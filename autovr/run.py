# Copyright 2024 The AutoVR Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import os
import pathlib
import threading
from typing import Any, Callable, Dict, List, Optional
import time
import json
import subprocess
import asyncio
import logging
import warnings

import frida
from abc import ABC, abstractmethod

from frida.core import Device, Script, Session
from .rpc import *
from .events import *
from .cfg_payload import *
from threading import *

logger = logging.getLogger(__name__)


def deprecated(message):

    def deprecated_decorator(func):

        def deprecated_func(*args, **kwargs):
            warnings.warn(
                "{} is a deprecated function. {}".format(
                    func.__name__, message),
                category=DeprecationWarning,
                stacklevel=2,
            )
            warnings.simplefilter("default", DeprecationWarning)
            return func(*args, **kwargs)

        return deprecated_func

    return deprecated_decorator


class AutoVRMethodMap(dict):
    """map from Address (0xABCD format) to Method name (a.b.c$$func format)"""

    def __init__(self, *args, **kwargs):
        super(AutoVRMethodMap, self).__init__(*args, **kwargs)

    def __setitem__(self, key: str, value):
        if not isinstance(key, str):
            raise TypeError("Key be in the 0xAddress format")
        if not isinstance(value, str):
            raise TypeError("Value must be a string")

        super(AutoVRMethodMap, self).__setitem__(key, value)


class AutoVRResumableFridaApp(ABC):
    """
    Abstration of a launched app instance in suspended state that are resumable,
    supported by Frida
    """
    protocol: RPC
    script: Script
    pid: int
    package_name: str
    device_name: str

    @abstractmethod
    def resume(self) -> AutoVRMethodMap:
        pass

    @abstractmethod
    async def check_health_async(self) -> bool:
        pass


class AutoVRLaunchableFridaApp(ABC):
    """
    Abstration of an launchable app usually controlled via Frida
    """

    @abstractmethod
    def start_app_suspended(
        self,
        process_detach_event: threading.Event,
        on_message_callback: Callable[[Dict[str, Any], Any], None],
    ) -> AutoVRResumableFridaApp:
        """Start a process based on the provided package_name and method table.
        The function will create the process in suspended state, and return an
        AutoVRResumableFridaApp instance.
        """
        pass


class AutoVR:

    def __init__(self) -> None:
        self.stop_event = threading.Event()
        self._leaks = {}
        self._collisions = {}
        self._triggers = {}
        self._objects_scene = {}
        self._scene_events = {}
        self._ui_events = {}
        self._resolved_deps = 0
        self._unity_events = {}
        self._per_event = {}
        self._methods: Optional[AutoVRMethodMap]

    def count_scenes(self,
                     app: AutoVRResumableFridaApp,
                     tries: int = 3) -> Optional[int]:
        # Ensure setup() was called beforehand
        count = 0
        num_scenes = None
        while count < tries:
            try:
                num_scenes = app.protocol.count_all_scenes()
                break
            except Exception as err:
                logger.warning("AutoVR: Count Scenes failed", exc_info=err)
                count += 1
        return num_scenes

    def analyze_events(self, events, parent_node, event_graph):
        branch_count = 0
        events_trigger = {}
        for event in events:
            # event_node = EventNode(event, parent_node)
            # logger.info(event)
            # event_graph.addCompletedEventNode(event_node)
            if event in self._methods:
                # logger.info("EVENT:", _methods[event])
                # node = CFGNode(protocol, _methods, _blacklist)
                # node.start_until_end(event)
                # node.resolve_reads_deps()
                # branch_count = branch_count + node.branch_count
                events_trigger[event] = []
                # if len(node.deps) > 0:
                #    events_trigger[event] += node.deps
                #    _resolved_deps += len(node.deps)
                #   logger.info("DEPS:", node.deps)

        return (events_trigger, branch_count)

    async def trigger_event(self, app: AutoVRResumableFridaApp, event: str,
                            seq: List[str]) -> List[str]:
        try:
            return await asyncio.wait_for(
                app.protocol.trigger_event({
                    "event": event,
                    "sequence": seq
                }),
                timeout=60,
            )
        except asyncio.TimeoutError:
            logger.info("Timeout occurred, skipping")
            return []

    async def trigger_events_path(
            self,
            app: AutoVRResumableFridaApp,
            starting_node: EventNode,
            event_graph: EventGraph,
            detach_event: Optional[asyncio.Event] = None):
        total_paths = []
        event_path = event_graph.findNextPath(starting_node)
        sequence = []

        if event_path is None:
            return None
        # remove starting_node from the event_path because we don't need to trigger it.
        nodes = " ".join([node.event_name for node in event_path])
        logger.info(f"event_path: {nodes}")
        for event_node in event_path:
            if event_node.triggered:
                sequence.append(event_node.event_name)
                continue

            next_events = await self.trigger_event(app, event_node.event_name,
                                                   sequence)
            event_node.markTriggered()

            if detach_event is not None and detach_event.is_set():
                logger.info("Detach event set, returning")
                return total_paths

            logger.info(" ".join(next_events))
            for next_event in next_events:
                next_event_node = EventNode(next_event, event_node)
                event_node.addChild(next_event_node)

            event_graph.addCompletedEventNode(event_node)
            if len(event_node.children) > 0:
                apath = await self.trigger_events_path(app, event_node,
                                                       event_graph,
                                                       detach_event)
                if apath is not None:
                    total_paths += apath

            # event_node may now have visited all nodes, update.
            event_node.updateVisited()
            event_graph.addCompletedEventNode(event_node)

        total_paths += event_path
        return total_paths

    def init(self, curr_scene: int):
        self._leaks[curr_scene] = []
        self._triggers[curr_scene] = 0
        self._unity_events[curr_scene] = {}
        self._per_event[curr_scene] = []
        self._objects_scene[curr_scene] = None
        self._collisions[curr_scene] = 0
        self._ui_events[curr_scene] = []

    def on_message(self, message, data):
        if message["type"] == "send":
            payload = json.loads(message["payload"])
            logger.info(payload)
        elif message["type"] == "error":
            logger.info(message["description"])
        else:
            logger.info(message)

    async def start(
        self,
        app: AutoVRResumableFridaApp,
        curr_scene: int,
        start_time: float,
        states,
        delay_scenes: int,
        detach_event: Optional[asyncio.Event] = None,
    ):
        try:
            states["curr_scene"] = curr_scene
            self.init(curr_scene)

            # Delay so all objects can load once the scene is loaded.
            # time.sleep(delay_scenes)
            init_events = app.protocol.load_scene_events(
                curr_scene, delay_scenes)

            all_events = set()

            event_graph = EventGraph(curr_scene, init_events)
            (events_trigger, inital_branch_count) = self.analyze_events(
                init_events, event_graph.scene_node, event_graph)
            logger.info(events_trigger)

            logger.info(f"event_graph {event_graph}")
            paths = await self.trigger_events_path(app, event_graph.scene_node,
                                                   event_graph, detach_event)
            all_events |= set(paths)
            while paths and (detach_event is None
                             or not detach_event.is_set()):
                # TODO(Jkim-Hack): Seems like we can do something with unloading scenes instead of restarting the game.
                # app.protocol.unload_scene(curr_scene)
                next_events = set(
                    app.protocol.load_scene_events(curr_scene, delay_scenes))
                logger.info(f"next_events: {next_events}")
                if len(next_events) < 1:
                    break
                paths = await self.trigger_events_path(app,
                                                       event_graph.scene_node,
                                                       event_graph,
                                                       detach_event)
                if paths is not None:
                    all_events |= set(paths)

            logger.info("FINISH SCENE")

            # Collect metrics of paths invoked
            self._scene_events[curr_scene] = all_events
            return True
        except Exception as err:
            logger.warning("run.py:", exc_info=err)
            return False

    def print_results(self, package_name: str, scene: str, time: float):
        dicts = {
            "leaks": self._leaks[scene],
            "collisions": self._collisions[scene],
            "triggers": self._triggers[scene],
            "objectsscene": self._objects_scene[scene],
            "sceneevents": self._scene_events[scene],
            "uievents": self._ui_events[scene],
            "unityevents": self._unity_events[scene],
            "efc_per_event": self._per_event[scene],
        }

        def json_serializer(obj):
            if isinstance(obj, set):
                return list(obj)
            return str(obj)

        # Loop through the dictionaries and write each one to a separate file
        pathlib.Path('./data').mkdir(parents=True, exist_ok=True)
        for name, dictionary in dicts.items():
            # Open a new file with a filename based on the dictionary name
            with open(f"./data/{package_name}_{name}_{scene}.json", "w") as f:
                # Use the json.dump method to write the dictionary to the file in JSON format
                json.dump(dictionary, f, default=json_serializer)
        with open(f"./data/{package_name}_resolved_{scene}.json", "w") as f:
            # use the json.dump method to write the dictionary to the file in json format
            json.dump(self._resolved_deps, f)
        with open(f"./data/{package_name}_time_{scene}.json", "w") as f:
            # use the json.dump method to write the dictionary to the file in json format
            json.dump(str(time), f)

    def collect_metrics(self, package_name: str, start_time: float,
                        curr_scene):
        end_time = time.time()
        self.print_results(package_name, curr_scene, end_time - start_time)

        logger.info(f"Time taken: {end_time - start_time}")
        logger.info(
            f"Scene: {curr_scene} | Objects: {self._objects_scene[curr_scene]}"
        )
        if curr_scene in self._per_event:
            logger.info(f"Events: {self._per_event[curr_scene]}")
        if curr_scene in self._collisions:
            logger.info(f"Collisions: {self._collisions[curr_scene]}")
        if curr_scene in self._triggers:
            logger.info(f"Triggers: {self._triggers[curr_scene]}")

    async def _arun(self,
                    app: AutoVRResumableFridaApp,
                    states: Dict[str, Any],
                    delay_scenes: int,
                    detach_event: Optional[asyncio.Event] = None):

        num_scenes = states["num_scenes"]
        start_scene = states["curr_scene"]

        start_time = time.time()

        logger.info(f"Total number of scenes: {num_scenes}")
        for curr_scene in range(start_scene, num_scenes):
            if detach_event is not None and detach_event.is_set():
                logger.info("Detaching...")
                return
            logger.info(f"curr_scene={curr_scene}")
            if not (await self.start(app, curr_scene, start_time, states,
                                     delay_scenes, detach_event)):
                continue
            states["curr_scene"] = curr_scene
            self.collect_metrics(app.package_name, start_time, curr_scene)

    def run(
        self,
        app: AutoVRResumableFridaApp,
        states: Dict[str, Any],
        delay_scenes: int,
        detach_event: Optional[threading.Event] = None,
    ):
        logger.info("Starting autovr:run ...")
        try:

            # adopted from autovr.py: run_async
            self._methods = app.resume()

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            if states["num_scenes"] == -1:
                logger.info("AutoVR: Counting scenes ...")
                states["num_scenes"] = self.count_scenes(app) or 0

            logger.info(f"Running {app.package_name}, pid={app.pid}")
            detach_async_event = asyncio.Event(
            ) if detach_event is not None else None
            thread = threading.Thread(target=loop.run_until_complete,
                                      args=[
                                          self._arun(app, states, delay_scenes,
                                                     detach_async_event)
                                      ])
            thread.start()
            if detach_event is not None:
                detach_event.wait()
                detach_async_event.set()
            thread.join()
            loop.close()
            logger.info(f"FINISHED: {app.package_name}, pid={app.pid}")

        except Exception as e:
            logger.warning("AutoVR:run:", exc_info=e)

    def check(self, app: AutoVRResumableFridaApp) -> Any:
        return app.protocol.check_health()

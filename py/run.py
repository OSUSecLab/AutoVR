import os
import pathlib
import threading
from typing import Any, Dict, List, Optional
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
from .mi_builder import *

logger = logging.getLogger(__name__)

def deprecated(message):
    def deprecated_decorator(func):
        def deprecated_func(*args, **kwargs):
            warnings.warn(
                "{} is a deprecated function. {}".format(func.__name__, message),
                category=DeprecationWarning,
                stacklevel=2,
            )
            warnings.simplefilter("default", DeprecationWarning)
            return func(*args, **kwargs)

        return deprecated_func

    return deprecated_decorator


protocol = RPC()  # deprecated
target_methods = ["LoadSceneAsync"]  # deprecated
blacklist = ["Object", "IntPtr", "StringBuilder", "String", "Number"]  # deprecated

_methods = {}  # deprecated
# _blacklist = []  # deprecated: no one use it
_resolved = {}  # deprecated
_resolving = set()  # deprecated
_events = []  # deprecated

_leaks = {}  # deprecated
_collisions = {}  # deprecated
_triggers = {}  # deprecated
_objects_scene = {}  # deprecated
_scene_events = {}  # deprecated
_ui_events = {}  # deprecated
_resolved_deps = 0  # deprecated
_unity_events = {}  # deprecated
_per_event = {}  # deprecated

# branch_count = 0  # deprecated: no one use it

# last_scene = 0 # deprecated: no one use it


@deprecated("Moved into AutoVR class")
def analyze_events(events, parent_node, event_graph):
    branch_count = 0
    events_trigger = {}
    for event in events:
        #event_node = EventNode(event, parent_node)
        #print(event)
        #event_graph.addCompletedEventNode(event_node)
        if event in _methods:
            # print("EVENT:", _methods[event])
            #node = CFGNode(protocol, _methods, _blacklist)
            #node.start_until_end(event)
            #node.resolve_reads_deps()
            #branch_count = branch_count + node.branch_count
            events_trigger[event] = []
            #if len(node.deps) > 0:
            #    events_trigger[event] += node.deps
            #    _resolved_deps += len(node.deps)
            #   print("DEPS:", node.deps)

    return (events_trigger, branch_count)


@deprecated("Moved into AutoVR class")
def on_message(message, data):
    if message["type"] == "send":
        payload = json.loads(message["payload"])
        print(payload)
        if payload["type"] == "targets":
            data = []
            for event in _events:
                pb = PayloadBuilder()
                pb.add_mi(event, _resolved)
                data.append(pb.data)
            
            # TODO: this doesn't work
            # script.post({'type': 'targets', 'payload': json.dumps(data)})
            raise RuntimeError("should not reach here yet")
            
        elif payload["type"] == "events_to_analyze":
            events = payload["data"]
            events_trigger = analyze_events(events)
            
            # TODO: this doesn't work
            
            # script.post({
            #    'type': 'events_to_analyze',
            #    'payload': json.dumps(events_trigger)
            #})
            raise RuntimeError("should not reach here yet")
            
        elif payload["type"] == "leaks":
            js = payload["data"]
            curr_scene = payload["scene"]
            _leaks[curr_scene].append(js)
        elif payload["type"] == "UI":
            js = payload["data"]
            curr_scene = payload["scene"]
            _ui_events[curr_scene].append(js)
        elif payload["type"] == "collisions":
            js = payload["data"]
            curr_scene = payload["scene"]
            count = _collisions[curr_scene]
            _collisions[curr_scene] = count + int(js)
            print("COLLISIONS = ", _collisions[curr_scene])
        elif payload["type"] == "triggers":
            js = payload["data"]
            curr_scene = payload["scene"]
            count = _triggers[curr_scene]
            _triggers[curr_scene] = count + int(js)
        elif payload["type"] == "objects_per_scene":
            js = payload["data"]
            curr_scene = payload["scene"]
            _objects_scene[curr_scene] = js
        elif payload["type"] == "unity_events":
            curr_scene = payload["scene"]
            objects = payload['objects']
            callbacks = payload['callbacks']
            failed = payload['failed']
            print(payload)
            d = {"objects": objects, "callbacks": callbacks, "failed": failed}
            _unity_events[curr_scene] = d.copy()
            print(_unity_events)
        elif payload["type"] == "efc_per_event":
            curr_scene = payload["scene"]
            _per_event[curr_scene] = payload["data"]
            print(_per_event)
    elif message["type"] == "error":
        print(message["description"])
    else:
        print(message)


@deprecated("No one seems to use it")
def contains_targets(name):
    for target in target_methods:
        if "$$" in name:
            if target in name[name.index("$$") + 2:]:
                return True
        elif target in name:
            return True
    return False


@deprecated("Moved to autovr.py")
def parse_all_methods(all_methods):
    for addr, name in all_methods:
        _methods[addr] = name


@deprecated("No one seems to use it")
def parse_events(events):
    for addr in events.keys():
        _events.append(addr)


# NOTE: this method does not compile
# def parse_instructions(ins, count):
#     method_instructions = []
#     for addr, inst in ins.items():
#         #print("Resolving", addr)
#         ins_list = inst["instructions"]
#         name = _methods[addr]
#         #if count == 0:
#         #    print(name)
#         builder = MethodInstructionsBuilder(name, protocol, True, _methods,
#                                             _resolved, _resolving)
        
#         for ins_meta in ins_list:
#             builder.add_instruction(Instruction(ins_meta))
#         _resolved[addr] = builder.build_and_clear()

#         mi = _resolved[addr]
#         method_instructions.append(mi)

#         need_resolved = []
#         for branch in mi.branches:
#             if branch not in _resolved and branch not in _resolving:
#                 if branch in _methods and contains_targets(_methods[branch]):
#                     mi.contains_target = True
#                     print("FOUND METHOD")
#                 _resolving.add(branch)
#                 need_resolved.append(branch)
#             elif branch not in _resolving:
#                 if branch in _methods and contains_targets(_methods[branch]):
#                     mi.contains_target = True
#                     print("FOUND METHOD")

#         if len(need_resolved) > 0:
#             # RPC call for branch addrs
#             b_ins = protocol.get_instructions(need_resolved)
#             mis = parse_instructions(json.loads(b_ins), count + 1)
#             for branch_mis in mis:
#                 method_instructions.append(branch_mis)
#                 mi.contains_target = mi.contains_target or branch_mis.contains_target
#             for resolved in need_resolved:
#                 _resolving.remove(resolved)

#     return method_instructions


@deprecated("Moved into AutoVR class")
def print_results(package, scene, time):
    dicts = {
        "leaks": _leaks[scene],
        "collisions": _collisions[scene],
        "triggers": _triggers[scene],
        "objectsscene": _objects_scene[scene],
        "sceneevents": _scene_events[scene],
        "uievents": _ui_events[scene],
        "unityevents": _unity_events[scene],
        "efc_per_event": _per_event[scene]
    }

    # Loop through the dictionaries and write each one to a separate file
    for name, dictionary in dicts.items():
        # Open a new file with a filename based on the dictionary name
        with open(f'../data/{package}_{name}_{scene}.json', "w") as f:
            # Use the json.dump method to write the dictionary to the file in JSON format
            json.dump(dictionary, f)
    with open(f"../data/{package}_resolved_{scene}.json", "w") as f:
        # use the json.dump method to write the dictionary to the file in json format
        json.dump(_resolved_deps, f)
    with open(f"../data/{package}_time_{scene}.json", "w") as f:
        # use the json.dump method to write the dictionary to the file in json format
        json.dump(str(time), f)


@deprecated("Moved into AutoVR class")
async def check_health(device_name):
    try:
        async with asyncio.timeout(60):
            cons_count = await protocol.check_health()
            if cons_count == 10:
                command = [
                    'adb', '-s', device_name, 'shell', 'input', 'keyevent',
                    '26'
                ]
                subprocess.run(command)
                time.sleep(2)
                subprocess.run(command)
            if cons_count < 20:
                print("Health check success!")
                return True
            raise Exception("Too many consecutive health checks.")
    except asyncio.TimeoutError:
        print("Health check failed with timeout")
        return False
    except Exception as e:
        print("Health check failed with exception")
        print(e)
        return False


@deprecated("Moved into AutoVR class")
async def trigger_event(event, seq):
    try:
        async with asyncio.timeout(60):
            next_events = await protocol.trigger_event({
                "event": event,
                "sequence": seq
            })
        return next_events
    except asyncio.TimeoutError:
        print("Timeout occurred, skipping")
        return []


@deprecated("Moved into AutoVR class")
async def trigger_events_path(starting_node, event_graph):
    total_paths = []
    event_path = event_graph.findNextPath(starting_node)
    sequence = []

    if event_path is None:
        return None
    # remove starting_node from the event_path because we don't need to trigger it.
    print("event_path:")
    for node in event_path:
        print(node.event_name, end=' ')
    print('\n')
    for event_node in event_path:
        if event_node.triggered:
            sequence.append(event_node.event_name)
            continue

        next_events = await trigger_event(event_node.event_name, sequence)
        event_node.markTriggered()

        print(next_events)
        for next_event in next_events:
            next_event_node = EventNode(next_event, event_node)
            event_node.addChild(next_event_node)

        event_graph.addCompletedEventNode(event_node)
        if len(event_node.children) > 0:
            apath = await trigger_events_path(event_node, event_graph)
            total_paths += apath

        # event_node may now have visited all nodes, update.
        event_node.updateVisited()
        event_graph.addCompletedEventNode(event_node)

    total_paths += event_path
    return total_paths


@deprecated("No one seems to use it")
async def trigger_events(events_trigger):
    num_branches = 0
    triggered = list(events_trigger.keys())
    for (event, seq) in events_trigger.items():
        try:
            async with asyncio.timeout(60):
                next_events = await protocol.trigger_event({
                    "event": event,
                    "sequence": seq
                })
        except asyncio.TimeoutError:
            print("Timeout occurred, skipping")
            continue

        if len(next_events) > 0:
            (next_events_trigger, branch_count) = analyze_events(next_events)
            num_branches = num_branches + branch_count
            (next_triggered,
             next_branch_count) = await trigger_events(next_events_trigger)
            num_branches = num_branches + next_branch_count
            triggered = triggered + next_triggered
    return (triggered, num_branches)


@deprecated("Moved into AutoVR class")
def init(curr_scene):
    _leaks[curr_scene] = []
    _triggers[curr_scene] = 0
    _unity_events[curr_scene] = {}
    _per_event[curr_scene] = []
    _collisions[curr_scene] = 0
    _ui_events[curr_scene] = []


@deprecated("Moved into autovr.py")
def _process_pids(pids):
    final = dict()
    for pid in pids:
        pid_entry = pid.lstrip().rstrip()  # remove trailing whitespace
        if pid_entry != '':
            process_id, name = pid_entry.split('  ', 1)
            final[name] = process_id
    return final


@deprecated("Moved into autovr.py")
def frida_ps_list(device_name):
    command = ['frida-ps', '-D', device_name]
    process = subprocess.Popen(command,
                               stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE)
    out, err = process.communicate()
    pids = out.decode("utf-8").split("\n")[2:]
    pids = _process_pids(pids)
    return pids


@deprecated("Moved into autovr.py")
def find_package_pid(package, device_name, rooted=False):
    if not rooted:
        print("Device not rooted, using re.frida.Gadget instead.")
        package = "re.frida.Gadget"
    pids = frida_ps_list(device_name)
    if package in list(pids.keys()):
        return int(pids[package])
    return -1


@deprecated("Moved into autovr.py")
def frida_kill(host, device_name, rooted=False):
    pid = find_package_pid(host, device_name, rooted)
    command = ['frida-kill', '-D', device_name, 'Gadget']
    if rooted and pid != -1:
        command = ['frida-kill', '-D', device_name, f"{pid}"]
    elif pid == -1:
        return
    process = subprocess.Popen(command)
    try:
        process.wait(3)
    except:
        return


@deprecated("Moved into autovr.py")
def run_command(command):
    return subprocess.check_output(command.split()).decode("utf-8")


@deprecated("Moved into autovr.py")
def run_check_errors(cmd):
    proc = subprocess.Popen(cmd.split(),
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE)
    return proc.stderr.read().decode()


@deprecated("Moved into autovr.py")
def spawn_package(device_name, package):
    start_command = f"adb -s {device_name} shell am start -n {package}/com.unity3d.player.UnityPlayerActivity"
    for i in range(1):
        output = run_check_errors(start_command)
        if "Error type 3" in output:
            return False
        time.sleep(3)
    return True


@deprecated("Moved to autovr.py")
def setup(device_name,
          host,
          ssl_offset='',
          use_mbed_tls=True,
          is_rooted=False):

    frida_kill(host, device_name, is_rooted)

    #if not spawn_package(device_name, host):
    #    return (None, None, None)
    #gadget = "re.frida.Gadget"
    device = frida.get_device(device_name)
    pid = device.spawn([host])  # 're.frida.Gadget' if running gadget
    #pid = device.get_frontmost_application(scope="full").pid

    session = device.attach(pid)
    script = session.create_script(open("index.out.js").read())

    protocol.set_export_sync(script.exports_sync)
    protocol.set_export_async(script.exports_async)
    script.load()
    script.on('message', on_message)

    if ssl_offset != '':
        setup_ssl_pin_offset(script, ssl_offset, use_mbed_tls)

    return (script, device, pid)


@deprecated("Moved to autovr.py")
def setup_ssl_pin_offset(script, offset, use_mbed_tls):
    script.post({
        'type': 'cert_func',
        'offset': offset,
        'use_mbed_tls': use_mbed_tls
    })


@deprecated("Moved to autovr.py")
def setup_base(script, device, pid, file):
    if file and file != '' and os.path.exists(file):
        f = open(file, "r")
        on = json.loads(f.read())
        script.post({'type': 'input', 'payload': json.dumps(on)})
    else:
        script.post({'type': 'input', 'payload': ''})

    device.resume(pid)
    res = protocol.init()
    res = json.loads(res)
    base = res["base"]
    parse_all_methods(res["all_methods"])


@deprecated("No one seems to use this at all")
def get_unity_version():
    return protocol.get_unity_version()


@deprecated("Moved to AutoVr class")
def count_scenes(tries=3):
    # Ensure setup_base() was called beforehand
    print("COUNTING SCENES")
    count = 0
    while count < tries:
        try:
            num_scenes = protocol.count_all_scenes()
            break
        except Exception as err:
            count += 1
    return num_scenes


@deprecated("Moved to AutoVr class")
async def start(curr_scene, start_time, states, delay_scenes):
    try:
        states["curr_scene"] = curr_scene
        init(curr_scene)

        # Delay so all objects can load once the scene is loaded.
        # time.sleep(delay_scenes)
        init_events = protocol.load_scene_events(curr_scene, delay_scenes)

        all_events = set()

        event_graph = EventGraph(curr_scene, init_events)
        (events_trigger,
         inital_branch_count) = analyze_events(init_events,
                                               event_graph.scene_node,
                                               event_graph)
        print(events_trigger)

        print("event_graph", event_graph)
        paths = await trigger_events_path(event_graph.scene_node, event_graph)
        all_events |= set(paths)
        while paths is not None:
            next_events = protocol.load_scene_events(curr_scene, delay_scenes)
            if len(next_events) < 1: break
            paths = await trigger_events_path(event_graph.scene_node,
                                              event_graph)
            if paths is not None:
                all_events |= set(paths)

        print("FINISH SCENE")

        # Collect metrics of paths invoked
        _scene_events[curr_scene] = all_events
        return True
    except Exception as err:
        print("run.py:", err)
        return False


@deprecated("Moved to AutoVr class")
def collect_metrics(package_name, start_time, curr_scene):
    end_time = time.time()
    print_results(package_name, curr_scene, end_time - start_time)

    print("Time taken:", end_time - start_time)
    print("Scene: ", curr_scene, " | ", "Objects:", _objects_scene[curr_scene])
    if curr_scene in _per_event:
        print("Events: ", _per_event[curr_scene])
    if curr_scene in _collisions:
        print("Collisions:", _collisions[curr_scene])
    if curr_scene in _triggers:
        print("Triggers:", _triggers[curr_scene])


@deprecated("Moved to AutoVr class")
async def run(script, package_name, states, delay_scenes):
    global _resolved_deps
    num_scenes = states["num_scenes"]
    start_scene = states["curr_scene"]

    start_time = time.time()

    # Experimental event function intruction reconstruction.
    #ins_feeder = InstructionFeeder.get_instance()
    #ins_feeder.add_rpc(protocol)

    print("NUMBER OF SCENES:", num_scenes)
    for curr_scene in range(start_scene, num_scenes):
        print(curr_scene)
        if not (await start(curr_scene, start_time, states, delay_scenes)):
            continue
        states["curr_scene"] = curr_scene
        collect_metrics(package_name, start_time, curr_scene)


class AutoVRMethodMap(dict):
    """map from Address (0xABCD format) to Method name (a.b.c$$func format)"""

    def __init__(self, *args, **kwargs):
        super(AutoVRMethodMap, self).__init__(*args, **kwargs)

    def __setitem__(self, key:str, value):
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

    def count_scenes(self, app: AutoVRResumableFridaApp, tries: int = 3) -> Optional[int]:
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

    async def trigger_event(
        self, app: AutoVRResumableFridaApp, event: str, seq: List[str]
    ) -> List[str]:
        try:
            return await asyncio.wait_for(
                app.protocol.trigger_event({"event": event, "sequence": seq}),
                timeout=60,
            )
        except asyncio.TimeoutError:
            logger.info("Timeout occurred, skipping")
            return []

    async def trigger_events_path(
        self, app: AutoVRResumableFridaApp, starting_node: EventNode, event_graph: EventGraph
    ):
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

            next_events = await self.trigger_event(app, event_node.event_name, sequence)
            event_node.markTriggered()

            logger.info(" ".join(next_events))
            for next_event in next_events:
                next_event_node = EventNode(next_event, event_node)
                event_node.addChild(next_event_node)

            event_graph.addCompletedEventNode(event_node)
            if len(event_node.children) > 0:
                apath = await self.trigger_events_path(app, event_node, event_graph)
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
            if payload["type"] == "targets":
                # TODO: disabled. not even compiling
                # data = []
                # for event in self._events:
                #     pb = PayloadBuilder()
                #     pb.add_mi(event, _resolved)
                #     data.append(pb.data)
                # script.post({"type": "targets", "payload": json.dumps(data)})
                pass
            elif payload["type"] == "events_to_analyze":
                # TODO: disabled. not even compiling
                # events = payload["data"]
                # events_trigger = analyze_events(events)
                # script.post(
                #     {"type": "events_to_analyze", "payload": json.dumps(events_trigger)}
                # )
                pass
            elif payload["type"] == "leaks":
                js = payload["data"]
                curr_scene = payload["scene"]
                self._leaks[curr_scene].append(js)
            elif payload["type"] == "UI":
                js = payload["data"]
                curr_scene = payload["scene"]
                self._ui_events[curr_scene].append(js)
            elif payload["type"] == "collisions":
                js = payload["data"]
                curr_scene = payload["scene"]
                count = self._collisions[curr_scene]
                self._collisions[curr_scene] = count + int(js)
                logger.info("COLLISIONS = ", self._collisions[curr_scene])
            elif payload["type"] == "triggers":
                js = payload["data"]
                curr_scene = payload["scene"]
                count = self._triggers[curr_scene]
                self._triggers[curr_scene] = count + int(js)
            elif payload["type"] == "objects_per_scene":
                js = payload["data"]
                curr_scene = payload["scene"]
                self._objects_scene[curr_scene] = js
            elif payload["type"] == "unity_events":
                curr_scene = payload["scene"]
                objects = payload["objects"]
                callbacks = payload["callbacks"]
                failed = payload["failed"]
                logger.info(payload)
                d = {"objects": objects, "callbacks": callbacks, "failed": failed}
                self._unity_events[curr_scene] = d.copy()
                logger.info(self._unity_events)
            elif payload["type"] == "efc_per_event":
                curr_scene = payload["scene"]
                self._per_event[curr_scene] = payload["data"]
                logger.info(self._per_event)
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
    ):
        try:
            states["curr_scene"] = curr_scene
            self.init(curr_scene)

            # Delay so all objects can load once the scene is loaded.
            # time.sleep(delay_scenes)
            init_events = app.protocol.load_scene_events(curr_scene, delay_scenes)

            all_events = set()

            event_graph = EventGraph(curr_scene, init_events)
            (events_trigger, inital_branch_count) = self.analyze_events(
                init_events, event_graph.scene_node, event_graph
            )
            logger.info(events_trigger)

            logger.info(f"event_graph {event_graph}")
            paths = await self.trigger_events_path(
                app, event_graph.scene_node, event_graph
            )
            all_events |= set(paths)
            while paths is not None:
                next_events = app.protocol.load_scene_events(curr_scene, delay_scenes)
                if len(next_events) < 1:
                    break
                paths = await self.trigger_events_path(
                    app, event_graph.scene_node, event_graph
                )
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

    def collect_metrics(self, package_name: str, start_time: float, curr_scene):
        end_time = time.time()
        self.print_results(package_name, curr_scene, end_time - start_time)

        logger.info(f"Time taken: {end_time - start_time}")
        logger.info(f"Scene: {curr_scene} | Objects: {self._objects_scene[curr_scene]}")
        if curr_scene in self._per_event:
            logger.info(f"Events: {self._per_event[curr_scene]}")
        if curr_scene in self._collisions:
            logger.info(f"Collisions: {self._collisions[curr_scene]}")
        if curr_scene in self._triggers:
            logger.info(f"Triggers: {self._triggers[curr_scene]}")

    async def _arun(
        self, app: AutoVRResumableFridaApp, states: Dict[str, Any], delay_scenes: int
    ):

        num_scenes = states["num_scenes"]
        start_scene = states["curr_scene"]

        start_time = time.time()

        logger.info(f"Total number of scenes: {num_scenes}")
        for curr_scene in range(start_scene, num_scenes):
            logger.info(f"curr_scene={curr_scene}")
            if not (
                await self.start(app, curr_scene, start_time, states, delay_scenes)
            ):
                continue
            states["curr_scene"] = curr_scene
            self.collect_metrics(app.package_name, start_time, curr_scene)

    def run(
        self,
        app: AutoVRResumableFridaApp,
        states: Dict[str, Any],
        delay_scenes: int,
    ):
        logger.info("Starting autovr:run ...")
        try:

            # adopted from autovr.py: run_async
            self._methods = app.resume()
            states = {"curr_scene": 0, "num_scenes": -1}

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            if states["num_scenes"] == -1:
                logger.info("AutoVR: Counting scenes ...")
                states["num_scenes"] = self.count_scenes(app) or 0

            logger.info(f"Running {app.package_name}, pid={app.pid}")
            loop.run_until_complete(self._arun(app, states, delay_scenes))
            loop.close()
            logger.info(f"FINISHED: {app.package_name}, pid={app.pid}")

        except Exception as e:
            logger.warning("AutoVR:run:", exc_info=e)
            
            
    def check(
        self,
        app: AutoVRResumableFridaApp
    ) -> Any:
        return app.protocol.check_health()

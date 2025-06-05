import os
import concurrent
import time
import subprocess
import asyncio
import threading
import argparse
import json
import logging

from dataclasses import dataclass
from typing import Any, Dict, Callable, List, Tuple
import frida
from frida.core import Script

from autovr.run import AutoVR, AutoVRMethodMap, AutoVRResumableFridaApp, AutoVRLaunchableFridaApp
from autovr.rpc import RPC
from autovr.app import AutoVRResumableFridaApp

logging.basicConfig(
    level=logging.DEBUG,
    format=
    "[%(asctime)s] %(levelname)s [%(name)s.%(funcName)s:%(lineno)d] %(message)s",
    datefmt="%d/%b/%Y %H:%M:%S")

logger = logging.getLogger(__name__)


class AutoVRFridaAppController():

    def __init__(self,
                 app: AutoVRLaunchableFridaApp,
                 manual: bool,
                 delay_scenes: int = 5000):
        self.curr_scene = -1
        self.last_scene = -1
        self.tries = 0
        self.should_cont = True
        self.states = {"curr_scene": 0, "num_scenes": -1}
        self.delay_scenes = delay_scenes
        self.app = app
        self.driver = AutoVR()
        self.manual = manual

    def check_frida_ps_async(self, event: threading.Event):
        logger.info("Checking frida processes")

        device_name = self.app.device_name
        command = f'frida-ps -D {device_name}'

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        while not event.is_set():
            logger.debug("Polling...")

            # Wake up device if off
            command = [
                'adb', '-s', device_name, 'shell', 'dumpsys', 'input_method'
            ]
            interactive = subprocess.check_output(command).decode("utf-8")
            if "mInteractive=false" in interactive:
                logger.debug("WAKING DEVICE")
                command = [
                    'adb', '-s', device_name, 'shell', 'input', 'keyevent',
                    '26'
                ]
                subprocess.run(command)
            health = loop.run_until_complete(self.app.check_health_async())
            if not health:
                logger.debug("Health check failed.")
                return
            time.sleep(5)
        loop.close()
        return

    def start(self):
        # TODO: Make max number of tries into a flag and pass it in this function.
        logger.info("Starting AutoVRApp")
        try:
            while self.should_cont:
                process_detach_event = threading.Event()

                self.app = self.app.start_app_suspended(
                    process_detach_event=process_detach_event,
                    on_message_callback=self.driver.on_message,
                )

                executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

                # AutoVR driver thread
                run_future = executor.submit(self.driver.run, self.app,
                                             self.states, self.delay_scenes,
                                             self.manual)

                check_future = None
                futures = [run_future]
                if not self.manual:
                    # Server health checking
                    check_future = executor.submit(self.check_frida_ps_async,
                                                   process_detach_event)
                    futures.append(check_future)

                # Blocks until the first function is done
                for future in concurrent.futures.as_completed(futures):
                    logger.info(f"CURRENT SCENE: {self.states['curr_scene']}")
                    logger.info(future)
                    # If frida process is lost (a crash)
                    if check_future != None and future is check_future:
                        # Restart to scene
                        logger.info("Crash occurs, restarting...")
                        if self.tries > 2:
                            logger.info("Too many crash tries, exiting",
                                        self.app.package_name)
                            self.should_cont = False
                            break
                        self.curr_scene = self.states["curr_scene"]
                        if self.last_scene == self.curr_scene:
                            self.tries += 1
                        else:
                            self.tries = 0
                            self.last_scene = self.curr_scene
                        break
                    # Scene successfully finished
                    elif future is run_future:
                        self.should_cont = False
                        logger.info("Success")
                        logger.info(
                            "AutoVR finished executing, shutting down...")
                        process_detach_event.set()
                        break

                # Cancel outstanding futures
                run_future.cancel()
                if check_future:
                    check_future.cancel()

                executor.shutdown(wait=False)
        except Exception as e:
            logger.info("autovr Error:", e)
            pass


class AutoVRResumableFridaAppImpl(AutoVRResumableFridaApp):
    """Implmementation of AutoVRResumableFridaApp to implement the actual Frida controlled app launch instance"""

    def __init__(
        self,
        device: Any,
        device_name: str,
        pid: int,
        package_name: str,
        protocol: RPC,
        script: Script,
        il2cpp_script_json: Dict[str, Any],
    ) -> None:
        self.device = device
        self.pid = pid
        self.protocol = protocol
        self.package_name = package_name
        self.script = script
        self.device_name = device_name
        self.il2cpp_script_json = il2cpp_script_json

    def resume(self) -> AutoVRMethodMap:
        self.device.resume(self.pid)

        scriptMetadataMethods = {"ScriptMetadataMethod": []}
        if self.il2cpp_script_json and "ScriptMetadataMethod" in self.il2cpp_script_json:
            scriptMetadataMethods = {
                "ScriptMetadataMethod":
                self.il2cpp_script_json["ScriptMetadataMethod"]
            }

        # init rpc protocol. it returns a json format
        #  {
        #     "base": "<baseaddress>",
        #     "all_methods": [
        #         ...
        #     ]
        #  }
        res = json.loads(
            self.protocol.init(
                symbol_payload=json.dumps(scriptMetadataMethods)))
        return AutoVRMethodMap(res["all_methods"])

    async def check_health_async(self) -> bool:
        # TODO: Sometimes UnityEvent parsing can take >1 minutes, we should make this into a user flag.
        try:
            async with asyncio.timeout(80):
                cons_count = await self.protocol.check_health()
                if cons_count == 10:
                    command = [
                        'adb', '-s', self.device_name, 'shell', 'input',
                        'keyevent', '26'
                    ]
                    subprocess.run(command)
                    time.sleep(2)
                    subprocess.run(command)
                if cons_count < 20:
                    logger.debug("Health check success!")
                    return True
                raise Exception("Too many consecutive health checks.")
        except asyncio.TimeoutError:
            logger.debug("Health check failed with timeout")
            return False
        except Exception as e:
            logger.warning("Health check failed with exception", exc_info=e)
            return False


class AutoVRLaunchableFridaAppImpl(AutoVRLaunchableFridaApp):
    """
    Implementation of AutoVRFridaProvider to implement the actual
    Frida support.
    """

    def __init__(
        self,
        device_name: str,
        package_name: str,
        il2cpp_script_json: Dict[str, Any],
        rooted: bool = False,
        ssl_offset: str = '',
        use_mbed_tls: bool = True,
        manual: bool = False,
    ) -> None:
        self.device_name = device_name
        self.package_name = package_name
        self.rooted = rooted
        self.ssl_offset = ssl_offset
        self.use_mbed_tls = use_mbed_tls
        self.il2cpp_script_json = il2cpp_script_json
        self.manual = manual

    # originally from run.py: _process_pids
    def _process_pids(self, pids: List[str]):
        final = dict()
        for pid in pids:
            pid_entry = pid.lstrip().rstrip()  # remove trailing whitespace
            if pid_entry != '' and len(pid_entry.split(' ')) > 1:
                process_id, name = pid_entry.split('  ', 1)
                final[name] = process_id
        return final

    # originally from run.py: frida-ps_list
    def _frida_ps_list(self, device_name: str):
        command = ['frida-ps', '-D', device_name]
        process = subprocess.Popen(command,
                                   stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE)
        out, err = process.communicate()
        pids = out.decode("utf-8").split("\n")[2:]
        pids = self._process_pids(pids)
        return pids

    # originally from run.py: find_package_pid
    def _find_package_pid(self, package: str, device_name: str, rooted=False):
        if not rooted:
            logger.info("Device not rooted, using re.frida.Gadget instead.")
            package = "re.frida.Gadget"
        pids = self._frida_ps_list(device_name)
        if package in list(pids.keys()):
            return int(pids[package])
        return -1

    # originally from run.py: frida_kill
    def frida_kill(self, package_name: str):
        pid = self._find_package_pid(package_name, self.device_name,
                                     self.rooted)
        command = ['frida-kill', '-D', self.device_name, 'Gadget']
        if self.rooted and pid != -1:
            command = ['frida-kill', '-D', self.device_name, f"{pid}"]
        elif pid == -1:
            return
        process = subprocess.Popen(command)
        try:
            process.wait(3)
        except:
            return

    def _run_check_errors(self, cmd):
        proc = subprocess.Popen(cmd.split(),
                                stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
        return proc.stderr.read().decode()

    def _spawn_package(self, device_name, package):
        start_command = f"adb -s {device_name} shell am start -n {package}/com.unity3d.player.UnityPlayerActivity"
        for i in range(1):
            output = self._run_check_errors(start_command)
            if "Error type 3" in output:
                return False
            time.sleep(3)
        return True

    # originally from run.py: setup
    def _setup(
        self,
        device_name: str,
        host: str,
        on_message,
        ssl_offset: str,
        use_mbed_tls: bool,
        protocol: RPC,
        process_detach_event: threading.Event,
    ) -> Tuple[Any, Any, int]:

        self.frida_kill(host)

        def frida_on_detached(reason, crash):
            logger.info(
                f"Process {pid} is detached due to: {reason} {crash if crash else ''}"
            )
            process_detach_event.set()

        #if not spawn_package(device_name, host):
        #    return (None, None, None)
        #gadget = "re.frida.Gadget"
        device = frida.get_device(device_name)
        pid = device.spawn([host])  # 're.frida.Gadget' if running gadget
        #pid = device.get_frontmost_application(scope="full").pid

        session = device.attach(pid)
        session.on("detached", frida_on_detached)
        script = session.create_script(
            open("ts/index.out.js", newline='\n', encoding="utf-8").read())

        protocol.set_export_sync(script.exports_sync)
        protocol.set_export_async(script.exports_async)
        script.load()
        script.on('message', on_message)

        if ssl_offset != '':
            self._setup_ssl_pin_offset(script, ssl_offset, use_mbed_tls)

        return (script, device, pid)

    # originally from run.py: setup_ssl_pin_offset
    def _setup_ssl_pin_offset(self, script, offset, use_mbed_tls):
        script.post({
            'type': 'cert_func',
            'offset': offset,
            'use_mbed_tls': use_mbed_tls
        })

    def start_app_suspended(
        self,
        process_detach_event: threading.Event,
        on_message_callback: Callable[[Dict[str, Any], Any], None],
    ) -> AutoVRResumableFridaApp:

        protocol = RPC()

        script, device, pid = self._setup(
            self.device_name,
            self.package_name,
            on_message=on_message_callback,
            ssl_offset=self.ssl_offset,
            use_mbed_tls=self.use_mbed_tls,
            protocol=protocol,
            process_detach_event=process_detach_event,
        )

        if script is None and device is None and pid is None:
            raise RuntimeError(
                "Frida not properly setup, ensure Frida is running on the device."
            )

        return AutoVRResumableFridaAppImpl(
            device=device,
            device_name=self.device_name,
            pid=pid,
            package_name=self.package_name,
            script=script,
            protocol=protocol,
            il2cpp_script_json=self.il2cpp_script_json,
        )

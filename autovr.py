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


logging.basicConfig(
    level=logging.DEBUG,
    format="[%(asctime)s] %(levelname)s [%(name)s.%(funcName)s:%(lineno)d] %(message)s",
    datefmt="%d/%b/%Y %H:%M:%S")
    
logger = logging.getLogger(__name__)

@dataclass
class Status:
    tries: int
    should_cont: bool


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
        
        scriptMetadataMethods = {
            "ScriptMetadataMethod": self.il2cpp_script_json["ScriptMetadataMethod"]
        }

        # init rpc protocol. it returns a json format
        #  {
        #     "base": "<baseaddress>",
        #     "all_methods": [
        #         ...
        #     ]
        #  }
        res = json.loads(
            self.protocol.init(symbol_payload=json.dumps(scriptMetadataMethods))
        )
        return AutoVRMethodMap(res["all_methods"])
        
    async def check_health_async(self) -> bool:
        try:
            async with asyncio.timeout(60):
                cons_count = await self.protocol.check_health()
                if cons_count == 10:
                    command = [
                        'adb', '-s', self.device_name, 'shell', 'input', 'keyevent',
                        '26'
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
        ssl_offset: str ='',
        use_mbed_tls: bool = True,
    ) -> None:
        self.device_name = device_name
        self.package_name = package_name
        self.rooted = rooted
        self.ssl_offset = ssl_offset
        self.use_mbed_tls = use_mbed_tls
        self.il2cpp_script_json = il2cpp_script_json
        
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
        pid = self._find_package_pid(package_name, self.device_name, self.rooted)
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
        script = session.create_script(open("ts/index.out.js", newline='\n', encoding="utf-8").read())

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
            raise RuntimeError("Frida not properly setup, ensure Frida is running on the device.")
        
        return AutoVRResumableFridaAppImpl(
            device=device,
            device_name=self.device_name,
            pid=pid,
            package_name=self.package_name,
            script=script,
            protocol=protocol,
            il2cpp_script_json=self.il2cpp_script_json,
        )
        

stop_event = threading.Event()

# Deprecated!
def run_async(script, device, pid, tries, script_file, host, states,
              delay_scenes):

    from py.run import setup_base, count_scenes, run
    setup_base(script, device, pid, script_file)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Possibly error prone here, if count_scenes() fails.
    if states["num_scenes"] == -1:
        states["num_scenes"] = count_scenes()

    loop.run_until_complete(run(script, host, states, delay_scenes))
    loop.close()
    print("FINISHED returning", host)
    return


def check_frida_ps_async(event: threading.Event, app: AutoVRResumableFridaApp):
    logger.info("Checking frida processes")
    command = 'frida-ps -D ' + app.device_name
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    while not event.is_set():
        logger.info("Polling...")

        # Wake up device if off
        command = [
            'adb', '-s', app.device_name, 'shell', 'dumpsys', 'input_method'
        ]
        interactive = subprocess.check_output(command).decode("utf-8")
        if "mInteractive=false" in interactive:
            logger.info("WAKING DEVICE")
            command = [
                'adb', '-s', app.device_name, 'shell', 'input', 'keyevent', '26'
            ]
            subprocess.run(command)

        health = loop.run_until_complete(app.check_health_async())
        if not health:
            logger.info("Health check failed.")
            return
        time.sleep(5)
    loop.close()
    return


def setup_crash_logs(device_name):
    logger.info("Clearing log buffer.")

    # Run the command: adb logcat -b crash
    command = ['adb', '-s', device_name, 'logcat', '-c']
    subprocess.run(command, check=True)


async def extract_crash_logs(device_name, dir_name, base_directory):
    command = f'adb -s {device_name} logcat -b crash'

    # Specify the output file
    output_file = f'{base_directory}/{dir_name}_crash_log.txt'

    # Open the file in write mode
    with open(output_file, 'a+') as file:
        # Run the command and redirect the output to the file
        await asyncio.create_subprocess_shell(command,
                                              stdout=file,
                                              stderr=subprocess.STDOUT)


def does_contain_package(device_name, package_name):
    command = [
        'adb', '-s', device_name, 'shell', 'pm', 'list', 'packages',
        package_name
    ]
    output = subprocess.check_output(command).decode('utf-8')
    return output and not output == ''


async def main(
    device_name: str,
    package_name: str,
    script_file: str,
    ssl_offset,
    use_mbed_tls,
    delay_scenes,
    is_rooted):
    
    logger.info("Staring AUTOVR:")
    logger.info(f"  device_name = {device_name}")
    logger.info(f"  package_name = {package_name}")
    logger.info(f"  script_file = {script_file}")
    logger.info(f"  ssl_offset = {ssl_offset}")
    logger.info(f"  use_mbed_tls = {use_mbed_tls}")
    logger.info(f"  delay_scenes = {delay_scenes}")
    logger.info(f"  is_rooted = {is_rooted}")

    if not does_contain_package(device_name, package_name):
        logger.warning(f"{device_name} does not have package {package_name}")
        return
    
    # originally from run.py: setup_base
    # preload the Unity symbols for the provided app
    if script_file != "" and os.path.exists(script_file):
        with open(script_file, "r", encoding="utf-8") as f:
            il2cpp_script_json = json.loads(f.read())
    else:
        raise RuntimeError(
            "Must provide a valid script_json file from il2cppdumper"
        )
    
    delay_scenes = int(delay_scenes)
    autovr = AutoVR()
    autovr_frida = AutoVRLaunchableFridaAppImpl(
        device_name=device_name,
        package_name=package_name,
        rooted=is_rooted,
        ssl_offset=ssl_offset,
        use_mbed_tls=use_mbed_tls,
        il2cpp_script_json=il2cpp_script_json,
    )
    
    pid = None
    try:
        # Housekeeping
        curr_scene = -1
        last_scene = -1
        status = Status(0, True)
        states = {"curr_scene": 0, "num_scenes": -1}

        while status.should_cont:
            logger.info("Starting")
            setup_crash_logs(device_name)

            process_detach_event = threading.Event()
            
            resumable_app = autovr_frida.start_app_suspended(
                process_detach_event=process_detach_event,
                on_message_callback=autovr.on_message,
            )
                
            # Submit the functions to the executor
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

            # AutoVR driver thread
            run_future = executor.submit(
                autovr.run,
                resumable_app,
                states,
                delay_scenes,
            )

            # Health checking
            check_future = executor.submit(check_frida_ps_async, process_detach_event,
                                           resumable_app)

            # Wait until the first function is done
            for future in concurrent.futures.as_completed(
                [run_future, check_future]):
                logger.info(f"CURRENT SCENE: {states['curr_scene']}")
                logger.info(future)
                # If frida process is lost (a crash)
                if future is check_future:
                    # Restart to scene
                    logger.info("Crash occurs, restarting...")
                    if status.tries > 2:
                        logger.info("Too many crash tries, exiting", package_name)
                        status.should_cont = False
                        break
                    curr_scene = states["curr_scene"]
                    if last_scene == curr_scene:
                        status.tries += 1
                        logger.info("Scene", curr_scene, "attempt", status.tries)
                    else:
                        status.tries = 0
                        last_scene = curr_scene
                    break
                # Scene successfully finished
                elif future is run_future:
                    status.should_cont = False
                    logger.info("Success")
                    logger.info("AutoVR finished executing, shutting down...")
                    process_detach_event.set()
                    # Shutdown the executor
                    break

            executor.shutdown(wait=False)
            # Get crash logs
            logger.info("Getting crash logs")
            await extract_crash_logs(device_name, package_name, "/tmp/")
            logger.info(f"Done getting crash logs at {package_name}")
    except Exception as e:
        logger.info("autovr Error:", e)

    autovr_frida.frida_kill(package_name)
    time.sleep(3)
    logger.info("Done")


if __name__ == '__main__':

    parser = argparse.ArgumentParser(description='Run AutOVR on a single package.')
    parser.add_argument('--device',
                        metavar='device',
                        type=str,
                        required=True,
                        help='The device id from adb devices.')
    parser.add_argument(
        '--package',
        metavar='package_name',
        type=str,
        required=True,
        help=
        'The package name to run AutoVR on. Ensure frida-gadget is injected in the apk, or frida-server is running when device is rooted.'
    )
    parser.add_argument(
        '--script-file',
        metavar='script_file',
        type=str,
        default='',
        required=False,
        help=
        'The script.json file path generated from using Il2CppDumper on package libil2pp.so file.'
    )
    parser.add_argument('--ssl-offset',
                        metavar='ssl_offset',
                        type=str,
                        default='',
                        required=False,
                        help='The SSL offset for the package.')
    parser.add_argument(
        '--use-mbed-tls',
        metavar='use_mbed_tls',
        type=bool,
        default=True,
        required=False,
        help='If the SSL offset is using mbed TLS function, set this to true.')
    parser.add_argument(
        '--delay_scenes',
        metavar='delay_scenes',
        type=int,
        default='3',
        required=False,
        help=
        'The amount of delay (seconds) between scene loading and event parsing.')
    parser.add_argument('--rooted',
                        metavar='is_rooted',
                        type=bool,
                        default=False,
                        required=False,
                        help='Set to true if the device is rooted.')
    args = parser.parse_args()
    
    asyncio.run(
        main(args.device, args.package, args.script_file, args.ssl_offset,
            args.use_mbed_tls, args.delay_scenes, args.rooted))

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
from autovr.app import AutoVRFridaAppController, AutoVRLaunchableFridaAppImpl

logging.basicConfig(
    level=logging.DEBUG,
    format=
    "[%(asctime)s] %(levelname)s [%(name)s.%(funcName)s:%(lineno)d] %(message)s",
    datefmt="%d/%b/%Y %H:%M:%S")

logger = logging.getLogger(__name__)


def setup_crash_logs(device_name):
    logger.info("Clearing log buffer.")

    # Run the command: adb logcat -b crash
    command = ['adb', '-s', device_name, 'logcat', '-c']
    subprocess.run(command, check=True)


async def extract_crash_logs(device_name, package_name, base_directory):
    logger.info("Getting crash logs")

    command = f'adb -s {device_name} logcat -b crash'

    # Specify the output file
    output_file = f'{base_directory}/{package_name}_crash_log.txt'

    # Open the file in write mode
    with open(output_file, 'a+') as file:
        # Run the command and redirect the output to the file
        await asyncio.create_subprocess_shell(command,
                                              stdout=file,
                                              stderr=subprocess.STDOUT)
    logger.info(f"Done getting crash logs at {package_name}")


def does_contain_package(device_name, package_name):
    command = [
        'adb', '-s', device_name, 'shell', 'pm', 'list', 'packages',
        package_name
    ]
    output = subprocess.check_output(command).decode('utf-8')
    return output and not output == ''


async def main(device_name: str, package_name: str, script_file: str,
               ssl_offset, use_mbed_tls, delay_scenes, is_rooted, manual):

    logger.info("Staring AUTOVR:")
    logger.info(f"  device_name = {device_name}")
    logger.info(f"  package_name = {package_name}")
    logger.info(f"  script_file = {script_file}")
    logger.info(f"  ssl_offset = {ssl_offset}")
    logger.info(f"  use_mbed_tls = {use_mbed_tls}")
    logger.info(f"  delay_scenes = {delay_scenes}")
    logger.info(f"  is_rooted = {is_rooted}")
    logger.info(f"  manual = {manual}")

    if not does_contain_package(device_name, package_name):
        logger.warning(f"{device_name} does not have package {package_name}")
        return

    # originally from run.py: setup_base
    # preload the Unity symbols for the provided app
    il2cpp_script_json = None
    if script_file != "" and os.path.exists(script_file):
        with open(script_file, "r", encoding="utf-8") as f:
            il2cpp_script_json = json.loads(f.read())
    elif script_file != "":
        raise RuntimeError(
            "Must provide a valid script_json file from il2cppdumper")

    delay_scenes = int(delay_scenes)

    autovr_frida = AutoVRLaunchableFridaAppImpl(
        device_name=device_name,
        package_name=package_name,
        rooted=is_rooted,
        ssl_offset=ssl_offset,
        use_mbed_tls=use_mbed_tls,
        il2cpp_script_json=il2cpp_script_json,
    )

    controller = AutoVRFridaAppController(autovr_frida, manual, delay_scenes)

    setup_crash_logs(device_name)

    controller.start()

    autovr_frida.frida_kill(package_name)
    time.sleep(3)
    await extract_crash_logs(device_name, package_name, "/tmp/")


if __name__ == '__main__':

    parser = argparse.ArgumentParser(
        description='Run AutOVR on a single package.')
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
        'The amount of delay (seconds) between scene loading and event parsing.'
    )
    parser.add_argument('--rooted',
                        metavar='is_rooted',
                        type=bool,
                        default=False,
                        required=False,
                        help='Set to true if the device is rooted.')
    parser.add_argument(
        '--manual',
        metavar='manual',
        type=bool,
        default=False,
        required=False,
        help='Set to true if a manual prompt is needed per scene.')
    args = parser.parse_args()

    asyncio.run(
        main(args.device, args.package, args.script_file, args.ssl_offset,
             args.use_mbed_tls, args.delay_scenes, args.rooted, args.manual))

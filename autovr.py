import os
import concurrent
import time
import subprocess
import asyncio
import threading
import argparse
from dataclasses import dataclass
from py.run import *
from py.run_bypass_all_ssl_pinnings import *


@dataclass
class Status:
    tries: int
    should_cont: bool


stop_event = threading.Event()


def run_async(script, device, pid, tries, script_file, host, states,
              delay_scenes, timeout):

    setup_base(script, device, pid, script_file)

    #loop = asyncio.new_event_loop()
    #asyncio.set_event_loop(loop)

    # Possibly error prone here, if count_scenes() fails.
    if "num_scenes" not in states:
        states["num_scenes"] = -1
    if states["num_scenes"] == -1:
        states["num_scenes"] = count_scenes()
    try:
        # Use asyncio.run() to run the asynchronous task with a timeout
        asyncio.run(
            asyncio.wait_for(run(script, host, states, delay_scenes),
                             timeout=timeout))
    except asyncio.TimeoutError:
        print("Async task timed out.")
    print("FINISHED returning", host)
    return


def check_frida_ps_async(event, device_name):
    print("Checking frida processes")
    command = 'frida-ps -D ' + device_name
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    while not event.is_set():
        print("Polling...")

        # Wake up device if off
        command = [
            'adb', '-s', device_name, 'shell', 'dumpsys', 'input_method'
        ]
        interactive = subprocess.check_output(command).decode("utf-8")
        if "mInteractive=false" in interactive:
            print("WAKING DEVICE")
            command = [
                'adb', '-s', device_name, 'shell', 'input', 'keyevent', '26'
            ]
            subprocess.run(command)

        health = loop.run_until_complete(check_health(device_name))
        if not health:
            print("Health check failed.")
            return
        time.sleep(5)
    loop.close()
    return


def setup_crash_logs(device_name):
    print("Clearing log buffer.")

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


def start_ant_monitor(device_name):
    command = [
        'adb', '-s', device_name, 'shell', 'am', 'start', '-n',
        'edu.uci.calit2.anteatermo.dev/edu.uci.calit2.anteater.client.android.activity.AntMonitorLauncherActivity',
        '-a', 'android.intent.action.MAIN', '-c',
        'android.intent.category.LAUNCHER'
    ]
    subprocess.run(command, check=True)


def stop_ant_monitor(device_name):
    package_name = "edu.uci.calit2.anteatermo.dev"
    command = [
        'adb', '-s', device_name, 'shell', 'am', 'force-stop', package_name
    ]
    subprocess.run(command, check=True)


def start_collection(device_name):
    start_collection = [
        'adb', '-s', device_name, 'shell', 'am', 'start-activity', '-n',
        'edu.uci.calit2.anteatermo.dev/edu.uci.calit2.anteater.client.android.activity.VpnStarterActivity',
        '--ez', 'edu.uci.calit2.anteater.EXTRA_DISCONNECT', 'false'
    ]
    subprocess.run(start_collection)


def stop_collection(device_name):
    stop_collection = [
        'adb', '-s', device_name, 'shell', 'am', 'start-activity', '-n',
        'edu.uci.calit2.anteatermo.dev/edu.uci.calit2.anteater.client.android.activity.VpnStarterActivity',
        '--ez', 'edu.uci.calit2.anteater.EXTRA_DISCONNECT', 'true'
    ]
    subprocess.run(stop_collection)


def clear_collection(device_name):
    clear_collection = [
        'adb', '-s', device_name, 'shell', 'rm', '-rf', '/sdcard/antmonitor/*'
    ]
    try:
        subprocess.run(clear_collection, check=True)
    except:
        print("Collection Cleared")


def get_pcaps_from_collection(device_name, results_directory, package):
    pcaps_command = [
        './get_pcaps.sh', '-s', f'{device_name}', '-d',
        f'{results_directory}/', f'{package}'
    ]
    subprocess.run(pcaps_command, check=True)


def is_antmonitor_running(device_name):
    try:
        # Run adb shell command to check if antmonitor process is running
        output = subprocess.check_output([
            'adb', '-s', device_name, 'shell', 'pidof',
            'edu.uci.calit2.anteatermo.dev'
        ]).decode().strip()
        if output:
            return True
        else:
            return False
    except subprocess.CalledProcessError:
        # Error occurred, antmonitor might not be installed or device not connected
        return False


def does_contain_package(device_name, package_name):
    command = [
        'adb', '-s', device_name, 'shell', 'pm', 'list', 'packages',
        package_name
    ]
    output = subprocess.check_output(command).decode('utf-8')
    return output and not output == ''


async def main(device_name, package_name, script_file, ssl_offset,
               use_mbed_tls, delay_scenes, timeout, is_rooted, use_antmonitor,
               results_directory):

    if not does_contain_package(device_name, package_name):
        print(f"{device_name} does not have package {package_name}")
        return
    delay_scenes = int(delay_scenes)
    timeout = int(timeout)
    pid = None

    if use_antmonitor:
        if is_antmonitor_running(device_name):
            stop_collection(device_name)
            clear_collection(device_name)
        else:
            start_ant_monitor(device_name)
            time.sleep(5)
        print("STARTING COLLECTION")
        start_collection(device_name)

    try:
        # Housekeeping
        curr_scene = -1
        last_scene = -1
        status = Status(0, True)
        states = {"curr_scene": 0, "num_scenes": -1}

        while status.should_cont:
            print("Starting")
            setup_crash_logs(device_name)

            script, device, pid = setup(device_name, package_name, ssl_offset,
                                        use_mbed_tls, is_rooted)
            print("Done setup")
            if script is None and device is None and pid is None:
                print(
                    "Frida not properly setup, ensure Frida is running on the device."
                )
                return

            event = threading.Event()
            # Submit the functions to the executor
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)

            run_future = executor.submit(run_async, script, device, pid,
                                         status.tries, script_file,
                                         package_name, states, delay_scenes,
                                         timeout)

            # Health checking
            check_future = executor.submit(check_frida_ps_async, event,
                                           device_name)

            # Wait until the first function is done
            for future in concurrent.futures.as_completed(
                [run_future, check_future]):
                print("CURRENT SCENE", states["curr_scene"])
                print(future)
                try:
                    future.result()
                except Exception as err:
                    raise err
                # If frida process is lost (a crash)
                if future is check_future:
                    # Restart to scene
                    print("Crash occurs, restarting...")
                    if status.tries > 2:
                        print("Too many crash tries, exiting", package_name)
                        status.should_cont = False
                        break
                    curr_scene = states["curr_scene"]
                    if last_scene == curr_scene:
                        status.tries += 1
                        print("Scene", curr_scene, "attempt", status.tries)
                    else:
                        status.tries = 0
                        last_scene = curr_scene
                    break
                # Scene successfully finished
                elif future is run_future:
                    status.should_cont = False
                    print("Success")
                    print("AutoVR finished executing, shutting down...")
                    event.set()
                    # Shutdown the executor
                    break

            executor.shutdown(wait=False)
            # Get crash logs
            print("Getting crash logs")
            await extract_crash_logs(device_name, package_name, "/tmp/")
            print(f"Done getting crash logs at {package_name}")
    except Exception as e:
        print("autovr Error:", e)
        raise e

    frida_kill(package_name, device_name, is_rooted)
    time.sleep(3)

    if use_antmonitor:
        print("STOPPING COLLECTION")
        stop_collection(device_name)
        time.sleep(5)
        print("COLLECTING RESULTS")
        get_pcaps_from_collection(device_name, results_directory, package_name)

    print("Done")


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
    type=str,
    default='3000',
    required=False,
    help=
    'The amount of delay (seconds) between scene loading and event parsing.')
parser.add_argument('--timeout',
                    metavar='timeout',
                    type=str,
                    default='600',
                    required=False,
                    help='The amount of time (s) to perform AutoVR.')
parser.add_argument('--rooted',
                    metavar='is_rooted',
                    type=bool,
                    default=False,
                    required=False,
                    help='Set to true if the device is rooted.')
parser.add_argument(
    '--antmonitor',
    metavar='antmonitor',
    type=bool,
    default=False,
    required=False,
    help='Set to true if you want to collect traffic via AntMonitor.')
parser.add_argument('--results',
                    metavar='results_directory',
                    type=bool,
                    default='../results/',
                    required=False,
                    help='The directory to put AntMonitor results in.')
args = parser.parse_args()
asyncio.run(
    main(args.device, args.package, args.script_file, args.ssl_offset,
         args.use_mbed_tls, args.delay_scenes, args.timeout, args.rooted,
         args.antmonitor, args.results))

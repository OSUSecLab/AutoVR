import os
import concurrent
import time
import subprocess
import asyncio
import threading
import argparse
from run import *
from run_bypass_all_ssl_pinnings import *

results_directory = '../results/pcaps/test'
root = '/Volumes/'
apk_map_file = root + 'F/sidequest/apks_map.txt'
libunity_directory = root + 'LENOVO_USB_HDD/Unity/unity_so_files'
stop_event = threading.Event()


def add_done_apk(apk_name, done_path):
    with open(done_path, 'a') as file:
        file.write(apk_name + '\n')


def read_done_files(done_path):
    with open(done_path, 'r') as file:
        lines = file.readlines()
        lines = [line.strip() for line in lines]
        return lines


def parse_apk_map(file_path):
    apk_dict = {}

    with open(file_path, 'r') as file:
        for line in file:
            line = line.strip()
            apk_file, apk_name = line.split(':')
            apk_dict[apk_name] = apk_file

    return apk_dict


def run_async(script, device, pid, tries, script_file, host, states):

    setup_base(script, device, pid, script_file)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    if states["num_scenes"] == -1:
        states["num_scenes"] = count_scenes()

    print("Running", host)
    device.resume(pid)
    loop.run_until_complete(run(script, host, states))
    loop.close()
    print("FINISHED", host)


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


def start_collection(device_name):
    start_collection = [
        'adb', '-s', device_name, 'shell', 'am', 'start-activity', '-n',
        'edu.uci.calit2.anteatermo.dev/edu.uci.calit2.anteater.client.android.activity.VpnStarterActivity',
        '--ez', 'edu.uci.calit2.anteater.EXTRA_DISCONNECT', 'false'
    ]
    subprocess.run(start_collection)
    time.sleep(5)


def stop_collection(device_name):
    stop_collection = [
        'adb', '-s', device_name, 'shell', 'am', 'start-activity', '-n',
        'edu.uci.calit2.anteatermo.dev/edu.uci.calit2.anteater.client.android.activity.VpnStarterActivity',
        '--ez', 'edu.uci.calit2.anteater.EXTRA_DISCONNECT', 'true'
    ]
    subprocess.run(stop_collection)


def clear_collection(device_name):
    clear_collection_command = [
        'adb', '-s', device_name, 'shell', 'rm', '-rf', '/sdcard/antmonitor/*'
    ]
    subprocess.run(clear_collection_command, check=True)


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


def start_antmonitor(device_name):
    package_name = "edu.uci.calit2.anteatermo.dev"
    # Stop the process if any
    stop_command = f"adb -s {device_name} shell am force-stop {package_name}"
    subprocess.run(stop_command, shell=True)

    # Wait for a short time to ensure the process is fully stopped before starting it again
    time.sleep(2)

    # Start the process
    start_command = f"adb -s {device_name} shell am start -n \"{package_name}/edu.uci.calit2.anteater.client.android.activity.AntMonitorLauncherActivity\" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER"
    subprocess.run(start_command, shell=True)
    # Wait for a short time to ensure the process is fully loaded
    time.sleep(2)


async def main(device_name, base_directory, done_path):

    names = parse_apk_map(apk_map_file)
    # Get the list of directories in the base directory
    directories = [
        d for d in os.listdir(base_directory)
        if os.path.isdir(os.path.join(base_directory, d))
    ]

    #print("Starting AntMonitor...")
    #start_antmonitor(device_name)

    # Process each directory
    for directory in directories:
        done_files = read_done_files(done_path)
        # Extract the directory name without the path
        dir_name = os.path.basename(directory)
        if dir_name in done_files:
            continue
        print("RUNNING", dir_name)

        # Run the command: adb shell pm list packages <dir_name>
        command = [
            'adb', '-s', device_name, 'shell', 'pm', 'list', 'packages',
            dir_name
        ]
        output = subprocess.check_output(command).decode('utf-8')

        #dumped_apk_dir = f'{directory}'
        dumped_apk_dir = f'{base_directory}/{dir_name}'
        script_file = f'{dumped_apk_dir}/script.json'
        skipped = False

        try:
            ssl_offset = None
            use_mbed_tls = False
            (ssl_offset,
             use_mbed_tls) = SSLOffsetFinder(dumped_apk_dir,
                                             libunity_directory).find_offset()
            print("SSL OFFSET:", ssl_offset)

            # If there is no output, run the command: adb install <dir_name>.apk
            if not output or output == '':
                # print("Downloading", dir_name, "from", names[dir_name])
                # apk_file = f'{dir_name}'
                # install_command = [
                #     'adb', '-s', device_name, 'install', names[apk_file]
                # ]
                # subprocess.run(install_command, check=True)
                add_done_apk(dir_name, done_path)
                continue

            # Housekeeping
            curr_scene = -1
            last_scene = -1
            tries = 0
            should_cont = True
            states = {}

            clear_collection(device_name)
            time.sleep(5)

            while should_cont:
                print("Starting")
                setup_crash_logs(device_name)

                script, device, pid = setup(device_name, dir_name, ssl_offset,
                                            use_mbed_tls)

                if script is None and device is None and pid is None:
                    print("Skipping", dir_name)
                    skipped = True
                    break

                skipped = False
                # Start AntMonitor collection
                start_collection(device_name)

                event = threading.Event()
                # Submit the functions to the executor
                executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
                check_future = executor.submit(check_frida_ps_async, event,
                                               device_name)

                if curr_scene == -1:
                    states["curr_scene"] = 0
                    states["num_scenes"] = -1

                run_future = executor.submit(run_async, script, device, pid,
                                             tries, script_file, dir_name,
                                             states)

                # Wait until the first function is done
                for future in concurrent.futures.as_completed(
                    [run_future, check_future]):

                    # If frida process is lost (a crash)
                    if future is check_future:
                        # Restart to scene
                        print("Crash occurs, restarting...")
                        if tries > 2:
                            print("Too many crash tries, exiting", dir_name)
                            should_cont = False
                            break
                        curr_scene = states["curr_scene"]
                        if last_scene == curr_scene:
                            tries += 1
                            print("Scene", curr_scene, "attempt", tries)
                        else:
                            tries = 0
                            last_scene = curr_scene
                        break
                    # Scene successfully finished
                    elif future is run_future:
                        should_cont = False
                        print("Success")
                        break

                    print("CURRENT SCENE", states["curr_scene"])

                event.set()
                # Shutdown the executor
                executor.shutdown(wait=False)

                # Get crash logs
                #print("Getting crash logs")
                #await extract_crash_logs(device_name, dir_name, base_directory)
                #print("Done getting crash logs")
        except Exception as e:
            print("run_all Error:", e)

        frida_kill(device_name)
        time.sleep(3)

        # TODO: clean up start and stop collection based off failure to setup frida and apk
        # Stop AntMonitor collection
        if not skipped:
            stop_collection(device_name)

        time.sleep(5)
        pcaps_command = [
            './get_pcaps.sh', '-s', f'{device_name}', '-d',
            f'{results_directory}/{dir_name}', f'{dir_name}'
        ]
        subprocess.run(pcaps_command, check=True)
        add_done_apk(dir_name, done_path)


parser = argparse.ArgumentParser(description='Run AutOVR')
parser.add_argument('--device', metavar='device', type=str, required=True)
parser.add_argument('--unpacked', metavar='unpacked', type=str, required=True)
parser.add_argument('--done', metavar='done', type=str, required=True)
args = parser.parse_args()
asyncio.run(main(args.device, args.unpacked, args.done))

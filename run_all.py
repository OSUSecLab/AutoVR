import os
import concurrent
import time
import subprocess
import asyncio
import argparse
from py.run_bypass_all_ssl_pinnings import *

results_directory = '../results/pcaps/'
root = '/Volumes/'
apk_map_file = root + 'F/sidequest/apks_map.txt'
libunity_directory = root + 'LENOVO_USB_HDD/Unity/unity_so_files'


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


def run_autovr(device_name, package, script_file, delay_scenes,
               results_directory, ssl_offset, use_mbed_tls, timeout,
               is_rooted):
    subprocess.run([
        'python3.11', 'autovr.py', '--device', device_name, '--package',
        package, '--results', results_directory, '--ssl-offset',
        str(ssl_offset), '--use-mbed-tls',
        str(use_mbed_tls), '--delay_scenes',
        str(delay_scenes), '--timeout',
        str(timeout), '--antmonitor', 'True'
    ])


async def main(device_name, base_directory, done_path, is_rooted):

    names = parse_apk_map(apk_map_file)
    # Get the list of directories in the base directory
    directories = [
        d for d in os.listdir(base_directory)
        if os.path.isdir(os.path.join(base_directory, d))
    ]

    # Process each directory
    for directory in directories:
        done_files = read_done_files(done_path)
        # Extract the directory name without the path
        dir_name = os.path.basename(directory)
        if dir_name in done_files:
            continue
        package_name = dir_name
        print("RUNNING", package_name)

        # Run the command: adb shell pm list packages <package_name>
        command = [
            'adb', '-s', device_name, 'shell', 'pm', 'list', 'packages',
            package_name
        ]
        output = subprocess.check_output(command).decode('utf-8')

        #dumped_apk_dir = f'{directory}'
        dumped_apk_dir = f'{base_directory}/{package_name}'
        script_file = f'{dumped_apk_dir}/script.json'

        ssl_offset = None
        use_mbed_tls = False
        (ssl_offset,
         use_mbed_tls) = SSLOffsetFinder(dumped_apk_dir,
                                         libunity_directory).find_offset()
        print("SSL OFFSET:", ssl_offset)

        # If there is no output, run the command: adb install <package_name>.apk
        if not output or output == '':
            # print("Downloading", package_name, "from", names[package_name])
            # apk_file = f'{package_name}'
            # install_command = [
            #     'adb', '-s', device_name, 'install', names[apk_file]
            # ]
            # subprocess.run(install_command, check=True)
            add_done_apk(package_name, done_path)
            continue

        # 10 minute timeout.
        run_autovr(device_name=device_name,
                   package=package_name,
                   script_file=script_file,
                   results_directory=results_directory,
                   ssl_offset=ssl_offset,
                   use_mbed_tls=use_mbed_tls,
                   delay_scenes=5000,
                   timeout=600,
                   is_rooted=is_rooted)

        add_done_apk(package_name, done_path)


parser = argparse.ArgumentParser(description='Run AutoVR at large scale.')
parser.add_argument('--device', metavar='device', type=str, required=True)
parser.add_argument('--unpacked', metavar='unpacked', type=str, required=True)
parser.add_argument('--done', metavar='done', type=str, required=True)
parser.add_argument('--rooted',
                    metavar='rooted',
                    type=bool,
                    required=False,
                    default=False)
args = parser.parse_args()
asyncio.run(main(args.device, args.unpacked, args.done, args.rooted))

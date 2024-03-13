import os
import frida
import traceback
import time
import sys
import json
import rpc
import multiprocessing
import subprocess
from mi_builder import *
from cfg_payload import PayloadBuilder
import asyncio
from threading import *

protocol = rpc.RPC()
target_methods = ["LoadSceneAsync"]
blacklist = ["Object", "IntPtr", "StringBuilder", "String", "Number"]

_methods = {}
_blacklist = []
_resolved = {}
_resolving = set()
_events = []

_leaks = {}
_collisions = {}
_triggers = {}
_objects_scene = {}
_scene_events = {}
_ui_events = {}
_resolved_deps = 0
_unity_events = {}
_per_event = {}

branch_count = 0

last_scene = 0


def analyze_events(events):
    branch_count = 0
    events_trigger = {}
    for event in events:
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
            script.post({'type': 'targets', 'payload': json.dumps(data)})
        elif payload["type"] == "events_to_analyze":
            events = payload["data"]
            events_trigger = analyze_events(events)
            script.post({
                'type': 'events_to_analyze',
                'payload': json.dumps(events_trigger)
            })
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


def contains_targets(name):
    for target in target_methods:
        if "$$" in name:
            if target in name[name.index("$$") + 2:]:
                return True
        elif target in name:
            return True
    return False


def parse_all_methods(all_methods):
    for addr, name in all_methods:
        _methods[addr] = name


def parse_events(events):
    for addr in events.keys():
        _events.append(addr)


def parse_instructions(ins, count):
    method_instructions = []
    for addr, inst in ins.items():
        #print("Resolving", addr)
        ins_list = inst["instructions"]
        name = _methods[addr]
        #if count == 0:
        #    print(name)
        builder = MethodInstructionsBuilder(name, protocol, True, _methods,
                                            _resolved, _resolving)

        for ins_meta in ins_list:
            builder.add_instruction(Instruction(ins_meta))
        _resolved[addr] = builder.build_and_clear()

        mi = _resolved[addr]
        method_instructions.append(mi)

        need_resolved = []
        for branch in mi.branches:
            if branch not in _resolved and branch not in _resolving:
                if branch in _methods and contains_targets(_methods[branch]):
                    mi.contains_target = True
                    print("FOUND METHOD")
                _resolving.add(branch)
                need_resolved.append(branch)
            elif branch not in _resolving:
                if branch in _methods and contains_targets(_methods[branch]):
                    mi.contains_target = True
                    print("FOUND METHOD")

        if len(need_resolved) > 0:
            # RPC call for branch addrs
            b_ins = protocol.get_instructions(need_resolved)
            mis = parse_instructions(json.loads(b_ins), count + 1)
            for branch_mis in mis:
                method_instructions.append(branch_mis)
                mi.contains_target = mi.contains_target or branch_mis.contains_target
            for resolved in need_resolved:
                _resolving.remove(resolved)

    return method_instructions


def print_results(package, scene, branches, time):
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
        with open(f"../data/{package}_{name}_{scene}.json", "w") as f:
            # Use the json.dump method to write the dictionary to the file in JSON format
            json.dump(dictionary, f)
    with open(f"../data/{package}_resolved_{scene}.json", "w") as f:
        # use the json.dump method to write the dictionary to the file in json format
        json.dump(_resolved_deps, f)

    with open(f"../data/{package}_branches_{scene}.json", "w") as f:
        # use the json.dump method to write the dictionary to the file in json format
        json.dump(branches, f)
    with open(f"../data/{package}_time_{scene}.json", "w") as f:
        # use the json.dump method to write the dictionary to the file in json format
        json.dump(str(time), f)


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


def init(curr_scene):
    _leaks[curr_scene] = []
    _triggers[curr_scene] = 0
    _unity_events[curr_scene] = {}
    _per_event[curr_scene] = []
    _collisions[curr_scene] = 0
    _ui_events[curr_scene] = []


def _process_pids(pids):
    final = dict()
    for pid in pids:
        pid_entry = pid.lstrip().rstrip()  # remove trailing whitespace
        if pid_entry != '':
            process_id, name = pid_entry.split('  ', 1)
            final[name] = process_id
    return final


def frida_ps_list(device_name):
    command = ['frida-ps', '-D', device_name]
    process = subprocess.Popen(command,
                               stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE)
    out, err = process.communicate()
    pids = out.decode("utf-8").split("\n")[2:]
    pids = _process_pids(pids)
    return pids


def find_package_pid(package, device_name, rooted=False):
    if not rooted:
        print("Device not rooted, using re.frida.Gadget instead.")
        package = "re.frida.Gadget"
    pids = frida_ps_list(device_name)
    if package in list(pids.keys()):
        return int(pids[package])
    return -1


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


def run_command(command):
    return subprocess.check_output(command.split()).decode("utf-8")


def run_check_errors(cmd):
    proc = subprocess.Popen(cmd.split(),
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE)
    return proc.stderr.read().decode()


def spawn_package(device_name, package):
    start_command = f"adb -s {device_name} shell am start -n {package}/com.unity3d.player.UnityPlayerActivity"
    for i in range(1):
        output = run_check_errors(start_command)
        if "Error type 3" in output:
            return False
        time.sleep(3)
    return True


async def main():
    n = len(sys.argv)
    if n != 3:
        print("Usage: python3 run.py <host package> <script.json>")
        exit()
    host = sys.argv[1]
    file = sys.argv[2]
    print(host)
    print(file)
    num_scenes = await count_scenes()
    await run(host, file, num_scenes, 0)


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
    script = session.create_script(open("../index.out.js").read())

    protocol.set_export_sync(script.exports_sync)
    protocol.set_export_async(script.exports_async)
    script.load()
    script.on('message', on_message)

    if ssl_offset != '':
        setup_ssl_pin_offset(script, ssl_offset, use_mbed_tls)

    return (script, device, pid)


def setup_ssl_pin_offset(script, offset, use_mbed_tls):
    script.post({
        'type': 'cert_func',
        'offset': offset,
        'use_mbed_tls': use_mbed_tls
    })


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


def get_unity_version():
    return protocol.get_unity_version()


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


async def start(curr_scene, start_time, states, delay_scenes):
    try:
        states["curr_scene"] = curr_scene
        init(curr_scene)

        # Delay so all objects can load once the scene is loaded.
        time.sleep(delay_scenes)

        protocol.load_scene(curr_scene)
        if curr_scene != 0: protocol.unload_scene(curr_scene - 1)
        init_events = protocol.load_scene_events(curr_scene)

        (events_trigger, inital_branch_count) = analyze_events(init_events)
        print(events_trigger)
        (all_events, next_branch_count) = await trigger_events(events_trigger)
        print("FINISH SCENE")

        _scene_events[curr_scene] = all_events
        end_time = time.time()
        branch_count = inital_branch_count + next_branch_count

        #print_results(host, curr_scene, branch_count,
        #              end_time - start_time)

        print("Time taken:", end_time - start_time)
        print("Scene: ", curr_scene, " | ", "Objects:",
              _objects_scene[curr_scene])
        if curr_scene in _per_event:
            print("Events: ", _per_event[curr_scene])
        if curr_scene in _collisions:
            print("Collisions:", _collisions[curr_scene])
        if curr_scene in _triggers:
            print("Triggers:", _triggers[curr_scene])
        print("Branches:", branch_count)
        return True
    except Exception as err:
        print(err)
        return False


async def run(script, host, states, delay_scenes):
    global _resolved_deps
    num_scenes = states["num_scenes"]
    start_scene = states["curr_scene"]

    start_time = time.time()
    ins_feeder = InstructionFeeder.get_instance()
    ins_feeder.add_rpc(protocol)

    print("NUMBER OF SCENES:", num_scenes)
    for curr_scene in range(start_scene, num_scenes):
        print(curr_scene)
        if not (await start(curr_scene, start_time, states, delay_scenes)):
            continue
        states["curr_scene"] = curr_scene
    #await start(0, start_time, states, delay_scenes)


# if wanted to run standalone.
#asyncio.run(main())

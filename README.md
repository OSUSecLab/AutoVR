# AutoVR
Everything in ts needs to be compiled. index.out.js is the compiled ts code and is the only ts depeendency that run.py needs.

Usage: python3 run.py \<device name\> \<host package\> \<script.json\>

device\_name = the device name you get from adb devices.

host package = the apk package name on the device.

script.json = run Il2CppDumper on the disassembled apk and get the script.json file as this path.

# mi\_builder.py
This file essentially was an old experimental idea of adding symbolic execution based off the assembly instructions of the event function callbacks. It is no longer being used and is not part of the main code. Feel free to take a look or not use it at all.


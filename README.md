# AutoVR
Everything in ts needs to be compiled. index.out.js is the compiled ts code and is the only ts depeendency that run.py needs. To compile, run the compile.sh script in the ts folder to produce the index.out.js file.


Usage: python3 run.py \<device name\> \<host package\> \<script.json\>

device\_name = the device name you get from adb devices.

host package = the apk package name on the device.

script.json = run Il2CppDumper on the disassembled apk and get the script.json file as this path.


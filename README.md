# AutoVR
Everything in ts needs to be compiled. index.out.js is the compiled ts code and is the only ts dependency that run.py needs. To compile, run the compile.sh script in the ts folder to produce the index.out.js file.


Usage: python3 run.py \<device name\> \<host package\> \<script.json\>

device\_name = the device name you get from adb devices.

host package = the apk package name on the device.

script.json = run Il2CppDumper on the disassembled apk and get the script.json file as this path.


## Details

First ensure Frida server is running on the device. More details can be found [here](https://frida.re/docs/android/).

Build the AutoVR codebase. In the `ts/` directory, run:

```
npm install
```

A slight unintended side effect is that this command generates Frida code that fails to compile. You will most likely
need to fix this before the next step.

Change all occurrences of `??=` to `=`. To find said occurences, just run `grep -R "??="` and only replace the occurences in the `index.out.js` file.

Then we should be able to compile without issue using:

```
./compile.sh
```

This should complete building the AutoVR codebase. Next we need to generate the `script.json` file.

To start, dissassemble the apk of the target package. You can find the list of packages and apk locations on the device using `pm list packages -f`. Use [apktool](https://apktool.org/) on the apk file:

```
apktool d <apk path>.apk
```

We then need to run [Il2CppDumper](https://github.com/Perfare/Il2CppDumper) on the dissassembled apk. This can be done using:

```
Il2CppDumper <unpacked apk path>/lib/arm64-v8a/libil2cpp.so <unpacked apk path>/assets/bin/Data/Managed/Metadata/global-metadata.dat output_dir/
```

We now have all of the files present to run the AutoVR analysis.

```
python3 autovr.py --device <device name> --package <package name> --script-file output_dir/script.json --rooted is_rooted
```

In this case the package name is the name found in the command `pm list packages`, and the device name is the name of the device found in the command `adb devices`.
For example, your package name might look like "com.AGVR.ArtGateVR" and your device name might look something like "1WMHH816NU0432".

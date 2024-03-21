# AutoVR

An automated UI and event tester for Unity VR games.

## Installation
1. Install the dependencies:
```
python >= 3.11
node >= v20.2.0
frida == 16.0.19
adb >= 33.0.3
```
2. Install frida 16.0.19 Android ARM64 binaries [[here][1]].
3. Clone this repository.
```
git clone https://github.com/OSUSecLab/AutoVR.git
```
4. Enter repository directory and run the following commands:
```bash
cd ts/
npm install
./compile.sh
```
5. Exit the compile script ^C.

## Usage

### For non-rooted devices.
Ensure you inject Frida Gadget with the same version of the frida ARM64 binary.
You can use common Frida Gadget injectors like ```objection``` [[here][3]] to inject Frida Gadget into your apk.

### For rooted devices.
Ensure Frida server binary is running on the device.

### Flag Table
| flag         | description                                                                                                                       | Required? |
|--------------|-----------------------------------------------------------------------------------------------------------------------------------|-----------|
| device       | Device ID connected using ```adb devices```                                                                                       | Y         |
| package      | Name of the target package.                                                                                                       | Y         |
| script-file  | The ```script.json``` file from Il2CppDumper [[here][2]].                                                                         | N         |
| ssl-offset   | For network: If SSL bypass is needed, this is the hexadecimal offset value of the Unity SSL pinning function.                     | N         |
| use-mbed-tls | For network: If ```mbedtls_x509_crt_verify_with_profile``` SSL pinning function is used.                                          | N         |
| delay_scenes | Seconds between scene loads to wait before event loading starts.                                                                  | N         |
| rooted       | If the device is rooted and frida-server-arm64 is running on the device.                                                          | N         |

### Usage
```bash
usage: autovr.py [-h] --device device --package package_name [--script-file script_file] [--ssl-offset ssl_offset] [--use-mbed-tls use_mbed_tls]
                 [--delay_scenes delay_scenes] [--rooted is_rooted]
```

Example:

```bash
python3.11 autovr.py --device 1WMHHA69J92123 --package com.my.package \
                      --script-file /path/to/script.json \
                      --ssl-offset 0xdeadbeef \
                      --use-mbed-tls True \
                      --delay_scenes 5 \
                      --rooted False
```

## License
```AutoVR``` is licensed under the MIT License.


[1]: https://github.com/frida/frida/releases
[2]: https://github.com/Perfare/Il2CppDumper
[3]: https://github.com/sensepost/objection


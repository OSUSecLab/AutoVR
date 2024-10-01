# AutoVR

An automated UI and event tester for Unity VR games.

## Installation
1. Install the dependencies:
   * python >= 3.11
   * node >= v20.2.0
   * adb >= 33.0.3
   * in Python environment, run
     ```
     pip install -r requirements.txt
     ```

2. Install frida 16.0.19 Android ARM64 binaries [[here][1]].
3. Clone this repository.
```
git clone https://github.com/OSUSecLab/AutoVR.git
```
4. Build AutoVR frida dependencies by:
```bash
make
```

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
| delay_scenes | Milliseconds between scene loads to wait before event loading starts.                                                             | N         |
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
                      --delay_scenes 5000 \
                      --rooted False
```


License
=======
    Copyright 2024 The AutoVR Authors 

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

[1]: https://github.com/frida/frida/releases
[2]: https://github.com/Perfare/Il2CppDumper
[3]: https://github.com/sensepost/objection


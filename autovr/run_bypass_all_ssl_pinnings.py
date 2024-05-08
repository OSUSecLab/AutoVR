'''
ADAPTED FROM OVRSeen, most, if not all, code is thanks to the UC Irvine Networking Group.

https://github.com/UCI-Networking-Group/OVRseen/blob/main/network_traffic/traffic_collection/cert_validation_bypass/run_bypass_all_ssl_pinnings.py
'''

from argparse import ArgumentParser
import os
import subprocess
import re
from difflib import get_close_matches

ARM_64BIT = 'arm64-v8a'
ARM_32BIT = 'armeabi-v7a'
CERT_FUNC = 'mbedtls_x509_crt_verify_with_profile'
CERT_FUNC_BACKUP = 'x509_crt_verify_restartable_ca_cb'


class SSLOffsetFinder():

    def __init__(self, apk_dir, libunity_dir):
        self.apk_dir = apk_dir
        self.libunity_dir = libunity_dir

    def _get_address(self, arch, pre, sig):
        # find the signature within the file
        file_path = os.path.join(self.apk_dir, 'lib', arch, 'libunity.so')
        print("pre: " + pre)
        print("sig: " + sig)
        offset = open(file_path, 'rb').read().find(bytes.fromhex(pre + sig))
        if offset != -1:
            print("Found offset: " + hex(offset + 4))
            return hex(offset + 4)

        # return None if signature is not found
        return 0x0

    def _get_sig(self, version, arch, function):
        is_backup = function == CERT_FUNC_BACKUP
        unity_dir = self.libunity_dir
        path = os.path.join(unity_dir, version)
        if not os.path.exists(path):
            try:
                version = get_close_matches(version,
                                            os.listdir(unity_dir),
                                            n=1)[0]
                path = os.path.join(unity_dir, version)
            except IndexError:
                return None

        # find symbol file for the given unity version
        # Full version
        #file_path = os.path.join(path, 'il2cpp', 'Release', 'Symbols', arch, 'libunity.sym.so')
        # Stripped down version
        file_path = os.path.join(path, 'Symbols', arch, 'libunity.sym.so')
        command = 'nm -a ' + file_path + ' | grep -m 1 ' + function + '; exit 0'
        # look for function address
        print(command)
        output = subprocess.check_output(command, shell=True)
        # the Unity versions that are before 2018 do not have mbedtls symbols (maybe they did not use the mbedtls library before then)
        if not output:
            print(
                "INFO: Unity versions before 2018 do not have mbedtls symbols/do not use the mbedtls library"
            )
            return None, None

        output = re.split(r"\s", output.decode('utf-8'), 1)
        address = re.search(r'[^0].*', output[0])  # strip front 0s
        # we need to get 4 bytes before and 16 bytes after the address
        address = int(address.group(0), 16)
        pre_addr = address - 4

        # look for func signature at the address found
        # Full version
        #file_path = os.path.join(path, 'il2cpp', 'Release', 'Libs', arch, 'libunity.so')
        # Stripped down version
        file_path = os.path.join(path, 'Libs', arch, 'libunity.so')
        # get the function signature itself
        if is_backup:
            # If the function is CERT_FUNC_BACKUP, we must search for 32 byte signature instead of 16.
            # Using 16 causes collisions with a shader critical function.
            command = 'xxd -l 32 -g 32 -s ' + str(
                address) + ' ' + file_path + ' ; exit 0'
        else:
            command = 'xxd -l 16 -g 16 -s ' + str(
                address) + ' ' + file_path + ' ; exit 0'

        print(command)
        signature = subprocess.check_output(command, shell=True)

        if is_backup:
            signature_0 = re.split(r"\n",
                                   signature.decode('utf-8'))[0].split(" ")[1]
            signature_1 = re.split(r"\n",
                                   signature.decode('utf-8'))[1].split(" ")[1]
            signature = signature_0 + signature_1
        else:
            signature = re.split(r"\s", signature.decode('utf-8'))[1]

        #print("SIGNATURE:", signature)
        # get the 4-byte preamble
        command = 'xxd -l 4 -g 4 -s ' + str(
            pre_addr) + ' ' + file_path + ' ; exit 0'
        print(command)
        preamble = subprocess.check_output(command, shell=True)
        preamble = re.split(r"\s", preamble.decode('utf-8'))

        # return the unique 4-byte preamble and 20-byte signature
        return preamble[1], signature

    def _get_arch(self):
        # arch is found by checking contents of lib folder
        try:
            arch_dirs = os.listdir(os.path.join(self.apk_dir, 'lib'))
            # if there are two then we have to choose arm64-v8a (i.e., ARM_64BIT)
            if ARM_32BIT in arch_dirs:
                arch = ARM_32BIT
            if ARM_64BIT in arch_dirs:
                arch = ARM_64BIT
            return arch

        except IndexError:
            return None

    def _get_version(self):
        # find all files in unzipped_apk/assets/bin/Data/
        path = os.path.join(self.apk_dir, 'assets', 'bin', 'Data')
        files = (file for file in os.listdir(path)
                 if os.path.isfile(os.path.join(path, file)))
        # iterate over the files and find the Unity version
        for file in files:
            # find the unity version, stated within file
            command = 'xxd ' + os.path.join(self.apk_dir, 'assets', 'bin',
                                            'Data', file) + '; exit 0'
            output = subprocess.check_output(command, shell=True)
            lines = re.split(r"\n", output.decode('utf-8'), 2)
            # version is within bytes [18, 27], which is usually shown in second line of output
            # has format 20xx.x.xxx
            for line in lines:
                result = re.search(r"20[\w]{2}\.[\w]+\.[\w]+f[\w]+", line)
                if result:
                    return result.group(0).strip()

        return None

    def _find_offset(self, backup=False):
        version = self._get_version()

        if not version:
            print("ERROR: Couldn't find unity version")
            return 0x0
        print("Unity version: " + version)

        arch = self._get_arch()
        print("Architecture: " + arch)
        if not arch:
            print("ERROR: Couldn't find unity architecture")
            return 0x0

        if backup:
            pre, sig = self._get_sig(version, arch, CERT_FUNC_BACKUP)
        else:
            pre, sig = self._get_sig(version, arch, CERT_FUNC)

        if not pre or not sig:
            print("ERROR: Couldn't find signature")
            return 0x0

        func_addr = self._get_address(arch, pre, sig)
        return func_addr

    # (address, True = CERT_FUNC function used | False = CERT_FUNC_BACKUP function used)
    def find_offset(self):
        func_addr = self._find_offset()
        if func_addr != 0x0:
            print(f"{CERT_FUNC} is found at address {func_addr}...")
            return (func_addr, True)
        else:
            print(
                f"{CERT_FUNC} is not found... trying backup function {CERT_FUNC_BACKUP}"
            )
            func_addr = self._find_offset(backup=True)
            if func_addr != 0x0:
                print(f"{CERT_FUNC_BACKUP} is found at address {func_addr}...")
            else:
                print(f"{CERT_FUNC_BACKUP} is not found... returning 0x0")
        return (func_addr, False)

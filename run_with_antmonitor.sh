#!/bin/bash

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <device_name> <package_name> <ssl_offset>"
    exit 1
fi

DEVICE_NAME=$1
PACKAGE_NAME=$2
SSL_OFFSET=$3

# Make autovr
make clean
make node_modules
(cd ./ts && make index.out.js)

adb -s $DEVICE_NAME shell am start -n \"edu.uci.calit2.anteatermo.dev/edu.uci.calit2.anteater.client.android.activity.AntMonitorLauncherActivity\" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER
sleep 2
adb -s "$DEVICE_NAME" shell am start-activity -n edu.uci.calit2.anteatermo.dev/edu.uci.calit2.anteater.client.android.activity.VpnStarterActivity --ez edu.uci.calit2.anteater.EXTRA_DISCONNECT false
sleep 2
python3 autovr.py --device $DEVICE_NAME --package $PACKAGE_NAME --delay_scenes 5000 --ssl-offset $SSL_OFFSET --rooted
sleep 2
adb -s "$DEVICE_NAME" shell am start-activity -n edu.uci.calit2.anteatermo.dev/edu.uci.calit2.anteater.client.android.activity.VpnStarterActivity --ez edu.uci.calit2.anteater.EXTRA_DISCONNECT true 
sleep 2
./get_pcaps.sh -s $DEVICE_NAME -d ./results/$PACKAGE_NAME
adb -s "$DEVICE_NAME" shell rm -rf /sdcard/antmonitor/*
echo "FINISHED $PACKAGE_NAME"

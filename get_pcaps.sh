#!/bin/bash

# From OVRSeen
# https://github.com/UCI-Networking-Group/OVRseen/blob/main/network_traffic/traffic_collection/cert_validation_bypass/get_pcaps.sh

# Function to print usage
print_usage()
{
	echo ""
	echo "A utility script to pull the captured PCAP files from the device."
	echo -e  "Usage:\tget_pcaps.sh [options]"
	echo ""
	echo -e "\t-s\t<device name>"
	echo ""
	echo -e "\t-h\t(print this usage info)"
	echo ""
	echo -e "\t-d\t<destination-directory>"
	echo ""
	exit 1
}

# Get PCAP files
get_pcap_files()
{
	# First argument is device name
	DEV_NAME=$1
	# Second argument is the destination directory
	DEST_DIR=$2
	# Third argument is the path to APK file
	PKG_NAME=$3
	# Get PCAP files from the device
	echo "==> Pulling captured PCAP files..."
	if [[ ! -d $DEST_DIR ]]
	then
		mkdir $DEST_DIR
	fi
	echo -e "$DEV_NAME"
	# Pull per directory
	adb -s $DEV_NAME pull /sdcard/antmonitor
	# Rename the directory
	echo -e "==> PCAP files are stored in $DEST_DIR/$PKG_NAME..."
	# Move per directory
	rm -rf $DEST_DIR/$PKG_NAME
	mv antmonitor $DEST_DIR/$PKG_NAME
	# Delete the PCAP files on the device
	adb -s $DEV_NAME shell 'rm -rf /sdcard/antmonitor/*'
	# Save the logcat_output.log file
	echo -e "==> Saving logcat output into $DEST_DIR/$PKG_NAME..."
	adb -s $DEV_NAME logcat -d > $DEST_DIR/$PKG_NAME/logcat_output.log
	# Uninstall the app
	echo -e "==> Uninstalling $PKG_NAME..."
	#adb -d uninstall $PKG_NAME
	
}


###
# Main body of script
###
# Get input argument and execute the right function
if [[ $1 == '-s' && $3 == '-d' ]]
then
	# Send intent to AntWall to stop the network traffic capture
	#adb -d shell am broadcast \
	#	-a edu.uci.calit2.anteater.client.android.vpn.STOPBACKGROUND \
	#	-n edu.uci.calit2.anteatermo.dev/edu.uci.calit2.anteater.client.android.device.DeviceBootListener
	# Sleep for a bit
	#sleep 3
	get_pcap_files $2 $4 $5 
else
	# Print usage info if there is any mistake
	print_usage
fi

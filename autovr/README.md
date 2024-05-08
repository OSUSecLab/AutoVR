# run.py
This is the main script you would run for a single VR application/apk. Running this will NOT bypass SSL pinning on the Unity side, so keep that in mind.

# mi\_builder.py
This file essentially was an old experimental idea of adding symbolic execution based off the assembly instructions of the event function callbacks. It is no longer being used and is not part of the main code. Feel free to take a look or not use it at all. 

# run\_all.py
This was the main script to run the large scale analysis. Unfortunately, this relies on apk data from an external drive where all the apks that were used in the experiment lives in. This file is only used to perform large scale experiments which may or may not be useful to you.

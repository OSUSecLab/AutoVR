'using strict'

import "frida-il2cpp-bridge";

import {RPC} from './rpc.js';

function run_module() {
  rpc.exports = {
    checkHealth() { return RPC.checkHealth(); },
    getUnityVersion() { return RPC.getUnityVersion(); },
    init(symbol_payload: string, bypassSSLPinning: boolean) {
      return RPC.init(symbol_payload = symbol_payload,
                      bypassSSLPinning = bypassSSLPinning);
    },
    getInstructions(payload) { return RPC.getInstructions(payload); },
    getInstructionsInterval(
        payload) { return RPC.getInstructionsInterval(payload); },
    getMethodsOfClassMethod(
        payload) { return RPC.getMethodsOfClassMethod(payload); },
    getReturnType(payload) { return RPC.getReturnType(payload); },
    resolveSymbols(payload) { return RPC.resolveSymbols(payload); },
    getAllMethods() { return RPC.getAllMethods(); },
    countAllScenes() { return RPC.countAllScenes(); },
    loadSceneEvents(
        scene_index, delay_scenes_ms
        ?) { return RPC.loadSceneEvents(scene_index, delay_scenes_ms); },
    getSceneEvents() { return RPC.getSceneEvents(); },
    loadScene(scene_index) { return RPC.loadScene(scene_index); },
    triggerEvent(payload) { return RPC.triggerEvent(payload); },
    test() { console.log("TEST CALLED"); },
    dispose : function() {}
  };
  // Loader.start();
}

export default ({
  "description" : "Entry point for AutoVR's frida script",
  "entry_point" : run_module,
})

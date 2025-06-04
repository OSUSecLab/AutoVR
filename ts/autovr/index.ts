/*
 * Copyright 2024 The AutoVR Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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

'using strict'

import "frida-il2cpp-bridge";

import {Loader} from "./loader"
import {ExecOptions} from "child_process";
import {off} from "process";
import {RPC} from './rpc';

rpc.exports = {
  checkHealth() { return RPC.checkHealth(); },
  getUnityVersion() { return RPC.getUnityVersion(); },
  init() { return RPC.init(); },
  getInstructions(payload) { return RPC.getInstructions(payload); },
  getInstructionsInterval(
      payload) { return RPC.getInstructionsInterval(payload); },
  getMethodsOfClassMethod(
      payload) { return RPC.getMethodsOfClassMethod(payload); },
  getReturnType(payload) { return RPC.getReturnType(payload); },
  resolveSymbols(payload) { return RPC.resolveSymbols(payload); },
  getAllMethods() { return RPC.getAllMethods(); },
  countAllScenes() { return RPC.countAllScenes(); },
  loadSceneEvents(scene_index) { return RPC.loadSceneEvents(scene_index); },
  triggerEvent(payload) { return RPC.triggerEvent(payload); },
  triggerAllEvents(payload) { return RPC.triggerAllEvents(payload); },
  test() { console.log("TEST CALLED"); },
  dispose : function() {}
};
// Loader.start();

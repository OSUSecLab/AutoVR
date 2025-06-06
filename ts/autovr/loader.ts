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
import "frida-il2cpp-bridge";

import {Classes} from "./classes.js"
import {Event, EventLoader, EventTriggerer} from "./events.js"
import {APIHooker} from "./hooks.js"
import {initNotifier, loadSceneNotifier, RPC} from './rpc.js'
import {SceneIndex, SceneMap} from "./scene.js"
import {UnityClass, UnityMethod, UnityObject} from "./unity_types.js"
import {promiseTimeout, promiseTimeoutRevert, Util} from './utils.js'

export const wait = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

const triggered_events: Array<string> = [];
const triggered_triggers: Array<string> = [];
const triggered_collisions: Array<string> = [];
const triggered_UI: Array<string> = [];
const objects_per_scene: Array<number> = [];

var curr_event: string = "";

var curr_scene: number = 0;

var eventLoader: EventLoader;
var eventTriggerer: EventTriggerer;

// TODO: Make a singleton?
const sceneMap: SceneMap = new SceneMap();

export class Loader {
  protected constructor() {}

  // TODO: make this into an RPC
  private static resolveSymbols_deprecated() {
    const op = recv('input', jsonStr => {
      if (jsonStr.payload.length > 0) {
        let parse = JSON.parse(jsonStr.payload);
        let methods: Array<any> = parse.ScriptMetadataMethod;
        methods.forEach(method => {
          let sym = Number(method.Address);
          let name = method.Name as string;
          let methodAddr =
              Number(method.MethodAddress) + Number(Il2Cpp.module.base);
          ResolvedSymbols.getInstance().addSymbol(
              "0x" + sym.toString(16), "0x" + methodAddr.toString(16));
        });
      }
    });
    op.wait();
  }

  private static resolveAllSymbols(symbol_payload: string) {
    // symbol payload format:
    // {
    //    "ScriptMetadataMethod": [
    //       {
    //          "Name": "method name",
    //          "Address": "0x12345",
    //          "MethodAddress": "0x34567"
    //       },
    //       ...
    //    ]
    // }
    if (symbol_payload.length > 0) {
      let symbols = ResolvedSymbols.getInstance()
      let parse = JSON.parse(symbol_payload);
      let methods: Array<any> = parse.ScriptMetadataMethod;
      console.log(`Loading ${methods.length} methods from len(symbol_payload)=${
          symbol_payload.length} ...`)
      methods.forEach(method => {
        let offsetAddr = Number(method.Address);
        let methodAddr =
            Number(method.MethodAddress) + Number(Il2Cpp.module.base);
        symbols.addSymbol("0x" + offsetAddr.toString(16),
                          "0x" + methodAddr.toString(16));
      });
    }
  }

  private static bypassSSLPinning() {
    let function_offset: string|undefined = undefined;
    let use_mbed_tls: boolean = true;
    const op = recv('cert_func', jsonStr => {
      function_offset = jsonStr.offset;
      use_mbed_tls = jsonStr.use_mbed_tls;
    });
    op.wait();
    if (function_offset) {
      APIHooker.bypassJavaSSLPinning();
      console.log("FUNCTION OFFSET:", function_offset);
      APIHooker.bypassUnitySSLPinning(new NativePointer(function_offset),
                                      use_mbed_tls);
    } else {
      console.log("SSL PINNING FAILED, function_offet not provided.");
    }
  }

  /** Resolves all methods of all classes. */
  private static resolveAllMethods(img: Il2Cpp.Image) {
    console.log("Resolving methods from " + img.name);
    img.classes.forEach(clazz => {
      clazz.methods.forEach(
          method => { AllMethods.getInstance().addMethod(method); });
    });
  }

  private static init() {
    console.log("Initializing classes...");
    const classes = Classes.getInstance();
    // To see il2cpp exceptions:
    // Il2Cpp.installExceptionListener("all");

    Il2Cpp.domain.assemblies.forEach(assemb => {
      let img = assemb.image;
      Loader.resolveAllMethods(img);
      ClassLoader.resolveRequiredClasses(img);
    });

    let obj = {
      "base" : Il2Cpp.module.base.toString(),
      "all_methods" : AllMethods.getInstance().toEntriesWithName()
    };
    return JSON.stringify(obj);
  }

  private static async getAllObjects(delay_scenes_ms: number) {
    // Delay specified time before resolving objects within scene.
    await wait(delay_scenes_ms);
    return await Util.getAllActiveObjects();
  }

  private static async resolveObjects(currentObjects: Il2Cpp.Object[]) {
    ResolvedObjects.getInstance().clear()
    ResolvedObjects.getInstance().addComps(currentObjects);
    let res = {
      "type" : "objects_per_scene",
      "scene" : curr_scene,
      "data" : currentObjects.length
    };
    send(JSON.stringify(res));

    eventLoader = new EventLoader(curr_scene);
    eventTriggerer = new EventTriggerer(curr_scene, eventLoader);
    return eventLoader.getEventFunctionCallbacks(currentObjects);
  }

  private static async hookLoadSceneExecution(
      beforeHook?: (...parameters: any[]) => void,
      duringHook?: (...parameters: any[]) => void,
      afterHook?: (...parameters: any[]) => void): Promise<number> {
    let instance = Classes.getInstance();
    console.log("hookLoadSceneExecution");
    if (instance.SceneManager) {
      var Method_LoadSceneAsyncNameIndexInternal =
          instance.SceneManager.method("LoadSceneAsyncNameIndexInternal");
      let promise = new Promise<any>((resolve, reject) => {
        if (beforeHook) {
          beforeHook();
        }
        Method_LoadSceneAsyncNameIndexInternal.implementation = function(
            v1, v2, v3, v4): any {
          if (duringHook) {
            duringHook(v1, v2, v3, v4);
          }
          const result = Method_LoadSceneAsyncNameIndexInternal.executeStatic(
              v1, v2, v3, v4);
          console.log("Method_LoadSceneAsyncNameIndexInternal:" + v1 + ":" + v2,
                      v4);
          resolve(v1);
          return result;
        };
        if (afterHook) {
          afterHook();
        }
      });
      return promise;
    }
    // Failed
    return Promise.resolve(-1);
  }

  public static async getSceneEvents() {
    // 0 delay for immediate execution.
    return await Loader.getAllObjects(0)
    	.then(currentObjects => Loader.resolveObjects(currentObjects));
  }

  public static async loadSceneEvents(scene_index: number,
                                      delay_scenes_ms: number = 5000) {
    let instance = Classes.getInstance();
    console.log("loadSceneEvents");
    return await Loader
        .hookLoadSceneExecution(() => Loader.loadScene("", scene_index, true),
                                (v1, v2, v3, v4) => {
                                  APIHooker.revertEntitlementCheck_alt();
                                  APIHooker.hookEntitlementCheck_alt();
                                },
                                () => {
                                  curr_event = '';
                                  curr_scene = scene_index;
                                  Loader.loadScene("", scene_index, true);
                                })
        .then(() => {
          Loader.revertSceneChange();
          return Loader.getAllObjects(delay_scenes_ms);
        })
        .then(currentObjects => Loader.resolveObjects(currentObjects));
  }

  public static triggerEvent(event: Event) {
    return eventTriggerer.triggerEvent(event);
  }

  public static triggerAllEvents(events: Map<string, Array<string>>) {
    return eventTriggerer.triggerAllEvents(events);
  }

  public static preventAppQuit() {
    let instance = Classes.getInstance();
    if (instance.Application) {
      var quit = instance.Application.rawImageClass.method("Quit", 0);
      quit.implementation = function(): any {
        console.log("QUIT CALLED");
        return null;
      };
      quit = instance.Application.rawImageClass.method("Quit", 1);
      quit.implementation = function(): any {
        console.log("QUIT CALLED");
        return null;
      };
    }
  }

  public static preventSceneChanges() {
    let instance = Classes.getInstance();
    if (instance.SceneManager) {
      var Method_LoadSceneAsyncNameIndexInternal =
          instance.SceneManager.method("LoadSceneAsyncNameIndexInternal");
      Method_LoadSceneAsyncNameIndexInternal.implementation = function(
          v1, v2, v3: Il2Cpp.ValueType, v4): any { return null; };
    }
  }

  public static revertSceneChange() {
    let instance = Classes.getInstance();
    if (instance.SceneManager) {
      var Method_LoadSceneAsyncNameIndexInternal =
          instance.SceneManager.method("LoadSceneAsyncNameIndexInternal");
      Method_LoadSceneAsyncNameIndexInternal.revert();
    }
  }

  /**
   * @deprecated Loader.getScenes() can fail and may cause undefined behavior
   *     (usually hangs the promise).
   */
  public static async unloadScene(sceneName: string, index: number) {
    let instance = Classes.getInstance();
    return await Il2Cpp.mainThread.schedule(() => {
      let SceneManager = instance.SceneManager;
      if (SceneManager) {
        if (SceneManager.methods.has("UnloadSceneNameIndexInternal")) {
          let sceneIndicies = Loader.getScenes(false);
          console.log("BEFORE SCENE_COUNT =", sceneIndicies);
          var sss = Il2Cpp.reference(false);
          let UnloadSceneOptions = instance.UnloadSceneOptions;
          if (sceneIndicies && sceneIndicies.includes(index) &&
              UnloadSceneOptions && SceneManager) {
            console.log("UNLOAD SCENE", index);
            SceneManager.method("UnloadSceneNameIndexInternal")
                .executeStatic(Il2Cpp.string(index == -1 ? sceneName : ""),
                               index, true,
                               UnloadSceneOptions.rawImageClass
                                   .field("UnloadAllEmbeddedSceneObjects")
                                   .value,
                               sss);
          }
        } else if (SceneManager.methods.has("UnloadSceneAsync")) {
          let sceneObject =
              SceneManager.method("GetSceneAt").executeStatic(index) as
              Il2Cpp.Object;
          SceneManager.method("UnloadSceneAsync").executeStatic(sceneObject);
        }
      }
    });
  }

  private static loadSceneIndexRaw(index: number,
                                   single: boolean): Il2Cpp.Object|null {
    let instance = Classes.getInstance();
    if (instance.LoadSceneParameters && instance.LoadSceneMode &&
        instance.AsyncOperation && instance.SceneManager) {
      const LoadSceneParameters_instance =
          instance.LoadSceneParameters.rawImageClass.new();
      LoadSceneParameters_instance.method(".ctor").invoke(
          instance.LoadSceneMode.rawImageClass
              .field<Il2Cpp.ValueType>(single ? "Single" : "Additive")
              .value);
      let SceneManager = instance.SceneManager;
      return SceneManager.method("LoadSceneAsyncNameIndexInternal")
                 .executeStatic(Il2Cpp.string(""), index,
                                LoadSceneParameters_instance.unbox(), true) as
             Il2Cpp.Object;
    }
    return null;
  }

  public static async loadScene(name: string, index: number,
                                single: boolean): Promise<Il2Cpp.Object|null> {
    let instance = Classes.getInstance();
    if (instance.LoadSceneParameters && instance.LoadSceneMode &&
        instance.AsyncOperation && instance.SceneManager) {
      const LoadSceneParameters_instance =
          instance.LoadSceneParameters.rawImageClass.new();
      LoadSceneParameters_instance.method(".ctor").invoke(
          instance.LoadSceneMode.rawImageClass
              .field<Il2Cpp.ValueType>(single ? "Single" : "Additive")
              .value);

      return Il2Cpp.mainThread.schedule(() => {
        var ret = null;
        if (index < sceneMap.count) {
          const sceneIndex: SceneIndex = sceneMap.get(index);
          console.log("LOAD SCENE", sceneIndex.raw);
          if (typeof sceneIndex.raw == "number") {
            ret = Loader.loadSceneIndexRaw(sceneIndex.raw!, single);
          } else {
            // TODO: Add Addressables scene loading here once cracked.
          }
        }
        return ret;
      });
    }
    return null;
  }

  public static async restoreScenes(names: string[]) {
    for (let i = 0; i < names.length; i++) {
      Loader.loadScene(names[i], -1, i == 0 ? true : false);
      await wait(1000);
    }
  }

  /**
   * @deprecated Loader.getScenes() can fail and may cause undefined behavior.
   *     This was mainly used for debugging purposes use with caution.
   */
  public static getScenes(nameOnly: boolean): number[]|null {
    let instance = Classes.getInstance();
    if (instance.SceneManager) {
      let SceneManager = instance.SceneManager
      var getSceneCount = SceneManager.tryMethod("get_sceneCount")
      if (getSceneCount) {
        var sceneCount = getSceneCount.executeStatic() as number;
        var scenes: number[] = [];
        var sceneNames: string[] = [];
        var scene: Il2Cpp.Object;
        var sceneName: string|null;
        if (!SceneManager.tryMethod("GetSceneAt"))
          return [];
        for (var i = 0; i < sceneCount; i++) {
          scene = (SceneManager.method("GetSceneAt").executeStatic(i) as
                   Il2Cpp.ValueType)
                      .box();
          scenes.push(scene.method<number>("get_buildIndex").invoke());

          if (nameOnly) {
            let sn = scene.method<Il2Cpp.String>("get_name").invoke();
            if (sn && !sn.isNull())
              sceneNames.push(sn.content!);
          }
        }
        return scenes;
      }
    }
    return [];
  }

  private static async getBuildSettingsCount() {
    let instance = Classes.getInstance();
    if (instance.SceneManager) {
      let SceneManager = instance.SceneManager
      var getSceneCount =
          SceneManager.tryMethod("get_sceneCountInBuildSettings")
      if (getSceneCount) {
        var sceneCount = getSceneCount.executeStatic() as number;
        return sceneCount;
      }
    }
    return 0;
  }

  public static async countAllScenes() {
    let classes = Classes.getInstance();
    console.log("countAllScenes");
    var buildSceneCount = await Loader.getBuildSettingsCount();

    var index = 0;
    for (index = 0; index < buildSceneCount; index++) {
      const sceneIndex: SceneIndex = {raw : index};
      sceneMap.setSceneIdentifier(index, sceneIndex);
    }
    return sceneMap.count;
  }

  private static async countAllScenes_legacy() {
    var maxSceneCount = 50;
    var sceneCount = 0;
    var ret = null;
    for (var i = 1; i < maxSceneCount; i++) {
      ret = await Loader.loadScene("", i, true);
      console.log("ret:" + i + ":" + ret);
      if (ret == null || ret.isNull()) {
        break;
      } else {
        await wait(2000);
      }
      sceneCount = i;
    }
    console.log("SceneCount", sceneCount);
    return sceneCount;
  }

  public static async start(symbol_payload: string,
                            bypassSSLPinning: boolean) {
    console.log("Attaching...");
    if (bypassSSLPinning) {
      console.log("Adding hook to bypassing SSL Pinning ...")
      Loader.bypassSSLPinning();
    }
    if (symbol_payload != "") {
      // TODO: remove this support and mandate symbol_payload to be passed as
      // part of init
      Loader.resolveAllSymbols(symbol_payload);
    } else {
      console.log(
          "(Deprecated): waiting for symbols to be posted as frida message ...")
      Loader.resolveSymbols_deprecated()
    }
    return Il2Cpp.perform(() => {
      console.log("Performing Il2Cpp");
      try {
        console.log("Loaded Unity version: " + Il2Cpp.unityVersion);
        return Loader.init();
      } catch (sse) {
        const u = sse as Error
        console.log(sse);
        console.error(u.stack);
      }
    }, "free");
  }
}

// Map of all method names to method virtual addresses in string format.
// Needs to be in string format for hashing to work.
export class AllMethods {
  private static instance: AllMethods;

  // Key -> Method virtual address in string format.
  // Value -> handle.
  private allMethods: Map<string, string>;
  private sortedKeys: string[] = [];
  private needSorted: boolean = true;
  readonly #methods =
      Il2Cpp.domain.assemblies
          .flatMap(_ => _.image.classes.flatMap(
                       _ => _.methods.filter(_ => !_.virtualAddress.isNull())))
          .sort((_, __) => _.virtualAddress.compare(__.virtualAddress));

  private constructor() { this.allMethods = new Map<string, string>(); }

  public static getInstance(): AllMethods {
    if (!AllMethods.instance) {
      AllMethods.instance = new AllMethods();
    }
    return AllMethods.instance;
  }

  public addMethod(method: Il2Cpp.Method) {
    let va = method.virtualAddress;
    let handle = method.handle;
    if (method.name.includes("OnSnap")) {
      console.log(method.class.name + "$$" + method.name);
      // method.implementation = function() { console.log("INVOKES"); };
    }
    this.allMethods.set(va.toString(), handle.toString());
    this.sortedKeys.push(va.toString().substring(2));
    this.needSorted = true;
  }

  public contains(addr: NativePointer|string) {
    if (addr instanceof NativePointer) {
      return this.allMethods.has(addr.toString());
    }
    return this.allMethods.has(addr as string);
  }

  public getMethodName(addr: NativePointer|string): string|null {
    let m_addr: string;
    if (addr instanceof NativePointer) {
      m_addr = addr.toString();
    } else {
      m_addr = addr;
    }

    if (this.allMethods.has(m_addr)) {
      let handle = new NativePointer(this.allMethods.get(m_addr)!);
      let method = new Il2Cpp.Method(handle);
      return method.class.name + "$$" + method.name;
    }
    return null;
  }

  public addressInRange(addr: string) {
    if (this.allMethods.has(addr)) {
      return addr;
    } else {
      var low = '';
      var prev = '';
      for (let key of this.sortedKeys) {
        if (Number("0x" + key) > Number(addr)) {
          return low;
        } else {
          low = key;
        }
      }
    }
    return null;
  }

  // Return array of entries with names being values instead of handles.
  public toEntriesWithName() {
    return Array.from(this.allMethods,
                      ([ key, value ]) => [key, this.getMethodName(key)]);
  }

  get size() { return this.allMethods.size; }

  get methods() { return this.allMethods; }
}

export class AllClasses {
  private static instance: AllClasses;

  // Key -> Class name.
  // Value -> Class handle.
  private allClasses: Map<string, string>;

  private constructor() { this.allClasses = new Map<string, string>(); }

  public static getInstance(): AllClasses {
    if (!AllClasses.instance) {
      AllClasses.instance = new AllClasses();
    }
    return AllClasses.instance;
  }

  public addClass(className: string, handle: string) {
    return this.allClasses.set(className, handle);
  }

  public contains(className: string) { return this.allClasses.has(className); }

  get size() { return this.allClasses.size; }

  get classes() { return this.allClasses; }
}

export class ResolvedMethods {
  private static instance: ResolvedMethods;

  // Key -> Method virtual address in string format.
  // Value -> Method's class' virtual address in string format.
  private allMethods: Map<string, string>;

  private constructor() { this.allMethods = new Map<string, string>(); }

  public static getInstance(): ResolvedMethods {
    if (!ResolvedMethods.instance) {
      ResolvedMethods.instance = new ResolvedMethods();
    }
    return ResolvedMethods.instance;
  }

  public addMethod(addr: NativePointer|string,
                   classAddr: NativePointer|string) {
    return this.allMethods.set(addr.toString(), classAddr.toString());
  }

  public contains(addr: NativePointer|string) {
    if (addr instanceof NativePointer) {
      return this.allMethods.has(addr.toString());
    }
    return this.allMethods.has(addr as string);
  }

  get size() { return this.allMethods.size; }

  get methods() { return this.allMethods; }
}

export class ResolvedClasses {
  private static instance: ResolvedClasses;
  private classMap: Map<string, UnityClass>;

  private constructor() { this.classMap = new Map<string, UnityClass>(); }

  public static getInstance(): ResolvedClasses {
    if (!ResolvedClasses.instance) {
      ResolvedClasses.instance = new ResolvedClasses();
    }
    return ResolvedClasses.instance;
  }

  public putClass(uniqueId: string, uClass: UnityClass) {
    return this.classMap.set(uniqueId, uClass);
  }

  public hasClass(uniqueId: string): boolean {
    return this.classMap.has(uniqueId);
  }

  class
  (uniqueId: string) { return this.classes.get(uniqueId); }

  get classes(): Map<string, UnityClass> { return this.classMap; }
}

export class ResolvedObjects {
  private static instance: ResolvedObjects;
  // string -> address in string format 0x00000000
  private objectMap: Map<string, UnityObject>;

  private constructor() { this.objectMap = new Map<string, UnityObject>(); }

  public static getInstance(): ResolvedObjects {
    if (!ResolvedObjects.instance) {
      ResolvedObjects.instance = new ResolvedObjects();
    }
    return ResolvedObjects.instance;
  }

  public putIl2CppObject(obj: Il2Cpp.Object) {
    if (!this.hasObject(obj.handle.toString())) {
      let uObject = new UnityObject(obj);
      uObject.resolveClassIfNeeded();
      this.objectMap.set(obj.handle.toString(), uObject);
    }
  }

  public hasObject(addrStr: string): boolean {
    return this.objectMap.has(addrStr);
  }

  public addComps(comps: Il2Cpp.Object[]) {
    for (var comp of comps) {
      this.putIl2CppObject(comp);
    }
  }

  public objectsOfClass(clazz: Il2Cpp.Class) {
    let objs: UnityObject[] = [];
    this.objects.forEach((object, handle) => {
      if (clazz.isAssignableFrom(object.class !.rawImageClass)) {
        objs.push(object);
      }
    });
    return objs;
  }

  public clear() { this.objectMap.clear(); }

  object(addrStr: string) { return this.objects.get(addrStr); }

  get objects(): Map<string, UnityObject> { return this.objectMap; }

  get objectValues(): Array<UnityObject> {
    return Array.from(this.objectMap.values());
  }

  get objectIl2CppValues() { return this.objectValues.map(uo => uo.unbox()); }

  method(methodAddr: string) {
    let objectIt = this.objectValues;
    let methods = AllMethods.getInstance();
    if (methods.contains(methodAddr)) {
      let method = new Il2Cpp.Method(new NativePointer(methodAddr));
      for (const obj of objectIt) {
        if (method.class.isAssignableFrom(obj.class !.rawImageClass)) {
          let methodImage = obj.tryMethod(method.name, method.parameterCount);
          if (methodImage) {
            return methodImage;
          }
        }
      }
    }
    return null;
  }
}

export class ResolvedSymbols {
  private static instance: ResolvedSymbols;
  // Addr string -> symbol addr str
  private symbols: Map<string, string>;

  private constructor() { this.symbols = new Map(); }

  public static getInstance(): ResolvedSymbols {
    if (!ResolvedSymbols.instance) {
      ResolvedSymbols.instance = new ResolvedSymbols();
    }
    return ResolvedSymbols.instance;
  }

  public addSymbol(addr: string, sym: string) { this.symbols.set(addr, sym); }

  symbolsMap() { return Array.from(this.symbols.keys()); }

  symbol(addr: string): string|null {
    if (this.symbols.has(addr)) {
      return this.symbols.get(addr)!;
    }
    return null;
  }
}

export class ClassLoader {
  /**
   * Resolve class from il2cpp image. @method resolveAllMethods must be called
   * beforehand.
   */
  static resolveClass<T extends UnityClass>(img: Il2Cpp.Image,
                                            className: string,
                                            required: boolean = false): T|null {
    let instance = ResolvedClasses.getInstance();
    if (instance.hasClass(className)) {
      return instance.class(className)! as T;
    }
    let uClass = new UnityClass() as T;
    let result = uClass.resolve(img, className);
    if (result != null) {
      // TODO: Support Generics class loading.
      // In this iteration, we are going to avoid Generics.
      uClass.resolveMethods(
          (method: UnityMethod<Il2Cpp.Method.ReturnType>): boolean => {
            return !method.methodName.includes("System.Collections.Generic");
          });
      uClass.resolveMethodInstructions();
      instance.putClass(uClass.name, uClass);
      return uClass;
    }
    return null;
  }

  static resolveClassFromObject<T extends UnityClass>(
      obj: Il2Cpp.Object, required: boolean = false): T|null {
    let instance = ResolvedClasses.getInstance();
    let uid = obj.class.name;
    if (instance.hasClass(uid)) {
      return instance.class(uid)! as T;
    }
    let uClass = new UnityClass() as T;
    let result = uClass.resolveClass(obj.class);
    if (result != null) {
      uClass.resolveMethods(
          (method: UnityMethod<Il2Cpp.Method.ReturnType>): boolean => {
            return !method.methodName.includes("System.Collections.Generic");
          });
      uClass.resolveMethodInstructions();
      return uClass;
    }
    return null;
  }

  /** Resolves all required classes. */
  static resolveRequiredClasses(img: Il2Cpp.Image) {
    const classes = Classes.getInstance();
    if (classes.Object == null) {
      classes.Object =
          ClassLoader.resolveClass<UnityClass>(img, "UnityEngine.Object", true);
    }
    if (classes.Resources == null) {
      classes.Resources = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Resources", true);
    }
    if (classes.SceneManager == null) {
      classes.SceneManager = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.SceneManagement.SceneManager", true);
    }
    if (classes.Rigidbody == null) {
      classes.Rigidbody = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Rigidbody", true);
    }
    if (classes.Component == null) {
      classes.Component = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Component", true);
    }
    if (classes.GameObject == null) {
      classes.GameObject = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.GameObject", true);
    }
    if (classes.LoadSceneParameters == null) {
      classes.LoadSceneParameters = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.SceneManagement.LoadSceneParameters", true);
    }
    if (classes.LoadSceneMode == null) {
      classes.LoadSceneMode = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.SceneManagement.LoadSceneMode", true);
    }
    if (classes.Enumerable = null) {
      classes.Enumerable = ClassLoader.resolveClass<UnityClass>(
          img, "System.Linq.Enumerable", true);
    }
    if (classes.UnloadSceneOptions == null) {
      classes.UnloadSceneOptions = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.SceneManagement.UnloadSceneOptions", true);
    }
    if (classes.AsyncOperation == null) {
      classes.AsyncOperation = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.AsyncOperation", true);
    }
    if (classes.UnityAction == null) {
      classes.UnityAction = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Events.UnityAction", true);
    }
    if (classes.UnityEvent == null) {
      classes.UnityEvent = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Events.UnityEvent", true);
    }
    if (classes.UnityEventBase == null) {
      classes.UnityEventBase = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Events.UnityEventBase", true);
    }
    if (classes.InvokableCall == null) {
      classes.InvokableCall = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Events.InvokableCall", true);
    }
    if (classes.Collider == null) {
      classes.Collider = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Collider", true);
    }
    if (classes.InvokableCallList == null) {
      classes.InvokableCallList = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Events.InvokableCallList", true);
    }
    if (classes.PersistentCall == null) {
      classes.PersistentCall = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Events.PersistentCall", true);
    }
    if (classes.ExecuteEvents == null) {
      classes.ExecuteEvents = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.ExecuteEvents", true);
    }
    if (classes.PointerEventData == null) {
      classes.PointerEventData = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.PointerEventData", true);
    }
    if (classes.EventSystem == null) {
      classes.EventSystem = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.EventSystem", true);
    }
    if (classes.IBeginDragHandler == null) {
      classes.IBeginDragHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IBeginDragHandler", true);
      if (classes.IBeginDragHandler)
        classes.EventHandlers.push(classes.IBeginDragHandler);
    }
    if (classes.ICancelHandler == null) {
      classes.ICancelHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.ICancelHandler", true);
      if (classes.ICancelHandler)
        classes.EventHandlers.push(classes.ICancelHandler);
    }
    if (classes.IDeselectHandler == null) {
      classes.IDeselectHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IDeselectHandler", true);
      if (classes.IDeselectHandler)
        classes.EventHandlers.push(classes.IDeselectHandler);
    }
    if (classes.IDragHandler == null) {
      classes.IDragHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IDragHandler", true);
      if (classes.IDragHandler)
        classes.EventHandlers.push(classes.IDragHandler);
    }
    if (classes.IDropHandler == null) {
      classes.IDropHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IDropHandler", true);
      if (classes.IDropHandler)
        classes.EventHandlers.push(classes.IDropHandler);
    }
    if (classes.IEndDragHandler == null) {
      classes.IEndDragHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IEndDragHandler", true);
      if (classes.IEndDragHandler)
        classes.EventHandlers.push(classes.IEndDragHandler);
    }
    if (classes.IInitializePotentialDragHandler == null) {
      classes.IInitializePotentialDragHandler =
          ClassLoader.resolveClass<UnityClass>(
              img, "UnityEngine.EventSystems.IInitializePotentialDragHandler",
              true);
      if (classes.IInitializePotentialDragHandler)
        classes.EventHandlers.push(classes.IInitializePotentialDragHandler);
    }
    if (classes.IMoveHandler == null) {
      classes.IMoveHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IMoveHandler", true);
      if (classes.IMoveHandler)
        classes.EventHandlers.push(classes.IMoveHandler);
    }
    if (classes.IPointerClickHandler == null) {
      classes.IPointerClickHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IPointerClickHandler", true);
      if (classes.IPointerClickHandler)
        classes.EventHandlers.push(classes.IPointerClickHandler);
    }
    if (classes.IPointerDownHandler == null) {
      classes.IPointerDownHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IPointerDownHandler", true);
      if (classes.IPointerDownHandler)
        classes.EventHandlers.push(classes.IPointerDownHandler);
    }
    if (classes.IPointerEnterHandler == null) {
      classes.IPointerEnterHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IPointerEnterHandler", true);
      if (classes.IPointerEnterHandler)
        classes.EventHandlers.push(classes.IPointerEnterHandler);
    }
    if (classes.IPointerExitHandler == null) {
      classes.IPointerExitHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IPointerExitHandler", true);
      if (classes.IPointerExitHandler)
        classes.EventHandlers.push(classes.IPointerExitHandler);
    }
    if (classes.IPointerUpHandler == null) {
      classes.IPointerUpHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IPointerUpHandler", true);
      if (classes.IPointerUpHandler)
        classes.EventHandlers.push(classes.IPointerUpHandler);
    }
    if (classes.IScrollHandler == null) {
      classes.IScrollHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IScrollHandler", true);
      if (classes.IScrollHandler)
        classes.EventHandlers.push(classes.IScrollHandler);
    }
    if (classes.ISelectHandler == null) {
      classes.ISelectHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.ISelectHandler", true);
      if (classes.ISelectHandler)
        classes.EventHandlers.push(classes.ISelectHandler);
    }
    if (classes.ISubmitHandler == null) {
      classes.ISubmitHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.ISubmitHandler", true);
      if (classes.ISubmitHandler)
        classes.EventHandlers.push(classes.ISubmitHandler);
    }
    if (classes.IUpdateSelectedHandler == null) {
      classes.IUpdateSelectedHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.EventSystems.IUpdateSelectedHandler", true);
      if (classes.IUpdateSelectedHandler)
        classes.EventHandlers.push(classes.IUpdateSelectedHandler);
    }
    if (classes.IEventHandler == null) {
      classes.IEventHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.UIElements.IEventLoader", true);
      if (classes.IEventHandler)
        classes.EventHandlers.push(classes.IEventHandler);
    }
    if (classes.CallbackEventHandler == null) {
      // TODO(Jkim-Hack): Looks like this class implements IEventHandler which
      // also handles TextInput events. Add support for TextInput events.
      classes.CallbackEventHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.UIElements.CallbackEventHandler", true);
    }
    if (classes.Message == null) {
      classes.Message = ClassLoader.resolveClass<UnityClass>(
          img, "Oculus.Platform.Message", true);
    }
    if (classes.CAPI == null) {
      classes.CAPI = ClassLoader.resolveClass<UnityClass>(
          img, "Oculus.Platform.CAPI", true);
    }
    if (classes.Entitlements == null) {
      classes.Entitlements = ClassLoader.resolveClass<UnityClass>(
          img, "Oculus.Platform.Entitlements", true);
    }

    if (classes.OVRBody == null) {
      classes.OVRBody =
          ClassLoader.resolveClass<UnityClass>(img, "OVRBody", true);
    }
    if (classes.OVRBoundary == null) {
      classes.OVRBoundary =
          ClassLoader.resolveClass<UnityClass>(img, "OVRBoundary", true);
    }
    if (classes.OVREyeGaze == null) {
      classes.OVREyeGaze =
          ClassLoader.resolveClass<UnityClass>(img, "OVREyeGaze", true);
    }
    if (classes.OVRFaceExpressions == null) {
      classes.OVRFaceExpressions =
          ClassLoader.resolveClass<UnityClass>(img, "OVRFaceExpressions", true);
    }
    if (classes.OVRFace == null) {
      classes.OVRFace =
          ClassLoader.resolveClass<UnityClass>(img, "OVRFace", true);
    }
    if (classes.LocationService == null) {
      classes.LocationService = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.LocationService", true);
    }
    if (classes.SystemInfo == null) {
      classes.SystemInfo = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.SystemInfo", true);
    }
    if (classes.Application == null) {
      classes.Application = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Application", true);
    }
    if (classes.Analytics == null) {
      classes.Analytics = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Analytics.Analytics", true);
    }
    if (classes.UploadHandlerRaw == null) {
      classes.UploadHandlerRaw = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Networking.UploadHandlerRaw", true);
    }
    if (classes.UnityWebRequest == null) {
      classes.UnityWebRequest = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Networking.UnityWebRequest", true);
    }
    if (classes.CertificateHandler == null) {
      classes.CertificateHandler = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.Networking.CertificateHandler", true);
    }
    if (classes.Socket == null) {
      classes.Socket = ClassLoader.resolveClass<UnityClass>(
          img, "System.Net.Sockets.Socket", true);
    }
    if (classes.AssetBundle == null) {
      classes.AssetBundle = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.AssetBundle", true);
    }
    if (classes.AsyncOperationHandle == null) {
      classes.AsyncOperationHandle = ClassLoader.resolveClass<UnityClass>(
          img,
          "UnityEngine.ResourceManagement.AsyncOperations.AsyncOperationHandle",
          true);
    }
    if (classes.SceneInstance == null) {
      classes.SceneInstance = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.ResourceManagement.ResourceProviders.SceneInstance",
          true);
    }
    if (classes.Scene == null) {
      classes.Scene = ClassLoader.resolveClass<UnityClass>(
          img, "UnityEngine.SceneManagement.Scene", true);
    }
  }
}

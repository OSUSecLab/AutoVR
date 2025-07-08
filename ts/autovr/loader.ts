import "frida-il2cpp-bridge";

import {AllMethods, ClassLoader} from "./class-loader.js";
import {Classes} from "./classes.js"
import {Event, EventLoader, EventTriggerer} from "./events.js"
import {APIHooker} from "./hooks.js"
import {
  ResolvedAssetBundles,
  ResolvedObjects,
  ResolvedSymbols
} from "./resolver.js";
import {Scene, SceneMap, SceneType} from "./scene.js"
import {Util} from './utils.js'

export const wait = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

var currentEvent: string = "";

var currentScene: number = 0;

var eventLoader: EventLoader;
var eventTriggerer: EventTriggerer;

export class Loader {
  protected constructor() {}

  private static bypassSSLPinning() {
    let functionOffset: string|undefined;
    let useMbedTls = true;

    const operation = recv("cert_func", (jsonStr) => {
      try {
        functionOffset = jsonStr.offset;
        useMbedTls = jsonStr.use_mbed_tls;
      } catch (error) {
        console.error("Failed to parse SSL pinning parameters:", error);
      }
    });
    operation.wait();

    if (functionOffset) {
      try {
        APIHooker.bypassJavaSSLPinning();
        console.log("FUNCTION OFFSET:", functionOffset);
        APIHooker.bypassUnitySSLPinning(new NativePointer(functionOffset),
                                        useMbedTls);
      } catch (error) {
        console.error("Error during SSL pinning bypass:", error);
      }
    } else {
      console.warn("SSL PINNING FAILED: The function offset not provided.");
    }
  }

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

  /** Resolves all methods of all classes. */
  private static resolveAllMethods(img: Il2Cpp.Image) {
    console.log(`Resolving methods from image: ${img.name}`);
    img.classes.forEach((clazz) => {
      clazz.methods.forEach(
          (method) => { AllMethods.getInstance().addMethod(method); });
    });
  }

  private static init() {
    console.log("Initializing classes...");
    const classes = Classes.getInstance();
    // To see il2cpp exceptions:
    // Il2Cpp.installExceptionListener("all");

    console.log("Resolving methods and required classes...");
    Il2Cpp.domain.assemblies.forEach((assembly) => {
      let img = assembly.image;
      if (!img) {
        console.warn(
            `Assembly '${assembly.name}' does not have an image. Skipping...`);
        return;
      }

      try {
        Loader.resolveAllMethods(img);
      } catch (error) {
        console.error(`Error processing assembly '${assembly.name}':`, error);
      }
    });

    ClassLoader.resolveRequiredClasses();
    this.listenForScenesFromAssetBundles();

    let obj = {
      base : Il2Cpp.module.base.toString(),
      all_methods : AllMethods.getInstance().toEntriesWithName(),
    };

    console.log("Initialization complete.");
    return JSON.stringify(obj);
  }

  private static async getAllObjects(delay_scenes_ms: number) {
    await wait(delay_scenes_ms);
    return await Util.getAllActiveObjects();
  }

  private static async resolveObjects(currentObjects: Il2Cpp.Object[]) {
    console.log("resolveEvents");
    ResolvedObjects.getInstance().clear();
    ResolvedObjects.getInstance().addComps(currentObjects);
    let res = {
      type : "objects_per_scene",
      scene : currentScene,
      data : currentObjects.length,
    };
    send(JSON.stringify(res));

    eventLoader = new EventLoader(currentScene);
    eventTriggerer = new EventTriggerer(currentScene, eventLoader);
    return eventLoader.getEventFunctionCallbacks(currentObjects);
  }

  private static async invokeInitializeAddressables():
      Promise<Il2Cpp.Object|null> {
    let instance = Classes.getInstance();
    const Addressables = instance.Addressables;
    if (!Addressables) {
      console.error("Addressables not found. Initialization failed.");
      return null;
    }

    const initializeMethod = Addressables.imageClass.method("InitializeAsync");
    if (!initializeMethod) {
      console.error("InitializeAsync method not found. Initialization failed.");
      return null;
    }

    try {
      const result = await Util.runAsyncOperationHandle(initializeMethod);
      return result?.result ?? null;
    } catch (error) {
      console.error("Error during Addressables initialization:", error);
      return null;
    }
  }

  public static async initializeAddressables(): Promise<Il2Cpp.Object|null> {
    let instance = Classes.getInstance();
    if (!instance.Addressables) {
      console.error("Addressables not found. Initialization failed.");
      return null;
    }

    return await Il2Cpp.mainThread.schedule((): Promise<Il2Cpp.Object|null> => {
      const Addressables = instance.Addressables!;

      const getStreamingAssetsSubFolderMethod =
          Addressables.imageClass.method<Il2Cpp.String>(
              "get_StreamingAssetsSubFolder");
      const getBuildPathMethod =
          Addressables.imageClass.method<Il2Cpp.String>("get_BuildPath");
      const getPlayerBuildDataPathMethod =
          Addressables.imageClass.method<Il2Cpp.String>(
              "get_PlayerBuildDataPath");
      const getRuntimePathMethod =
          Addressables.imageClass.method<Il2Cpp.String>("get_RuntimePath");

      if (getStreamingAssetsSubFolderMethod) {
        console.log("StreamingAssetsSubFolder:",
                    getStreamingAssetsSubFolderMethod.invoke().content);
      }

      if (getBuildPathMethod) {
        console.log("BuildPath:", getBuildPathMethod.invoke().content);
      }

      if (getPlayerBuildDataPathMethod) {
        console.log("PlayerBuildDataPath:",
                    getPlayerBuildDataPathMethod.invoke().content);
      }

      if (getRuntimePathMethod) {
        console.log("RuntimePath:", getRuntimePathMethod.invoke().content);
      }

      return this.invokeInitializeAddressables();
    });
  }

  private static async hookLoadSceneExecution(
      sceneIndex: number, beforeHook?: (...parameters: any[]) => void,
      duringHook?: (...parameters: any[]) => void,
      afterHook?: (...parameters: any[]) => void): Promise<number> {
    console.log("hookLoadSceneExecution");

    let instance = Classes.getInstance();
    if (!instance.SceneManager) {
      console.warn("SceneManager not found. Hook cannot be applied.");
      return Promise.resolve(-1);
    }

    const loadSceneMethod =
        instance.SceneManager.method("LoadSceneAsyncNameIndexInternal");
    let promise = new Promise<any>((resolve) => {
      if (beforeHook) {
        beforeHook();
      }
      loadSceneMethod.implementation = function(v1: any, v2: any, v3: any,
                                                v4: any): any {
        if (duringHook) {
          duringHook(v1, v2, v3, v4);
        }
        let operation = loadSceneMethod.executeStatic(v1, v2, v3, v4);
        console.log("LoadSceneAsyncNameIndexInternal:" + v1 + ":" + v2, v4);
        resolve(v1);
        return operation;
      };
      if (afterHook) {
        afterHook();
      }
    });
    await Loader.loadScene(sceneIndex, true);
    return await promise;
  }

  public static async loadSceneEvents(scene_index: number,
                                      delay_scenes_ms: number = 5000) {
    let instance = Classes.getInstance();
    console.log("loadSceneEvents");
    await wait(delay_scenes_ms);
    return await Loader
        .hookLoadSceneExecution(scene_index, () => {},
                                (v1, v2, v3, v4) => {
                                  APIHooker.revertEntitlementCheck_alt();
                                  APIHooker.hookEntitlementCheck_alt();
                                },
                                async () => {
                                  currentEvent = '';
                                  currentScene = scene_index;
                                })
        .then(() => {
          Loader.revertSceneChange();
          console.log("getAllObjectEvents");
          return Loader.getAllObjects(delay_scenes_ms);
        })
        .then(currentObjects => Loader.resolveObjects(currentObjects));
  }

  public static async getSceneEvents() {
    // 0 delay for immediate execution.
    return await Loader.getAllObjects(0).then(
        currentObjects => Loader.resolveObjects(currentObjects));
  }

  public static triggerEvent(event: Event) {
    return eventTriggerer.triggerEvent(event);
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
      const method =
          instance.SceneManager.method("LoadSceneAsyncNameIndexInternal");
      method.implementation = function(v1, v2, v3: Il2Cpp.ValueType,
                                       v4): any { return null; };
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

  // Required to run on the IL2CPP main thread.
  private static async loadSceneIndexRaw(name: string, index: number,
                                         single: boolean): Promise<boolean> {
    return await Il2Cpp.mainThread.schedule(async () => {
      const instance = Classes.getInstance();
      if (instance.LoadSceneParameters && instance.LoadSceneMode &&
          instance.AsyncOperation && instance.SceneManager) {
        const LoadSceneParameters_instance =
            instance.LoadSceneParameters.rawImageClass.new();
        LoadSceneParameters_instance.method(".ctor").invoke(
            instance.LoadSceneMode.rawImageClass
                .field<Il2Cpp.ValueType>(single ? "Single" : "Additive")
                .value);
        const SceneManager = instance.SceneManager;

        const LoadSceneAsyncNameIndexInternal =
            SceneManager.imageClass.method<Il2Cpp.Object>(
                "LoadSceneAsyncNameIndexInternal");
        try {
          let result = LoadSceneAsyncNameIndexInternal.invoke(
              Il2Cpp.string(name), index, LoadSceneParameters_instance.unbox(),
              true);
          /*
          let result = await
          Util.runAsyncOperation(LoadSceneAsyncNameIndexInternal, [
            Il2Cpp.string(name),
            index,
            LoadSceneParameters_instance.unbox(),
            true,
          ]);
         */
          if (result == null || result.isNull()) {
            // Something failed within the AsyncOperation.
            return false;
          }
          return true;
        } catch (e: any) {
          console.error("loadSceneIndexRaw", e.stack);
        }
      }
      return false;
    });
  }

  private static async loadSceneFromAddressables(key: string, single: boolean,
                                                 activeOnLoad: boolean = true,
                                                 priority: number = 100):
      Promise<Il2Cpp.Object|null> {
    const instance = Classes.getInstance();
    const Addressables = instance.Addressables;
    if (!Addressables) {
      console.error("Addressables not found.");
      return null;
    }

    const LoadSceneMode = instance.LoadSceneMode;
    if (!LoadSceneMode) {
      console.error("LoadSceneMode not found.");
      return null;
    }

    const LoadSceneAsync =
        Addressables.imageClass.method("LoadSceneAsync")
            .overload("System.Object",
                      "UnityEngine.SceneManagement.LoadSceneMode",
                      "System.Boolean", "System.Int32");
    if (!LoadSceneAsync) {
      console.error("LoadSceneAsync method not found.");
      return null;
    }

    const loadMode =
        LoadSceneMode.rawImageClass
            .field<Il2Cpp.ValueType>(single ? "Single" : "Additive")
            .value;

    const sceneInstance = await Util.runAsyncOperationHandle<Il2Cpp.Object>(
        LoadSceneAsync as Il2Cpp.Method,
        [ Il2Cpp.string(key), loadMode, activeOnLoad, priority ]);

    if (sceneInstance == null) {
      console.error("Failed to load scene from Addressables:", key);
    }

    const scene = sceneInstance!.method("get_Scene").invoke() as Il2Cpp.Object;
    return scene;
  }

  private static async loadSceneFromAssetBundle(name: string, single: boolean) {
    let instance = Classes.getInstance();
    let LoadScene = instance.SceneManager!.imageClass.method("LoadScene", 2) as
                    Il2Cpp.Method;
    try {
      return Il2Cpp.mainThread.schedule(() => {
        LoadScene.invoke(Il2Cpp.string(name),
                         instance.LoadSceneMode!.rawImageClass
                             .field<Il2Cpp.ValueType>("Single")
                             .value);
      });
    } catch (err) {
      console.error("loadSceneFromAssetBundle:", err);
    }
  }

  public static async loadScene(index: number, single: boolean) {
    const sceneMap = SceneMap.getInstance();
    if (!sceneMap.hasScene(index))
      return;

    let AssetBundle = Classes.getInstance().AssetBundle;

    // Make sure to run this on the main thread, rather than the current thread.
    return await Il2Cpp.mainThread.schedule(async () => {
      var ret = null;
      const scene: Scene = sceneMap.getScene(index);
      if (scene.type === SceneType.Build || scene.type === SceneType.Count) {
        console.log("===============================================");
        console.log("Loading BuildIndex Scene:", scene.raw);
        console.log("===============================================");
        await Loader.loadSceneIndexRaw("", scene.raw as number, single);
      } else if (scene.type === SceneType.AssetBundle) {
        // TODO: Add support for AssetBundle scenes.
        console.log("===============================================");
        console.log("Loading AssetBundle Scene:", scene.raw);
        console.log("===============================================");
        await Loader.loadSceneFromAssetBundle(scene.raw as string, single);
        // let assets = await
        // ResolvedAssetBundles.getInstance().loadAllAssetBundles();
        // console.log("AssetBundles Length:", assets.length);
      } else if (scene.type === SceneType.Addressable) {
        console.log("===============================================");
        console.log("Loading Addressable Scene:", scene.raw);
        console.log("===============================================");
        await Loader.loadSceneFromAddressables(scene.raw as string, single);
      }
    });
  }

  public static async restoreScenes() {
    const sceneMap = SceneMap.getInstance();
    for (let i = 0; i < sceneMap.count; i++) {
      await Loader.loadScene(i, i == 0 ? true : false);
    }
  }

  public static async getAllScenesFromCount() {
    var maxSceneCount = 50;
    var sceneCount = 0;
    var ret = null;
    for (var i = 1; i < maxSceneCount; i++) {
      ret = await Loader.loadSceneIndexRaw("", i, true);
      console.log("ret:" + i + ":" + ret);
      if (!ret) {
        break;
      } else {
        await wait(1000);
      }
      sceneCount = i;
    }
    console.log("getAllScenesFromCount", sceneCount);
    return sceneCount + 1;
  }

  private static async discoverScenesFromBuildSettings() {
    const buildSceneCount = await Loader.getBuildSettingsScenesCount();
    console.log(`SceneCountInBuildSettings: ${buildSceneCount}`);

    const sceneCount = await Loader.getBuildScenesCount() + 1;
    console.log(`SceneCount: ${sceneCount}`);

    const sceneMap = SceneMap.getInstance();
    const count = buildSceneCount > sceneCount ? buildSceneCount : sceneCount;
    for (let index = 0; index < count + 1; index++) {
      const scene:
          Scene = {raw : index, type : SceneType.Build, assetBundle : null};
      sceneMap.setScene(index, scene);
    }
    return count;
  }

  private static async discoverScenesFromCount() {
    const sceneMap = SceneMap.getInstance();
    let count = await Loader.getAllScenesFromCount();
    for (var i = 0; i < count; i++) {
      sceneMap.addScene({raw : i, type : SceneType.Count, assetBundle : null});
    }
  }

  private static async getBuildSettingsScenesCount() {
    let instance = Classes.getInstance();
    if (!instance.SceneManager) {
      console.warn("SceneManager not found in instance.");
      return -1;
    }
    const getSceneCount =
        instance.SceneManager.tryMethod("get_sceneCountInBuildSettings");
    if (!getSceneCount) {
      console.warn(
          "SceneManager does not have 'get_sceneCountInBuildSettings' method.");
      return -1;
    }
    return (getSceneCount.executeStatic() as number) ?? 0;
  }

  private static async getBuildScenesCount() {
    let instance = Classes.getInstance();
    if (!instance.SceneManager) {
      console.warn("SceneManager not found in instance.");
      return -1;
    }
    const getSceneCount = instance.SceneManager.tryMethod("get_sceneCount");
    if (!getSceneCount) {
      console.warn("SceneManager does not have 'get_sceneCount' method.");
      return -1;
    }
    return (getSceneCount.executeStatic() as number) ?? 0;
  }

  private static listenForScenesFromAssetBundles() {
    const assetBundles = ResolvedAssetBundles.getInstance();
    const classes = Classes.getInstance();
    let AssetBundle = classes.AssetBundle;

    if (AssetBundle) {
      let LoadFromFile =
          AssetBundle.imageClass.tryMethod("LoadFromFile") as Il2Cpp.Method;
      if (LoadFromFile) {
        LoadFromFile.implementation = function(v1: Il2Cpp.String, v2: number,
                                               v3: number) {
          console.log("LoadFromFile", v1, v2, v3);
          let assetBundle = LoadFromFile.invoke(v1, v2, v3) as Il2Cpp.Object;
          assetBundles.putAssetBundle(assetBundle);
          return assetBundle;
        };
      }

      let LoadFromFileAsync = AssetBundle.imageClass.tryMethod(
                                  "LoadFromFileAsync", 2) as Il2Cpp.Method;
      if (LoadFromFileAsync) {
        LoadFromFileAsync.implementation = function(...args) {
          let assetBundleOp =
              Util.runAsyncOperation(LoadFromFileAsync, args, null)
                  .then((assetBundleCreationRequest: Il2Cpp.Object|null) =>
                            assetBundleCreationRequest == null
                                ? null
                                : assetBundleCreationRequest
                                          .method("get_assetBundle")
                                          .invoke() as Il2Cpp.Object)
                  .catch(err => console.error("LoadFromFileAsync", err)) as
              Promise<Il2Cpp.Object|null>;
          if (assetBundleOp != null)
            assetBundles.putAssetBundleOperation(assetBundleOp);
          return LoadFromFileAsync.invoke(...args);
        };
      }

      // let LoadFromMemory_Internal =
      // AssetBundle.imageClass.method("LoadFromFileAsync_Internal", 3) as
      // Il2Cpp.Method; let LoadFromMemoryAsync_Internal =
      // AssetBundle.imageClass.method("LoadFromFileAsync_Internal", 3) as
      // Il2Cpp.Method; let LoadFromStream_Internal =
      // AssetBundle.imageClass.method("LoadFromFileAsync_Internal", 3) as
      // Il2Cpp.Method; let LoadFromStreamAsync_Internal =
      // AssetBundle.imageClass.method("LoadFromFileAsync_Internal", 3) as
      // Il2Cpp.Method;
    }
  }

  private static async discoverScenesFromAssetBundles() {
    const instance = Classes.getInstance();
    const resolvedAssetBundles = ResolvedAssetBundles.getInstance();
    let AssetBundle = instance.AssetBundle;

    let abScenes: Map<Il2Cpp.String, Il2Cpp.Object> =
        await resolvedAssetBundles.resolveScenes();
    const sceneMap = SceneMap.getInstance();
    for (let [sceneName, assetBundle] of abScenes) {
      sceneMap.addScene({
        raw : sceneName.content,
        type : SceneType.AssetBundle,
        assetBundle : assetBundle
      });
    }
  }

  public static async countAllScenes() {
    await wait(3000)
    return await Il2Cpp.mainThread.schedule(async () => {
      console.log("Counting all scenes...");
      await this.discoverScenesFromBuildSettings();
      await this.discoverScenesFromCount();
      await this.discoverScenesFromAssetBundles();
      return SceneMap.getInstance().count;
    });
  }

  public static async start(symbol_payload: string,
                            bypassSSLPinning: boolean = true) {
    console.log("Attaching...");

    if (bypassSSLPinning) {
      console.log("Adding hook to bypassing SSL Pinning ...");
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
        const error = sse as Error;
        console.log(sse);
        console.error(error.stack);
      }
    }, "main");
  }
}

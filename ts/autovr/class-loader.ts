/*
 * Copyright 2025 The AutoVR Authors
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

import {Classes} from "./classes.js"
import {ResolvedClasses} from "./resolver.js"
import {UnityClass, UnityMethod, UnityObject} from "./unity_types.js"

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
    if (required) {
      throw new Error(
          `Class "${className}" could not be resolved from the IL2CPP image.`);
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

  private static getImageFromAssembly(assemblyName: string): Il2Cpp.Image|null {
    const assembly = Il2Cpp.domain.tryAssembly(assemblyName);
    return (assembly) ? assembly.image : null;
  }

  /** Resolves all required classes. */
  static resolveRequiredClasses() {
    const requiredImages = [
      "mscorlib",
      "System",
      "UnityEngine.CoreModule",
      "UnityEngine.PhysicsModule",
      "UnityEngine.UI",
      "UnityEngine.UnityWebRequestModule",
    ];

    const optionalImages = [
      "UnityEngine.ResourceManagement",
      "UnityEngine.UIElements",
      "UnityEngine.InputLegacyModule",
      "UnityEngine.UnityAnalyticsModule",
      "UnityEngine.AssetBundleModule",
      "Unity.Addressables",
    ];

    let images: Map<string, Il2Cpp.Image> = new Map<string, Il2Cpp.Image>();

    for (const imgName of requiredImages) {
      let img = ClassLoader.getImageFromAssembly(imgName);
      if (img == null) {
        throw new Error(`Could not find image for assembly "${imgName}".`);
      }
      images.set(imgName, img);
    }

    for (const imgName of optionalImages) {
      let img = ClassLoader.getImageFromAssembly(imgName);
      if (img != null) {
        images.set(imgName, img);
      }
    }

    const classes = Classes.getInstance();

    const imageCOR = images.get("mscorlib")!;
    if (classes.Directory == null) {
      classes.Directory = ClassLoader.resolveClass<UnityClass>(
          imageCOR, "System.IO.Directory", true);
    }

    if (classes.Path == null) {
      classes.Path = ClassLoader.resolveClass<UnityClass>(
          imageCOR, "System.IO.Path", true);
    }

    if (classes.Enumerable = null) {
      classes.Enumerable = ClassLoader.resolveClass<UnityClass>(
          imageCOR, "System.Linq.Enumerable", true);
    }

    if (classes.Action == null) {
      classes.Action = imageCOR.class("System.Action`1");
    }

    const imageSystem = images.get("System")!;
    if (classes.Socket == null) {
      classes.Socket = ClassLoader.resolveClass<UnityClass>(
          imageSystem, "System.Net.Sockets.Socket", false);
    }

    const imageCoreModule = images.get("UnityEngine.CoreModule")!;
    if (classes.Object == null) {
      classes.Object = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Object", true);
    }
    if (classes.Resources == null) {
      classes.Resources = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Resources", true);
    }
    if (classes.SceneManager == null) {
      classes.SceneManager = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.SceneManagement.SceneManager", true);
    }
    if (classes.Component == null) {
      classes.Component = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Component", true);
    }
    if (classes.GameObject == null) {
      classes.GameObject = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.GameObject", true);
    }
    if (classes.LoadSceneParameters == null) {
      classes.LoadSceneParameters = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.SceneManagement.LoadSceneParameters",
          true);
    }
    if (classes.LoadSceneMode == null) {
      classes.LoadSceneMode = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.SceneManagement.LoadSceneMode", true);
    }

    if (classes.UnloadSceneOptions == null) {
      classes.UnloadSceneOptions = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.SceneManagement.UnloadSceneOptions",
          false);
    }
    if (classes.AsyncOperation == null) {
      classes.AsyncOperation =
          imageCoreModule.class("UnityEngine.AsyncOperation");
    }
    if (classes.UnityAction == null) {
      classes.UnityAction = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Events.UnityAction", true);
    }
    if (classes.UnityEvent == null) {
      classes.UnityEvent = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Events.UnityEvent", true);
    }
    if (classes.UnityEventBase == null) {
      classes.UnityEventBase = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Events.UnityEventBase", true);
    }
    if (classes.InvokableCall == null) {
      classes.InvokableCall = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Events.InvokableCall", true);
    }
    if (classes.InvokableCallList == null) {
      classes.InvokableCallList = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Events.InvokableCallList", true);
    }
    if (classes.PersistentCall == null) {
      classes.PersistentCall = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Events.PersistentCall", true);
    }
    if (classes.SystemInfo == null) {
      classes.SystemInfo = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.SystemInfo", true);
    }
    if (classes.Application == null) {
      classes.Application = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.Application", true);
    }
    if (classes.Scene == null) {
      classes.Scene = ClassLoader.resolveClass<UnityClass>(
          imageCoreModule, "UnityEngine.SceneManagement.Scene", true);
    }

    const imagePhysicsModule = images.get("UnityEngine.PhysicsModule")!;
    if (classes.Rigidbody == null) {
      classes.Rigidbody = ClassLoader.resolveClass<UnityClass>(
          imagePhysicsModule, "UnityEngine.Rigidbody", true);
    }
    if (classes.Collider == null) {
      classes.Collider = ClassLoader.resolveClass<UnityClass>(
          imagePhysicsModule, "UnityEngine.Collider", true);
    }

    const imageUI = images.get("UnityEngine.UI")!;
    if (classes.ExecuteEvents == null) {
      classes.ExecuteEvents = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.ExecuteEvents", true);
    }
    if (classes.PointerEventData == null) {
      classes.PointerEventData = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.PointerEventData", true);
    }
    if (classes.EventSystem == null) {
      classes.EventSystem = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.EventSystem", true);
    }
    if (classes.IBeginDragHandler == null) {
      classes.IBeginDragHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IBeginDragHandler", true);
      if (classes.IBeginDragHandler)
        classes.EventHandlers.push(classes.IBeginDragHandler);
    }
    if (classes.ICancelHandler == null) {
      classes.ICancelHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.ICancelHandler", true);
      if (classes.ICancelHandler)
        classes.EventHandlers.push(classes.ICancelHandler);
    }
    if (classes.IDeselectHandler == null) {
      classes.IDeselectHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IDeselectHandler", true);
      if (classes.IDeselectHandler)
        classes.EventHandlers.push(classes.IDeselectHandler);
    }
    if (classes.IDragHandler == null) {
      classes.IDragHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IDragHandler", true);
      if (classes.IDragHandler)
        classes.EventHandlers.push(classes.IDragHandler);
    }
    if (classes.IDropHandler == null) {
      classes.IDropHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IDropHandler", true);
      if (classes.IDropHandler)
        classes.EventHandlers.push(classes.IDropHandler);
    }
    if (classes.IEndDragHandler == null) {
      classes.IEndDragHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IEndDragHandler", true);
      if (classes.IEndDragHandler)
        classes.EventHandlers.push(classes.IEndDragHandler);
    }
    if (classes.IInitializePotentialDragHandler == null) {
      classes.IInitializePotentialDragHandler =
          ClassLoader.resolveClass<UnityClass>(
              imageUI,
              "UnityEngine.EventSystems.IInitializePotentialDragHandler", true);
      if (classes.IInitializePotentialDragHandler)
        classes.EventHandlers.push(classes.IInitializePotentialDragHandler);
    }
    if (classes.IMoveHandler == null) {
      classes.IMoveHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IMoveHandler", true);
      if (classes.IMoveHandler)
        classes.EventHandlers.push(classes.IMoveHandler);
    }
    if (classes.IPointerClickHandler == null) {
      classes.IPointerClickHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IPointerClickHandler", true);
      if (classes.IPointerClickHandler)
        classes.EventHandlers.push(classes.IPointerClickHandler);
    }
    if (classes.IPointerDownHandler == null) {
      classes.IPointerDownHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IPointerDownHandler", true);
      if (classes.IPointerDownHandler)
        classes.EventHandlers.push(classes.IPointerDownHandler);
    }
    if (classes.IPointerEnterHandler == null) {
      classes.IPointerEnterHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IPointerEnterHandler", true);
      if (classes.IPointerEnterHandler)
        classes.EventHandlers.push(classes.IPointerEnterHandler);
    }
    if (classes.IPointerExitHandler == null) {
      classes.IPointerExitHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IPointerExitHandler", true);
      if (classes.IPointerExitHandler)
        classes.EventHandlers.push(classes.IPointerExitHandler);
    }
    if (classes.IPointerUpHandler == null) {
      classes.IPointerUpHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IPointerUpHandler", true);
      if (classes.IPointerUpHandler)
        classes.EventHandlers.push(classes.IPointerUpHandler);
    }
    if (classes.IScrollHandler == null) {
      classes.IScrollHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IScrollHandler", true);
      if (classes.IScrollHandler)
        classes.EventHandlers.push(classes.IScrollHandler);
    }
    if (classes.ISelectHandler == null) {
      classes.ISelectHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.ISelectHandler", true);
      if (classes.ISelectHandler)
        classes.EventHandlers.push(classes.ISelectHandler);
    }
    if (classes.ISubmitHandler == null) {
      classes.ISubmitHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.ISubmitHandler", true);
      if (classes.ISubmitHandler)
        classes.EventHandlers.push(classes.ISubmitHandler);
    }
    if (classes.IUpdateSelectedHandler == null) {
      classes.IUpdateSelectedHandler = ClassLoader.resolveClass<UnityClass>(
          imageUI, "UnityEngine.EventSystems.IUpdateSelectedHandler", true);
      if (classes.IUpdateSelectedHandler)
        classes.EventHandlers.push(classes.IUpdateSelectedHandler);
    }

    const imageUnityWebRequest =
        images.get("UnityEngine.UnityWebRequestModule")!;
    if (classes.UploadHandlerRaw == null) {
      classes.UploadHandlerRaw = ClassLoader.resolveClass<UnityClass>(
          imageUnityWebRequest, "UnityEngine.Networking.UploadHandlerRaw",
          false);
    }
    if (classes.UnityWebRequest == null) {
      classes.UnityWebRequest = ClassLoader.resolveClass<UnityClass>(
          imageUnityWebRequest, "UnityEngine.Networking.UnityWebRequest",
          false);
    }
    if (classes.CertificateHandler == null) {
      classes.CertificateHandler = ClassLoader.resolveClass<UnityClass>(
          imageUnityWebRequest, "UnityEngine.Networking.CertificateHandler",
          false);
    }

    const imageResourceManagement =
        images.get("UnityEngine.ResourceManagement")!;
    if (imageResourceManagement) {
      if (classes.AsyncOperationHandle1 == null) {
        classes.AsyncOperationHandle1 = imageResourceManagement.class(
            "UnityEngine.ResourceManagement.AsyncOperations.AsyncOperationHandle`1");
        if (!classes.AsyncOperationHandle1) {
          console.error("Could not resolve AsyncOperationHandle`1 class.");
        }
      }

      if (classes.SceneInstance == null) {
        classes.SceneInstance = ClassLoader.resolveClass<UnityClass>(
            imageResourceManagement,
            "UnityEngine.ResourceManagement.ResourceProviders.SceneInstance",
            true);
      }
    }

    const imageUIElemnts = images.get("UnityEngine.UIElements");
    if (imageUIElemnts) {
      if (classes.IEventHandler == null) {
        classes.IEventHandler = ClassLoader.resolveClass<UnityClass>(
            imageUIElemnts, "UnityEngine.UIElements.IEventHandler", false);
        if (classes.IEventHandler)
          classes.EventHandlers.push(classes.IEventHandler);
      }
      if (classes.CallbackEventHandler == null) {
        // TODO(Jkim-Hack): Looks like this class implements IEventHandler which
        // also handles TextInput events. Add support for TextInput events.
        classes.CallbackEventHandler = ClassLoader.resolveClass<UnityClass>(
            imageUIElemnts, "UnityEngine.UIElements.CallbackEventHandler",
            false);
      }
    }

    const imageAnalyticsModule = images.get("UnityEngine.UnityAnalyticsModule");
    if (imageAnalyticsModule) {
      if (classes.Analytics == null) {
        classes.Analytics = ClassLoader.resolveClass<UnityClass>(
            imageAnalyticsModule, "UnityEngine.Analytics.Analytics", false);
      }
    }

    const imageInputLegacyModule = images.get("UnityEngine.InputLegacyModule");
    if (imageInputLegacyModule) {
      if (classes.LocationService == null) {
        classes.LocationService = ClassLoader.resolveClass<UnityClass>(
            imageInputLegacyModule, "UnityEngine.LocationService", false);
      }
    }

    const imageAssetBundle = images.get("UnityEngine.AssetBundleModule");
    if (imageAssetBundle) {
      if (classes.AssetBundle == null) {
        classes.AssetBundle = ClassLoader.resolveClass<UnityClass>(
            imageAssetBundle, "UnityEngine.AssetBundle", false);
      }
    }

    const imageAddressables = images.get("Unity.Addressables");
    if (imageAddressables) {
      if (classes.Addressables == null) {
        classes.Addressables = ClassLoader.resolveClass<UnityClass>(
            imageAddressables, "UnityEngine.AddressableAssets.Addressables",
            false);
      }
      if (classes.AddressablesImpl == null) {
        classes.AddressablesImpl = ClassLoader.resolveClass<UnityClass>(
            imageAddressables, "UnityEngine.AddressableAssets.AddressablesImpl",
            false);
      }
    }
  }
}

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
import {AllMethods} from "./class-loader.js"
import {UnityClass, UnityObject} from './unity_types.js'
import { Classes } from './classes.js'
import { Util } from './utils.js'

function assert(value: unknown): asserts value {
  if (!value) {
    throw new Error("Assertion failed");
  }
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

  public getObject(handleAddrStr: string): Il2Cpp.Object|null {
    if (this.hasObject(handleAddrStr)) {
      return this.objectMap.get(handleAddrStr)!.unbox();
    }
    return null;
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

export class ResolvedAssetBundles {
  private static instance: ResolvedAssetBundles;

  private classes: Classes = Classes.getInstance();
  
  public static getInstance(): ResolvedAssetBundles {
    if (!ResolvedAssetBundles.instance) {
      ResolvedAssetBundles.instance = new ResolvedAssetBundles();
    }
    return ResolvedAssetBundles.instance;
  }
  
  assetBundles: Il2Cpp.Object[];

  unresolvedAssetBundles: Promise<Il2Cpp.Object>[];

  constructor()  { 
    this.assetBundles = new Array<Il2Cpp.Object>(); 
    this.unresolvedAssetBundles = new Array<Promise<Il2Cpp.Object>>();
  }
  
  putAssetBundle(assetBundle: Il2Cpp.Object) {
    this.assetBundles.push(assetBundle); 
  }

  
  putAssetBundleOperation(assetBundleOp: Promise<Il2Cpp.Object>) {
    assert(this.classes.AssetBundle!.imageClass);
    this.unresolvedAssetBundles.push(assetBundleOp);
  }

  async resolveAssetBundles() {
    // TODO: Streamify
    for (let assetBundleHandle of this.unresolvedAssetBundles) { 
      this.putAssetBundle(await assetBundleHandle);
    }
    this.unresolvedAssetBundles = [];
  }

  // "An AssetBundle can store either Scenes or Assets, never a mix of the two."
  async loadAllAssetBundles() : Promise<Il2Cpp.Object[]>{
    if (this.unresolvedAssetBundles.length > 0) {
      await this.resolveAssetBundles();
    }
    let allAssets = await this.assetBundles.filter(bundle => !bundle.isNull() && 
                                   bundle.method<Il2Cpp.Array<Il2Cpp.String>>("GetAllScenePaths").invoke().length == 0)
    .map(bundle => Util.runAsyncOperationHandle<Il2Cpp.Array<Il2Cpp.Object>>(bundle.method("LoadAllAssetsAsync"), [], {}));

    let objects = [];
    for (let asset of allAssets) {
      let boxedObjs: Il2Cpp.Array<Il2Cpp.Object> = await asset;
      for (let obj of boxedObjs) { 
        objects.push(obj);
      }
    }

    return objects;
  }

  async resolveScenes() : Promise<Map<Il2Cpp.String, Il2Cpp.Object>> {
    let classes = Classes.getInstance();
    
    if (this.unresolvedAssetBundles.length > 0) {
      await this.resolveAssetBundles();
    }

    // TODO: we dont need the actual AssetBundles, we should remove.
    return new Map(this.assetBundles.filter(bundle => !bundle.isNull()).flatMap(bundle => {
      let scenes = bundle.method<Il2Cpp.Array<Il2Cpp.String>>("GetAllScenePaths").invoke();
      let sceneBundleEntry = [];
      for (let scene of scenes) {
       if (classes.Path) {
        scene = classes.Path!.imageClass.method("GetFileNameWithoutExtension").invoke(scene) as Il2Cpp.String; 
       }
       sceneBundleEntry.push({key: scene, value: bundle});
      }
      return sceneBundleEntry;
    }).map(sceneBundle => [sceneBundle.key, sceneBundle.value]));
  }
}

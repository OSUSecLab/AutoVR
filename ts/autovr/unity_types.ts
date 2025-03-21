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
import "frida-il2cpp-bridge"

import {
  AllMethods,
  ClassLoader,
  ResolvedClasses,
  ResolvedObjects,
  ResolvedSymbols
} from './loader.js'

const targetMethods = [ "LoadSceneAsyncNameIndexInternal" ];
var currMethodName = '';

function assert(value: unknown): asserts value {
  if (!value) {
    throw new Error("Assertion failed");
  }
}

export class UnityClass {
  imageClass!: Il2Cpp.Class; // TODO: Add Mono class descriptor once built.
  methods!:
      Map<string, UnityMethod<Il2Cpp.Method.ReturnType>>; // Method name to
                                                          // UnityMethod obj
  parentClass!: UnityClass;
  nestedClasses!: UnityClass[];

  constructor(uClass?: UnityClass) {
    if (uClass) {
      this.imageClass = uClass.imageClass;
      this.methods = new Map(uClass.methods);
      this.parentClass = uClass.parentClass;
      this.nestedClasses = [];
    }
  }

  new(): UnityObject {
    let obj = this.imageClass.new();
    let instance = ResolvedObjects.getInstance();
    instance.putIl2CppObject(obj);
    return new UnityObject(obj, this);
  }

  /** Checks if this UnityClass inherits from the @param parentClass. */
  inherits(parentClass: UnityClass, includeInterfaces: boolean): boolean {
    assert(parentClass != null);
    assert(this.imageClass != null);
    if (this.parentClass != null) {
      return this.imageClass.isSubclassOf(parentClass.rawImageClass,
                                          includeInterfaces);
    }
    return false;
  }

  get name(): string { return this.rawImageClass.name; }

  /** @internal */
  get rawImageClass(): Il2Cpp.Class {
    assert(this.imageClass != null);
    return this.imageClass;
  }

  /** Gets direct parent UnityClass */
  get parent(): UnityClass { return this.parentClass; }

  get il2cppType(): Il2Cpp.Type { return this.rawImageClass.type; }

  tryMethod(name: string): UnityMethod<Il2Cpp.Method.ReturnType>|undefined {
    assert(this.methods != null);
    if (!this.methods!.has(name))
      return undefined;
    return this.methods!.get(name)!;
  }

  method(name: string): UnityMethod<Il2Cpp.Method.ReturnType> {
    assert(this.methods != null);
    assert(this.methods!.has(name));
    return this.methods!.get(name)!;
  }

  get resolvedMethods(): Map<string, UnityMethod<Il2Cpp.Method.ReturnType>> {
    assert(this.methods != null);
    return this.methods!;
  }

  /** Resolves fully qualified className from assembly image. */
  resolve(image: Il2Cpp.Image, className: string) {
    assert(image != null);
    assert(className != null);
    assert(this.imageClass == null);
    assert(this.methods == null);

    let classTemp = image.tryClass(className);
    if (classTemp != null) {
      this.methods = new Map<string, UnityMethod<Il2Cpp.Method.ReturnType>>();
      this.imageClass = classTemp;
      let id = this.imageClass.name;
      ResolvedClasses.getInstance().putClass(id, this);
      this.resolveNestedClasses(this.imageClass.nestedClasses);
    }
    return classTemp;
  }

  /** Resolves fully qualified className from assembly image. */
  resolveClass(clazz: Il2Cpp.Class) {
    assert(clazz != null);
    assert(this.imageClass == null);
    assert(this.methods == null);

    this.methods = new Map<string, UnityMethod<Il2Cpp.Method.ReturnType>>();
    this.imageClass = clazz;
    this.nestedClasses = [];
    let image = this.imageClass.image;
    let id = this.imageClass.name;

    ResolvedClasses.getInstance().putClass(id, this);
    this.resolveNestedClasses(this.imageClass.nestedClasses);
    return clazz;
  }

  resolveNestedClasses(nested: Il2Cpp.Class[]) {
    this.nestedClasses = [];
    if (nested.length > 0) {
      nested.forEach(imgClass => {
        let nClass = new UnityClass();
        let result = nClass.resolveClass(imgClass);
        if (result) {
          ResolvedClasses.getInstance().putClass(imgClass.name, nClass);
          this.nestedClasses.push(nClass);
        }
      });
    }
  }

  /**
   * Resolves all methods depending on filter, true to resolve, false to
   * ignore.
   */
  resolveMethods(
      filter?: (method: UnityMethod<Il2Cpp.Method.ReturnType>) => boolean) {
    assert(this.imageClass);
    this.imageClass.methods.forEach(imgMethod => {
      let uMethod =
          new UnityMethod<Il2Cpp.Method.ReturnType>(this).resolve(imgMethod);
      if (typeof filter !== 'undefined') {
        if (filter.call(this, uMethod)) {
          if (this.methods.has(imgMethod.name)) {
            this.methods.get(imgMethod.name)!.addOverload(uMethod);
          } else {
            this.methods.set(imgMethod.name, uMethod);
          }
        }
      } else {
        if (this.methods.has(imgMethod.name)) {
          this.methods.get(imgMethod.name)!.addOverload(uMethod);
        } else {
          this.methods.set(imgMethod.name, uMethod);
        }
      }
    }, this);
    this.nestedClasses.forEach(nClass => { nClass.resolveMethods(filter); });
  }

  /**
   * Adds method instructions to all resolved methods from @method
   * resolveMethods.
   */
  resolveMethodInstructions() {
    assert(this.imageClass != null);
    assert(this.methods != null);
    let allMethodAddrs = AllMethods.getInstance();
    if (allMethodAddrs.size > 0) {
      let queue: string[] = [];
      this.methods.forEach((uMethod: UnityMethod<Il2Cpp.Method.ReturnType>,
                            methodName: string) => {
        if (allMethodAddrs.contains(uMethod.virtualAddress.toString())) {
          let overloads = uMethod.overloads;
          var overloadIndex = -1;
          var method = uMethod;
          do {
            if (overloadIndex >= 0) {
              method = uMethod.overloads[overloadIndex];
            }
            queue.push(method.virtualAddress.toString());
            // let ins = UnityClass.resolveInstructions(method.virtualAddress,
            //                                          methodName, true);
            // if (overloadIndex >= 0) {
            //   this.methods!.get(methodName)!.overloads[overloadIndex]
            //       .instructions = ins;
            // } else {
            //   this.methods!.get(methodName)!.instructions = ins;
            // }
            overloadIndex++;
          } while (overloads.length > overloadIndex);
        }
      });
      let obj = {"type" : "resolve_methods", "to_resolve" : queue};
    }
    this.nestedClasses.forEach(
        nClass => { nClass.resolveMethodInstructions(); });
  }
}

abstract class Boxable {
  private isMono: boolean = false;
  private il2CppType?: Il2Cpp.Field.Type|void;
  // MONO types

  private il2CppValue?: Il2Cpp.ValueType|Il2Cpp.Parameter|Il2Cpp.Reference|void;

  abstract unbox(): Il2Cpp.ValueType|Il2Cpp.Parameter|Il2Cpp.Object;

  box(val: Il2Cpp.ValueType): UnityObject {
    let object = val.box();
    return new UnityObject(object);
  }
}

export class UnityMethod<ReturnType extends Il2Cpp.Method.ReturnType> {
  private parentClass: UnityClass;
  private initialized: boolean = false;
  private methodSignature: Il2Cpp.Method<ReturnType>|null = null;
  // private methodInstructions: MethodInstructions|null = null;
  private overloadingMethods: UnityMethod<ReturnType>[] = [];
  private name!: string;
  private isGeneric: boolean = false;
  private paramTypes: string[] = [];

  private readOffsets: string[] = [];
  private writeOffsets: string[] = [];
  private base: Number = Number(0);

  constructor(parentClass: UnityClass) { this.parentClass = parentClass; }

  /** @internal */
  addOverload(overload: UnityMethod<ReturnType>) {
    assert(this.initialized);
    this.overloadingMethods.push(overload);
  }

  /** @internal */
  get overloads() {
    assert(this.initialized);
    return this.overloadingMethods;
  }

  overload(...params: string[]) {
    assert(this.initialized);
    for (var i = 0; i < this.overloadingMethods.length; i++) {
      let overloadParams = this.overloadingMethods[i].parameterTypes;
      if (this.arrayEquals(overloadParams, params)) {
        return this.overloadingMethods[i];
      }
    }
    throw new Error("No overload suited for " + this.name);
  }

  /** @internal */
  private arrayEquals(arr1: string[], arr2: string[]): boolean {
    if (arr1.length != arr2.length)
      return false;
    for (var i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i])
        return false;
    }
    return true;
  }

  get parameterTypes() {
    assert(this.initialized);
    return this.paramTypes;
  }

  /** @internal */
  get il2cppMethod(): Il2Cpp.Method<ReturnType> {
    assert(this.initialized);
    assert(this.methodSignature != null);
    return this.methodSignature;
  }

  get virtualAddress(): NativePointer {
    assert(this.initialized);
    assert(this.il2cppMethod != null);
    return this.il2cppMethod.virtualAddress;
  }

  execute(obj?: UnityObject, ...args: any): ReturnType|undefined {
    assert(this.initialized);
    assert(this.methodSignature != null);
    assert(this.methodSignature.parameterCount == args.length);
    let imageObject: Il2Cpp.Object;
    if (obj) {
      imageObject = obj.unbox();
    } else if (this.base != Number(0)) {
      let baseAddr = '0x' + this.base.toString(16);
      let instance = ResolvedObjects.getInstance();
      if (instance.hasObject(baseAddr)) {
        imageObject = instance.object(baseAddr)!.unbox();
      } else {
        // Something happened? Sequence may not have caught this base addr
        console.log("Should not happen");
        return undefined;
      }
    }
    return this.executeIl2Cpp(imageObject!, ...args);
  }

  executeIl2Cpp(obj: Il2Cpp.Object, ...args: any): ReturnType {
    assert(this.initialized);
    assert(this.methodSignature != null);
    assert(this.methodSignature.parameterCount == args.length);
    return obj.method<ReturnType>(this.methodSignature.name, args.length)
        .invoke(...args);
  }

  executeStatic(...args: any): ReturnType {
    assert(this.initialized);
    assert(this.methodSignature != null);
    return this.methodSignature.invoke(...args);
  }

  set implementation(block: (this: Il2Cpp.Class|Il2Cpp.Object,
                             ...parameters: any[]) => ReturnType) {
    assert(this.initialized);
    assert(this.methodSignature != null);
    this.methodSignature!.implementation = block;
  }

  revert() {
    assert(this.initialized);
    assert(this.methodSignature != null);
    this.methodSignature!.revert();
  }

  // Sets instructions for solvers to use. Does not replace actual instructions.
  /*
  set instructions(ins: MethodInstructions) {
    assert(this.initialized);
    assert(this.methodSignature != null);
    this.methodInstructions =
        new MethodInstructions(ins.instructions, ins.readOffsets,
                               ins.writeOffsets, ins.containsTarget);
  }
  printInstructions() {
    assert(this.methodInstructions != null);
    this.methodInstructions.printInstructions();
  }
  fieldOffsets() {
    assert(this.methodInstructions != null);
    return this.methodInstructions.fieldOffsetsFound;
  }
  */

  addBase(offset: string|Number) {
    if (offset instanceof Number) {
      this.base = offset;
    } else {
      this.base = Number(offset);
    }
  }
  /*
  get reads() {
    assert(this.methodInstructions != null);
    return this.methodInstructions.readOffsets.map(offset => {
      let num = Number(offset) + Number(this.base);
      return '0x' + num.toString(16);
    });
  }

  get writes() {
    assert(this.methodInstructions != null);
    return this.methodInstructions.writeOffsets.map(offset => {
      let num = Number(offset) + Number(this.base);
      return '0x' + num.toString(16);
    });
  }

  hasTarget() {
    assert(this.methodInstructions != null);
    return this.methodInstructions.hasTarget;
  }
  */
  get methodName() {
    assert(this.name);
    return this.name;
  }

  /** @internal */
  resolve(methodSignature: Il2Cpp.Method<ReturnType>) {
    assert(!this.initialized);
    assert(this.methodSignature == null);
    this.methodSignature = methodSignature;
    this.initialized = true;
    this.name = methodSignature.name;
    let params = methodSignature.parameters;
    for (var i = 0; i < params.length; i++) {
      let type = params[i].type;
      this.paramTypes.push(type.name);
    }
    return this;
  }
}

export class UnityObject extends Boxable {
  private imageObject!: Il2Cpp.Object;
  private uClass?: UnityClass;

  constructor(imageObject: Il2Cpp.Object, uClass?: UnityClass) {
    super();
    this.uClass = uClass;
    this.imageObject = imageObject;
  }

  il2cppUnbox() { return this.imageObject.unbox(); }

  unbox() { return this.imageObject; }

  get class
  () { return this.uClass; }

  get base(): NativePointer { return this.imageObject.handle; }

  resolveClassIfNeeded() {
    assert(this.imageObject || this.uClass);
    let instance = ResolvedClasses.getInstance();
    let uClass =
        ClassLoader.resolveClassFromObject<UnityClass>(this.imageObject);
    if (uClass) {
      let id = uClass.name;
      if (!instance.hasClass(id)) {
        instance.putClass(id, uClass);
      }
      this.uClass = instance.classes.get(id)!;
      let methods = this.uClass.resolvedMethods;
      methods.forEach(method => { method.addBase(this.base.toString()); });
    } else {
      console.log("Unable to resolve class from: ", this.imageObject);
    }
  }

  tryMethod(name: string, paramCount: number) {
    assert(this.uClass);
    return this.imageObject!.tryMethod(name, paramCount);
  }

  invokeMethod(methodName: string, ...params: any) {
    this.resolveClassIfNeeded();
    let methods = this.uClass!.methods;
    if (methods.has(methodName)) {
      let method = methods.get(methodName)!;
      return method.execute(this, params);
    }
  }

  toString(): string { return this.imageObject.toString(); }
}

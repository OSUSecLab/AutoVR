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
import {Classes} from './classes.js'
import {AllMethods} from './class-loader.js'
import {ResolvedSymbols} from './resolver.js'
import {UnityMethod} from './unity_types.js'

export const promiseTimeoutRevert =
    function(ms: number, promise: Promise<any>,
             method: UnityMethod<Il2Cpp.Method.ReturnType>) {
  let timeout = new Promise((resolve, reject) => {
    let id = setTimeout(() => {
      clearTimeout(id);
      method.revert();
      resolve('0x0');
    }, ms);
  });

  return Promise.race([ promise, timeout ]);
}

export const promiseTimeout =
    function(ms: number, promise: Promise<any>) {
  let timeout = new Promise((resolve, reject) => {
    let id = setTimeout(() => {
      console.log("TIME");
      clearTimeout(id);
      resolve('0x0');
    }, ms);
  });
  return Promise.race([ promise, timeout ]);
}

export class Util {

  static resolveInstructions(address: NativePointer, methodName: string,
                             shouldResolveBranches: boolean = true) {
    let allMethodAddrs = AllMethods.getInstance();
    let builder =
        new MethodInstructionsBuilder(methodName, shouldResolveBranches);
    if (!address.isNull() && allMethodAddrs.size > 0) {
      let instruction = Instruction.parse(address);
      do {
        try {
          builder.addInstruction(address, instruction);
          instruction = Instruction.parse(instruction.next);
          address = instruction.address;
        } catch (e) {
          // Assume any exceptions are result of ending a class' method
          // addresses
          break;
        }
      } while (!allMethodAddrs.contains(address.toString()) &&
               instruction.mnemonic !== "udf");
    }
    return builder.buildAndClear();
  }

  static resolveInstructionsInterval(start: NativePointer, end: NativePointer,
                                     methodName: string,
                                     shouldResolveBranches: boolean = true) {
    let allMethodAddrs = AllMethods.getInstance();
    let builder =
        new MethodInstructionsBuilder(methodName, shouldResolveBranches);
    if (!start.isNull() && allMethodAddrs.size > 0) {
      let instruction = Instruction.parse(start);
      do {
        try {
          builder.addInstruction(start, instruction);
          instruction = Instruction.parse(instruction.next);
          start = instruction.address;
        } catch (e) {
          // Assume any exceptions are result of ending a class' method
          // addresses
          break;
        }
      } while (end.toString() !== start.toString());
    }
    return builder.buildAndClear();
  }

  static async runOnAllThreads(block: () => any,
                               breakOnFirstPassed: boolean = true) {
    let allThreads = Il2Cpp.attachedThreads;
    for (let thread of allThreads) {
      try {
        await thread.schedule(() => {
          block();
          // console.log("passed, on thread", thread.id);
        });
        if (breakOnFirstPassed)
          break;
      } catch (err: any) {
        // console.log(thread.id, "throws err");
      }
    }
  }

  static debugHookAllObjectMethods(obj: Il2Cpp.Object) {
    let clazz = obj.class;
    let methods = clazz.methods;
    for (const method of methods) {
      let objMethod = obj.method(method.name);
      try {

        objMethod.implementation = function(...params) {
          console.log("CALLED", method.name);
          try {
            console.log(params);
          } catch (err: any) {
          }
          return objMethod.invoke(...params);
        };
      } catch (err: any) {
      }
    }
  }

  static objectsOfClass(clazz: Il2Cpp.Class, objs: Il2Cpp.Object[]) {
    return objs.filter(obj => clazz.isAssignableFrom(obj.class));
  }

  static async tryObjectsOnThread():
      Promise<Promise<Il2Cpp.Object[]>[]|undefined> {
    let classes = Classes.getInstance();
    if (classes.GameObject && classes.Object) {
      let GameObject = classes.GameObject!.rawImageClass;
      let Component = classes.Component!.rawImageClass;
      // TODO: Memory map objects to their respective threads so that we can
      // call functions on individual threads for each object, instead of brute
      // forcing.
      return await Il2Cpp.perform<Array<Promise<Array<Il2Cpp.Object>>>>(() => {
        let threads: Il2Cpp.Thread[] =
            Il2Cpp.attachedThreads.filter(thread => thread && !thread.isNull())
        let promises = new Array<Promise<Array<Il2Cpp.Object>>>();
        for (const thread of threads) {
          try {
            promises.push(thread.schedule<Array<Il2Cpp.Object>>(() => {
              try {
                let findObjectsMethod =
                    GameObject.tryMethod<Il2Cpp.Array<Il2Cpp.Object>>(
                        "FindObjectsOfType");
                if (findObjectsMethod) {
                  console.log("Getting Objects...")
                  return Array.from(findObjectsMethod.overload("System.Type")
                                        .invoke(Component.type.object));
                }
                return Il2Cpp.MemorySnapshot.capture().objects;
              } catch (e) {
                // console.log("tryObjectsOnThread", e);
              }
              return new Array<Il2Cpp.Object>();
            }));
          } catch (e) {
            // console.log("threads:", e);
            promises.push(Promise.resolve(new Array<Il2Cpp.Object>()));
            continue;
          }
        }
        return promises;
      });
    }
  }

  static async getAllObjects(): Promise<Il2Cpp.Object[]> {
    let classes = Classes.getInstance();
    if (classes.GameObject && classes.Object) {
      let objs = new Array<Il2Cpp.Object>();
      try {
        let promiseObjs = await Util.tryObjectsOnThread();
        if (promiseObjs) {
          for (const promise of promiseObjs) {
            let promiseObj = await promise;
            objs.push(...promiseObj);
          }
        }
      } catch (e) {
        let err = e as Error;
        console.log("GetAllObjects", e, err.stack);
      }
      if (objs.length > 0) {
        return objs;
      }
    }
    console.log("Getting other objects instead...");
    return Il2Cpp.MemorySnapshot.capture().objects;
  }

  static async getActiveObjects(objects: Il2Cpp.Object[]) {
      let instance = Classes.getInstance();
    // return objects;
    return await Il2Cpp.mainThread.schedule(() => {
      return Util.objectsOfClass(instance.Component!.rawImageClass, objects)
        .filter(obj => {
            try {
              if (obj.isNull()) {
                return false;
              }
              let gameObj = obj.method<Il2Cpp.Object>("get_gameObject").invoke();
              if (gameObj.isNull()) {
                return false;
              }
              let active = gameObj!.tryMethod<boolean>("get_activeInHierarchy");
              let activeSelf = gameObj!.tryMethod<boolean>("get_activeSelf");
              if (active && activeSelf) {
                return active.invoke() && activeSelf.invoke();
              }
              return false;
            } catch (e) {
              console.log(e);
              return false;
            }
          });
        });

  }

  static async getAllActiveObjects() {
    return await Util.getActiveObjects(await Util.getAllObjects());
  }

  static isCollider(comp: Il2Cpp.Class): boolean {
    let classes = Classes.getInstance();
    try {
      return comp.name.includes("Collider") && comp.isSubclassOf(classes.Collider!.imageClass, false) ||
             (comp.parent !== null && Util.isCollider(comp.parent));
    } catch {
      return false;
    }
  }

  static isActiveObject(comp: Il2Cpp.Object): boolean {
    try {
      return comp.method<Il2Cpp.Object>("get_gameObject")
          .invoke()
          .method<boolean>("get_activeInHierarchy")
          .invoke();
    } catch (err) {
      // console.log(err);
      return false;
    }
  }

  static findActiveColliders(comps: Array<Il2Cpp.Object>) {
    return comps.filter(comp => Util.isCollider(comp.class) &&
                                Util.isActiveObject(comp));
  }

  static getRigidbody(collider: Il2Cpp.Object) {
    let rb = collider.method<Il2Cpp.Object>('get_attachedRigidbody').invoke();
    return rb;
  }

  static isStaticCollider(collider: Il2Cpp.Object) {
    try {
      return Util.getRigidbody(collider).isNull();
    } catch (err) {
      return false;
    }
  }

  static findStaticColliders(colliders: Array<Il2Cpp.Object>) {
    return colliders.filter(collider => Util.isStaticCollider(collider));
  }

  static isKinematicCollider(collider: Il2Cpp.Object) {
    try {
      return !Util.isStaticCollider(collider) &&
             Util.getRigidbody(collider)
                 .method<boolean>("get_isKinematic")
                 .invoke();
    } catch (err) {
      return false;
    }
  }

  static findKinematicColliders(colliders: Array<Il2Cpp.Object>) {
    return colliders.filter(collider => !Util.isKinematicCollider(collider));
  }

  static isTrigger(comp: Il2Cpp.Object): boolean {
    try {
      return comp.method<boolean>("get_isTrigger").invoke()
    } catch (err) {
      // console.log(err);
      return false;
    }
  }

  // Potential triggers since we don't know if both sink and source are both
  // static colliders.
  static findPotentialTriggerables(colliders: Array<Il2Cpp.Object>) {
    return colliders.filter(collider => {
      try {
        return Util.isTrigger(collider);
      } catch (e) {
        return false;
      }
    });
  }

  static removeStaticTriggerables(colliders: Array<Il2Cpp.Object>) {
    return colliders.filter(collider => {
      try {
        return !Util.isStaticCollider(collider);
      } catch (e) {
        return false;
      }
    });
  }

  static findTriggerablesSink(comps: Array<Il2Cpp.Object>) {
    return comps.filter(comp => (comp.tryMethod("OnTriggerEnter") ||
                                 comp.tryMethod("OnTriggerStay") ||
                                 comp.tryMethod("OnTriggerExit")) &&
                                        Util.isActiveObject(comp)
                                    ? true
                                    : false);
  }

  static findCollisionables(colliders: Array<Il2Cpp.Object>) {
    return colliders.filter(collider => {
      try {
        // Is not static collider means rigidbody exists.
        // Is not kinematic means its a valid collision sink.
        return !Util.isTrigger(collider) &&
               ((!Util.isStaticCollider(collider) &&
                 !Util.isKinematicCollider(collider)) ||
                Util.isStaticCollider(collider) ||
                Util.isKinematicCollider(collider));
      } catch (e) {
        return false;
      }
    });
  }

  static doesCompHaveCollider(comp: Il2Cpp.Object) {
    try {
      const get_GameObject = comp.tryMethod<Il2Cpp.Object>("get_gameObject");
      if (get_GameObject) {
        const compGO = get_GameObject.invoke();
        let components = compGO.method<Il2Cpp.Array<Il2Cpp.Object>>("GetComponentsInChildren", 2).invoke(Classes.getInstance().Collider!.imageClass.type.object, /*includeInactive=*/false);
        return components.length > 0;
      }
    } catch (e) {
      console.log("doesCompHavCollider:", e);
    }
    return false;
  }

  static findCollisionSinks(comps: Array<Il2Cpp.Object>) {
    return comps.filter(comp => this.doesCompHaveCollider(comp) && ((comp.tryMethod("OnCollisionEnter") ||
                                 comp.tryMethod("OnCollisionStay") ||
                                 comp.tryMethod("OnCollisionExit"))) &&
                                        Util.isActiveObject(comp)
                                    ? true
                                    : false);
  }
  
  /**
   * Handles Unity's async operations.
   * @param method The method that returns an AsyncOperationHandle.
   * @param args Arguments to pass to the async method (optional).
   * @param options Optional configuration for the operation:
   *   - timeout: Maximum time to wait for the operation to complete (in ms, default: 10,000).
   *   - retries: Number of retries for transient errors (default: 0).
   * @returns A Promise resolving to the operation's result.
   */
  static async runAsyncOperationHandle<T = any>(
    method: Il2Cpp.Method,
    args: any[] = [],
    options: { timeout?: number; retries?: number } = {}, 
  ): Promise<T> {
    const { timeout = 10000, retries = 0 } = options;

    if (!method) {
      throw new Error("Async method not found.");
    }

    let instance = Classes.getInstance();
    const actionGeneric = instance.Action;
    if (!actionGeneric) {
      throw new Error("Action class not found.");
    }

    let attempts = 0;

    const invokeOperation = (): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("Async operation timed out."));
        }, timeout);

        try {
          const handle = method.invoke(...args) as Il2Cpp.Object;

          if (handle.isNull()) {
            clearTimeout(timeoutId);
            reject(new Error("AsyncOperationHandle is null."));
            return;
          }

          handle.method("add_completed").invoke(
            Il2Cpp.delegate(actionGeneric.inflate(handle.class), () => {
              clearTimeout(timeoutId);
              try {
                const result = handle.method("get_Result").invoke();
                const status = handle.method("get_Status").invoke();
                const exception = handle.method("get_OperationException").invoke();
                console.log("AsyncOperation exception:", exception);
                if (exception) {
                  throw new Error(exception.toString());
                }
                console.debug("Async operation completed.");
                resolve(result as T);
              } catch (err) {
                reject(err);
              }
            })
          );
        } catch (err) {
          clearTimeout(timeoutId);
          reject(err);
        }
      });

    while (attempts <= retries) {
      try {
        return await invokeOperation();
      } catch (error) {
        if (attempts < retries) {
          attempts++;
          console.warn(`Retrying operation (${attempts}/${retries})...`);
        } else {
          throw error;
        }
      }
    }

    throw new Error("Async operation failed after retries.");
  }

  /**
   * Handles Unity's async operations.
   * @param method The method that returns an AsyncOperation.
   * @param args Arguments to pass to the async method (optional).
   * @param options Optional configuration for the operation:
   *   - timeout: Maximum time to wait for the operation to complete (in ms, default: 10,000).
   *   - retries: Number of retries for transient errors (default: 0).
   * @returns A Promise resolving to the operation's result.
   */
  static async runAsyncOperation(
    method: Il2Cpp.Method,
    args: any[] = [],
    parent: Il2Cpp.Object | null = null,
    options: { timeout?: number; retries?: number, allowSceneActivation?: boolean} = {}
  ): Promise<Il2Cpp.Object> {
    const { timeout = 10000, retries = 0, allowSceneActivation = false} = options;

    if (!method) {
      throw new Error("Async method not found.");
    }

    if (method.returnType.typeEnum != 18) {
      throw new Error("Unsupported async operation return type.");
    }

    let instance = Classes.getInstance();
    const actionGeneric = instance.Action;
    if (!actionGeneric) {
      throw new Error("Action class not found.");
    }

    let attempts = 0;

    const invokeOperation = (): Promise<Il2Cpp.Object> =>
      new Promise<Il2Cpp.Object>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("Async operation timed out."));
        }, timeout);
        
        try {
          const operation = (parent ? 
                              parent.method(method.name, method.parameterCount).invoke(...args) : 
                              method.invoke(...args)) as Il2Cpp.Object;
          if (allowSceneActivation && operation) {
            operation.method("set_allowSceneActivation").invoke(true);
          } 

          const add_completed = operation.method("add_completed");
          add_completed.invoke(
            Il2Cpp.delegate(actionGeneric.inflate(instance.AsyncOperation!), () => {
              clearTimeout(timeoutId);
              resolve(operation);
            })
          );
        } catch (err) {
          console.error("invokeOperation()", err);
          clearTimeout(timeoutId);
          reject(err);
          throw err;
        }
      });

    while (attempts <= retries) {
      try {
        return invokeOperation();
      } catch (error) {
        if (attempts < retries) {
          attempts++;
          console.warn(`Retrying operation (${attempts}/${retries})...`);
        } else {
          throw error;
        }
      }
    }

    throw new Error("Async operation failed after retries.");
  }
}

export class MethodInstructionsBuilder {
  public instructions: Map<string, Instruction> = new Map();
  public methodName: string;
  public mAddress: string|undefined;
  public classHandle: string|undefined;

  private shouldResolveBranches: boolean = true;

  // Calling object's register trace
  private coReg: string = 'x0';
  private adrpRegs: Map<string, Number> = new Map();

  constructor(methodName: string, resolveBranches: boolean) {
    this.shouldResolveBranches = resolveBranches;
    this.methodName = methodName;
  }

  addInstruction(addr: NativePointer, ins: Instruction) {
    this.instructions.set(addr.toString(), ins);
  }

  clear() { this.instructions.clear(); }

  buildAndClear(): MethodInstructions {
    let mi = this.build();
    this.clear();
    return mi;
  }

  build(): MethodInstructions {
    return new MethodInstructions(this.instructions);
  }
}

export class MethodInstructions {
  public instructions: Map<string, Instruction>;

  constructor(instructions: Map<string, Instruction>) {
    this.instructions = new Map(instructions);
  }

  toJson() {
    let jsonInstructions: any[] = [];
    this.instructions.forEach((instr, addr) => {
      jsonInstructions.push({
        instruction : instr.toString(),
        groups : instr.groups,
        mnemonic : instr.mnemonic,
        addr : addr
      });
    });
    return {"instructions" : jsonInstructions};
  }
}

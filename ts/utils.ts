import {Classes} from './classes'
import {AllMethods, ResolvedSymbols} from './loader'
import {UnityMethod} from './unity_types'

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

  static objectsOfClass(clazz: Il2Cpp.Class, objs: Il2Cpp.Object[]) {
    return objs.filter(obj => clazz.isAssignableFrom(obj.class));
  }

  static async tryObjectsOnThread():
      Promise<Promise<Il2Cpp.Object[]>[]|undefined> {
    let classes = Classes.getInstance();
    if (classes.GameObject && classes.Object) {
      let GameObject = classes.GameObject!.rawImageClass;
      let Component = classes.Component!.rawImageClass;
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

  static getActiveObjects(objects: Il2Cpp.Object[]) {
    let instance = Classes.getInstance();
    // return objects;
    return Util.objectsOfClass(instance.Component!.rawImageClass, objects)
        .filter(obj => {
          try {
            if (obj.isNull()) {
              return false;
            }
            let gameObj = obj.method<Il2Cpp.Object>("get_gameObject").invoke();
            if (gameObj && gameObj.isNull()) {
              return false;
            }
            let active = gameObj!.tryMethod<boolean>("get_activeInHierarchy");
            if (active) {
              return active.invoke();
            } else {
              return false;
            }
          } catch (e) {
            return false;
          }
        });
  }

  static async getAllActiveObjects() {
    return Util.getActiveObjects(await Util.getAllObjects());
  }

  static isCollider(comp: Il2Cpp.Class): boolean {
    try {
      return comp.name.includes("Collider") ||
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

  static findCollisionSinks(comps: Array<Il2Cpp.Object>) {
    return comps.filter(comp => (comp.tryMethod("OnCollisionEnter") ||
                                 comp.tryMethod("OnCollisionStay") ||
                                 comp.tryMethod("OnCollisionExit")) &&
                                        Util.isActiveObject(comp)
                                    ? true
                                    : false);
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

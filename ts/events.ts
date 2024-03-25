import {Classes} from './classes';
import {AllMethods, Loader, ResolvedObjects, wait} from './loader';
import {UnityObject} from './unity_types';
import {promiseTimeout, Util} from './utils';

let blacklist = [
  "UnityEngine.Vector2", "UnityEngine.Vector3", "UnityEngine.Transform",
  "UnityEngine.Transform[]", "UnityEngine.Quaternion", "System.Object",
  "UnityEngine.Material", "System.String", "UnityEngine.Collider[]",
  "UnityEngine.Collider", "System.Reflection.FieldInfo[]",
  "System.Reflection.PropertyInfo[]", "UnityEngine.CharacterJoint",
  "UnityEngine.JointDrive", "UnityEngine.Animator", "System.Int32",
  "System.Char", "System.Type", "Unity.Profiling.ProfilerMarker"
]; // List of classes to exclude from event finding

const TIME_BETWEEN_EVENTS = 2000;
const TIME_BETWEEN_PHYSICS = 3000;

export interface Event {
  event: string;
  sequence: Array<string>;
}

export class TriggeredEvents {
  private static instance: TriggeredEvents;
  private events: Set<string>;

  private constructor() { this.events = new Set<string>; }

  public static getInstance(): TriggeredEvents {
    if (!TriggeredEvents.instance) {
      TriggeredEvents.instance = new TriggeredEvents();
    }
    return TriggeredEvents.instance;
  }

  public contains(event: string) { return this.events.has(event); }

  public addEvent(event: string) { this.events.add(event); }

  get triggeredEvents() { return this.events; }

  public clear() { this.events.clear(); }
}

interface FieldData {
  field?: Il2Cpp.Field;
  subFields: FieldData[];
  hasUEvent: boolean;
  isUIEvent: boolean;
}

export class EventLoader {
  classes!: Classes;
  curr_scene!: number;
  visited: Set<string> = new Set<string>;
  loadedEvents: Map<string, Il2Cpp.Object> = new Map<string, Il2Cpp.Object>;
  efcs: Map<string, Set<Il2Cpp.Object>> = new Map<string, Set<Il2Cpp.Object>>;

  constructor(scene_index: number) {
    this.curr_scene = scene_index;
    this.classes = Classes.getInstance();
  }

  private inVisited(comp: Il2Cpp.Object) {
    return this.visited.has(comp.handle.toString());
  }

  // objs: additional objects.
  public findAllUnityEvents(comps: Il2Cpp.Object[]) {
    console.log("-------FINDING UNITY EVENTS-------")
    if (this.classes.UnityEvent && this.classes.Object &&
        this.classes.GameObject && this.classes.Component) {

      try {
        // Explore fields of component class and all subfields
        // if a field is an object, then it may have subfields.
        for (const comp of comps) {
          this.visited.add(comp.handle.toString());

          let fields = comp.class.fields;
          let result: FieldData[] = [];
          let types = new Set<string>(blacklist);
          fields.forEach(field => {
            types.add(field.type.name)
            // console.log("From", comp.class.name, field.type.class.name);
            let fieldData: FieldData = {
              field : undefined,
              hasUEvent : false,
              isUIEvent : this.implementsUIHandler(comp.class),
              subFields : []
            };
            fieldData.field = field;
            if (!field.type.isPrimitive) {
              if (this.implementsUIHandler(field.type.class)) {
                fieldData.isUIEvent = true;
              }
              if (field.type.name.includes("UnityEvent")) {
                fieldData.hasUEvent = true;
              } else {
                // Explore subfields
                let found = this.findEventsInField(field, types);
                if (found.field) {
                  let fieldName = found.field!.type.class.name;
                  fieldData.hasUEvent = found.hasUEvent || fieldData.hasUEvent;
                  fieldData.isUIEvent = found.isUIEvent || fieldData.isUIEvent;
                  fieldData.subFields.push(found);
                }
              }
            }

            if (fieldData.hasUEvent) {
              result.push(fieldData);
            }
            this.exploreSubFields(comp, result, types)
          });
        }
      } catch (ee) {
        console.log(ee)
      }
    }
    console.log("-------DONE FINDING UNITY EVENTS-------")
  }

  private implementsUIHandler(clazz: Il2Cpp.Class) {
    let classes = Classes.getInstance();
    for (const eh of classes.EventHandlers) {
      if (clazz.isSubclassOf(eh.rawImageClass, true)) {
        return true;
      }
    }
    return false;
  }

  private exploreSubFields(component: Il2Cpp.Object, fieldDatas: FieldData[],
                           types: Set<string>) {
    fieldDatas.forEach(fd => {
      let field = fd.field!;
      let fieldName = field.name;
      if (field && fd.hasUEvent) {
        if (field.type.name.includes("UnityEvent") && fd.isUIEvent) {
          this.loadUnityEventField(component, fieldName);
        } else if (this.parentHasUnityEvent(field)) {
          let fieldObj =
              component.field<Il2Cpp.Object>(fieldName).value as Il2Cpp.Object;
          if (!fieldObj.isNull() && fd.isUIEvent) {
            this.loadUnityEvent(fieldObj);
          }
        } else if (fd.subFields.length > 0 && !types.has(field.type.name)) {
          let tCopy = new Set(types);
          if (!field.type.name.includes("UnityEvent")) {
            tCopy.add(field.type.name);
          }
          let fieldObj =
              component.field<Il2Cpp.Object>(fieldName).value as Il2Cpp.Object;
          if (!fieldObj.isNull()) {
            this.exploreSubFields(fieldObj, fd.subFields, tCopy);
          }
        }
      }
    });
  }

  private findEventsInField(field: Il2Cpp.Field,
                            types: Set<string>): FieldData {
    let result: FieldData = {
      field : undefined,
      hasUEvent : false,
      isUIEvent : false,
      subFields : []
    };
    if (!field.type.isPrimitive) {
      // then its an object
      let fieldClass = field.type.class;
      if (!field.type.name.includes("UnityEvent")) {
        types.add(field.type.name);
      }
      let tCopy = new Set(types);
      let fields = fieldClass.fields;
      if (fieldClass.parent) {
        result.hasUEvent = fieldClass.parent!.name.includes("UnityEvent");
        if (this.implementsUIHandler(fieldClass.parent)) {
          result.isUIEvent = true;
        }
        fields.concat(fieldClass.parent!.fields);
      }
      if (this.implementsUIHandler(fieldClass)) {
        result.isUIEvent = true;
      }

      result.field = field;

      fields.forEach(f => {
        let fclass = f.type.class;
        result.isUIEvent = this.implementsUIHandler(fclass) || result.isUIEvent;
        result.hasUEvent =
            fclass.name.includes("UnityEvent") || result.hasUEvent;
        if (!types.has(f.type.name) && !f.type.name.includes("System.") &&
            !f.type.name.includes("[]")) {
          // console.log(f.type.name);
          let found = this.findEventsInField(f, tCopy);
          tCopy.forEach(obj => types.add(obj));
          if (found.field) {
            types.delete(f.type.name);
            let fieldName = found.field.name;
            result.hasUEvent = found.hasUEvent || result.hasUEvent;
            result.isUIEvent = found.isUIEvent || result.isUIEvent;
            result.subFields.push(found);
          }
        }
      });
    }
    return result;
  }

  private parentHasUnityEvent(field: Il2Cpp.Field): boolean {
    let fieldClass = field.type.class;
    if (fieldClass.parent) {
      return fieldClass.parent!.name.includes("UnityEvent");
    }
    return false;
  }

  private loadUnityEvent(eventObj: Il2Cpp.Object) {
    if (eventObj && !eventObj.isNull()) {
      this.loadedEvents.set(eventObj.handle.toString(), eventObj);
      ResolvedObjects.getInstance().putIl2CppObject(eventObj);
      console.log("Loaded: ", eventObj, eventObj.class.name);
    }
  }

  private loadUnityEventField(comp: Il2Cpp.Object, fieldName: string) {
    if (comp && !comp.isNull()) {
      let field = comp.tryField<Il2Cpp.Object>(fieldName);
      if (field) {
        let event = field.value as Il2Cpp.Object;
        if (!event.isNull()) {
          this.loadedEvents.set(comp.handle.toString(), event);
          ResolvedObjects.getInstance().putIl2CppObject(comp);
          console.log("Loaded: ", fieldName, event.handle, " from: ", comp,
                      " offset: ", comp.handle, event.class.name);
        }
      }
    }
  }

  private getCallsFromICL(event: Il2Cpp.Object) {
    let invokableCallList = event.field<Il2Cpp.Object>("m_Calls").value;
    let m_PersisitentCalls =
        invokableCallList.field<Il2Cpp.Object>("m_PersistentCalls").value;
    let m_RuntimeCalls =
        invokableCallList.field<Il2Cpp.Object>("m_RuntimeCalls").value;
    let m_ExecutingCalls =
        invokableCallList.field<Il2Cpp.Object>("m_ExecutingCalls").value;

    let res = [];
    try {
      let p_calls =
          m_PersisitentCalls.method<Il2Cpp.Array<Il2Cpp.Object>>("ToArray")
              .invoke();
      res.push(p_calls);
      let r_calls =
          m_RuntimeCalls.method<Il2Cpp.Array<Il2Cpp.Object>>("ToArray")
              .invoke();
      res.push(r_calls);
      let e_calls =
          m_ExecutingCalls.method<Il2Cpp.Array<Il2Cpp.Object>>("ToArray")
              .invoke();
      res.push(e_calls);
    } catch (e) {
      console.log(e);
    }

    return res;
  }

  private hookAndInvokeUnityEvents() {
    let addrs: string[] = [];
    if (this.classes.UnityEvent && this.classes.InvokableCallList &&
        this.classes.UnityEventBase) {
      console.log("Hooking listeners...");
      var Method_AddPersistentInvokableCall =
          this.classes.InvokableCallList.method("AddPersistentInvokableCall");
      var Method_AddListener =
          this.classes.InvokableCallList.method("AddListener");

      let loaded = Array.from(this.loadedEvents.values());
      var k = 0;
      var nullCount = 0;
      var failed = 0;

      let efcs_per_event = [];
      console.log(loaded.length);
      for (const event of loaded) {
        try {
          if (event.isNull()) {
            console.log("Null event");
            continue;
          }
          let eventKey = event.handle.toString();

          let persistentCallGroup =
              event.field<Il2Cpp.Object>("m_PersistentCalls").value;
          let m_Calls =
              persistentCallGroup.field<Il2Cpp.Object>("m_Calls").value;
          let p_calls =
              m_Calls.method<Il2Cpp.Array<Il2Cpp.Object>>("ToArray").invoke();
          console.log(persistentCallGroup, m_Calls, p_calls.length);
          let icl_calls = this.getCallsFromICL(event);

          let all_calls: Il2Cpp.Object[] = [];

          // Get PersistentCallGroup calls
          for (var i = 0; i < p_calls.length; i++) {
            let p_call = p_calls.get(i);
            let grc = p_call.tryMethod<Il2Cpp.Object>("GetRuntimeCall");
            if (grc) {
              let rc = grc.invoke(event);
              all_calls.push(rc);
              // EventTriggerer.hookUnityEventInvoke(rc);
            }
          }

          // Get InvokableCallList calls
          for (const icl_call of icl_calls) {
            for (var i = 0; i < icl_call.length; i++) {
              all_calls.push(icl_call.get(i));
              // EventTriggerer.hookUnityEventInvoke(icl_call.get(i));
            }
          }

          let call_count = 0;
          for (const call of all_calls) {
            if (!call.isNull()) {
              let delegate = call.tryField<Il2Cpp.Object>("Delegate")!.value;
              let val =
                  delegate.tryField<Il2Cpp.ValueType>("method_ptr")!.value;
              k++;
              call_count++;
              addrs.push(val.toString());
              if (!this.efcs.has(val.toString())) {
                this.efcs.set(val.toString(), new Set());
              }
              this.efcs.get(val.toString())!.add(event);
              // console.log(val.toString());
              // console.log(
              //     AllMethods.getInstance().methods.get(val.toString()));
            } else {
              nullCount++;
            }
          }
          efcs_per_event.push(call_count)
        } catch (err) {
          failed++;
          console.log(err, (err as Error).stack);
          continue;
        }
      }
      let per_event = {
        "type" : "efc_per_event",
        "scene" : this.curr_scene,
        "data" : efcs_per_event
      };
      let res = {
        "type" : "unity_events",
        "scene" : this.curr_scene,
        "objects" : loaded.length,
        "callbacks" : k,
        "failed" : failed + nullCount
      };
      send(JSON.stringify(per_event));
      send(JSON.stringify(res));
      console.log(k + "/" + loaded.length, "succeeded events.");
      console.log(nullCount + "/" + loaded.length, "null events.");
      console.log(failed + "/" + loaded.length, "failed events.");
    }
    return addrs;
  }

  private getActiveCollisionSinks(comps: Il2Cpp.Object[]) {
    let sinks = Util.findCollisionSinks(comps);
    let enters = new Set<string>();
    let exits = new Set<string>();
    let stays = new Set<string>();
    sinks.forEach(sink => {
      let method = sink.tryMethod("OnCollisionEnter");
      if (method) {
        enters.add(method.virtualAddress.toString());
      }
      method = sink.tryMethod("OnCollisionExit");
      if (method) {
        exits.add(method.virtualAddress.toString());
      }
      method = sink.tryMethod("OnCollisionStay");
      if (method) {
        stays.add(method.virtualAddress.toString());
      }
    });
    return Array.from(enters)
        .concat(Array.from(stays))
        .concat(Array.from(exits));
  }

  private getActiveTriggerables(comps: Il2Cpp.Object[]) {
    let triggers = Util.findTriggerablesSink(comps);
    let enters = new Set<string>();
    let exits = new Set<string>();
    let stays = new Set<string>();
    triggers.forEach(trigger => {
      let method = trigger.tryMethod("OnTriggerEnter");
      if (method) {
        enters.add(method.virtualAddress.toString());
      }
      method = trigger.tryMethod("OnTriggerExit");
      if (method) {
        exits.add(method.virtualAddress.toString());
      }
      method = trigger.tryMethod("OnTriggerStay");
      if (method) {
        stays.add(method.virtualAddress.toString());
      }
    });
    return Array.from(enters)
        .concat(Array.from(stays))
        .concat(Array.from(exits));
  }

  public getEventFunctionCallbacks(objects: Il2Cpp.Object[]) {
    let comps = objects.filter(comp => !this.inVisited(comp));
    if (comps.length > 0) {
      let res = this.loadUnityEvents(comps)
                    .concat(this.getActiveTriggerables(comps))
                    .concat(this.getActiveCollisionSinks(comps));
      console.log(res);
      return res;
    }
    return [];
  }

  private loadUnityEvents(comps: Il2Cpp.Object[]) {
    // this.loadedEvents.clear();
    this.findAllUnityEvents(comps);
    return this.hookAndInvokeUnityEvents();
  }
}

export class EventTriggerer {

  loader!: EventLoader;
  curr_scene!: number;

  constructor(curr_scene: number, loader: EventLoader) {
    this.curr_scene = curr_scene;
    this.loader = loader;
  }

  public static hookUnityEventInvoke(ue: Il2Cpp.Object) {
    ue.class.methods.forEach(method => {
      if (method.name === "Invoke") {
        let invoke = ue.tryMethod(method.name, method.parameterCount);
        if (invoke) {
          console.log(invoke);
          if (method.parameterCount > 0) {
            invoke.implementation = function(v1: any): any {
              let ret = invoke!.invoke(v1);
              console.log("Invoke called", ue, v1, ret);
              return ret;
            };
          } else {
            invoke.implementation = function(): any {
              let ret = invoke!.invoke();
              console.log("Invoke called", ue, ret);
              return ret;
            };
          }
        }
      }
    });
  }

  private ableParams(im: Il2Cpp.Method): boolean {
    let paramCount = im.parameterCount;
    for (const param of im.parameters) {
      let type = param.type;
      if (type.isPrimitive) {
        // Can't accurately simulate anything other than boolean for the
        // moment.
        if (type.typeEnum !== Il2Cpp.Type.enum.boolean) {
          return false;
        }
      }
    }
    return true;
  }

  private countBoolParams(im: Il2Cpp.Method) {
    let count = 0;
    let paramCount = im.parameterCount;
    for (const param of im.parameters) {
      let type = param.type;
      if (type.isPrimitive) {
        if (type.typeEnum === Il2Cpp.Type.enum.boolean) {
          count++;
        }
      }
    }
    return count;
  }

  // boolVal = true to set the boolean value to true.
  private generateArguments(im: Il2Cpp.Method,
                            boolVal: boolean = false): any[] {
    let paramCount = im.parameterCount;
    let argsList: any[] = [];

    for (const param of im.parameters) {
      let type = param.type;
      if (type.isPrimitive) {
        // Should always be boolean
        const TryParse =
            Il2Cpp.corlib.class("System.Boolean").method("TryParse");
        const value = Il2Cpp.reference<boolean>(boolVal);
        if (boolVal) {
          TryParse.invoke(Il2Cpp.string("true"), value);
        } else {
          TryParse.invoke(Il2Cpp.string("false"), value);
        }
        argsList.push(value.value);
      } else {
        // Must be an object
        let objs: UnityObject[] =
            ResolvedObjects.getInstance().objectsOfClass(type.object.class);
        if (objs.length > 0) {
          argsList.push(objs[0].unbox());
        }
      }
    }

    return argsList;
  }

  private async invokeSequenceMethod(emMethod: Il2Cpp.Method,
                                     eObjs: UnityObject[],
                                     sequence: Array<string>) {

    const instance = AllMethods.getInstance();
    const resolvedObjects = ResolvedObjects.getInstance();
    var i = 0;
    var max = 4;
    for (const methodVA of sequence) {
      if (i > max)
        break;
      if (instance.contains(methodVA)) {
        const handle = instance.methods.get(methodVA);
        const method = new Il2Cpp.Method(new NativePointer(handle!));
        const mClass = method.class;
        const objs: UnityObject[] = resolvedObjects.objectsOfClass(mClass);

        for (const obj of objs) {
          const toInvoke = obj.tryMethod(method.name, method.parameterCount);
          if (toInvoke && this.ableParams(toInvoke)) {
            console.log("Triggering", toInvoke.name);
            try {
              let bools = this.countBoolParams(toInvoke);
              if (bools > 0) {
                for (var j = 0; j < 2; j++) {
                  const argsList =
                      this.generateArguments(toInvoke, j == 1 ? true : false);
                  toInvoke.invoke(...argsList);
                }
              } else {
                const argsList = this.generateArguments(toInvoke);
                toInvoke.invoke(...argsList);
              }
            } catch (e) {
              console.log(e);
              continue;
            }
          }
        }
        await this.triggerEventsOfObjs(emMethod, eObjs);
        await wait(300);
        i++;
      }
    }
  }

  private async triggerUI(obj: Il2Cpp.Object, method: Il2Cpp.Method) {
    let events = this.loader.efcs;
    let res = {
      "type" : "UI",
      "scene" : this.curr_scene,
      "data" : method.class.name + "$$" + method.name
    };
    send(JSON.stringify(res));
    // TODO: Too much nesting, clean.
    if (events.has(method.virtualAddress.toString())) {
      let efcs = events.get(method.virtualAddress.toString())!;
      for (const fc of efcs) {
        try {
          let compMethod = fc.tryMethod("Invoke");
          if (compMethod) {
            console.log("INVOKING", obj, method.name);
            if (this.countBoolParams(compMethod) > 0) {
              await Util.runOnAllThreads(() => {
                if (compMethod) {
                  for (var j = 0; j < 2; j++) {
                    const argsList = this.generateArguments(
                        compMethod, j == 1 ? true : false);
                    compMethod.invoke(...argsList);
                  }
                }
              });
            } else {
              // Sometimes these methods are accessing obejcts from different
              // threads. The best chance is to try to invoke this methods on
              // all possible threads.
              await Util.runOnAllThreads(() => {
                if (compMethod) {
                  compMethod.invoke();
                }
              });
            }
            console.log("INVOKED", method.name);
          }
        } catch (e) {
          console.log("UI UI UI:", e);
        }
      }
    }
  }

  // Assume comp is a triggerable
  public async triggerCollider(method: Il2Cpp.Method, comp: Il2Cpp.Object,
                               colliders: Array<Il2Cpp.Object>) {
    let compMethod = comp.tryMethod(method.name, method.parameterCount);
    method.revert();
    method.implementation = function(v1: Il2Cpp.Object): any {
      console.log("[!]", "trigger", comp, v1);
      return comp.method(method.name, method.parameterCount).invoke(v1);
    };
    let trigger_count = 0;
    for (const collider of colliders) {
      await Util.runOnAllThreads(() => {
        if (compMethod && !collider.isNull()) {
          compMethod.invoke(collider);
          trigger_count++;
        }
      });
    }
    let res = {
      "type" : "triggers",
      "scene" : this.curr_scene,
      "data" : trigger_count
    };
    send(JSON.stringify(res));
  }

  public async triggerCollision(method: Il2Cpp.Method, comp: Il2Cpp.Object,
                                collisionables: Array<Il2Cpp.Object>) {
    const instance = Classes.getInstance();
    if (!instance.Rigidbody) {
      return;
    }
    const sinkGO = comp.method<Il2Cpp.Object>("get_gameObject").invoke();
    const sinkRB =
        sinkGO.method("GetComponent")
            .inflate<Il2Cpp.Object>(instance.Rigidbody!.rawImageClass)
            .invoke();
    if (sinkRB.isNull()) {
      // console.log("RB null");
      return;
    }
    method.revert();
    method.implementation = function(v1: Il2Cpp.Object): any {
      console.log("[!]", "collision", comp,
                  v1.method<Il2Cpp.Object>("get_collider")
                      .invoke()
                      .method<Il2Cpp.Object>("get_gameObject")
                      .invoke());
      return comp.method(method.name, method.parameterCount).invoke(v1);
    };
    // console.log("COLLISION SINK", sinkGO);
    // console.log("COLLISIONABLES", collisionables);
    // TODO: runOnAllThreads here
    let collision_count = 0
    for (var i = 0; i < collisionables.length; i++) {
      try {
        let collider = collisionables[i];
        const colliderRB =
            collider.method<Il2Cpp.Object>("get_attachedRigidbody").invoke();
        if (colliderRB.isNull()) {
          continue;
        }

        const originalPos =
            colliderRB.method<Il2Cpp.Object>("get_position").invoke();
        colliderRB.method("set_position")
            .invoke(sinkRB.method<Il2Cpp.Object>("get_position").invoke());
        collision_count++;
        await wait(300);
        colliderRB.method("set_position").invoke(originalPos);
      } catch (e: any) {
        console.log(e.stack);
        continue;
      }
    }
    let res = {
      "type" : "collisions",
      "scene" : this.curr_scene,
      "data" : collision_count
    };
    send(JSON.stringify(res));
  }

  private async triggerEventsOfObjs(method: Il2Cpp.Method,
                                    objsWithMethod: UnityObject[]) {
    /*
    if (method.isStatic) {
      try {
        method.invoke();
      } catch (e) {
        console.log(e);
      }
      return;
    }
    */
    const resolvedObjects = ResolvedObjects.getInstance();
    const objectIl2CppValues = resolvedObjects.objectIl2CppValues;

    const colliders = Util.findActiveColliders(objectIl2CppValues);
    const staticColliders = Util.findStaticColliders(colliders);
    const kinematicColliders = Util.findKinematicColliders(colliders);

    var triggerables = Util.findPotentialTriggerables(colliders);
    const collisionables = Util.findCollisionables(colliders);

    let methodName = method.name;
    const isTriggerEvent = methodName.includes("OnTrigger");
    const isCollisionEvent = methodName.includes("OnCollision");

    console.log("TRIGGERING", method.class.name + "$$" + methodName,
                objsWithMethod.length);
    for (const obj of objsWithMethod) {
      try {
        let unboxed = obj.unbox();
        if (!isCollisionEvent && !isTriggerEvent) {
          await promiseTimeout(20000, this.triggerUI(obj.unbox(), method));
        } else if (isTriggerEvent) {
          // Static colliders may not be triggered together, according to
          // physics rule matrix.
          let isStaticCollider = Util.isStaticCollider(unboxed);
          triggerables = Util.removeStaticTriggerables(triggerables);
          console.log("TRIGGERABLES", triggerables);
          await promiseTimeout(
              20000, this.triggerCollider(method, unboxed, triggerables));
        } else if (isCollisionEvent) {
          await promiseTimeout(
              20000, this.triggerCollision(method, unboxed, colliders));
        }
        await wait(TIME_BETWEEN_PHYSICS);
      } catch (e) {
        console.log(e);
      }
    }
  }

  private async loadNextEvents() {
    const instance = AllMethods.getInstance();
    const triggeredEvents = TriggeredEvents.getInstance();

    // Get all events loaded but ignore already triggered events.
    return this.loader
        .getEventFunctionCallbacks(await Util.getAllActiveObjects())
        .filter((event) => !triggeredEvents.contains(event) &&
                           instance.contains(event));
  }

  public sendTriggeredEvents() {
    const triggeredEvents = TriggeredEvents.getInstance();
    let res = {
      "type" : "leaks",
      "scene" : this.curr_scene,
      "data" : Array.from(triggeredEvents.triggeredEvents)
    };
    send(JSON.stringify(res));
    triggeredEvents.clear();
  }

  public async _triggerEvent(eventAddress: string) {
    const instance = AllMethods.getInstance();
    const triggeredEvents = TriggeredEvents.getInstance();
    const resolvedObjects = ResolvedObjects.getInstance();
    const objectIl2CppValues = resolvedObjects.objectIl2CppValues;
    let name =
        instance.contains(eventAddress) ? instance.getMethodName(eventAddress)! : eventAddress;
    if (!triggeredEvents.contains(name)) {
      triggeredEvents.addEvent(name);
    }
    if (instance.contains(eventAddress)) {
      const emHandle = instance.methods.get(eventAddress);
      const emMethod = new Il2Cpp.Method(new NativePointer(emHandle!));
      const emClass = emMethod.class;
      const eObjs: UnityObject[] = resolvedObjects.objectsOfClass(emClass);

      await this.triggerEventsOfObjs(emMethod, eObjs);
      // Wait between events avoid breaking
      await wait(TIME_BETWEEN_EVENTS);
    }
    return await this.loadNextEvents();
  }

  public async triggerEvent(eventObj: Event) {
    const instance = AllMethods.getInstance();
    const triggeredEvents = TriggeredEvents.getInstance();
    const resolvedObjects = ResolvedObjects.getInstance();
    const objectIl2CppValues = resolvedObjects.objectIl2CppValues;

    let event = eventObj.event;
    let sequence = eventObj.sequence;

    console.log("SEQ", sequence.length);
    for (var i = 0; i < sequence.length; i++) {
      let seqEventAddr = sequence[i];
      // Skip synthetic scene event nodes.
      if (!seqEventAddr.startsWith("scene:")) {
        this._triggerEvent(seqEventAddr);
      }
    }
    return await this._triggerEvent(event);
  }

  // Event Addr -> [methods to trigger]
  public async triggerAllEvents(events: Map<string, Array<string>>) {
    Loader.preventSceneChanges();
    Loader.preventAppQuit();
    const instance = AllMethods.getInstance();
    const triggeredEvents = TriggeredEvents.getInstance();
    const resolvedObjects = ResolvedObjects.getInstance();
    const objectIl2CppValues = resolvedObjects.objectIl2CppValues;

    for (const [event, sequence] of events) {
      if (triggeredEvents.contains(event)) {
        continue;
      }
      let name =
          instance.contains(event) ? instance.getMethodName(event)! : event;
      if (instance.contains(event)) {
        const emHandle = instance.methods.get(event);
        const emMethod = new Il2Cpp.Method(new NativePointer(emHandle!));
        const emClass = emMethod.class;
        const eObjs: UnityObject[] = resolvedObjects.objectsOfClass(emClass);

        if (sequence.length < 1) {
          await this.triggerEventsOfObjs(emMethod, eObjs);
        } else {
          await this.invokeSequenceMethod(emMethod, eObjs, sequence);
        }
        // Wait 1 sec between event groups to avoid breaking
        await wait(TIME_BETWEEN_EVENTS);
      }
      let nextEvents = await this.loadNextEvents();
      if (nextEvents.length > 1) {
        return nextEvents;
      }
    }
    await wait(5000); // Wait for any remaining events
    console.log("DONE");
    Loader.revertSceneChange();
    return new Map<string, string>();
  }
}

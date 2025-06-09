import {Classes} from './classes.js';
import {ResolvedObjects} from './resolver.js';
import {AllMethods} from './class-loader.js';
import { Loader,  wait} from './loader.js';
import {UnityObject} from './unity_types.js';
import {promiseTimeout, Util} from './utils.js';

let blacklist = [
  "UnityEngine.Vector2", "UnityEngine.Vector3", "UnityEngine.Transform",
  "UnityEngine.Transform[]", "UnityEngine.Quaternion", "System.Object",
  "UnityEngine.Material", "System.String", "UnityEngine.Collider[]",
  "UnityEngine.Collider", "System.Reflection.FieldInfo[]",
  "System.Reflection.PropertyInfo[]", "UnityEngine.CharacterJoint",
  "UnityEngine.JointDrive", "UnityEngine.Animator", "System.Int32",
  "System.Char", "System.Type", "Unity.Profiling.ProfilerMarker"
]; // List of classes to exclude from event finding

const TIME_BETWEEN_EVENTS = 100;

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
  hasCallbackEventHandler: boolean;
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
  public findAllUIEvents(comps: Il2Cpp.Object[]) {
    console.log("-------FINDING UI EVENTS-------")
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
            // Explore subfields to find UI events
            let found = this.findEventsInField(field, types);
            if (found.hasUEvent || found.hasCallbackEventHandler) {
              result.push(found);
            }
          });
          // Loads UI events
          this.exploreSubFields(comp, result, types);
        }
      } catch (ee) {
        console.log(ee)
      }
    }
    console.log("-------DONE FINDING UI EVENTS-------")
  }

  private implementsUIHandler(clazz: Il2Cpp.Class) {
    let classes = Classes.getInstance();
    for (const eh of classes.EventHandlers) {
      if (clazz.isSubclassOf(eh.rawImageClass, true) ||
          clazz.isAssignableFrom(eh.rawImageClass)) {
        return true;
      }
    }
    return false;
  }

  private parentHasUnityEvent(field: Il2Cpp.Field): boolean {
    let fieldClass = field.type.class;
    let parent: Il2Cpp.Class|null = fieldClass.parent;
    if (parent) {
      return parent!.name.includes("UnityEvent") ||
             parent!.name.includes("CallbackEventHandler");
    }
    return false;
  }

  private findEventsInField(field: Il2Cpp.Field,
                            types: Set<string>): FieldData {
    let result: FieldData = {
      field : undefined,
      hasUEvent : false,
      hasCallbackEventHandler : false,
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
        result.hasCallbackEventHandler =
            fieldClass.parent!.name.includes("hasCallbackEventHandler");
        result.isUIEvent = this.implementsUIHandler(fieldClass.parent);
        fields.concat(fieldClass.parent!.fields);
      }
      result.isUIEvent =
          result.isUIEvent || this.implementsUIHandler(field.type.class);

      fields.forEach(f => {
        let fclass = f.type.class;
        let fname = f.type.name;
        if (f.type && !types.has(fname) && !fname.includes("System.") &&
            !fname.includes("[]")) {
          let found = this.findEventsInField(f, tCopy);
          tCopy.forEach(obj => types.add(obj));
          if (found.hasUEvent || found.hasCallbackEventHandler) {
            let fieldName = found.field!.name;
            result.hasUEvent = found.hasUEvent || result.hasUEvent;
            result.isUIEvent = found.isUIEvent || result.isUIEvent;
            result.hasCallbackEventHandler =
                found.hasCallbackEventHandler || result.hasCallbackEventHandler;
            if (found.hasUEvent || found.hasCallbackEventHandler) {
              found.isUIEvent = result.isUIEvent;
              result.subFields.push(found);
            }
          }
        }
      });
      result.field = field;
    }
    return result;
  }

  private fieldNameHas(field: Il2Cpp.Field, hasName: string): boolean {
    return field.type.name.includes(hasName);
  }

  private exploreSubFields(component: Il2Cpp.Object, fieldDatas: FieldData[],
                           types: Set<string>) {
    fieldDatas.filter(fd => fd.field !== undefined).forEach(fd => {
      let field = fd.field!;
      let fieldName = field.name;
      if (field && (fd.hasUEvent || fd.hasCallbackEventHandler) &&
          fd.isUIEvent) {
        console.log("Component:", component, "Field:", field, fd.isUIEvent,
                    fd.subFields.length);
        if ((this.fieldNameHas(field, "UnityEvent") ||
             this.fieldNameHas(field, "CallbackEventHandler"))) {
          console.log("[FF]	Field:", fieldName, fd.subFields.length);
          this.loadUnityEventField(component, fieldName);
        } else if (this.parentHasUnityEvent(field)) {
          console.log("[PF]	Field:", fieldName, fd.subFields.length);
          let fieldObj =
              component.field<Il2Cpp.Object>(fieldName).value as Il2Cpp.Object;
          if (!fieldObj.isNull()) {
            console.log("NULL", fieldObj.isNull());
            this.loadUnityEvent(fieldObj);
          }
        } else if (fd.subFields.length > 0 && !types.has(field.class.name)) {
          console.log("[SF]	Field:", fieldName, fd.subFields.length);
          fd.subFields.forEach(sf => console.log("		",
                                                 sf.field!.type.name,
                                                 sf.field!.name));
          let tCopy = new Set(types);
          if (!this.fieldNameHas(field, "UnityEvent") &&
              !this.fieldNameHas(field, "CallbackEventHandler")) {
            tCopy.add(component.toString());
          }
          let fieldObj =
              component.field<Il2Cpp.Object>(fieldName).value as Il2Cpp.Object;
          if (!fieldObj.isNull()) {
            console.log("	Field:", fieldName, fieldObj.class.name,
                        fd.subFields.length);
            this.exploreSubFields(fieldObj, fd.subFields, tCopy);
          }
        }
      }
    });
  }

  private loadUnityEvent(eventObj: Il2Cpp.Object) {
    this.loadedEvents.set(eventObj.handle.toString(), eventObj);
    ResolvedObjects.getInstance().putIl2CppObject(eventObj);
    console.log("Loaded: ", eventObj, eventObj.class.name);
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

  private getEventCallbackFunctors(eventCallbackList: Il2Cpp.Object,
                                   event: Il2Cpp.Object) {
    let m_List = eventCallbackList.field<Il2Cpp.Object>("m_List").value;
    let methods =
        m_List.method<Il2Cpp.Array<Il2Cpp.Object>>("ToArray").invoke();

    let addrs: string[] = [];
    for (let method of methods) {
      let delegate = method.field<Il2Cpp.Object>("m_Callback").value;
      let val = delegate.tryField<Il2Cpp.ValueType>("method_ptr")!.value;
      if (!val.isNull()) {
        addrs.push(val.toString());
        if (!this.efcs.has(val.toString())) {
          this.efcs.set(val.toString(), new Set());
        }
        this.efcs.get(val.toString())!.add(event);
      }
    }
    return addrs;
  }

  private getCallbackEventHandlers(event: Il2Cpp.Object) {
    let delegates: string[] = [];
    if (event.isNull()) {
      console.log("Null event");
    }
    let eventKey = event.handle.toString();

    let registryFieldObj =
        event.field<Il2Cpp.Object>("m_CallbackRegistry").value;
    if (!registryFieldObj.isNull()) {
      let m_Callbacks =
          registryFieldObj.field<Il2Cpp.Object>("m_Callbacks").value;
      let m_TemporaryCallbacks =
          registryFieldObj.field<Il2Cpp.Object>("m_TemporaryCallbacks").value;

      if (!m_Callbacks.isNull()) {
        delegates.concat(this.getEventCallbackFunctors(m_Callbacks, event));
      }
      if (!m_TemporaryCallbacks.isNull()) {
        delegates.concat(
            this.getEventCallbackFunctors(m_TemporaryCallbacks, event));
      }
    }
    return delegates;
  }

  private hookAndInvokeCallbackEventHandlers() {
    var failed = 0;
    if (this.classes.CallbackEventHandler) {
      console.log("Hooking Callback Event Handlers");
      let loaded = Array.from(this.loadedEvents.values());
      console.log(loaded.length)
      return loaded
          .filter((event) => event.class.isAssignableFrom(
                      this.classes.CallbackEventHandler!.imageClass))
          .map((event) => {
            try {
              return this.getCallbackEventHandlers(event);
            } catch (err) {
              failed++;
              console.log(err, (err as Error).stack);
            }
            return [];
          })
          .filter((possibleAddrs) => possibleAddrs.length > 0)
          .flat();
    }
    return [];
  }

  private hookAndInvokeUnityEvents() {
    let addrs: string[] = [];
    if (this.classes.UnityEvent && this.classes.InvokableCallList &&
        this.classes.UnityEventBase) {
      console.log("Hooking listeners...");

      let loaded = Array.from(this.loadedEvents.values());
      var k = 0;
      var nullCount = 0;
      var failed = 0;

      let efcs_per_event = [];
      for (const [key, event] of this.loadedEvents) {
        try {
          if (event.isNull()) {
            console.log("Null event");
            continue;
          } else if (event.class.isAssignableFrom(
                         this.classes.UnityEventBase.imageClass)) {
            continue;
          }
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
            }
          }

          // Get InvokableCallList calls
          for (const icl_call of icl_calls) {
            for (var i = 0; i < icl_call.length; i++) {
              all_calls.push(icl_call.get(i));
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
              addrs.push(key + "@" + val.toString());
              if (!this.efcs.has(val.toString())) {
                this.efcs.set(val.toString(), new Set());
              }
              this.efcs.get(val.toString())!.add(event);
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
    console.log("COLLISIONS:", sinks.length);
    let enters = new Set<string>();
    let exits = new Set<string>();
    let stays = new Set<string>();
    sinks.forEach(sink => {
      let method = sink.tryMethod("OnCollisionEnter");
      if (method) {
        console.log(sink.class.name + "$$" + method.virtualAddress.toString());
        enters.add(sink.handle.toString() + "@" + method.virtualAddress.toString());
      }
      method = sink.tryMethod("OnCollisionExit");
      if (method) {
        console.log(sink.class.name + "$$" + method.virtualAddress.toString());
        exits.add(sink.handle.toString() + "@" + method.virtualAddress.toString());
      }
      method = sink.tryMethod("OnCollisionStay");
      if (method) {
        console.log(sink.class.name + "$$" + method.virtualAddress.toString());
        stays.add(sink.handle.toString() + "@" + method.virtualAddress.toString());
      }
    });
    return Array.from(enters)
        .concat(Array.from(stays))
        .concat(Array.from(exits));
  }

  private getActiveTriggerables(comps: Il2Cpp.Object[]) {
    let resolvedObjects = ResolvedObjects.getInstance();
    let triggers = Util.findTriggerablesSink(comps);
    console.log("TRIGGERS:", triggers.length);
    let enters = new Set<string>();
    let exits = new Set<string>();
    let stays = new Set<string>();
    triggers.forEach(trigger => {
      console.log(trigger.class.name);
      let method = trigger.tryMethod("OnTriggerEnter");
      if (method) {
        enters.add(trigger.handle.toString() + "@" + method.virtualAddress.toString());
      }
      method = trigger.tryMethod("OnTriggerExit");
      if (method) {
        exits.add(trigger.handle.toString() + "@" + method.virtualAddress.toString());
      }
      method = trigger.tryMethod("OnTriggerStay");
      if (method) {
        stays.add(trigger.handle.toString() + "@" + method.virtualAddress.toString());
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
    this.findAllUIEvents(comps);
    return this.hookAndInvokeUnityEvents().concat(
        this.hookAndInvokeCallbackEventHandlers());
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
                    try {
                      compMethod.invoke(...argsList);
                    } catch (e) {
                      console.log("Invoke failed, msg:", e);
                    }
                  }
                }
              });
            } else {
              // Sometimes these methods are accessing obejcts from different
              // threads. The best chance is to try to invoke this methods on
              // all possible threads.
              await Util.runOnAllThreads(() => {
                if (compMethod) {
                  try {
                    compMethod.invoke();
                  } catch (e) {
                    console.log("Invoke failed, msg:", e);
                  }
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
    if (comp.isNull()) {
      return;
    }
    let compMethod = comp.tryMethod(method.name, method.parameterCount);
    method.revert();
    method.implementation = function(v1: Il2Cpp.Object): any {
      console.log("[!]", "trigger", comp, v1);
      if (!comp.isNull() && !v1.isNull()) {
        return comp.method(method.name, method.parameterCount).invoke(v1);
      }
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
    if (comp.isNull()) {
      return;
    }
    const instance = Classes.getInstance();
    if (!instance.Rigidbody) {
      return;
    }
    try {
    await Il2Cpp.mainThread.schedule(async () => {
        const sinkGO = comp.method<Il2Cpp.Object>("get_gameObject").invoke();
        const sinkTransform = sinkGO.method<Il2Cpp.Object>("get_transform").invoke();
        const sinkRB =
            sinkGO.method("GetComponent")
                .inflate<Il2Cpp.Object>(instance.Rigidbody!.rawImageClass)
                .invoke();
        if (sinkRB.isNull()) {
          return;
        }
        console.log("COLLISION SINK", sinkGO);
        console.log("COLLISIONABLES", collisionables.length);
        let collision_count = 0
        for (var i = 0; i < collisionables.length; i++) {
          try {
            if (sinkGO.isNull() || !Util.isActiveObject(sinkGO)) {
              console.log("COLLISION SINK", "NOT ACTIVE OR NULL");
              break;
            }

            let collider = collisionables[i];
            const colliderGO =
                collider.method<Il2Cpp.Object>("get_gameObject").invoke();
            if (colliderGO.equals(sinkGO)) {
              continue;
            }
            const colliderTransform = colliderGO.method<Il2Cpp.Object>("get_transform").invoke();
            const colliderRB =
                colliderGO.method("GetComponent")
                    .inflate<Il2Cpp.Object>(instance.Rigidbody!.rawImageClass)
                    .invoke();
            if (colliderRB.isNull()) {
              continue;
            }

            if ((colliderGO.isNull() || !Util.isActiveObject(colliderGO))) {
              continue;
            }

            const originalPos =
                sinkTransform.method<Il2Cpp.Object>("get_position").invoke();
            //console.log("Moved to position from ", originalPos);
            sinkTransform.method("set_position")
                .invoke(colliderTransform.method<Il2Cpp.Object>("get_position").invoke());
            sinkRB.method("set_position")
                .invoke(colliderTransform.method<Il2Cpp.Object>("get_position").invoke());
            // console.log("Moved to position to ", sinkRB.method<Il2Cpp.Object>("get_position").invoke());
            collision_count++;
            await wait(40);
            sinkTransform.method("set_position")
                .invoke(originalPos);
            sinkRB.method("set_position").invoke(originalPos);
            // console.log("Moved to original position to ", originalPos);
          } catch (e: any) {
            console.error("triggerCollision():", e.stack);
            continue;
          }
        }
        let res = {
          "type" : "collisions",
          "scene" : this.curr_scene,
          "data" : comp.class.name + "$$" + method.name,
          "count" : collision_count
        };
        send(JSON.stringify(res));
      });
    } catch (e: any) {
      console.error("triggerCollision():", e.stack);
      return;
    }
  }

  private async triggerEventsOfObj(method: Il2Cpp.Method,
                                    objWithMethod: Il2Cpp.Object) {
    const resolvedObjects = ResolvedObjects.getInstance();
    const objectIl2CppValues = resolvedObjects.objectIl2CppValues;

    await Il2Cpp.mainThread.schedule(async () => {
      const colliders = Util.findActiveColliders(objectIl2CppValues);
      const staticColliders = Util.findStaticColliders(colliders);
      const kinematicColliders = Util.findKinematicColliders(colliders);

      var triggerables = Util.findPotentialTriggerables(colliders);
      const collisionables = Util.findCollisionables(colliders);

      let methodName = method.name;
      const isTriggerEvent = methodName.includes("OnTrigger");
      const isCollisionEvent = methodName.includes("OnCollision");

      console.log("TRIGGERING", method.class.name + "$$" + methodName,
                  objWithMethod);
      try {
        console.log(objWithMethod.handle.toString());
        if (!isCollisionEvent && !isTriggerEvent) {
          await promiseTimeout(100, this.triggerUI(objWithMethod, method));
        } else if (isTriggerEvent) {
          // Static colliders may not be triggered together, according to
          // physics rule matrix.
          let isStaticCollider = Util.isStaticCollider(objWithMethod);
          if (isStaticCollider) {
            triggerables = Util.removeStaticTriggerables(triggerables);
          } 
          await promiseTimeout(
              100, this.triggerCollider(method, objWithMethod, triggerables));
        } else if (isCollisionEvent) {
          await promiseTimeout( 
              100, this.triggerCollision(method, objWithMethod, collisionables));
        }
      } catch (e) {
        console.log(e);
      }
    });
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

  public async _triggerEvent(event: string) {
    if (event.startsWith("scene:")) {
      return;
    }   
    const instance = AllMethods.getInstance();
    const triggeredEvents = TriggeredEvents.getInstance();
    const resolvedObjects = ResolvedObjects.getInstance();
    const objectIl2CppValues = resolvedObjects.objectIl2CppValues;
    let objEvent = event.split("@");
    let objHandle = objEvent[0];
    let eventAddress = objEvent[1];
    let name =
        instance.contains(eventAddress) ? instance.getMethodName(eventAddress)! : eventAddress;
    if (!triggeredEvents.contains(event)) {
      triggeredEvents.addEvent(event);
    } 
    console.log("_triggerEvent", name,  objHandle, " @ ", eventAddress, instance.contains(eventAddress), resolvedObjects.hasObject(objHandle));
    if (instance.contains(eventAddress) && resolvedObjects.hasObject(objHandle)) {
      console.log("ABOUT TO TRIGGER", name,  objHandle, " @ ", eventAddress, instance.contains(eventAddress));
      const emHandle = instance.methods.get(eventAddress);
      const emMethod = new Il2Cpp.Method(new NativePointer(emHandle!));
      const emClass = emMethod.class;
      const eObjs: UnityObject[] = resolvedObjects.objectsOfClass(emClass);
  
      await this.triggerEventsOfObj(emMethod, resolvedObjects.getObject(objHandle)!);
      // Wait between events avoid breaking
      await wait(TIME_BETWEEN_EVENTS);
    }
    let nextEvents = await this.loadNextEvents();
    return nextEvents;
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
}

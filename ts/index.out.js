(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Classes = void 0;
class Classes {
    static instance;
    constructor() { }
    static getInstance() {
        if (!Classes.instance) {
            Classes.instance = new Classes();
        }
        return Classes.instance;
    }
    /* Unity base classes */
    Object = null;
    Resources = null;
    /* Scene related classes */
    SceneManager = null;
    LoadSceneParameters = null;
    LoadSceneMode = null;
    UnloadSceneOptions = null;
    AsyncOperation = null;
    /* General Unity objects */
    Component = null;
    GameObject = null;
    Collider = null;
    Rigidbody = null;
    /* UI event handlers */
    IBeginDragHandler = null;
    ICancelHandler = null;
    IDeselectHandler = null;
    IDragHandler = null;
    IDropHandler = null;
    IEndDragHandler = null;
    IInitializePotentialDragHandler = null;
    IMoveHandler = null;
    IPointerClickHandler = null;
    IPointerDownHandler = null;
    IPointerEnterHandler = null;
    IPointerExitHandler = null;
    IPointerUpHandler = null;
    IScrollHandler = null;
    ISelectHandler = null;
    ISubmitHandler = null;
    IUpdateSelectedHandler = null;
    /* UI event handlers in array form */
    EventHandlers = [];
    /* UI event helpers */
    UnityAction = null;
    UnityEvent = null;
    UnityEventBase = null;
    InvokableCall = null;
    InvokableCallList = null;
    PersistentCall = null;
    ExecuteEvents = null;
    PointerEventData = null;
    EventSystem = null;
    /* Oculus API bridge */
    CAPI = null;
    Message = null;
    /* Entitlements */
    Entitlements = null;
    /* Oculus VR Tracking */
    OVRBody = null;
    OVRBoundary = null;
    OVREyeGaze = null;
    OVRFace = null;
    OVRFaceExpressions = null;
    /* Unity LocationService API */
    LocationService = null;
    /* Unity SystemInfo API */
    SystemInfo = null;
    /* Application */
    Application = null;
    /* Analytics */
    Analytics = null;
    /* Sockets */
    Socket = null;
    /* UnityWebRequest UploadHandler */
    UploadHandlerRaw = null;
    /* UnityWebRequest CertificateHandler */
    CertificateHandler = null;
    /* UnityWebRequest */
    UnityWebRequest = null;
}
exports.Classes = Classes;

},{}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventTriggerer = exports.EventLoader = exports.TriggeredEvents = void 0;
const classes_1 = require("./classes");
const loader_1 = require("./loader");
const utils_1 = require("./utils");
let blacklist = [
    "UnityEngine.Vector2", "UnityEngine.Vector3", "UnityEngine.Transform",
    "UnityEngine.Transform[]", "UnityEngine.Quaternion", "System.Object",
    "UnityEngine.Material", "System.String", "UnityEngine.Collider[]",
    "UnityEngine.Collider", "System.Reflection.FieldInfo[]",
    "System.Reflection.PropertyInfo[]", "UnityEngine.CharacterJoint",
    "UnityEngine.JointDrive", "UnityEngine.Animator", "System.Int32",
    "System.Char", "System.Type", "Unity.Profiling.ProfilerMarker"
]; // List of classes to exclude from event finding
class TriggeredEvents {
    static instance;
    events;
    constructor() { this.events = new Set; }
    static getInstance() {
        if (!TriggeredEvents.instance) {
            TriggeredEvents.instance = new TriggeredEvents();
        }
        return TriggeredEvents.instance;
    }
    contains(event) { return this.events.has(event); }
    addEvent(event) { this.events.add(event); }
    get triggeredEvents() { return this.events; }
    clear() { this.events.clear(); }
}
exports.TriggeredEvents = TriggeredEvents;
class EventLoader {
    classes;
    curr_scene;
    visited = new Set;
    loadedEvents = new Map;
    efcs = new Map;
    constructor(scene_index) {
        this.curr_scene = scene_index;
        this.classes = classes_1.Classes.getInstance();
    }
    inVisited(comp) {
        return this.visited.has(comp.handle.toString());
    }
    // objs: additional objects.
    findAllUnityEvents(comps) {
        console.log("-------FINDING UNITY EVENTS-------");
        if (this.classes.UnityEvent && this.classes.Object &&
            this.classes.GameObject && this.classes.Component) {
            try {
                // Explore fields of component class and all subfields
                // if a field is an object, then it may have subfields.
                for (const comp of comps) {
                    this.visited.add(comp.handle.toString());
                    let fields = comp.class.fields;
                    let result = [];
                    let types = new Set(blacklist);
                    fields.forEach(field => {
                        types.add(field.type.name);
                        // console.log("From", comp.class.name, field.type.class.name);
                        let fieldData = {
                            field: undefined,
                            hasUEvent: false,
                            isUIEvent: this.implementsUIHandler(comp.class),
                            subFields: []
                        };
                        fieldData.field = field;
                        if (!field.type.isPrimitive) {
                            if (this.implementsUIHandler(field.type.class)) {
                                fieldData.isUIEvent = true;
                            }
                            if (field.type.name.includes("UnityEvent")) {
                                fieldData.hasUEvent = true;
                            }
                            else {
                                // Explore subfields
                                let found = this.findEventsInField(field, types);
                                if (found.field) {
                                    let fieldName = found.field.type.class.name;
                                    fieldData.hasUEvent = found.hasUEvent || fieldData.hasUEvent;
                                    fieldData.isUIEvent = found.isUIEvent || fieldData.isUIEvent;
                                    fieldData.subFields.push(found);
                                }
                            }
                        }
                        if (fieldData.hasUEvent) {
                            result.push(fieldData);
                        }
                        this.exploreSubFields(comp, result, types);
                    });
                }
            }
            catch (ee) {
                console.log(ee);
            }
        }
        console.log("-------DONE FINDING UNITY EVENTS-------");
    }
    implementsUIHandler(clazz) {
        let classes = classes_1.Classes.getInstance();
        for (const eh of classes.EventHandlers) {
            if (clazz.isSubclassOf(eh.rawImageClass, true)) {
                return true;
            }
        }
        return false;
    }
    exploreSubFields(component, fieldDatas, types) {
        fieldDatas.forEach(fd => {
            let field = fd.field;
            let fieldName = field.name;
            if (field && fd.hasUEvent) {
                if (field.type.name.includes("UnityEvent") && fd.isUIEvent) {
                    this.loadUnityEventField(component, fieldName);
                }
                else if (this.parentHasUnityEvent(field)) {
                    let fieldObj = component.field(fieldName).value;
                    if (!fieldObj.isNull() && fd.isUIEvent) {
                        this.loadUnityEvent(fieldObj);
                    }
                }
                else if (fd.subFields.length > 0 && !types.has(field.type.name)) {
                    let tCopy = new Set(types);
                    if (!field.type.name.includes("UnityEvent")) {
                        tCopy.add(field.type.name);
                    }
                    let fieldObj = component.field(fieldName).value;
                    if (!fieldObj.isNull()) {
                        this.exploreSubFields(fieldObj, fd.subFields, tCopy);
                    }
                }
            }
        });
    }
    findEventsInField(field, types) {
        let result = {
            field: undefined,
            hasUEvent: false,
            isUIEvent: false,
            subFields: []
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
                result.hasUEvent = fieldClass.parent.name.includes("UnityEvent");
                if (this.implementsUIHandler(fieldClass.parent)) {
                    result.isUIEvent = true;
                }
                fields.concat(fieldClass.parent.fields);
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
    parentHasUnityEvent(field) {
        let fieldClass = field.type.class;
        if (fieldClass.parent) {
            return fieldClass.parent.name.includes("UnityEvent");
        }
        return false;
    }
    loadUnityEvent(eventObj) {
        if (eventObj && !eventObj.isNull()) {
            this.loadedEvents.set(eventObj.handle.toString(), eventObj);
            loader_1.ResolvedObjects.getInstance().putIl2CppObject(eventObj);
            console.log("Loaded: ", eventObj, eventObj.class.name);
        }
    }
    loadUnityEventField(comp, fieldName) {
        if (comp && !comp.isNull()) {
            let field = comp.tryField(fieldName);
            if (field) {
                let event = field.value;
                if (!event.isNull()) {
                    this.loadedEvents.set(comp.handle.toString(), event);
                    loader_1.ResolvedObjects.getInstance().putIl2CppObject(comp);
                    console.log("Loaded: ", fieldName, event.handle, " from: ", comp, " offset: ", comp.handle, event.class.name);
                }
            }
        }
    }
    getCallsFromICL(event) {
        let invokableCallList = event.field("m_Calls").value;
        let m_PersisitentCalls = invokableCallList.field("m_PersistentCalls").value;
        let m_RuntimeCalls = invokableCallList.field("m_RuntimeCalls").value;
        let m_ExecutingCalls = invokableCallList.field("m_ExecutingCalls").value;
        let res = [];
        try {
            let p_calls = m_PersisitentCalls.method("ToArray")
                .invoke();
            res.push(p_calls);
            let r_calls = m_RuntimeCalls.method("ToArray")
                .invoke();
            res.push(r_calls);
            let e_calls = m_ExecutingCalls.method("ToArray")
                .invoke();
            res.push(e_calls);
        }
        catch (e) {
            console.log(e);
        }
        return res;
    }
    hookAndInvokeUnityEvents() {
        let addrs = [];
        if (this.classes.UnityEvent && this.classes.InvokableCallList &&
            this.classes.UnityEventBase) {
            console.log("Hooking listeners...");
            var Method_AddPersistentInvokableCall = this.classes.InvokableCallList.method("AddPersistentInvokableCall");
            var Method_AddListener = this.classes.InvokableCallList.method("AddListener");
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
                    let persistentCallGroup = event.field("m_PersistentCalls").value;
                    let m_Calls = persistentCallGroup.field("m_Calls").value;
                    let p_calls = m_Calls.method("ToArray").invoke();
                    console.log(persistentCallGroup, m_Calls, p_calls.length);
                    let icl_calls = this.getCallsFromICL(event);
                    let all_calls = [];
                    // Get PersistentCallGroup calls
                    for (var i = 0; i < p_calls.length; i++) {
                        let p_call = p_calls.get(i);
                        let grc = p_call.tryMethod("GetRuntimeCall");
                        if (grc) {
                            let rc = grc.invoke(event);
                            all_calls.push(rc);
                            EventTriggerer.hookUnityEventInvoke(rc);
                        }
                    }
                    // Get InvokableCallList calls
                    for (const icl_call of icl_calls) {
                        for (var i = 0; i < icl_call.length; i++) {
                            all_calls.push(icl_call.get(i));
                            EventTriggerer.hookUnityEventInvoke(icl_call.get(i));
                        }
                    }
                    let call_count = 0;
                    for (const call of all_calls) {
                        if (!call.isNull()) {
                            let delegate = call.tryField("Delegate").value;
                            let val = delegate.tryField("method_ptr").value;
                            k++;
                            call_count++;
                            addrs.push(val.toString());
                            if (!this.efcs.has(val.toString())) {
                                this.efcs.set(val.toString(), []);
                            }
                            this.efcs.get(val.toString()).push(event);
                            // console.log(val.toString());
                            // console.log(
                            //     AllMethods.getInstance().methods.get(val.toString()));
                        }
                        else {
                            nullCount++;
                        }
                    }
                    efcs_per_event.push(call_count);
                }
                catch (err) {
                    failed++;
                    console.log(err, err.stack);
                    continue;
                }
            }
            let per_event = {
                "type": "efc_per_event",
                "scene": this.curr_scene,
                "data": efcs_per_event
            };
            let res = {
                "type": "unity_events",
                "scene": this.curr_scene,
                "objects": loaded.length,
                "callbacks": k,
                "failed": failed + nullCount
            };
            send(JSON.stringify(per_event));
            send(JSON.stringify(res));
            console.log(k + "/" + loaded.length, "succeeded events.");
            console.log(nullCount + "/" + loaded.length, "null events.");
            console.log(failed + "/" + loaded.length, "failed events.");
        }
        return addrs;
    }
    getActiveCollisionSinks(comps) {
        let sinks = utils_1.Util.findCollisionSinks(comps);
        let enters = new Set();
        let exits = new Set();
        let stays = new Set();
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
    getActiveTriggerables(comps) {
        let triggers = utils_1.Util.findTriggerablesSink(comps);
        let enters = new Set();
        let exits = new Set();
        let stays = new Set();
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
    getEventFunctionCallbacks(objects) {
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
    loadUnityEvents(comps) {
        // this.loadedEvents.clear();
        this.findAllUnityEvents(comps);
        return this.hookAndInvokeUnityEvents();
    }
}
exports.EventLoader = EventLoader;
class EventTriggerer {
    loader;
    curr_scene;
    constructor(curr_scene, loader) {
        this.curr_scene = curr_scene;
        this.loader = loader;
    }
    static hookUnityEventInvoke(ue) {
        ue.class.methods.forEach(method => {
            if (method.name === "Invoke") {
                let invoke = ue.tryMethod(method.name, method.parameterCount);
                if (invoke) {
                    if (method.parameterCount > 0) {
                        invoke.implementation = function (v1) {
                            let ret = invoke.invoke(v1);
                            console.log("Invoke called", ue, v1);
                            return ret;
                        };
                    }
                    else {
                        invoke.implementation = function () {
                            console.log("Invoke called", ue);
                            let ret = invoke.invoke();
                            return ret;
                        };
                    }
                }
            }
        });
    }
    ableParams(im) {
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
    countBoolParams(im) {
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
    generateArguments(im, boolVal = false) {
        let paramCount = im.parameterCount;
        let argsList = [];
        for (const param of im.parameters) {
            let type = param.type;
            if (type.isPrimitive) {
                // Should always be boolean
                const TryParse = Il2Cpp.corlib.class("System.Boolean").method("TryParse");
                const value = Il2Cpp.reference(boolVal);
                if (boolVal) {
                    TryParse.invoke(Il2Cpp.string("true"), value);
                }
                else {
                    TryParse.invoke(Il2Cpp.string("false"), value);
                }
                argsList.push(value.value);
            }
            else {
                // Must be an object
                let objs = loader_1.ResolvedObjects.getInstance().objectsOfClass(type.object.class);
                if (objs.length > 0) {
                    argsList.push(objs[0].unbox());
                }
            }
        }
        return argsList;
    }
    async invokeSequenceMethod(emMethod, eObjs, sequence) {
        const instance = loader_1.AllMethods.getInstance();
        const resolvedObjects = loader_1.ResolvedObjects.getInstance();
        var i = 0;
        var max = 4;
        for (const methodVA of sequence) {
            if (i > max)
                break;
            if (instance.contains(methodVA)) {
                const handle = instance.methods.get(methodVA);
                const method = new Il2Cpp.Method(new NativePointer(handle));
                const mClass = method.class;
                const objs = resolvedObjects.objectsOfClass(mClass);
                for (const obj of objs) {
                    const toInvoke = obj.tryMethod(method.name, method.parameterCount);
                    if (toInvoke && this.ableParams(toInvoke)) {
                        console.log("Triggering", toInvoke.name);
                        try {
                            let bools = this.countBoolParams(toInvoke);
                            if (bools > 0) {
                                for (var j = 0; j < 2; j++) {
                                    const argsList = this.generateArguments(toInvoke, j == 1 ? true : false);
                                    toInvoke.invoke(...argsList);
                                }
                            }
                            else {
                                const argsList = this.generateArguments(toInvoke);
                                toInvoke.invoke(...argsList);
                            }
                        }
                        catch (e) {
                            console.log(e);
                            continue;
                        }
                    }
                }
                await this.triggerEventsOfObjs(emMethod, eObjs);
                await (0, loader_1.wait)(50);
                i++;
            }
        }
    }
    async triggerUI(method) {
        let events = this.loader.efcs;
        let res = {
            "type": "UI",
            "scene": this.curr_scene,
            "data": method.class.name + "$$" + method.name
        };
        send(JSON.stringify(res));
        if (events.has(method.virtualAddress.toString())) {
            let efcs = events.get(method.virtualAddress.toString());
            for (const fc of efcs) {
                try {
                    let compMethod = fc.tryMethod("Invoke");
                    if (compMethod) {
                        console.log("INVOKING", method.name);
                        if (this.countBoolParams(compMethod) > 0) {
                            for (var j = 0; j < 2; j++) {
                                const argsList = this.generateArguments(compMethod, j == 1 ? true : false);
                                await compMethod.invoke(...argsList);
                            }
                        }
                        else {
                            await compMethod.invoke();
                        }
                        console.log("INVOKED", method.name);
                    }
                }
                catch (e) {
                    console.log(e);
                }
            }
        }
    }
    // Assume comp is a triggerable
    async triggerCollider(method, comp, colliders) {
        let compMethod = comp.tryMethod(method.name, method.parameterCount);
        method.revert();
        method.implementation = function (v1) {
            console.log("[!]", "trigger", comp, v1);
            return comp.method(method.name, method.parameterCount).invoke(v1);
        };
        let trigger_count = 0;
        if (compMethod) {
            for (const collider of colliders) {
                try {
                    if (collider.isNull())
                        continue;
                    compMethod.invoke(collider);
                    trigger_count++;
                }
                catch (err) {
                    for (const thread of Il2Cpp.attachedThreads) {
                        thread.schedule(() => {
                            if (compMethod) {
                                try {
                                    // console.log("invoking trigger");
                                    compMethod.invoke(collider);
                                    trigger_count++;
                                }
                                catch (err) {
                                    console.log(err);
                                }
                            }
                        });
                    }
                    continue;
                }
            }
        }
        let res = {
            "type": "triggers",
            "scene": this.curr_scene,
            "data": trigger_count
        };
        send(JSON.stringify(res));
    }
    async triggerCollision(method, comp, collisionables) {
        const instance = classes_1.Classes.getInstance();
        if (!instance.Rigidbody) {
            return;
        }
        const sinkGO = comp.method("get_gameObject").invoke();
        const sinkRB = sinkGO.method("GetComponent")
            .inflate(instance.Rigidbody.rawImageClass)
            .invoke();
        if (sinkRB.isNull()) {
            // console.log("RB null");
            return;
        }
        method.revert();
        method.implementation = function (v1) {
            console.log("[!]", "collision", comp, v1.method("get_collider")
                .invoke()
                .method("get_gameObject")
                .invoke());
            return comp.method(method.name, method.parameterCount).invoke(v1);
        };
        // console.log("COLLISION SINK", sinkGO);
        // console.log("COLLISIONABLES", collisionables);
        let collision_count = 0;
        for (var i = 0; i < collisionables.length; i++) {
            try {
                let collider = collisionables[i];
                const colliderRB = collider.method("get_attachedRigidbody").invoke();
                if (colliderRB.isNull()) {
                    continue;
                }
                const originalPos = colliderRB.method("get_position").invoke();
                colliderRB.method("set_position")
                    .invoke(sinkRB.method("get_position").invoke());
                collision_count++;
                await (0, loader_1.wait)(300);
                colliderRB.method("set_position").invoke(originalPos);
            }
            catch (e) {
                console.log(e.stack);
                continue;
            }
        }
        let res = {
            "type": "collisions",
            "scene": this.curr_scene,
            "data": collision_count
        };
        send(JSON.stringify(res));
    }
    async triggerEventsOfObjs(method, objsWithMethod) {
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
        const resolvedObjects = loader_1.ResolvedObjects.getInstance();
        const objectIl2CppValues = resolvedObjects.objectIl2CppValues;
        const colliders = utils_1.Util.findActiveColliders(objectIl2CppValues);
        const staticColliders = utils_1.Util.findStaticColliders(colliders);
        const kinematicColliders = utils_1.Util.findKinematicColliders(colliders);
        var triggerables = utils_1.Util.findPotentialTriggerables(colliders);
        const collisionables = utils_1.Util.findCollisionables(colliders);
        let methodName = method.name;
        const isTriggerEvent = methodName.includes("OnTrigger");
        const isCollisionEvent = methodName.includes("OnCollision");
        console.log("TRIGGERING", method.class.name + "$$" + methodName, objsWithMethod.length);
        for (const obj of objsWithMethod) {
            try {
                let unboxed = obj.unbox();
                if (!isCollisionEvent && !isTriggerEvent) {
                    await (0, utils_1.promiseTimeout)(20000, this.triggerUI(method));
                }
                else if (isTriggerEvent) {
                    // Static colliders may not be triggered together, according to
                    // physics rule matrix.
                    let isStaticCollider = utils_1.Util.isStaticCollider(unboxed);
                    triggerables = utils_1.Util.removeStaticTriggerables(triggerables);
                    console.log("TRIGGERABLES", triggerables);
                    await (0, utils_1.promiseTimeout)(20000, this.triggerCollider(method, unboxed, triggerables));
                    break;
                }
                else if (isCollisionEvent) {
                    await (0, utils_1.promiseTimeout)(20000, this.triggerCollision(method, unboxed, colliders));
                    break;
                }
                await (0, loader_1.wait)(50);
            }
            catch (e) {
                console.log(e);
            }
        }
    }
    async loadNextEvents() {
        return this.loader.getEventFunctionCallbacks(await utils_1.Util.getAllActiveObjects());
    }
    sendTriggeredEvents() {
        const triggeredEvents = TriggeredEvents.getInstance();
        let res = {
            "type": "leaks",
            "scene": this.curr_scene,
            "data": Array.from(triggeredEvents.triggeredEvents)
        };
        send(JSON.stringify(res));
        triggeredEvents.clear();
    }
    async triggerEvent(eventObj) {
        const instance = loader_1.AllMethods.getInstance();
        const triggeredEvents = TriggeredEvents.getInstance();
        const resolvedObjects = loader_1.ResolvedObjects.getInstance();
        const objectIl2CppValues = resolvedObjects.objectIl2CppValues;
        let event = eventObj.event;
        let sequence = eventObj.sequence;
        let name = instance.contains(event) ? instance.getMethodName(event) : event;
        if (instance.contains(event)) {
            const emHandle = instance.methods.get(event);
            const emMethod = new Il2Cpp.Method(new NativePointer(emHandle));
            const emClass = emMethod.class;
            const eObjs = resolvedObjects.objectsOfClass(emClass);
            if (sequence.length < 1) {
                await this.triggerEventsOfObjs(emMethod, eObjs);
            }
            else {
                await this.invokeSequenceMethod(emMethod, eObjs, sequence);
            }
            // Wait 1 sec between event groups to avoid breaking
            await (0, loader_1.wait)(1000);
        }
        return await this.loadNextEvents();
    }
    // Event Addr -> [methods to trigger]
    async triggerAllEvents(events) {
        loader_1.Loader.preventSceneChanges();
        loader_1.Loader.preventAppQuit();
        const instance = loader_1.AllMethods.getInstance();
        const triggeredEvents = TriggeredEvents.getInstance();
        const resolvedObjects = loader_1.ResolvedObjects.getInstance();
        const objectIl2CppValues = resolvedObjects.objectIl2CppValues;
        for (const [event, sequence] of events) {
            if (triggeredEvents.contains(event)) {
                continue;
            }
            let name = instance.contains(event) ? instance.getMethodName(event) : event;
            if (instance.contains(event)) {
                const emHandle = instance.methods.get(event);
                const emMethod = new Il2Cpp.Method(new NativePointer(emHandle));
                const emClass = emMethod.class;
                const eObjs = resolvedObjects.objectsOfClass(emClass);
                if (sequence.length < 1) {
                    await this.triggerEventsOfObjs(emMethod, eObjs);
                }
                else {
                    await this.invokeSequenceMethod(emMethod, eObjs, sequence);
                }
                // Wait 1 sec between event groups to avoid breaking
                await (0, loader_1.wait)(1000);
            }
            let nextEvents = await this.loadNextEvents();
            if (nextEvents.length > 1) {
                return nextEvents;
            }
        }
        await (0, loader_1.wait)(5000); // Wait for any remaining events
        console.log("DONE");
        loader_1.Loader.revertSceneChange();
        return new Map();
    }
}
exports.EventTriggerer = EventTriggerer;

},{"./classes":1,"./loader":5,"./utils":13}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APIHooker = void 0;
const classes_1 = require("./classes");
const events_1 = require("./events");
const loader_1 = require("./loader");
const libunity = "libunity.so";
const mbedtls = "mbedtls_x509_crt_verify_with_profile";
const tls = "x509_crt_verify_restartable_ca_cb";
class APIHooker {
    static enableLeaks = false;
    static enableEntitlement = true;
    constructor() { }
    // Bypass Java Android SSL Pinning
    // Source: https://codeshare.frida.re/@masbog/frida-android-unpinning-ssl/
    static bypassJavaSSLPinning() {
        setTimeout(function () {
            Java.perform(function () {
                console.log("");
                console.log("[.] Android Cert Pinning Bypass");
                var CertificateFactory = Java.use("java.security.cert.CertificateFactory");
                var FileInputStream = Java.use("java.io.FileInputStream");
                var BufferedInputStream = Java.use("java.io.BufferedInputStream");
                var X509Certificate = Java.use("java.security.cert.X509Certificate");
                var KeyStore = Java.use("java.security.KeyStore");
                var TrustManagerFactory = Java.use("javax.net.ssl.TrustManagerFactory");
                var SSLContext = Java.use("javax.net.ssl.SSLContext");
                var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
                // var is_android_n = 0;
                //--------
                console.log("[.] TrustManagerImpl Android 7+ detection...");
                // Android 7+ TrustManagerImpl
                // The work in the following NCC blogpost was a great help for this
                // hook! hattip @AdriVillaB :)
                // https://www.nccgroup.trust/uk/about-us/newsroom-and-events/blogs/2017/november/bypassing-androids-network-security-configuration/
                // See also:
                // https://codeshare.frida.re/@avltree9798/universal-android-ssl-pinning-bypass/
                try {
                    var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
                    var ArrayList = Java.use("java.util.ArrayList");
                    TrustManagerImpl.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
                        console.log("[+] Bypassing TrustManagerImpl->verifyChain()");
                        return untrustedChain;
                    };
                    TrustManagerImpl.checkTrustedRecursive.implementation = function (certs, host, clientAuth, untrustedChain, trustAnchorChain, used) {
                        console.log("[+] Bypassing TrustManagerImpl->checkTrustedRecursive()");
                        return ArrayList.$new();
                    };
                }
                catch (err) {
                    console.log("[-] TrustManagerImpl Not Found");
                }
                // if (is_android_n === 0) {
                //--------
                console.log("[.] TrustManager Android < 7 detection...");
                // Implement a new TrustManager
                // ref: https://gist.github.com/oleavr/3ca67a173ff7d207c6b8c3b0ca65a9d8
                var TrustManager = Java.registerClass({
                    name: 'com.sensepost.test.TrustManager',
                    implements: [X509TrustManager],
                    methods: {
                        checkClientTrusted: function (chain, authType) { },
                        checkServerTrusted: function (chain, authType) { },
                        getAcceptedIssuers: function () { return []; }
                    }
                });
                // Prepare the TrustManagers array to pass to SSLContext.init()
                var TrustManagers = [TrustManager.$new()];
                // Get a handle on the init() on the SSLContext class
                var SSLContext_init = SSLContext.init.overload('[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom');
                try {
                    // Override the init method, specifying our new TrustManager
                    SSLContext_init.implementation = function (keyManager, trustManager, secureRandom) {
                        console.log("[+] Overriding SSLContext.init() with the custom TrustManager android < 7");
                        SSLContext_init.call(this, keyManager, TrustManagers, secureRandom);
                    };
                }
                catch (err) {
                    console.log("[-] TrustManager Not Found");
                }
                //}
                //-------
                console.log("[.] OkHTTP 3.x detection...");
                // OkHTTP v3.x
                // Wrap the logic in a try/catch as not all applications will have
                // okhttp as part of the app.
                try {
                    var CertificatePinner = Java.use('okhttp3.CertificatePinner');
                    console.log("[+] OkHTTP 3.x Found");
                    CertificatePinner.check.overload('java.lang.String', 'java.util.List')
                        .implementation = function () {
                        console.log("[+] OkHTTP 3.x check() called. Not throwing an exception.");
                    };
                }
                catch (err) {
                    // If we dont have a ClassNotFoundException exception, raise the
                    // problem encountered.
                    console.log("[-] OkHTTP 3.x Not Found");
                }
                //--------
                console.log("[.] Appcelerator Titanium detection...");
                // Appcelerator Titanium PinningTrustManager
                // Wrap the logic in a try/catch as not all applications will have
                // appcelerator as part of the app.
                try {
                    var PinningTrustManager = Java.use('appcelerator.https.PinningTrustManager');
                    console.log("[+] Appcelerator Titanium Found");
                    PinningTrustManager.checkServerTrusted.implementation = function () {
                        console.log("[+] Appcelerator checkServerTrusted() called. Not throwing an exception.");
                    };
                }
                catch (err) {
                    // If we dont have a ClassNotFoundException exception, raise the
                    // problem encountered.
                    console.log("[-] Appcelerator Titanium Not Found");
                }
            });
        }, 0);
    }
    // Adapted from OVRSeen.
    // https://github.com/UCI-Networking-Group/OVRseen
    static bypassUnitySSLPinning(function_offset, use_mbed_tls) {
        var modulesArray = Process.enumerateModules();
        for (var i = 0; i < modulesArray.length; i++) {
            if (modulesArray[i].path.indexOf(libunity) != -1) {
                var base_address = Module.findBaseAddress(libunity);
                if (base_address) {
                    var function_address = base_address.add(function_offset); // Spatial for function
                    let hooked_function = use_mbed_tls ? mbedtls : tls;
                    console.log("Hooking", hooked_function, "at", function_address);
                    Interceptor.attach(function_address, {
                        onEnter(args) {
                            if (use_mbed_tls) {
                                console.log("FOUND:", hooked_function, args[5]);
                                this.flags =
                                    args[5]; // mbedtls_x509_crt_verify_with_profile flag at 5
                            }
                            else {
                                console.log("FOUND:", hooked_function, args[5]);
                                this.flags =
                                    args[5]; // x509_cert_verify_restartable_ca_cb flag at 5
                            }
                        },
                        onLeave(retval) {
                            console.log(hooked_function);
                            console.log("retval", retval, retval.toInt32());
                            console.log("flag", this.flags, this.flags.readU32());
                            console.log("nullifying retval", retval);
                            retval.replace(0x0);
                            this.flags.writeU32(0x0);
                            console.log("flag replaced");
                        }
                    });
                }
            }
        }
    }
    static bypassUnitySSLPinningIl2Cpp() {
        let classes = classes_1.Classes.getInstance();
        if (classes.CertificateHandler) {
            let certificateHandler = classes.CertificateHandler.rawImageClass;
            let validate = certificateHandler.tryMethod("ValidateCertificateNative");
            if (validate) {
                validate.implementation = function () {
                    console.log("Bypass Validation!");
                    return true;
                };
            }
        }
        if (classes.UnityWebRequest) {
            let uwr = classes.UnityWebRequest.rawImageClass;
            uwr.methods.forEach(method => {
                if (method.name.includes(".ctor")) {
                    method.implementation = function (args) {
                        let ret = method.invoke(...args);
                        let field = ret.tryField("m_CertificateHandler");
                        if (field) {
                            console.log("Nullifying certificateHandler");
                            field.value = new Il2Cpp.Object(ptr(0x0));
                        }
                        return ret;
                    };
                }
            });
        }
    }
    static revertEntitlementCheck_alt() {
        let instance = classes_1.Classes.getInstance();
        let uCAPI = instance.CAPI;
        if (uCAPI && APIHooker.enableEntitlement) {
            let CAPI = uCAPI.rawImageClass;
            let MessageIsError = CAPI.method("ovr_Message_IsError", 1);
            MessageIsError.revert();
        }
    }
    static hookEntitlementCheck_alt() {
        let instance = classes_1.Classes.getInstance();
        let uCAPI = instance.CAPI;
        const USER_ENTITLEMENT = "Entitlement_GetIsViewerEntitled";
        if (uCAPI && APIHooker.enableEntitlement) {
            let CAPI = uCAPI.rawImageClass;
            let MessageGetType = CAPI.method("ovr_Message_GetType", 1);
            let MessageIsError = CAPI.method("ovr_Message_IsError", 1);
            MessageGetType.implementation = function (v1) {
                let retType = MessageGetType.invoke(v1);
                console.log(retType, ":", v1);
                if (retType.toString() == USER_ENTITLEMENT) {
                    let message = v1;
                    MessageIsError.implementation = function (v1) {
                        console.log("MESSAGE IS ERROR", v1);
                        if (message.toString() == v1.toString()) {
                            console.log("FOUND ERROR");
                            return false;
                        }
                        let ret = MessageIsError.invoke(v1);
                        return ret;
                    };
                }
                return retType;
            };
        }
    }
    static hookEntitlementCheck() {
        let instance = classes_1.Classes.getInstance();
        let uCAPI = instance.CAPI;
        let uMessage = instance.Message;
        let uEntitlements = instance.Entitlements;
        if (uCAPI && uMessage && uEntitlements && APIHooker.enableEntitlement) {
            let Message = uMessage.rawImageClass;
            let CAPI = uCAPI.rawImageClass;
            let Entitlements = uEntitlements.rawImageClass;
            if (CAPI && Message && Entitlements) {
                let isUserEntitled = Entitlements.method("IsUserEntitledToApplication");
                isUserEntitled.implementation = function () {
                    let ret = isUserEntitled.invoke();
                    if (ret) {
                        let onComplete = ret.method("OnComplete", 1);
                        console.log(onComplete);
                        onComplete.implementation = function (v1) {
                            v1.method("Invoke", 1).implementation = function (message) {
                                let isErr = message.method("get_IsError");
                                isErr.implementation = function () {
                                    console.log("RETURNING NO ERROR");
                                    return false;
                                };
                                let err = message.method("GetError");
                                err.implementation = function () {
                                    console.log("RETURNING NULL POINTER");
                                    return new Il2Cpp.Object(new NativePointer(0x0));
                                };
                                return v1.method("Invoke", 1).invoke(message);
                            };
                            return onComplete.invoke(v1);
                        };
                    }
                    return ret;
                };
            }
        }
    }
    static bytesToString(bytes) {
        const asciiString = bytes.map((byte) => String.fromCharCode(byte)).join('');
        console.log(asciiString);
    }
    static hookUploadHandlerData(curr_scene) {
        let instance = classes_1.Classes.getInstance();
        if (instance.UploadHandlerRaw) {
            let createMethod = instance.UploadHandlerRaw.rawImageClass.method("Create");
            createMethod.implementation = function (v1, v2) {
                let ret = createMethod.invoke(v1, v2);
                console.log("!!!!UPLOAD!!!! From scene:", curr_scene, "method:", createMethod.name, "args:", v1, v2, "ret:", ret);
                console.log("!!!!DATA!!!!!", v2.toString());
                if (!v2.isNull()) {
                    let stringRep = v2.toString();
                    let byteArr = stringRep.replace("[", '').replace("]", '').split(",").map(function (item) { return parseInt(item, 10); });
                    APIHooker.bytesToString(byteArr);
                }
                return ret;
            };
        }
    }
    static hookAnalytics() {
        let instance = classes_1.Classes.getInstance();
        if (instance.Analytics) {
            let Analytics = instance.Analytics.rawImageClass;
            let methods = Analytics.methods;
            let CustomEventName = Analytics.method("CustomEvent", 1);
            let CustomEvent = Analytics.method("CustomEvent", 2);
            CustomEventName.implementation = function (v1) {
                let ret = CustomEventName.invoke(v1);
                console.log("!!!!ANALYTICS!!!!", "method:", CustomEventName.name, "args:", v1, "ret:", ret);
                return ret;
            };
            CustomEvent.implementation = function (v1, eventData) {
                let ret = CustomEventName.invoke(v1);
                let data = new Map();
                let keys = eventData.method("get_Keys").invoke();
                console.log("!!!!ANALYTICS!!!!", "method:", CustomEvent.name, "args:", v1, eventData, "ret:", ret);
                for (const key of keys) {
                    let value = eventData.method("get_Item", 1).invoke(key);
                    console.log(value);
                    if (!key.isNull() && key.content != null && value != null) {
                        data.set(key.content, value);
                    }
                }
                console.log(data);
                return ret;
            };
        }
    }
    static hookNetworkSends(curr_scene) {
        let instance = classes_1.Classes.getInstance();
        if (instance.Socket) {
            let Socket = instance.Socket.rawImageClass;
            let methods = Socket.methods;
            methods.forEach(method => {
                if (method.name.startsWith("Send_internal")) {
                    console.log("Found send method:", method.name);
                    method.implementation = function (v1, buffer, count, ...args) {
                        let ret = method.invoke(v1, buffer, count, ...args);
                        console.log("!!!!SEND!!!! From scene:", curr_scene, "method:", method.name, "args:", buffer, count, "ret:", ret);
                        console.log("!!!!DATA!!!!!", buffer.toString());
                        if (!buffer.isNull()) {
                            let stringRep = buffer.toString();
                            let byteArr = stringRep.replace("[", '').replace("]", '').split(",").map(function (item) { return parseInt(item, 10); });
                            APIHooker.bytesToString(byteArr);
                        }
                        return ret;
                    };
                }
                else {
                    method.implementation = function (...args) {
                        let ret = method.invoke(...args);
                        console.log("!!!!SEND!!!! From scene:", curr_scene, "method:", method.name, "args:", ...args, "ret:", ret);
                        return ret;
                    };
                }
            });
        }
    }
    static hookSysInfo(curr_scene) {
        let instance = classes_1.Classes.getInstance();
        if (instance.SystemInfo && APIHooker.enableLeaks) {
            let allMethods = loader_1.AllMethods.getInstance();
            let sysInfo = instance.SystemInfo;
            let methods = sysInfo.rawImageClass.methods;
            methods.forEach(method => {
                if (method.name.includes("get_device")) {
                    method.implementation = function (...args) {
                        let ret = method.invoke(...args);
                        console.log("!!!!SYSINFO!!!! From scene:", curr_scene, "method:", method.name, "args:", args, "ret:", ret);
                        events_1.TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                            method.name);
                        return ret;
                    };
                }
            });
        }
    }
    static hookBodyTracking(curr_scene, obj) {
        let instance = classes_1.Classes.getInstance();
        if (instance.OVRBody && APIHooker.enableLeaks) {
            let allMethods = loader_1.AllMethods.getInstance();
            let OVRBody = instance.OVRBody;
            let methods = OVRBody.rawImageClass.methods;
            methods.forEach(method => {
                method.implementation = function (...args) {
                    console.log("Body");
                    let ret = obj.method(method.name, method.parameterCount).invoke(...args);
                    console.log("!!!!BODY!!!! From scene:", curr_scene, "method:", method.name, "args:", args, "ret:", ret);
                    events_1.TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                        method.name);
                    return ret;
                };
            });
        }
    }
    static hookBoundsTracking(curr_scene) {
        let instance = classes_1.Classes.getInstance();
        if (instance.OVRBoundary && APIHooker.enableLeaks) {
            let allMethods = loader_1.AllMethods.getInstance();
            let OVRBoundary = instance.OVRBoundary;
            let methods = OVRBoundary.rawImageClass.methods;
            methods.forEach(method => {
                method.implementation = function (...args) {
                    let ret = method.invoke(...args);
                    console.log("!!!!BOUNDS!!!! From scene:", curr_scene, "method:", method.name, "args:", args, "ret:", ret);
                    events_1.TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                        method.name);
                    return ret;
                };
            });
        }
    }
    static hookEyeTracking(curr_scene, obj) {
        let instance = classes_1.Classes.getInstance();
        if (instance.OVREyeGaze && APIHooker.enableLeaks) {
            let allMethods = loader_1.AllMethods.getInstance();
            let OVREyeGaze = instance.OVREyeGaze;
            let methods = OVREyeGaze.rawImageClass.methods;
            methods.forEach(method => {
                method.implementation = function (...args) {
                    console.log("Eye");
                    let ret = obj.method(method.name, method.parameterCount).invoke(...args);
                    console.log("!!!!EYE!!!! From scene:", curr_scene, "method:", method.name, "args:", args, "ret:", ret);
                    events_1.TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                        method.name);
                    return ret;
                };
            });
        }
    }
    static hookFaceTracking(curr_scene, obj) {
        let instance = classes_1.Classes.getInstance();
        if (instance.OVRFace && APIHooker.enableLeaks) {
            let allMethods = loader_1.AllMethods.getInstance();
            let OVRFace = instance.OVRFace;
            let methods = OVRFace.rawImageClass.methods;
            methods.forEach(method => {
                method.implementation = function (...args) {
                    console.log("Face");
                    let ret = obj.method(method.name, method.parameterCount).invoke(...args);
                    console.log("!!!!FACE!!!! From scene:", curr_scene, "method:", method.name, "args:", args, "ret:", ret);
                    events_1.TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                        method.name);
                    return ret;
                };
            });
        }
    }
    static hookFaceExpressionsTracking(curr_scene, obj) {
        let instance = classes_1.Classes.getInstance();
        if (instance.OVRFaceExpressions && APIHooker.enableLeaks) {
            let allMethods = loader_1.AllMethods.getInstance();
            let OVRFaceExpressions = instance.OVRFaceExpressions;
            let methods = OVRFaceExpressions.rawImageClass.methods;
            methods.forEach(method => {
                method.implementation = function (...args) {
                    console.log("Face");
                    let ret = obj.method(method.name, method.parameterCount).invoke(...args);
                    console.log("!!!!FACE!!!! From scene:", curr_scene, "method:", method.name, "args:", args, "ret:", ret);
                    events_1.TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                        method.name);
                    return ret;
                };
            });
        }
    }
    static hookLocation(curr_scene) {
        let instance = classes_1.Classes.getInstance();
        if (instance.LocationService && APIHooker.enableLeaks) {
            let allMethods = loader_1.AllMethods.getInstance();
            let LocationService = instance.LocationService;
            let methods = LocationService.rawImageClass.methods;
            methods.forEach(method => {
                if (!method.name.includes("FreeMessage") &&
                    !method.name.includes("PopMessage")) {
                    method.implementation = function (...args) {
                        console.log("Location");
                        let ret = method.invoke(...args);
                        console.log("!!!!LOCATION!!!! From scene:", curr_scene, "method:", method.name, "args:", args, "ret:", ret);
                        events_1.TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                            method.name);
                        return ret;
                    };
                }
            });
        }
    }
    static hookCAPI(curr_scene) {
        let instance = classes_1.Classes.getInstance();
        if (instance.CAPI) {
            let allMethods = loader_1.AllMethods.getInstance();
            let CAPI = instance.CAPI;
            let methods = CAPI.rawImageClass.methods;
            methods.forEach(method => {
                if (!method.name.includes("FreeMessage") &&
                    !method.name.includes("PopMessage")) {
                    method.implementation = function (...args) {
                        let ret = method.invoke(...args);
                        console.log("!!!!CAPI!!!! From scene:", curr_scene, "method:", method.name, "args:", args, "ret:", ret);
                        events_1.TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                            method.name);
                        return ret;
                    };
                }
            });
        }
    }
    static hookVRTrackingAPI(curr_scene, activeObjects) {
        let classes = classes_1.Classes.getInstance();
        activeObjects.forEach(object => {
            try {
                if (!object.isNull()) {
                    if (classes.OVRFace && classes.OVRFace.rawImageClass) {
                        if (classes.OVRFace.rawImageClass.isAssignableFrom(object.class)) {
                            APIHooker.hookFaceTracking(curr_scene, object);
                        }
                    }
                    if (classes.OVRFaceExpressions &&
                        classes.OVRFaceExpressions.rawImageClass) {
                        if (classes.OVRFaceExpressions.rawImageClass.isAssignableFrom(object.class)) {
                            APIHooker.hookFaceExpressionsTracking(curr_scene, object);
                        }
                    }
                    if (classes.OVRBody && classes.OVRBody.rawImageClass) {
                        if (classes.OVRBody.rawImageClass.isAssignableFrom(object.class)) {
                            APIHooker.hookBodyTracking(curr_scene, object);
                        }
                    }
                    if (classes.OVREyeGaze && classes.OVREyeGaze.rawImageClass) {
                        if (classes.OVREyeGaze.rawImageClass.isAssignableFrom(object.class)) {
                            APIHooker.hookEyeTracking(curr_scene, object);
                        }
                    }
                }
            }
            catch (e) {
                console.log(e);
            }
        });
    }
    static revertHookOVR() {
        let instance = classes_1.Classes.getInstance();
        if (instance.OVRBody) {
            let OVRBody = instance.OVRBody;
            let methods = OVRBody.rawImageClass.methods;
            methods.forEach(method => { method.revert(); });
        }
        if (instance.OVRBoundary) {
            let OVRBoundary = instance.OVRBoundary;
            let methods = OVRBoundary.rawImageClass.methods;
            methods.forEach(method => { method.revert(); });
        }
        if (instance.OVREyeGaze) {
            let OVREyeGaze = instance.OVREyeGaze;
            let methods = OVREyeGaze.rawImageClass.methods;
            methods.forEach(method => { method.revert(); });
        }
        if (instance.OVRFace) {
            let OVRFace = instance.OVRFace;
            let methods = OVRFace.rawImageClass.methods;
            methods.forEach(method => { method.revert(); });
        }
    }
    static revertHookSysInfo() {
        let instance = classes_1.Classes.getInstance();
        if (instance.SystemInfo) {
            let SysInfo = instance.SystemInfo;
            let methods = SysInfo.rawImageClass.methods;
            methods.forEach(method => { method.revert(); });
        }
    }
    static revertHookCAPI() {
        let instance = classes_1.Classes.getInstance();
        if (instance.CAPI) {
            let CAPI = instance.CAPI;
            let methods = CAPI.rawImageClass.methods;
            methods.forEach(method => { method.revert(); });
        }
    }
    static revertHookUploadHandlerData() {
        let instance = classes_1.Classes.getInstance();
        if (instance.UploadHandlerRaw) {
            let UploadHandlerRaw = instance.UploadHandlerRaw;
            let methods = UploadHandlerRaw.rawImageClass.methods;
            methods.forEach(method => { method.revert(); });
        }
    }
}
exports.APIHooker = APIHooker;

},{"./classes":1,"./events":2,"./loader":5}],4:[function(require,module,exports){
"use strict";
'using strict';
Object.defineProperty(exports, "__esModule", { value: true });
require("frida-il2cpp-bridge");
const rpc_1 = require("./rpc");
rpc.exports = {
    checkHealth() { return rpc_1.RPC.checkHealth(); },
    getUnityVersion() { return rpc_1.RPC.getUnityVersion(); },
    init() { return rpc_1.RPC.init(); },
    getInstructions(payload) { return rpc_1.RPC.getInstructions(payload); },
    getInstructionsInterval(payload) { return rpc_1.RPC.getInstructionsInterval(payload); },
    getMethodsOfClassMethod(payload) { return rpc_1.RPC.getMethodsOfClassMethod(payload); },
    getReturnType(payload) { return rpc_1.RPC.getReturnType(payload); },
    resolveSymbols(payload) { return rpc_1.RPC.resolveSymbols(payload); },
    getAllMethods() { return rpc_1.RPC.getAllMethods(); },
    countAllScenes() { return rpc_1.RPC.countAllScenes(); },
    loadSceneEvents(scene_index) { return rpc_1.RPC.loadSceneEvents(scene_index); },
    triggerEvent(payload) { return rpc_1.RPC.triggerEvent(payload); },
    triggerAllEvents(payload) { return rpc_1.RPC.triggerAllEvents(payload); },
    test() { console.log("TEST CALLED"); },
    dispose: function () { }
};
// Loader.start();

},{"./rpc":11,"frida-il2cpp-bridge":8}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassLoader = exports.ResolvedSymbols = exports.ResolvedObjects = exports.ResolvedClasses = exports.ResolvedMethods = exports.AllClasses = exports.AllMethods = exports.Loader = exports.wait = void 0;
require("frida-il2cpp-bridge");
const classes_1 = require("./classes");
const events_1 = require("./events");
const hooks_1 = require("./hooks");
const unity_types_1 = require("./unity_types");
const utils_1 = require("./utils");
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
exports.wait = wait;
const triggered_events = [];
const triggered_triggers = [];
const triggered_collisions = [];
const triggered_UI = [];
const objects_per_scene = [];
var curr_event = "";
var curr_scene = 0;
var eventLoader;
var eventTriggerer;
class Loader {
    constructor() { }
    // TODO: make this into an RPC
    static resolveSymbols() {
        const op = recv('input', jsonStr => {
            if (jsonStr.payload.length > 0) {
                let parse = JSON.parse(jsonStr.payload);
                let methods = parse.ScriptMetadataMethod;
                methods.forEach(method => {
                    let sym = Number(method.Address);
                    let name = method.Name;
                    let methodAddr = Number(method.MethodAddress) + Number(Il2Cpp.module.base);
                    /*
                    if (sym.toString(16) == '19a7588') {
                      console.log("0x" + sym.toString(16));
                      console.log("0x" + methodAddr.toString(16));
                      console.log(name);
                    }*/
                    ResolvedSymbols.getInstance().addSymbol("0x" + sym.toString(16), "0x" + methodAddr.toString(16));
                });
            }
        });
        op.wait();
    }
    static bypassSSLPinning() {
        hooks_1.APIHooker.bypassJavaSSLPinning();
        let function_offset = undefined;
        let use_mbed_tls = true;
        const op = recv('cert_func', jsonStr => {
            function_offset = jsonStr.offset;
            use_mbed_tls = jsonStr.use_mbed_tls;
        });
        op.wait();
        if (function_offset) {
            console.log("FUNCTION OFFSET:", function_offset);
            hooks_1.APIHooker.bypassUnitySSLPinning(new NativePointer(function_offset), use_mbed_tls);
        }
        else {
            console.log("SSL PINNING FAILED, function_offet not provided.");
        }
    }
    /** Resolves all methods of all classes. */
    static resolveAllMethods(img) {
        console.log("Resolving methods from " + img.name);
        img.classes.forEach(clazz => {
            clazz.methods.forEach(method => { AllMethods.getInstance().addMethod(method); });
        });
    }
    static init() {
        console.log("Initializing classes...");
        const classes = classes_1.Classes.getInstance();
        // Il2Cpp.installExceptionListener("all");
        Loader.resolveSymbols();
        Il2Cpp.domain.assemblies.forEach(assemb => {
            let img = assemb.image;
            Loader.resolveAllMethods(img);
            ClassLoader.resolveRequiredClasses(img);
        });
        Loader.preventAppQuit();
        // APIHooker.bypassUnitySSLPinningIl2Cpp();
        // APIHooker.hookCAPI(curr_scene);
        //    APIHooker.hookSysInfo(curr_scene);
        //    APIHooker.hookBoundsTracking(curr_scene);
        //    APIHooker.hookLocation(curr_scene);
        //    APIHooker.hookUploadHandlerData(curr_scene);
        //    APIHooker.hookNetworkSends(curr_scene);
        //    APIHooker.hookAnalytics();
        let obj = {
            "base": Il2Cpp.module.base.toString(),
            "all_methods": AllMethods.getInstance().toEntriesWithName()
        };
        return JSON.stringify(obj);
    }
    static async loadSceneEvents(scene_index) {
        let instance = classes_1.Classes.getInstance();
        if (instance.SceneManager) {
            var Method_LoadSceneAsyncNameIndexInternal = instance.SceneManager.method("LoadSceneAsyncNameIndexInternal");
            let promise = new Promise((resolve, reject) => {
                Method_LoadSceneAsyncNameIndexInternal.implementation = function (v1, v2, v3, v4) {
                    hooks_1.APIHooker.revertEntitlementCheck_alt();
                    hooks_1.APIHooker.hookEntitlementCheck_alt();
                    const result = Method_LoadSceneAsyncNameIndexInternal.executeStatic(v1, v2, v3, v4);
                    console.log("Method_LoadSceneAsyncNameIndexInternal:" + v1 + ":" + v2, v4);
                    resolve(v1);
                    return result;
                };
                curr_event = '';
                curr_scene = scene_index;
                Loader.loadScene("", scene_index, true);
            });
            let scene = await promise;
            console.log(scene, scene.length);
            Loader.revertSceneChange();
            // let objects = Il2Cpp.MemorySnapshot.capture().objects;
            // APIHooker.hookVRTrackingAPI(curr_scene, objects);
            // Wait for Update() calls on all gameobjects
            await (0, exports.wait)(5000);
            let currentObjects = await utils_1.Util.getAllActiveObjects();
            ResolvedObjects.getInstance().addComps(currentObjects);
            let res = {
                "type": "objects_per_scene",
                "scene": curr_scene,
                "data": currentObjects.length
            };
            send(JSON.stringify(res));
            eventLoader = new events_1.EventLoader(curr_scene);
            eventTriggerer = new events_1.EventTriggerer(curr_scene, eventLoader);
            return eventLoader.getEventFunctionCallbacks(currentObjects);
        }
    }
    static triggerEvent(event) {
        return eventTriggerer.triggerEvent(event);
    }
    static triggerAllEvents(events) {
        return eventTriggerer.triggerAllEvents(events);
    }
    static preventAppQuit() {
        let instance = classes_1.Classes.getInstance();
        if (instance.Application) {
            var quit = instance.Application.rawImageClass.method("Quit", 0);
            quit.implementation = function () {
                console.log("QUIT CALLED");
                return null;
            };
            quit = instance.Application.rawImageClass.method("Quit", 1);
            quit.implementation = function () {
                console.log("QUIT CALLED");
                return null;
            };
        }
    }
    static preventSceneChanges() {
        let instance = classes_1.Classes.getInstance();
        if (instance.SceneManager) {
            var Method_LoadSceneAsyncNameIndexInternal = instance.SceneManager.method("LoadSceneAsyncNameIndexInternal");
            Method_LoadSceneAsyncNameIndexInternal.implementation = function (v1, v2, v3, v4) { return null; };
        }
    }
    static revertSceneChange() {
        let instance = classes_1.Classes.getInstance();
        if (instance.SceneManager) {
            var Method_LoadSceneAsyncNameIndexInternal = instance.SceneManager.method("LoadSceneAsyncNameIndexInternal");
            Method_LoadSceneAsyncNameIndexInternal.revert();
        }
    }
    static async unloadScene(sceneName, index) {
        let instance = classes_1.Classes.getInstance();
        await Il2Cpp.mainThread.schedule(() => {
            var sss = Il2Cpp.reference(true);
            let UnloadSceneOptions = instance.UnloadSceneOptions;
            let SceneManager = instance.SceneManager;
            if (UnloadSceneOptions && SceneManager) {
                SceneManager.method("UnloadSceneNameIndexInternal")
                    .executeStatic(Il2Cpp.string(index == -1 ? sceneName : ""), index, true, UnloadSceneOptions.rawImageClass
                    .field("UnloadAllEmbeddedSceneObjects")
                    .value, sss);
            }
        });
    }
    static loadScene(name, index, single) {
        var ret = null;
        let instance = classes_1.Classes.getInstance();
        if (instance.LoadSceneParameters && instance.LoadSceneMode &&
            instance.AsyncOperation && instance.SceneManager) {
            const LoadSceneParameters_instance = instance.LoadSceneParameters.rawImageClass.new();
            LoadSceneParameters_instance.method(".ctor").invoke(instance.LoadSceneMode.rawImageClass
                .field(single ? "Single" : "Additive")
                .value);
            // console.log("LoadSceneParameters_instance:" +
            //            LoadSceneParameters_instance);
            let SceneManager = instance.SceneManager;
            if (index == -1) {
                console.log("LOAD SCENE");
                ret = SceneManager.method("LoadSceneAsyncNameIndexInternal")
                    .executeStatic(Il2Cpp.string(name), -1, LoadSceneParameters_instance.unbox(), true);
            }
            else {
                console.log("LOAD SCENE");
                ret = SceneManager.method("LoadSceneAsyncNameIndexInternal")
                    .executeStatic(Il2Cpp.string(""), index, LoadSceneParameters_instance.unbox(), true);
            }
        }
        return ret;
    }
    static async restoreScenes(names) {
        for (let i = 0; i < names.length; i++) {
            Loader.loadScene(names[i], -1, i == 0 ? true : false);
            await (0, exports.wait)(1000);
        }
    }
    static getScenes(nameOnly) {
        let instance = classes_1.Classes.getInstance();
        if (instance.SceneManager) {
            let SceneManager = instance.SceneManager;
            var getSceneCount = SceneManager.tryMethod("get_sceneCount");
            if (getSceneCount) {
                var sceneCount = getSceneCount.executeStatic();
                var scenes = [];
                var sceneNames = [];
                var scene;
                var sceneName;
                if (!SceneManager.tryMethod("GetSceneAt"))
                    return [];
                for (var i = 0; i < sceneCount; i++) {
                    scene = SceneManager.method("GetSceneAt").executeStatic(i)
                        .box();
                    scenes.push(scene);
                    if (nameOnly) {
                        let sn = scene.method("get_name").invoke();
                        if (sn && !sn.isNull())
                            sceneNames.push(sn.content);
                    }
                }
                if (nameOnly)
                    return sceneNames;
                else
                    return scenes;
            }
        }
        return [];
    }
    static async countAllScenes() {
        var launcherScenes = Loader.getScenes(true);
        var sceneCount = 0;
        var ret = null;
        for (var i = 1; i < 40; i++) {
            ret = Loader.loadScene("", i, true);
            console.log("ret:" + i + ":" + ret);
            if (ret == null || ret.isNull()) {
                sceneCount = i;
                break;
            }
            else {
                await (0, exports.wait)(2000);
            }
        }
        Loader.restoreScenes(launcherScenes);
        return sceneCount;
    }
    static async start() {
        console.log("Attatching...");
        // Loader.bypassSSLPinning();
        console.log("Loading Il2Cpp...");
        return Il2Cpp.perform(() => {
            console.log("Loaded Il2Cpp");
            try {
                console.log("Loaded Unity version: " + Il2Cpp.unityVersion);
                return Loader.init();
            }
            catch (sse) {
                const u = sse;
                console.log(sse);
                console.error(u.stack);
            }
        }, "free");
    }
}
exports.Loader = Loader;
// Map of all method names to method virtual addresses in string format.
// Needs to be in string format for hashing to work.
class AllMethods {
    static instance;
    // Key -> Method virtual address in string format.
    // Value -> handle.
    allMethods;
    sortedKeys = [];
    needSorted = true;
    #methods = Il2Cpp.domain.assemblies
        .flatMap(_ => _.image.classes.flatMap(_ => _.methods.filter(_ => !_.virtualAddress.isNull())))
        .sort((_, __) => _.virtualAddress.compare(__.virtualAddress));
    constructor() { this.allMethods = new Map(); }
    static getInstance() {
        if (!AllMethods.instance) {
            AllMethods.instance = new AllMethods();
        }
        return AllMethods.instance;
    }
    addMethod(method) {
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
    contains(addr) {
        if (addr instanceof NativePointer) {
            return this.allMethods.has(addr.toString());
        }
        return this.allMethods.has(addr);
    }
    getMethodName(addr) {
        let m_addr;
        if (addr instanceof NativePointer) {
            m_addr = addr.toString();
        }
        else {
            m_addr = addr;
        }
        if (this.allMethods.has(m_addr)) {
            let handle = new NativePointer(this.allMethods.get(m_addr));
            let method = new Il2Cpp.Method(handle);
            return method.class.name + "$$" + method.name;
        }
        return null;
    }
    addressInRange(addr) {
        if (this.allMethods.has(addr)) {
            return addr;
        }
        else {
            var low = '';
            var prev = '';
            for (let key of this.sortedKeys) {
                if (Number("0x" + key) > Number(addr)) {
                    return low;
                }
                else {
                    low = key;
                }
            }
        }
        return null;
    }
    // Return array of entries with names being values instead of handles.
    toEntriesWithName() {
        return Array.from(this.allMethods, ([key, value]) => [key, this.getMethodName(key)]);
    }
    get size() { return this.allMethods.size; }
    get methods() { return this.allMethods; }
}
exports.AllMethods = AllMethods;
class AllClasses {
    static instance;
    // Key -> Class name.
    // Value -> Class handle.
    allClasses;
    constructor() { this.allClasses = new Map(); }
    static getInstance() {
        if (!AllClasses.instance) {
            AllClasses.instance = new AllClasses();
        }
        return AllClasses.instance;
    }
    addClass(className, handle) {
        return this.allClasses.set(className, handle);
    }
    contains(className) { return this.allClasses.has(className); }
    get size() { return this.allClasses.size; }
    get classes() { return this.allClasses; }
}
exports.AllClasses = AllClasses;
class ResolvedMethods {
    static instance;
    // Key -> Method virtual address in string format.
    // Value -> Method's class' virtual address in string format.
    allMethods;
    constructor() { this.allMethods = new Map(); }
    static getInstance() {
        if (!ResolvedMethods.instance) {
            ResolvedMethods.instance = new ResolvedMethods();
        }
        return ResolvedMethods.instance;
    }
    addMethod(addr, classAddr) {
        return this.allMethods.set(addr.toString(), classAddr.toString());
    }
    contains(addr) {
        if (addr instanceof NativePointer) {
            return this.allMethods.has(addr.toString());
        }
        return this.allMethods.has(addr);
    }
    get size() { return this.allMethods.size; }
    get methods() { return this.allMethods; }
}
exports.ResolvedMethods = ResolvedMethods;
class ResolvedClasses {
    static instance;
    classMap;
    constructor() { this.classMap = new Map(); }
    static getInstance() {
        if (!ResolvedClasses.instance) {
            ResolvedClasses.instance = new ResolvedClasses();
        }
        return ResolvedClasses.instance;
    }
    putClass(uniqueId, uClass) {
        return this.classMap.set(uniqueId, uClass);
    }
    hasClass(uniqueId) {
        return this.classMap.has(uniqueId);
    }
    class(uniqueId) { return this.classes.get(uniqueId); }
    get classes() { return this.classMap; }
}
exports.ResolvedClasses = ResolvedClasses;
class ResolvedObjects {
    static instance;
    // string -> address in string format 0x00000000
    objectMap;
    constructor() { this.objectMap = new Map(); }
    static getInstance() {
        if (!ResolvedObjects.instance) {
            ResolvedObjects.instance = new ResolvedObjects();
        }
        return ResolvedObjects.instance;
    }
    putIl2CppObject(obj) {
        if (!this.hasObject(obj.handle.toString())) {
            let uObject = new unity_types_1.UnityObject(obj);
            uObject.resolveClassIfNeeded();
            this.objectMap.set(obj.handle.toString(), uObject);
        }
    }
    hasObject(addrStr) {
        return this.objectMap.has(addrStr);
    }
    addComps(comps) {
        for (var comp of comps) {
            this.putIl2CppObject(comp);
        }
    }
    objectsOfClass(clazz) {
        let objs = [];
        this.objects.forEach((object, handle) => {
            if (clazz.isAssignableFrom(object.class.rawImageClass)) {
                objs.push(object);
            }
        });
        return objs;
    }
    clear() { this.objectMap.clear(); }
    object(addrStr) { return this.objects.get(addrStr); }
    get objects() { return this.objectMap; }
    get objectValues() {
        return Array.from(this.objectMap.values());
    }
    get objectIl2CppValues() { return this.objectValues.map(uo => uo.unbox()); }
    method(methodAddr) {
        let objectIt = this.objectValues;
        let methods = AllMethods.getInstance();
        if (methods.contains(methodAddr)) {
            let method = new Il2Cpp.Method(new NativePointer(methodAddr));
            for (const obj of objectIt) {
                if (method.class.isAssignableFrom(obj.class.rawImageClass)) {
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
exports.ResolvedObjects = ResolvedObjects;
class ResolvedSymbols {
    static instance;
    // Addr string -> symbol addr str
    symbols;
    constructor() { this.symbols = new Map(); }
    static getInstance() {
        if (!ResolvedSymbols.instance) {
            ResolvedSymbols.instance = new ResolvedSymbols();
        }
        return ResolvedSymbols.instance;
    }
    addSymbol(addr, sym) { this.symbols.set(addr, sym); }
    symbolsMap() { return Array.from(this.symbols.keys()); }
    symbol(addr) {
        if (this.symbols.has(addr)) {
            return this.symbols.get(addr);
        }
        return null;
    }
}
exports.ResolvedSymbols = ResolvedSymbols;
class ClassLoader {
    /**
     * Resolve class from il2cpp image. @method resolveAllMethods must be called
     * beforehand.
     */
    static resolveClass(img, className, required = false) {
        let instance = ResolvedClasses.getInstance();
        if (instance.hasClass(className)) {
            return instance.class(className);
        }
        let uClass = new unity_types_1.UnityClass();
        let result = uClass.resolve(img, className);
        if (result != null) {
            uClass.resolveMethods((method) => {
                return !method.methodName.includes("System.Collections.Generic");
            });
            uClass.resolveMethodInstructions();
            instance.putClass(uClass.name, uClass);
            return uClass;
        }
        return null;
    }
    static resolveClassFromObject(obj, required = false) {
        let instance = ResolvedClasses.getInstance();
        let uid = obj.class.name;
        if (instance.hasClass(uid)) {
            return instance.class(uid);
        }
        let uClass = new unity_types_1.UnityClass();
        let result = uClass.resolveClass(obj.class);
        if (result != null) {
            uClass.resolveMethods((method) => {
                return !method.methodName.includes("System.Collections.Generic");
            });
            uClass.resolveMethodInstructions();
            return uClass;
        }
        return null;
    }
    /** Resolves all required classes. */
    static resolveRequiredClasses(img) {
        const classes = classes_1.Classes.getInstance();
        if (classes.Object == null) {
            classes.Object =
                ClassLoader.resolveClass(img, "UnityEngine.Object", true);
        }
        if (classes.Resources == null) {
            classes.Resources = ClassLoader.resolveClass(img, "UnityEngine.Resources", true);
        }
        if (classes.SceneManager == null) {
            classes.SceneManager = ClassLoader.resolveClass(img, "UnityEngine.SceneManagement.SceneManager", true);
        }
        if (classes.Rigidbody == null) {
            classes.Rigidbody = ClassLoader.resolveClass(img, "UnityEngine.Rigidbody", true);
        }
        if (classes.Component == null) {
            classes.Component = ClassLoader.resolveClass(img, "UnityEngine.Component", true);
        }
        if (classes.GameObject == null) {
            classes.GameObject = ClassLoader.resolveClass(img, "UnityEngine.GameObject", true);
        }
        if (classes.LoadSceneParameters == null) {
            classes.LoadSceneParameters = ClassLoader.resolveClass(img, "UnityEngine.SceneManagement.LoadSceneParameters", true);
        }
        if (classes.LoadSceneMode == null) {
            classes.LoadSceneMode = ClassLoader.resolveClass(img, "UnityEngine.SceneManagement.LoadSceneMode", true);
        }
        if (classes.UnloadSceneOptions == null) {
            classes.UnloadSceneOptions = ClassLoader.resolveClass(img, "UnityEngine.SceneManagement.UnloadSceneOptions", true);
        }
        if (classes.AsyncOperation == null) {
            classes.AsyncOperation = ClassLoader.resolveClass(img, "UnityEngine.AsyncOperation", true);
        }
        if (classes.UnityAction == null) {
            classes.UnityAction = ClassLoader.resolveClass(img, "UnityEngine.Events.UnityAction", true);
        }
        if (classes.UnityEvent == null) {
            classes.UnityEvent = ClassLoader.resolveClass(img, "UnityEngine.Events.UnityEvent", true);
        }
        if (classes.UnityEventBase == null) {
            classes.UnityEventBase = ClassLoader.resolveClass(img, "UnityEngine.Events.UnityEventBase", true);
        }
        if (classes.InvokableCall == null) {
            classes.InvokableCall = ClassLoader.resolveClass(img, "UnityEngine.Events.InvokableCall", true);
        }
        if (classes.Collider == null) {
            classes.Collider = ClassLoader.resolveClass(img, "UnityEngine.Collider", true);
        }
        if (classes.InvokableCallList == null) {
            classes.InvokableCallList = ClassLoader.resolveClass(img, "UnityEngine.Events.InvokableCallList", true);
        }
        if (classes.PersistentCall == null) {
            classes.PersistentCall = ClassLoader.resolveClass(img, "UnityEngine.Events.PersistentCall", true);
        }
        if (classes.ExecuteEvents == null) {
            classes.ExecuteEvents = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.ExecuteEvents", true);
        }
        if (classes.PointerEventData == null) {
            classes.PointerEventData = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.PointerEventData", true);
        }
        if (classes.EventSystem == null) {
            classes.EventSystem = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.EventSystem", true);
        }
        if (classes.IBeginDragHandler == null) {
            classes.IBeginDragHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IBeginDragHandler", true);
            if (classes.IBeginDragHandler)
                classes.EventHandlers.push(classes.IBeginDragHandler);
        }
        if (classes.ICancelHandler == null) {
            classes.ICancelHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.ICancelHandler", true);
            if (classes.ICancelHandler)
                classes.EventHandlers.push(classes.ICancelHandler);
        }
        if (classes.IDeselectHandler == null) {
            classes.IDeselectHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IDeselectHandler", true);
            if (classes.IDeselectHandler)
                classes.EventHandlers.push(classes.IDeselectHandler);
        }
        if (classes.IDragHandler == null) {
            classes.IDragHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IDragHandler", true);
            if (classes.IDragHandler)
                classes.EventHandlers.push(classes.IDragHandler);
        }
        if (classes.IDropHandler == null) {
            classes.IDropHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IDropHandler", true);
            if (classes.IDropHandler)
                classes.EventHandlers.push(classes.IDropHandler);
        }
        if (classes.IEndDragHandler == null) {
            classes.IEndDragHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IEndDragHandler", true);
            if (classes.IEndDragHandler)
                classes.EventHandlers.push(classes.IEndDragHandler);
        }
        if (classes.IInitializePotentialDragHandler == null) {
            classes.IInitializePotentialDragHandler =
                ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IInitializePotentialDragHandler", true);
            if (classes.IInitializePotentialDragHandler)
                classes.EventHandlers.push(classes.IInitializePotentialDragHandler);
        }
        if (classes.IMoveHandler == null) {
            classes.IMoveHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IMoveHandler", true);
            if (classes.IMoveHandler)
                classes.EventHandlers.push(classes.IMoveHandler);
        }
        if (classes.IPointerClickHandler == null) {
            classes.IPointerClickHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IPointerClickHandler", true);
            if (classes.IPointerClickHandler)
                classes.EventHandlers.push(classes.IPointerClickHandler);
        }
        if (classes.IPointerDownHandler == null) {
            classes.IPointerDownHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IPointerDownHandler", true);
            if (classes.IPointerDownHandler)
                classes.EventHandlers.push(classes.IPointerDownHandler);
        }
        if (classes.IPointerEnterHandler == null) {
            classes.IPointerEnterHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IPointerEnterHandler", true);
            if (classes.IPointerEnterHandler)
                classes.EventHandlers.push(classes.IPointerEnterHandler);
        }
        if (classes.IPointerExitHandler == null) {
            classes.IPointerExitHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IPointerExitHandler", true);
            if (classes.IPointerExitHandler)
                classes.EventHandlers.push(classes.IPointerExitHandler);
        }
        if (classes.IPointerUpHandler == null) {
            classes.IPointerUpHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IPointerUpHandler", true);
            if (classes.IPointerUpHandler)
                classes.EventHandlers.push(classes.IPointerUpHandler);
        }
        if (classes.IScrollHandler == null) {
            classes.IScrollHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IScrollHandler", true);
            if (classes.IScrollHandler)
                classes.EventHandlers.push(classes.IScrollHandler);
        }
        if (classes.ISelectHandler == null) {
            classes.ISelectHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.ISelectHandler", true);
            if (classes.ISelectHandler)
                classes.EventHandlers.push(classes.ISelectHandler);
        }
        if (classes.ISubmitHandler == null) {
            classes.ISubmitHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.ISubmitHandler", true);
            if (classes.ISubmitHandler)
                classes.EventHandlers.push(classes.ISubmitHandler);
        }
        if (classes.IUpdateSelectedHandler == null) {
            classes.IUpdateSelectedHandler = ClassLoader.resolveClass(img, "UnityEngine.EventSystems.IUpdateSelectedHandler", true);
            if (classes.IUpdateSelectedHandler)
                classes.EventHandlers.push(classes.IUpdateSelectedHandler);
        }
        if (classes.Message == null) {
            classes.Message = ClassLoader.resolveClass(img, "Oculus.Platform.Message", true);
            // APIHooker.hookEntitlementCheck();
        }
        if (classes.CAPI == null) {
            classes.CAPI = ClassLoader.resolveClass(img, "Oculus.Platform.CAPI", true);
            hooks_1.APIHooker.hookEntitlementCheck_alt();
            // APIHooker.hookEntitlementCheck();
        }
        if (classes.Entitlements == null) {
            classes.Entitlements = ClassLoader.resolveClass(img, "Oculus.Platform.Entitlements", true);
            // APIHooker.hookEntitlementCheck();
        }
        if (classes.OVRBody == null) {
            classes.OVRBody =
                ClassLoader.resolveClass(img, "OVRBody", true);
        }
        if (classes.OVRBoundary == null) {
            classes.OVRBoundary =
                ClassLoader.resolveClass(img, "OVRBoundary", true);
        }
        if (classes.OVREyeGaze == null) {
            classes.OVREyeGaze =
                ClassLoader.resolveClass(img, "OVREyeGaze", true);
        }
        if (classes.OVRFaceExpressions == null) {
            classes.OVRFaceExpressions =
                ClassLoader.resolveClass(img, "OVRFaceExpressions", true);
        }
        if (classes.OVRFace == null) {
            classes.OVRFace =
                ClassLoader.resolveClass(img, "OVRFace", true);
        }
        if (classes.LocationService == null) {
            classes.LocationService = ClassLoader.resolveClass(img, "UnityEngine.LocationService", true);
        }
        if (classes.SystemInfo == null) {
            classes.SystemInfo = ClassLoader.resolveClass(img, "UnityEngine.SystemInfo", true);
        }
        if (classes.Application == null) {
            classes.Application = ClassLoader.resolveClass(img, "UnityEngine.Application", true);
        }
        if (classes.Analytics == null) {
            classes.Analytics = ClassLoader.resolveClass(img, "UnityEngine.Analytics.Analytics", true);
        }
        if (classes.UploadHandlerRaw == null) {
            classes.UploadHandlerRaw = ClassLoader.resolveClass(img, "UnityEngine.Networking.UploadHandlerRaw", true);
        }
        if (classes.UnityWebRequest == null) {
            classes.UnityWebRequest = ClassLoader.resolveClass(img, "UnityEngine.Networking.UnityWebRequest", true);
        }
        if (classes.CertificateHandler == null) {
            classes.CertificateHandler = ClassLoader.resolveClass(img, "UnityEngine.Networking.CertificateHandler", true);
        }
        if (classes.Socket == null) {
            classes.Socket = ClassLoader.resolveClass(img, "System.Net.Sockets.Socket", true);
        }
    }
}
exports.ClassLoader = ClassLoader;

},{"./classes":1,"./events":2,"./hooks":3,"./unity_types":12,"./utils":13,"frida-il2cpp-bridge":8}],6:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assert = exports.testResetConfiguration = exports.configureAssert = void 0;
var FailureType;
(function (FailureType) {
    FailureType["Condition"] = "Condition";
    FailureType["NoValue"] = "NoValue";
})(FailureType || (FailureType = {}));
var messageFormatter = function (failureType, message, props) {
    var _a;
    var typeMap = (_a = {},
        _a[FailureType.Condition] = 'Assert condition failed',
        _a[FailureType.NoValue] = 'Assert value not undefined/null failed',
        _a);
    var msg = typeMap[failureType] +
        (message ? ": " + message : '') +
        (props ? ": " + JSON.stringify(props) : '');
    return msg;
};
var errorCreatorFactory = function (formatter) {
    return function (failureType, message, props) {
        return new Error(formatter(failureType, message, props));
    };
};
var defaultConfiguration = {
    formatter: messageFormatter,
    errorCreator: errorCreatorFactory(messageFormatter),
};
var configuration = defaultConfiguration;
/**
 * Customize formatting of assertion failure messages, creation of failure Errors and reporting of failures
 * @param custom
 */
function configureAssert(custom) {
    var newConfig = __assign(__assign({}, configuration), custom);
    newConfig.errorCreator =
        custom.errorCreator || errorCreatorFactory(newConfig.formatter);
    configuration = newConfig;
}
exports.configureAssert = configureAssert;
/**
 * For test purpose
 */
function testResetConfiguration() {
    configuration = defaultConfiguration;
}
exports.testResetConfiguration = testResetConfiguration;
var hardAssert = function (conditionOrValue, message, props) {
    if (typeof conditionOrValue === 'boolean') {
        if (!conditionOrValue) {
            var properties = typeof props === 'function' ? props() : props;
            var error = configuration.errorCreator(FailureType.Condition, message, properties);
            if (configuration.errorReporter) {
                configuration.errorReporter(FailureType.Condition, error, message, properties);
            }
            throw error;
        }
        return;
    }
    if (typeof conditionOrValue === 'undefined' || conditionOrValue === null) {
        var properties = typeof props === 'function' ? props() : props;
        var error = configuration.errorCreator(FailureType.NoValue, message, properties);
        if (configuration.errorReporter) {
            configuration.errorReporter(FailureType.NoValue, error, message, properties);
        }
        throw error;
    }
    return conditionOrValue;
};
var softAssert = function (conditionOrValue, message, props) {
    var warningReporter = configuration.warningReporter;
    if (typeof conditionOrValue === 'boolean') {
        if (!conditionOrValue) {
            var properties = typeof props === 'function' ? props() : props;
            exports.assert(warningReporter, 'assert.soft must have warningReporter configured, see https://www.npmjs.com/package/assert-ts#configuration')(FailureType.Condition, message, properties);
        }
        return conditionOrValue;
    }
    if (conditionOrValue === undefined || conditionOrValue === null) {
        var properties = typeof props === 'function' ? props() : props;
        exports.assert(warningReporter, 'assert.soft must have warningReporter configured, see https://www.npmjs.com/package/assert-ts#configuration')(FailureType.NoValue, message, properties);
        return false;
    }
    return true;
};
var _assert = hardAssert;
_assert.soft = softAssert;
exports.assert = _assert;

},{}],7:[function(require,module,exports){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = require("./assert");
__exportStar(require("./assert"), exports);
exports.default = assert_1.assert;

},{"./assert":6}],8:[function(require,module,exports){
(function (setImmediate){(function (){
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** @internal */
function raise(message) {
    const error = new Error(`\x1B[0m${message}`);
    error.name = `\x1B[0m\x1B[38;5;9mil2cpp\x1B[0m`;
    error.stack = error.stack
        ?.replace(/^Error/, error.name)
        ?.replace(/\n    at (.+) \((.+):(.+)\)/, "\x1b[3m\x1b[2m")
        ?.concat("\x1B[0m");
    throw error;
}
/** @internal */
function warn(message) {
    globalThis.console.log(`\x1B[38;5;11mil2cpp\x1B[0m: ${message}`);
}
/** @internal */
function ok(message) {
    globalThis.console.log(`\x1B[38;5;10mil2cpp\x1B[0m: ${message}`);
}
/** @internal */
function inform(message) {
    globalThis.console.log(`\x1B[38;5;12mil2cpp\x1B[0m: ${message}`);
}
/** @internal */
function getter(target, key, get, decorator) {
    globalThis.Object.defineProperty(target, key, decorator?.(target, key, { get, configurable: true }) ?? { get });
}
/** @internal */
function lazy(_, propertyKey, descriptor) {
    const getter = descriptor.get;
    if (!getter) {
        throw new Error("@lazy can only be applied to getter accessors");
    }
    descriptor.get = function () {
        const value = getter.call(this);
        Object.defineProperty(this, propertyKey, {
            value,
            configurable: descriptor.configurable,
            enumerable: descriptor.enumerable,
            writable: false
        });
        return value;
    };
    return descriptor;
}
/** Scaffold class. */
class NativeStruct {
    handle;
    constructor(handleOrWrapper) {
        if (handleOrWrapper instanceof NativePointer) {
            this.handle = handleOrWrapper;
        }
        else {
            this.handle = handleOrWrapper.handle;
        }
    }
    equals(other) {
        return this.handle.equals(other.handle);
    }
    isNull() {
        return this.handle.isNull();
    }
    asNullable() {
        return this.isNull() ? null : this;
    }
}
/** @internal */
class Target {
    stringEncoding;
    address;
    constructor(responsible, name, stringEncoding) {
        this.stringEncoding = stringEncoding;
        this.address = Module.findExportByName(responsible, name) ?? NULL;
    }
    static get targets() {
        function info() {
            switch (Process.platform) {
                case "linux":
                    try {
                        if (UnityVersion.gte(Java.androidVersion, "12")) {
                            return [null, ["__loader_dlopen", "utf8"]];
                        }
                        else {
                            return ["libdl.so", ["dlopen", "utf8"], ["android_dlopen_ext", "utf8"]];
                        }
                    }
                    catch (e) {
                        return [null, ["dlopen", "utf8"]];
                    }
                case "darwin":
                    return ["libdyld.dylib", ["dlopen", "utf8"]];
                case "windows":
                    const ll = "LoadLibrary";
                    return ["kernel32.dll", [`${ll}W`, "utf16"], [`${ll}ExW`, "utf16"], [`${ll}A`, "ansi"], [`${ll}ExA`, "ansi"]];
            }
        }
        const [responsible, ...targets] = info();
        return targets.map(([name, encoding]) => new Target(responsible, name, encoding)).filter(_ => !_.address.isNull());
    }
    readString(pointer) {
        switch (this.stringEncoding) {
            case "utf8":
                return pointer.readUtf8String();
            case "utf16":
                return pointer.readUtf16String();
            case "ansi":
                return pointer.readAnsiString();
        }
    }
}
/** @internal */
function forModule(...moduleNames) {
    return new Promise(resolve => {
        for (const moduleName of moduleNames) {
            const module = Process.findModuleByName(moduleName);
            if (module != null) {
                resolve(moduleName);
                return;
            }
        }
        const interceptors = Target.targets.map(target => Interceptor.attach(target.address, {
            onEnter(args) {
                this.modulePath = target.readString(args[0]) ?? "";
            },
            onLeave(returnValue) {
                if (returnValue.isNull())
                    return;
                for (const moduleName of moduleNames) {
                    if (!this.modulePath.endsWith(moduleName))
                        continue;
                    setImmediate(() => interceptors.forEach(_ => _.detach()));
                    resolve(moduleName);
                }
            }
        }));
    });
}
NativePointer.prototype.offsetOf = function (condition, depth) {
    depth = 512;
    for (let i = 0; i < depth; i++) {
        if (condition(this.add(i))) {
            return i;
        }
    }
    return null;
};
/** @internal */
function readNativeIterator(block) {
    const array = [];
    const iterator = Memory.alloc(Process.pointerSize);
    let handle = block(iterator);
    while (!handle.isNull()) {
        array.push(handle);
        handle = block(iterator);
    }
    return array;
}
/** @internal */
function readNativeList(block) {
    const lengthPointer = Memory.alloc(Process.pointerSize);
    const startPointer = block(lengthPointer);
    if (startPointer.isNull()) {
        return [];
    }
    const array = new Array(lengthPointer.readInt());
    for (let i = 0; i < array.length; i++) {
        array[i] = startPointer.add(i * Process.pointerSize).readPointer();
    }
    return array;
}
/** @internal */
function recycle(Class) {
    return new Proxy(Class, {
        cache: new Map(),
        construct(Target, argArray) {
            const handle = argArray[0].toUInt32();
            if (!this.cache.has(handle)) {
                this.cache.set(handle, new Target(argArray[0]));
            }
            return this.cache.get(handle);
        }
    });
}
/** @internal */
var UnityVersion;
(function (UnityVersion) {
    const pattern = /(20\d{2}|\d)\.(\d)\.(\d{1,2})(?:[abcfp]|rc){0,2}\d?/;
    function find(string) {
        return string?.match(pattern)?.[0];
    }
    UnityVersion.find = find;
    function gte(a, b) {
        return compare(a, b) >= 0;
    }
    UnityVersion.gte = gte;
    function lt(a, b) {
        return compare(a, b) < 0;
    }
    UnityVersion.lt = lt;
    function compare(a, b) {
        const aMatches = a.match(pattern);
        const bMatches = b.match(pattern);
        for (let i = 1; i <= 3; i++) {
            const a = Number(aMatches?.[i] ?? -1);
            const b = Number(bMatches?.[i] ?? -1);
            if (a > b)
                return 1;
            else if (a < b)
                return -1;
        }
        return 0;
    }
})(UnityVersion || (UnityVersion = {}));
var Il2Cpp;
(function (Il2Cpp) {
    Il2Cpp.api = {
        get alloc() {
            return r("il2cpp_alloc", "pointer", ["size_t"]);
        },
        get arrayGetLength() {
            return r("il2cpp_array_length", "uint32", ["pointer"]);
        },
        get arrayNew() {
            return r("il2cpp_array_new", "pointer", ["pointer", "uint32"]);
        },
        get assemblyGetImage() {
            return r("il2cpp_assembly_get_image", "pointer", ["pointer"]);
        },
        get classForEach() {
            return r("il2cpp_class_for_each", "void", ["pointer", "pointer"]);
        },
        get classFromName() {
            return r("il2cpp_class_from_name", "pointer", ["pointer", "pointer", "pointer"]);
        },
        get classFromObject() {
            return r("il2cpp_class_from_system_type", "pointer", ["pointer"]);
        },
        get classGetArrayClass() {
            return r("il2cpp_array_class_get", "pointer", ["pointer", "uint32"]);
        },
        get classGetArrayElementSize() {
            return r("il2cpp_class_array_element_size", "int", ["pointer"]);
        },
        get classGetAssemblyName() {
            return r("il2cpp_class_get_assemblyname", "pointer", ["pointer"]);
        },
        get classGetBaseType() {
            return r("il2cpp_class_enum_basetype", "pointer", ["pointer"]);
        },
        get classGetDeclaringType() {
            return r("il2cpp_class_get_declaring_type", "pointer", ["pointer"]);
        },
        get classGetElementClass() {
            return r("il2cpp_class_get_element_class", "pointer", ["pointer"]);
        },
        get classGetFieldFromName() {
            return r("il2cpp_class_get_field_from_name", "pointer", ["pointer", "pointer"]);
        },
        get classGetFields() {
            return r("il2cpp_class_get_fields", "pointer", ["pointer", "pointer"]);
        },
        get classGetFlags() {
            return r("il2cpp_class_get_flags", "int", ["pointer"]);
        },
        get classGetImage() {
            return r("il2cpp_class_get_image", "pointer", ["pointer"]);
        },
        get classGetInstanceSize() {
            return r("il2cpp_class_instance_size", "int32", ["pointer"]);
        },
        get classGetInterfaces() {
            return r("il2cpp_class_get_interfaces", "pointer", ["pointer", "pointer"]);
        },
        get classGetMethodFromName() {
            return r("il2cpp_class_get_method_from_name", "pointer", ["pointer", "pointer", "int"]);
        },
        get classGetMethods() {
            return r("il2cpp_class_get_methods", "pointer", ["pointer", "pointer"]);
        },
        get classGetName() {
            return r("il2cpp_class_get_name", "pointer", ["pointer"]);
        },
        get classGetNamespace() {
            return r("il2cpp_class_get_namespace", "pointer", ["pointer"]);
        },
        get classGetNestedClasses() {
            return r("il2cpp_class_get_nested_types", "pointer", ["pointer", "pointer"]);
        },
        get classGetParent() {
            return r("il2cpp_class_get_parent", "pointer", ["pointer"]);
        },
        get classGetStaticFieldData() {
            return r("il2cpp_class_get_static_field_data", "pointer", ["pointer"]);
        },
        get classGetValueTypeSize() {
            return r("il2cpp_class_value_size", "int32", ["pointer", "pointer"]);
        },
        get classGetType() {
            return r("il2cpp_class_get_type", "pointer", ["pointer"]);
        },
        get classHasReferences() {
            return r("il2cpp_class_has_references", "bool", ["pointer"]);
        },
        get classInitialize() {
            return r("il2cpp_runtime_class_init", "void", ["pointer"]);
        },
        get classIsAbstract() {
            return r("il2cpp_class_is_abstract", "bool", ["pointer"]);
        },
        get classIsAssignableFrom() {
            return r("il2cpp_class_is_assignable_from", "bool", ["pointer", "pointer"]);
        },
        get classIsBlittable() {
            return r("il2cpp_class_is_blittable", "bool", ["pointer"]);
        },
        get classIsEnum() {
            return r("il2cpp_class_is_enum", "bool", ["pointer"]);
        },
        get classIsGeneric() {
            return r("il2cpp_class_is_generic", "bool", ["pointer"]);
        },
        get classIsInflated() {
            return r("il2cpp_class_is_inflated", "bool", ["pointer"]);
        },
        get classIsInterface() {
            return r("il2cpp_class_is_interface", "bool", ["pointer"]);
        },
        get classIsSubclassOf() {
            return r("il2cpp_class_is_subclass_of", "bool", ["pointer", "pointer", "bool"]);
        },
        get classIsValueType() {
            return r("il2cpp_class_is_valuetype", "bool", ["pointer"]);
        },
        get domainGetAssemblyFromName() {
            return r("il2cpp_domain_assembly_open", "pointer", ["pointer", "pointer"]);
        },
        get domainGet() {
            return r("il2cpp_domain_get", "pointer", []);
        },
        get domainGetAssemblies() {
            return r("il2cpp_domain_get_assemblies", "pointer", ["pointer", "pointer"]);
        },
        get fieldGetClass() {
            return r("il2cpp_field_get_parent", "pointer", ["pointer"]);
        },
        get fieldGetFlags() {
            return r("il2cpp_field_get_flags", "int", ["pointer"]);
        },
        get fieldGetName() {
            return r("il2cpp_field_get_name", "pointer", ["pointer"]);
        },
        get fieldGetOffset() {
            return r("il2cpp_field_get_offset", "int32", ["pointer"]);
        },
        get fieldGetStaticValue() {
            return r("il2cpp_field_static_get_value", "void", ["pointer", "pointer"]);
        },
        get fieldGetType() {
            return r("il2cpp_field_get_type", "pointer", ["pointer"]);
        },
        get fieldSetStaticValue() {
            return r("il2cpp_field_static_set_value", "void", ["pointer", "pointer"]);
        },
        get free() {
            return r("il2cpp_free", "void", ["pointer"]);
        },
        get gcCollect() {
            return r("il2cpp_gc_collect", "void", ["int"]);
        },
        get gcCollectALittle() {
            return r("il2cpp_gc_collect_a_little", "void", []);
        },
        get gcDisable() {
            return r("il2cpp_gc_disable", "void", []);
        },
        get gcEnable() {
            return r("il2cpp_gc_enable", "void", []);
        },
        get gcGetHeapSize() {
            return r("il2cpp_gc_get_heap_size", "int64", []);
        },
        get gcGetMaxTimeSlice() {
            return r("il2cpp_gc_get_max_time_slice_ns", "int64", []);
        },
        get gcGetUsedSize() {
            return r("il2cpp_gc_get_used_size", "int64", []);
        },
        get gcHandleGetTarget() {
            return r("il2cpp_gchandle_get_target", "pointer", ["uint32"]);
        },
        get gcHandleFree() {
            return r("il2cpp_gchandle_free", "void", ["uint32"]);
        },
        get gcHandleNew() {
            return r("il2cpp_gchandle_new", "uint32", ["pointer", "bool"]);
        },
        get gcHandleNewWeakRef() {
            return r("il2cpp_gchandle_new_weakref", "uint32", ["pointer", "bool"]);
        },
        get gcIsDisabled() {
            return r("il2cpp_gc_is_disabled", "bool", []);
        },
        get gcIsIncremental() {
            return r("il2cpp_gc_is_incremental", "bool", []);
        },
        get gcSetMaxTimeSlice() {
            return r("il2cpp_gc_set_max_time_slice_ns", "void", ["int64"]);
        },
        get gcStartIncrementalCollection() {
            return r("il2cpp_gc_start_incremental_collection", "void", []);
        },
        get gcStartWorld() {
            return r("il2cpp_start_gc_world", "void", []);
        },
        get gcStopWorld() {
            return r("il2cpp_stop_gc_world", "void", []);
        },
        get getCorlib() {
            return r("il2cpp_get_corlib", "pointer", []);
        },
        get imageGetAssembly() {
            return r("il2cpp_image_get_assembly", "pointer", ["pointer"]);
        },
        get imageGetClass() {
            return r("il2cpp_image_get_class", "pointer", ["pointer", "uint"]);
        },
        get imageGetClassCount() {
            return r("il2cpp_image_get_class_count", "uint32", ["pointer"]);
        },
        get imageGetName() {
            return r("il2cpp_image_get_name", "pointer", ["pointer"]);
        },
        get initialize() {
            return r("il2cpp_init", "void", ["pointer"]);
        },
        get livenessAllocateStruct() {
            return r("il2cpp_unity_liveness_allocate_struct", "pointer", ["pointer", "int", "pointer", "pointer", "pointer"]);
        },
        get livenessCalculationBegin() {
            return r("il2cpp_unity_liveness_calculation_begin", "pointer", ["pointer", "int", "pointer", "pointer", "pointer", "pointer"]);
        },
        get livenessCalculationEnd() {
            return r("il2cpp_unity_liveness_calculation_end", "void", ["pointer"]);
        },
        get livenessCalculationFromStatics() {
            return r("il2cpp_unity_liveness_calculation_from_statics", "void", ["pointer"]);
        },
        get livenessFinalize() {
            return r("il2cpp_unity_liveness_finalize", "void", ["pointer"]);
        },
        get livenessFreeStruct() {
            return r("il2cpp_unity_liveness_free_struct", "void", ["pointer"]);
        },
        get memorySnapshotCapture() {
            return r("il2cpp_capture_memory_snapshot", "pointer", []);
        },
        get memorySnapshotFree() {
            return r("il2cpp_free_captured_memory_snapshot", "void", ["pointer"]);
        },
        get memorySnapshotGetClasses() {
            return r("il2cpp_memory_snapshot_get_classes", "pointer", ["pointer", "pointer"]);
        },
        get memorySnapshotGetObjects() {
            return r("il2cpp_memory_snapshot_get_objects", "pointer", ["pointer", "pointer"]);
        },
        get methodGetClass() {
            return r("il2cpp_method_get_class", "pointer", ["pointer"]);
        },
        get methodGetFlags() {
            return r("il2cpp_method_get_flags", "uint32", ["pointer", "pointer"]);
        },
        get methodGetName() {
            return r("il2cpp_method_get_name", "pointer", ["pointer"]);
        },
        get methodGetObject() {
            return r("il2cpp_method_get_object", "pointer", ["pointer", "pointer"]);
        },
        get methodGetParameterCount() {
            return r("il2cpp_method_get_param_count", "uint8", ["pointer"]);
        },
        get methodGetParameterName() {
            return r("il2cpp_method_get_param_name", "pointer", ["pointer", "uint32"]);
        },
        get methodGetParameters() {
            return r("il2cpp_method_get_parameters", "pointer", ["pointer", "pointer"]);
        },
        get methodGetParameterType() {
            return r("il2cpp_method_get_param", "pointer", ["pointer", "uint32"]);
        },
        get methodGetReturnType() {
            return r("il2cpp_method_get_return_type", "pointer", ["pointer"]);
        },
        get methodIsGeneric() {
            return r("il2cpp_method_is_generic", "bool", ["pointer"]);
        },
        get methodIsInflated() {
            return r("il2cpp_method_is_inflated", "bool", ["pointer"]);
        },
        get methodIsInstance() {
            return r("il2cpp_method_is_instance", "bool", ["pointer"]);
        },
        get monitorEnter() {
            return r("il2cpp_monitor_enter", "void", ["pointer"]);
        },
        get monitorExit() {
            return r("il2cpp_monitor_exit", "void", ["pointer"]);
        },
        get monitorPulse() {
            return r("il2cpp_monitor_pulse", "void", ["pointer"]);
        },
        get monitorPulseAll() {
            return r("il2cpp_monitor_pulse_all", "void", ["pointer"]);
        },
        get monitorTryEnter() {
            return r("il2cpp_monitor_try_enter", "bool", ["pointer", "uint32"]);
        },
        get monitorTryWait() {
            return r("il2cpp_monitor_try_wait", "bool", ["pointer", "uint32"]);
        },
        get monitorWait() {
            return r("il2cpp_monitor_wait", "void", ["pointer"]);
        },
        get objectGetClass() {
            return r("il2cpp_object_get_class", "pointer", ["pointer"]);
        },
        get objectGetVirtualMethod() {
            return r("il2cpp_object_get_virtual_method", "pointer", ["pointer", "pointer"]);
        },
        get objectInitialize() {
            return r("il2cpp_runtime_object_init_exception", "void", ["pointer", "pointer"]);
        },
        get objectNew() {
            return r("il2cpp_object_new", "pointer", ["pointer"]);
        },
        get objectGetSize() {
            return r("il2cpp_object_get_size", "uint32", ["pointer"]);
        },
        get objectUnbox() {
            return r("il2cpp_object_unbox", "pointer", ["pointer"]);
        },
        get resolveInternalCall() {
            return r("il2cpp_resolve_icall", "pointer", ["pointer"]);
        },
        get stringGetChars() {
            return r("il2cpp_string_chars", "pointer", ["pointer"]);
        },
        get stringGetLength() {
            return r("il2cpp_string_length", "int32", ["pointer"]);
        },
        get stringNew() {
            return r("il2cpp_string_new", "pointer", ["pointer"]);
        },
        get valueTypeBox() {
            return r("il2cpp_value_box", "pointer", ["pointer", "pointer"]);
        },
        get threadAttach() {
            return r("il2cpp_thread_attach", "pointer", ["pointer"]);
        },
        get threadDetach() {
            return r("il2cpp_thread_detach", "void", ["pointer"]);
        },
        get threadGetAttachedThreads() {
            return r("il2cpp_thread_get_all_attached_threads", "pointer", ["pointer"]);
        },
        get threadGetCurrent() {
            return r("il2cpp_thread_current", "pointer", []);
        },
        get threadIsVm() {
            return r("il2cpp_is_vm_thread", "bool", ["pointer"]);
        },
        get typeGetClass() {
            return r("il2cpp_class_from_type", "pointer", ["pointer"]);
        },
        get typeGetName() {
            return r("il2cpp_type_get_name", "pointer", ["pointer"]);
        },
        get typeGetObject() {
            return r("il2cpp_type_get_object", "pointer", ["pointer"]);
        },
        get typeGetTypeEnum() {
            return r("il2cpp_type_get_type", "int", ["pointer"]);
        }
    };
    decorate(Il2Cpp.api, lazy);
    getter(Il2Cpp, "memorySnapshotApi", () => new CModule("#include <stdint.h>\n#include <string.h>\n\ntypedef struct Il2CppManagedMemorySnapshot Il2CppManagedMemorySnapshot;\ntypedef struct Il2CppMetadataType Il2CppMetadataType;\n\nstruct Il2CppManagedMemorySnapshot\n{\n  struct Il2CppManagedHeap\n  {\n    uint32_t section_count;\n    void * sections;\n  } heap;\n  struct Il2CppStacks\n  {\n    uint32_t stack_count;\n    void * stacks;\n  } stacks;\n  struct Il2CppMetadataSnapshot\n  {\n    uint32_t type_count;\n    Il2CppMetadataType * types;\n  } metadata_snapshot;\n  struct Il2CppGCHandles\n  {\n    uint32_t tracked_object_count;\n    void ** pointers_to_objects;\n  } gc_handles;\n  struct Il2CppRuntimeInformation\n  {\n    uint32_t pointer_size;\n    uint32_t object_header_size;\n    uint32_t array_header_size;\n    uint32_t array_bounds_offset_in_header;\n    uint32_t array_size_offset_in_header;\n    uint32_t allocation_granularity;\n  } runtime_information;\n  void * additional_user_information;\n};\n\nstruct Il2CppMetadataType\n{\n  uint32_t flags;\n  void * fields;\n  uint32_t field_count;\n  uint32_t statics_size;\n  uint8_t * statics;\n  uint32_t base_or_element_type_index;\n  char * name;\n  const char * assembly_name;\n  uint64_t type_info_address;\n  uint32_t size;\n};\n\nuintptr_t\nil2cpp_memory_snapshot_get_classes (\n    const Il2CppManagedMemorySnapshot * snapshot, Il2CppMetadataType ** iter)\n{\n  const int zero = 0;\n  const void * null = 0;\n\n  if (iter != NULL && snapshot->metadata_snapshot.type_count > zero)\n  {\n    if (*iter == null)\n    {\n      *iter = snapshot->metadata_snapshot.types;\n      return (uintptr_t) (*iter)->type_info_address;\n    }\n    else\n    {\n      Il2CppMetadataType * metadata_type = *iter + 1;\n\n      if (metadata_type < snapshot->metadata_snapshot.types +\n                              snapshot->metadata_snapshot.type_count)\n      {\n        *iter = metadata_type;\n        return (uintptr_t) (*iter)->type_info_address;\n      }\n    }\n  }\n  return 0;\n}\n\nvoid **\nil2cpp_memory_snapshot_get_objects (\n    const Il2CppManagedMemorySnapshot * snapshot, uint32_t * size)\n{\n  *size = snapshot->gc_handles.tracked_object_count;\n  return snapshot->gc_handles.pointers_to_objects;\n}\n"), lazy);
    function r(exportName, retType, argTypes) {
        const handle = Il2Cpp.module.findExportByName(exportName) ?? Il2Cpp.memorySnapshotApi[exportName];
        return new NativeFunction(handle ?? raise(`couldn't resolve export ${exportName}`), retType, argTypes);
    }
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    Il2Cpp.application = {
        /** */
        get dataPath() {
            return unityEngineCall("get_persistentDataPath");
        },
        /** */
        get identifier() {
            return unityEngineCall("get_identifier") ?? unityEngineCall("get_bundleIdentifier");
        },
        /** Gets the version of the application */
        get version() {
            return unityEngineCall("get_version");
        }
    };
    // prettier-ignore
    getter(Il2Cpp, "unityVersion", () => {
        const unityVersion = unityEngineCall("get_unityVersion");
        if (unityVersion != null) {
            return unityVersion;
        }
        const searchPattern = "45 64 69 74 6f 72 ?? 44 61 74 61 ?? 69 6c 32 63 70 70";
        for (const range of Il2Cpp.module.enumerateRanges("r--").concat(Process.getRangeByAddress(Il2Cpp.module.base))) {
            for (let { address } of Memory.scanSync(range.base, range.size, searchPattern)) {
                while (address.readU8() != 0) {
                    address = address.sub(1);
                }
                const match = UnityVersion.find(address.add(1).readCString());
                if (match != undefined) {
                    return match;
                }
            }
        }
        raise("couldn't determine the Unity version, please specify it manually");
    }, lazy);
    // prettier-ignore
    getter(Il2Cpp, "unityVersionIsBelow201830", () => {
        return UnityVersion.lt(Il2Cpp.unityVersion, "2018.3.0");
    }, lazy);
    // prettier-ignore
    getter(Il2Cpp, "unityVersionIsBelow202120", () => {
        return UnityVersion.lt(Il2Cpp.unityVersion, "2021.2.0");
    }, lazy);
    function unityEngineCall(method) {
        const handle = Il2Cpp.api.resolveInternalCall(Memory.allocUtf8String("UnityEngine.Application::" + method));
        const nativeFunction = new NativeFunction(handle, "pointer", []);
        return nativeFunction.isNull() ? null : new Il2Cpp.String(nativeFunction()).asNullable()?.content ?? null;
    }
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    /** Dumps the application. */
    function dump(fileName, path) {
        fileName = fileName ?? `${Il2Cpp.application.identifier ?? "unknown"}_${Il2Cpp.application.version ?? "unknown"}.cs`;
        const destination = `${path ?? Il2Cpp.application.dataPath}/${fileName}`;
        const file = new File(destination, "w");
        for (const assembly of Il2Cpp.domain.assemblies) {
            inform(`dumping ${assembly.name}...`);
            for (const klass of assembly.image.classes) {
                file.write(`${klass}\n\n`);
            }
        }
        file.flush();
        file.close();
        ok(`dump saved to ${destination}`);
    }
    Il2Cpp.dump = dump;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    /** */
    function installExceptionListener(targetThread = "current") {
        const currentThread = Il2Cpp.api.threadGetCurrent();
        return Interceptor.attach(Il2Cpp.module.getExportByName("__cxa_throw"), function (args) {
            if (targetThread == "current" && !Il2Cpp.api.threadGetCurrent().equals(currentThread)) {
                return;
            }
            inform(new Il2Cpp.Object(args[0].readPointer()));
        });
    }
    Il2Cpp.installExceptionListener = installExceptionListener;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    /** Creates a filter which includes `element`s whose type can be assigned to `klass` variables. */
    function is(klass) {
        return (element) => {
            if (element instanceof Il2Cpp.Class) {
                return klass.isAssignableFrom(element);
            }
            else {
                return klass.isAssignableFrom(element.class);
            }
        };
    }
    Il2Cpp.is = is;
    /** Creates a filter which includes `element`s whose type corresponds to `klass` type. */
    function isExactly(klass) {
        return (element) => {
            if (element instanceof Il2Cpp.Class) {
                return element.equals(klass);
            }
            else {
                return element.class.equals(klass);
            }
        };
    }
    Il2Cpp.isExactly = isExactly;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    Il2Cpp.gc = {
        /** Gets the heap size in bytes. */
        get heapSize() {
            return Il2Cpp.api.gcGetHeapSize();
        },
        /** Determines whether the garbage collector is disabled. */
        get isEnabled() {
            return !Il2Cpp.api.gcIsDisabled();
        },
        /** Determines whether the garbage collector is incremental. */
        get isIncremental() {
            return !!Il2Cpp.api.gcIsIncremental();
        },
        /** Gets the number of nanoseconds the garbage collector can spend in a collection step. */
        get maxTimeSlice() {
            return Il2Cpp.api.gcGetMaxTimeSlice();
        },
        /** Gets the used heap size in bytes. */
        get usedHeapSize() {
            return Il2Cpp.api.gcGetUsedSize();
        },
        /** Enables or disables the garbage collector. */
        set isEnabled(value) {
            value ? Il2Cpp.api.gcEnable() : Il2Cpp.api.gcDisable();
        },
        /** Sets the number of nanoseconds the garbage collector can spend in a collection step. */
        set maxTimeSlice(nanoseconds) {
            Il2Cpp.api.gcSetMaxTimeSlice(nanoseconds);
        },
        /** Returns the heap allocated objects of the specified class. This variant reads GC descriptors. */
        choose(klass) {
            const matches = [];
            const callback = (objects, size) => {
                for (let i = 0; i < size; i++) {
                    matches.push(new Il2Cpp.Object(objects.add(i * Process.pointerSize).readPointer()));
                }
            };
            const chooseCallback = new NativeCallback(callback, "void", ["pointer", "int", "pointer"]);
            if (Il2Cpp.unityVersionIsBelow202120) {
                const onWorld = new NativeCallback(() => { }, "void", []);
                const state = Il2Cpp.api.livenessCalculationBegin(klass, 0, chooseCallback, NULL, onWorld, onWorld);
                Il2Cpp.api.livenessCalculationFromStatics(state);
                Il2Cpp.api.livenessCalculationEnd(state);
            }
            else {
                const realloc = (handle, size) => {
                    if (!handle.isNull() && size.compare(0) == 0) {
                        Il2Cpp.free(handle);
                        return NULL;
                    }
                    else {
                        return Il2Cpp.alloc(size);
                    }
                };
                const reallocCallback = new NativeCallback(realloc, "pointer", ["pointer", "size_t", "pointer"]);
                this.stopWorld();
                const state = Il2Cpp.api.livenessAllocateStruct(klass, 0, chooseCallback, NULL, reallocCallback);
                Il2Cpp.api.livenessCalculationFromStatics(state);
                Il2Cpp.api.livenessFinalize(state);
                this.startWorld();
                Il2Cpp.api.livenessFreeStruct(state);
            }
            return matches;
        },
        /** Forces a garbage collection of the specified generation. */
        collect(generation) {
            Il2Cpp.api.gcCollect(generation < 0 ? 0 : generation > 2 ? 2 : generation);
        },
        /** Forces a garbage collection. */
        collectALittle() {
            Il2Cpp.api.gcCollectALittle();
        },
        /** Resumes all the previously stopped threads. */
        startWorld() {
            return Il2Cpp.api.gcStartWorld();
        },
        /** Performs an incremental garbage collection. */
        startIncrementalCollection() {
            return Il2Cpp.api.gcStartIncrementalCollection();
        },
        /** Stops all threads which may access the garbage collected heap, other than the caller. */
        stopWorld() {
            return Il2Cpp.api.gcStopWorld();
        }
    };
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    /** Allocates the given amount of bytes. */
    function alloc(size = Process.pointerSize) {
        return Il2Cpp.api.alloc(size);
    }
    Il2Cpp.alloc = alloc;
    /** Frees memory. */
    function free(pointer) {
        return Il2Cpp.api.free(pointer);
    }
    Il2Cpp.free = free;
    /** @internal */
    function read(pointer, type) {
        switch (type.typeEnum) {
            case Il2Cpp.Type.enum.boolean:
                return !!pointer.readS8();
            case Il2Cpp.Type.enum.byte:
                return pointer.readS8();
            case Il2Cpp.Type.enum.unsignedByte:
                return pointer.readU8();
            case Il2Cpp.Type.enum.short:
                return pointer.readS16();
            case Il2Cpp.Type.enum.unsignedShort:
                return pointer.readU16();
            case Il2Cpp.Type.enum.int:
                return pointer.readS32();
            case Il2Cpp.Type.enum.unsignedInt:
                return pointer.readU32();
            case Il2Cpp.Type.enum.char:
                return pointer.readU16();
            case Il2Cpp.Type.enum.long:
                return pointer.readS64();
            case Il2Cpp.Type.enum.unsignedLong:
                return pointer.readU64();
            case Il2Cpp.Type.enum.float:
                return pointer.readFloat();
            case Il2Cpp.Type.enum.double:
                return pointer.readDouble();
            case Il2Cpp.Type.enum.nativePointer:
            case Il2Cpp.Type.enum.unsignedNativePointer:
                return pointer.readPointer();
            case Il2Cpp.Type.enum.pointer:
                return new Il2Cpp.Pointer(pointer.readPointer(), type.class.baseType);
            case Il2Cpp.Type.enum.valueType:
                return new Il2Cpp.ValueType(pointer, type);
            case Il2Cpp.Type.enum.object:
            case Il2Cpp.Type.enum.class:
                return new Il2Cpp.Object(pointer.readPointer());
            case Il2Cpp.Type.enum.genericInstance:
                return type.class.isValueType ? new Il2Cpp.ValueType(pointer, type) : new Il2Cpp.Object(pointer.readPointer());
            case Il2Cpp.Type.enum.string:
                return new Il2Cpp.String(pointer.readPointer());
            case Il2Cpp.Type.enum.array:
            case Il2Cpp.Type.enum.multidimensionalArray:
                return new Il2Cpp.Array(pointer.readPointer());
        }
        raise(`couldn't read the value from ${pointer} using an unhandled or unknown type ${type.name} (${type.typeEnum}), please file an issue`);
    }
    Il2Cpp.read = read;
    /** @internal */
    function write(pointer, value, type) {
        switch (type.typeEnum) {
            case Il2Cpp.Type.enum.boolean:
                return pointer.writeS8(+value);
            case Il2Cpp.Type.enum.byte:
                return pointer.writeS8(value);
            case Il2Cpp.Type.enum.unsignedByte:
                return pointer.writeU8(value);
            case Il2Cpp.Type.enum.short:
                return pointer.writeS16(value);
            case Il2Cpp.Type.enum.unsignedShort:
                return pointer.writeU16(value);
            case Il2Cpp.Type.enum.int:
                return pointer.writeS32(value);
            case Il2Cpp.Type.enum.unsignedInt:
                return pointer.writeU32(value);
            case Il2Cpp.Type.enum.char:
                return pointer.writeU16(value);
            case Il2Cpp.Type.enum.long:
                return pointer.writeS64(value);
            case Il2Cpp.Type.enum.unsignedLong:
                return pointer.writeU64(value);
            case Il2Cpp.Type.enum.float:
                return pointer.writeFloat(value);
            case Il2Cpp.Type.enum.double:
                return pointer.writeDouble(value);
            case Il2Cpp.Type.enum.nativePointer:
            case Il2Cpp.Type.enum.unsignedNativePointer:
            case Il2Cpp.Type.enum.pointer:
            case Il2Cpp.Type.enum.valueType:
            case Il2Cpp.Type.enum.string:
            case Il2Cpp.Type.enum.object:
            case Il2Cpp.Type.enum.class:
            case Il2Cpp.Type.enum.array:
            case Il2Cpp.Type.enum.multidimensionalArray:
            case Il2Cpp.Type.enum.genericInstance:
                if (value instanceof Il2Cpp.ValueType) {
                    Memory.copy(pointer, value, type.class.valueTypeSize);
                    return pointer;
                }
                return pointer.writePointer(value);
        }
        raise(`couldn't write value ${value} to ${pointer} using an unhandled or unknown type ${type.name} (${type.typeEnum}), please file an issue`);
    }
    Il2Cpp.write = write;
    /** @internal */
    function fromFridaValue(value, type) {
        if (globalThis.Array.isArray(value)) {
            return arrayToValueType(type, value);
        }
        else if (value instanceof NativePointer) {
            if (type.isByReference) {
                return new Il2Cpp.Reference(value, type);
            }
            switch (type.typeEnum) {
                case Il2Cpp.Type.enum.pointer:
                    return new Il2Cpp.Pointer(value, type.class.baseType);
                case Il2Cpp.Type.enum.string:
                    return new Il2Cpp.String(value);
                case Il2Cpp.Type.enum.class:
                case Il2Cpp.Type.enum.genericInstance:
                case Il2Cpp.Type.enum.object:
                    return new Il2Cpp.Object(value);
                case Il2Cpp.Type.enum.array:
                case Il2Cpp.Type.enum.multidimensionalArray:
                    return new Il2Cpp.Array(value);
                default:
                    return value;
            }
        }
        else if (type.typeEnum == Il2Cpp.Type.enum.boolean) {
            return !!value;
        }
        else {
            return value;
        }
    }
    Il2Cpp.fromFridaValue = fromFridaValue;
    /** @internal */
    function toFridaValue(value) {
        if (typeof value == "boolean") {
            return +value;
        }
        else if (value instanceof Il2Cpp.ValueType) {
            return valueTypeToArray(value);
        }
        else {
            return value;
        }
    }
    Il2Cpp.toFridaValue = toFridaValue;
    /** @internal */
    function valueTypeToArray(value) {
        const instanceFields = value.type.class.fields.filter(_ => !_.isStatic);
        return instanceFields.length == 0
            ? [value.handle.readU8()]
            : instanceFields
                .map(_ => _.withHolder(value).value)
                .map(value => value instanceof Il2Cpp.ValueType
                ? valueTypeToArray(value)
                : value instanceof NativeStruct
                    ? value.handle
                    : typeof value == "boolean"
                        ? +value
                        : value);
    }
    /** @internal */
    function arrayToValueType(type, nativeValues) {
        function iter(type, startOffset = 0) {
            const arr = [];
            for (const field of type.class.fields) {
                if (!field.isStatic) {
                    const offset = startOffset + field.offset - Il2Cpp.Object.headerSize;
                    if (field.type.typeEnum == Il2Cpp.Type.enum.valueType ||
                        (field.type.typeEnum == Il2Cpp.Type.enum.genericInstance && field.type.class.isValueType)) {
                        arr.push(...iter(field.type, offset));
                    }
                    else {
                        arr.push([field.type.typeEnum, offset]);
                    }
                }
            }
            if (arr.length == 0) {
                arr.push([Il2Cpp.Type.enum.unsignedByte, 0]);
            }
            return arr;
        }
        const valueType = Memory.alloc(type.class.valueTypeSize);
        nativeValues = nativeValues.flat(Infinity);
        const typesAndOffsets = iter(type);
        for (let i = 0; i < nativeValues.length; i++) {
            const value = nativeValues[i];
            const [typeEnum, offset] = typesAndOffsets[i];
            const pointer = valueType.add(offset);
            switch (typeEnum) {
                case Il2Cpp.Type.enum.boolean:
                    pointer.writeS8(value);
                    break;
                case Il2Cpp.Type.enum.byte:
                    pointer.writeS8(value);
                    break;
                case Il2Cpp.Type.enum.unsignedByte:
                    pointer.writeU8(value);
                    break;
                case Il2Cpp.Type.enum.short:
                    pointer.writeS16(value);
                    break;
                case Il2Cpp.Type.enum.unsignedShort:
                    pointer.writeU16(value);
                    break;
                case Il2Cpp.Type.enum.int:
                    pointer.writeS32(value);
                    break;
                case Il2Cpp.Type.enum.unsignedInt:
                    pointer.writeU32(value);
                    break;
                case Il2Cpp.Type.enum.char:
                    pointer.writeU16(value);
                    break;
                case Il2Cpp.Type.enum.long:
                    pointer.writeS64(value);
                    break;
                case Il2Cpp.Type.enum.unsignedLong:
                    pointer.writeU64(value);
                    break;
                case Il2Cpp.Type.enum.float:
                    pointer.writeFloat(value);
                    break;
                case Il2Cpp.Type.enum.double:
                    pointer.writeDouble(value);
                    break;
                case Il2Cpp.Type.enum.nativePointer:
                case Il2Cpp.Type.enum.unsignedNativePointer:
                case Il2Cpp.Type.enum.pointer:
                case Il2Cpp.Type.enum.array:
                case Il2Cpp.Type.enum.multidimensionalArray:
                case Il2Cpp.Type.enum.string:
                case Il2Cpp.Type.enum.object:
                case Il2Cpp.Type.enum.class:
                case Il2Cpp.Type.enum.genericInstance:
                    pointer.writePointer(value);
                    break;
                default:
                    warn(`arrayToValueType: defaulting ${typeEnum} to pointer`);
                    pointer.writePointer(value);
                    break;
            }
        }
        return new Il2Cpp.ValueType(valueType, type);
    }
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    getter(Il2Cpp, "moduleName", () => {
        switch (Process.platform) {
            case "linux":
                try {
                    const _ = Java.androidVersion;
                    return "libil2cpp.so";
                }
                catch (e) {
                    return "GameAssembly.so";
                }
            case "windows":
                return "GameAssembly.dll";
            case "darwin":
                try {
                    return "UnityFramework";
                }
                catch (e) {
                    return "GameAssembly.dylib";
                }
        }
        raise(`${Process.platform} is not supported yet`);
    });
    // prettier-ignore
    getter(Il2Cpp, "module", () => {
        return Process.getModuleByName(Il2Cpp.moduleName);
    }, lazy);
    /** @internal Waits for Unity and Il2Cpp native libraries to be loaded and initialized. */
    async function initialize(blocking = false) {
        if (Process.platform == "darwin") {
            Reflect.defineProperty(Il2Cpp, "moduleName", {
                value: DebugSymbol.fromName("il2cpp_init").moduleName ?? (await forModule("UnityFramework", "GameAssembly.dylib"))
            });
        }
        else {
            await forModule(Il2Cpp.moduleName);
        }
        if (Il2Cpp.api.getCorlib().isNull()) {
            return await new Promise(resolve => {
                const interceptor = Interceptor.attach(Il2Cpp.api.initialize, {
                    onLeave() {
                        interceptor.detach();
                        blocking ? resolve(true) : setImmediate(() => resolve(false));
                    }
                });
            });
        }
        return false;
    }
    Il2Cpp.initialize = initialize;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    /** Attaches the caller thread to Il2Cpp domain and executes the given block.  */
    async function perform(block, flag = "bind") {
        try {
            const isInMainThread = await Il2Cpp.initialize(flag == "main");
            if (flag == "main" && !isInMainThread) {
                return perform(() => Il2Cpp.mainThread.schedule(block), "free");
            }
            let thread = Il2Cpp.currentThread;
            const isForeignThread = thread == null;
            thread = Il2Cpp.domain.attach();
            const result = block();
            if (isForeignThread) {
                if (flag == "free") {
                    thread.detach();
                }
                else if (flag == "bind") {
                    Script.bindWeak(globalThis, () => thread.detach());
                }
            }
            return result instanceof Promise ? await result : result;
        }
        catch (error) {
            Script.nextTick(_ => { throw _; }, error); // prettier-ignore
            return Promise.reject(error);
        }
    }
    Il2Cpp.perform = perform;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class Tracer {
        /** @internal */
        #state = {
            depth: 0,
            buffer: [],
            history: new Set(),
            flush: () => {
                if (this.#state.depth == 0) {
                    const message = `\n${this.#state.buffer.join("\n")}\n`;
                    if (this.#verbose) {
                        inform(message);
                    }
                    else {
                        const hash = cyrb53(message);
                        if (!this.#state.history.has(hash)) {
                            this.#state.history.add(hash);
                            inform(message);
                        }
                    }
                    this.#state.buffer.length = 0;
                }
            }
        };
        /** @internal */
        #threadId = Il2Cpp.mainThread.id;
        /** @internal */
        #verbose = false;
        /** @internal */
        #applier;
        /** @internal */
        #targets = [];
        /** @internal */
        #domain;
        /** @internal */
        #assemblies;
        /** @internal */
        #classes;
        /** @internal */
        #methods;
        /** @internal */
        #assemblyFilter;
        /** @internal */
        #classFilter;
        /** @internal */
        #methodFilter;
        /** @internal */
        #parameterFilter;
        constructor(applier) {
            this.#applier = applier;
        }
        /** */
        thread(thread) {
            this.#threadId = thread.id;
            return this;
        }
        /** Determines whether print duplicate logs. */
        verbose(value) {
            this.#verbose = value;
            return this;
        }
        /** Sets the application domain as the place where to find the target methods. */
        domain() {
            this.#domain = Il2Cpp.domain;
            return this;
        }
        /** Sets the passed `assemblies` as the place where to find the target methods. */
        assemblies(...assemblies) {
            this.#assemblies = assemblies;
            return this;
        }
        /** Sets the passed `classes` as the place where to find the target methods. */
        classes(...classes) {
            this.#classes = classes;
            return this;
        }
        /** Sets the passed `methods` as the target methods. */
        methods(...methods) {
            this.#methods = methods;
            return this;
        }
        /** Filters the assemblies where to find the target methods. */
        filterAssemblies(filter) {
            this.#assemblyFilter = filter;
            return this;
        }
        /** Filters the classes where to find the target methods. */
        filterClasses(filter) {
            this.#classFilter = filter;
            return this;
        }
        /** Filters the target methods. */
        filterMethods(filter) {
            this.#methodFilter = filter;
            return this;
        }
        /** Filters the target methods. */
        filterParameters(filter) {
            this.#parameterFilter = filter;
            return this;
        }
        /** Commits the current changes by finding the target methods. */
        and() {
            const filterMethod = (method) => {
                if (this.#parameterFilter == undefined) {
                    this.#targets.push(method);
                    return;
                }
                for (const parameter of method.parameters) {
                    if (this.#parameterFilter(parameter)) {
                        this.#targets.push(method);
                        break;
                    }
                }
            };
            const filterMethods = (values) => {
                for (const method of values) {
                    filterMethod(method);
                }
            };
            const filterClass = (klass) => {
                if (this.#methodFilter == undefined) {
                    filterMethods(klass.methods);
                    return;
                }
                for (const method of klass.methods) {
                    if (this.#methodFilter(method)) {
                        filterMethod(method);
                    }
                }
            };
            const filterClasses = (values) => {
                for (const klass of values) {
                    filterClass(klass);
                }
            };
            const filterAssembly = (assembly) => {
                if (this.#classFilter == undefined) {
                    filterClasses(assembly.image.classes);
                    return;
                }
                for (const klass of assembly.image.classes) {
                    if (this.#classFilter(klass)) {
                        filterClass(klass);
                    }
                }
            };
            const filterAssemblies = (assemblies) => {
                for (const assembly of assemblies) {
                    filterAssembly(assembly);
                }
            };
            const filterDomain = (domain) => {
                if (this.#assemblyFilter == undefined) {
                    filterAssemblies(domain.assemblies);
                    return;
                }
                for (const assembly of domain.assemblies) {
                    if (this.#assemblyFilter(assembly)) {
                        filterAssembly(assembly);
                    }
                }
            };
            this.#methods
                ? filterMethods(this.#methods)
                : this.#classes
                    ? filterClasses(this.#classes)
                    : this.#assemblies
                        ? filterAssemblies(this.#assemblies)
                        : this.#domain
                            ? filterDomain(this.#domain)
                            : undefined;
            this.#assemblies = undefined;
            this.#classes = undefined;
            this.#methods = undefined;
            this.#assemblyFilter = undefined;
            this.#classFilter = undefined;
            this.#methodFilter = undefined;
            this.#parameterFilter = undefined;
            return this;
        }
        /** Starts tracing. */
        attach() {
            for (const target of this.#targets) {
                if (!target.virtualAddress.isNull()) {
                    try {
                        this.#applier(target, this.#state, this.#threadId);
                    }
                    catch (e) {
                        switch (e.message) {
                            case /unable to intercept function at \w+; please file a bug/.exec(e.message)?.input:
                            case "already replaced this function":
                                break;
                            default:
                                throw e;
                        }
                    }
                }
            }
        }
    }
    Il2Cpp.Tracer = Tracer;
    /** */
    function trace(parameters = false) {
        const applier = () => (method, state, threadId) => {
            const paddedVirtualAddress = method.relativeVirtualAddress.toString(16).padStart(8, "0");
            Interceptor.attach(method.virtualAddress, {
                onEnter() {
                    if (this.threadId == threadId) {
                        // prettier-ignore
                        state.buffer.push(`\x1b[2m0x${paddedVirtualAddress}\x1b[0m ${`│ `.repeat(state.depth++)}┌─\x1b[35m${method.class.type.name}::\x1b[1m${method.name}\x1b[0m\x1b[0m`);
                    }
                },
                onLeave() {
                    if (this.threadId == threadId) {
                        // prettier-ignore
                        state.buffer.push(`\x1b[2m0x${paddedVirtualAddress}\x1b[0m ${`│ `.repeat(--state.depth)}└─\x1b[33m${method.class.type.name}::\x1b[1m${method.name}\x1b[0m\x1b[0m`);
                        state.flush();
                    }
                }
            });
        };
        const applierWithParameters = () => (method, state, threadId) => {
            const paddedVirtualAddress = method.relativeVirtualAddress.toString(16).padStart(8, "0");
            const startIndex = +!method.isStatic | +Il2Cpp.unityVersionIsBelow201830;
            const callback = function (...args) {
                if (this.threadId == threadId) {
                    const thisParameter = method.isStatic ? undefined : new Il2Cpp.Parameter("this", -1, method.class.type);
                    const parameters = thisParameter ? [thisParameter].concat(method.parameters) : method.parameters;
                    // prettier-ignore
                    state.buffer.push(`\x1b[2m0x${paddedVirtualAddress}\x1b[0m ${`│ `.repeat(state.depth++)}┌─\x1b[35m${method.class.type.name}::\x1b[1m${method.name}\x1b[0m\x1b[0m(${parameters.map(e => `\x1b[32m${e.name}\x1b[0m = \x1b[31m${Il2Cpp.fromFridaValue(args[e.position + startIndex], e.type)}\x1b[0m`).join(", ")})`);
                }
                const returnValue = method.nativeFunction(...args);
                if (this.threadId == threadId) {
                    // prettier-ignore
                    state.buffer.push(`\x1b[2m0x${paddedVirtualAddress}\x1b[0m ${`│ `.repeat(--state.depth)}└─\x1b[33m${method.class.type.name}::\x1b[1m${method.name}\x1b[0m\x1b[0m${returnValue == undefined ? "" : ` = \x1b[36m${Il2Cpp.fromFridaValue(returnValue, method.returnType)}`}\x1b[0m`);
                    state.flush();
                }
                return returnValue;
            };
            method.revert();
            const nativeCallback = new NativeCallback(callback, method.returnType.fridaAlias, method.fridaSignature);
            Interceptor.replace(method.virtualAddress, nativeCallback);
        };
        return new Il2Cpp.Tracer(parameters ? applierWithParameters() : applier());
    }
    Il2Cpp.trace = trace;
    /** */
    function backtrace(mode) {
        const methods = Il2Cpp.domain.assemblies
            .flatMap(_ => _.image.classes.flatMap(_ => _.methods.filter(_ => !_.virtualAddress.isNull())))
            .sort((_, __) => _.virtualAddress.compare(__.virtualAddress));
        const searchInsert = (target) => {
            let left = 0;
            let right = methods.length - 1;
            while (left <= right) {
                const pivot = Math.floor((left + right) / 2);
                const comparison = methods[pivot].virtualAddress.compare(target);
                if (comparison == 0) {
                    return methods[pivot];
                }
                else if (comparison > 0) {
                    right = pivot - 1;
                }
                else {
                    left = pivot + 1;
                }
            }
            return methods[right];
        };
        const applier = () => (method, state, threadId) => {
            Interceptor.attach(method.virtualAddress, function () {
                if (this.threadId == threadId) {
                    const handles = globalThis.Thread.backtrace(this.context, mode);
                    handles.unshift(method.virtualAddress);
                    for (const handle of handles) {
                        if (handle.compare(Il2Cpp.module.base) > 0 && handle.compare(Il2Cpp.module.base.add(Il2Cpp.module.size)) < 0) {
                            const method = searchInsert(handle);
                            if (method) {
                                const offset = handle.sub(method.virtualAddress);
                                if (offset.compare(0xfff) < 0) {
                                    // prettier-ignore
                                    state.buffer.push(`\x1b[2m0x${method.relativeVirtualAddress.toString(16).padStart(8, "0")}\x1b[0m\x1b[2m+0x${offset.toString(16).padStart(3, `0`)}\x1b[0m ${method.class.type.name}::\x1b[1m${method.name}\x1b[0m`);
                                }
                            }
                        }
                    }
                    state.flush();
                }
            });
        };
        return new Il2Cpp.Tracer(applier());
    }
    Il2Cpp.backtrace = backtrace;
    /** https://stackoverflow.com/a/52171480/16885569 */
    function cyrb53(str) {
        let h1 = 0xdeadbeef;
        let h2 = 0x41c6ce57;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
        h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
        h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    }
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class Array extends NativeStruct {
        /** Gets the Il2CppArray struct size, possibly equal to `Process.pointerSize * 4`. */
        static get headerSize() {
            return Il2Cpp.corlib.class("System.Array").instanceSize;
        }
        /** @internal Gets a pointer to the first element of the current array. */
        get elements() {
            const string = Il2Cpp.string("vfsfitvnm");
            const array = string.object.method("Split", 1).invoke(NULL);
            // prettier-ignore
            const offset = array.handle.offsetOf(_ => _.readPointer().equals(string.handle))
                ?? raise("couldn't find the elements offset in the native array struct");
            // prettier-ignore
            getter(Il2Cpp.Array.prototype, "elements", function () {
                return new Il2Cpp.Pointer(this.handle.add(offset), this.elementType);
            }, lazy);
            return this.elements;
        }
        /** Gets the size of the object encompassed by the current array. */
        get elementSize() {
            return this.elementType.class.arrayElementSize;
        }
        /** Gets the type of the object encompassed by the current array. */
        get elementType() {
            return this.object.class.type.class.baseType;
        }
        /** Gets the total number of elements in all the dimensions of the current array. */
        get length() {
            return Il2Cpp.api.arrayGetLength(this);
        }
        /** Gets the encompassing object of the current array. */
        get object() {
            return new Il2Cpp.Object(this);
        }
        /** Gets the element at the specified index of the current array. */
        get(index) {
            if (index < 0 || index >= this.length) {
                raise(`cannot get element at index ${index} as the array length is ${this.length}`);
            }
            return this.elements.get(index);
        }
        /** Sets the element at the specified index of the current array. */
        set(index, value) {
            if (index < 0 || index >= this.length) {
                raise(`cannot set element at index ${index} as the array length is ${this.length}`);
            }
            this.elements.set(index, value);
        }
        /** */
        toString() {
            return this.isNull() ? "null" : `[${this.elements.read(this.length, 0)}]`;
        }
        /** Iterable. */
        *[Symbol.iterator]() {
            for (let i = 0; i < this.length; i++) {
                yield this.elements.get(i);
            }
        }
    }
    __decorate([
        lazy
    ], Array.prototype, "elementSize", null);
    __decorate([
        lazy
    ], Array.prototype, "elementType", null);
    __decorate([
        lazy
    ], Array.prototype, "length", null);
    __decorate([
        lazy
    ], Array.prototype, "object", null);
    __decorate([
        lazy
    ], Array, "headerSize", null);
    Il2Cpp.Array = Array;
    /** @internal */
    function array(klass, lengthOrElements) {
        const length = typeof lengthOrElements == "number" ? lengthOrElements : lengthOrElements.length;
        const array = new Il2Cpp.Array(Il2Cpp.api.arrayNew(klass, length));
        if (globalThis.Array.isArray(lengthOrElements)) {
            array.elements.write(lengthOrElements);
        }
        return array;
    }
    Il2Cpp.array = array;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    let Assembly = class Assembly extends NativeStruct {
        /** Gets the image of this assembly. */
        get image() {
            let get = function () {
                return new Il2Cpp.Image(Il2Cpp.api.assemblyGetImage(this));
            };
            try {
                Il2Cpp.api.assemblyGetImage;
            }
            catch (_) {
                get = function () {
                    // We need to get the System.Reflection.Module of the current assembly;
                    // System.Reflection.Assembly::GetModulesInternal, for some reason,
                    // throws a NullReferenceExceptionin Unity 5.3.8f1, so we must rely on
                    // System.Type::get_Module instead.
                    // Now we need to get any System.Type of this assembly.
                    // We cannot use System.Reflection.Assembly::GetTypes because it may
                    // return an empty array; hence we use System.Reflection.Assembly::GetType
                    // to retrieve <Module>, a class/type that seems to be always present
                    // (despite being excluded from System.Reflection.Assembly::GetTypes).
                    return new Il2Cpp.Image(this.object
                        .method("GetType", 1)
                        .invoke(Il2Cpp.string("<Module>"))
                        .method("get_Module")
                        .invoke()
                        .field("_impl").value);
                };
            }
            getter(Il2Cpp.Assembly.prototype, "image", get, lazy);
            return this.image;
        }
        /** Gets the name of this assembly. */
        get name() {
            return this.image.name.replace(".dll", "");
        }
        /** Gets the encompassing object of the current assembly. */
        get object() {
            for (const _ of Il2Cpp.domain.object.method("GetAssemblies", 1).invoke(false)) {
                if (_.field("_mono_assembly").value.equals(this)) {
                    return _;
                }
            }
            raise("couldn't find the object of the native assembly struct");
        }
    };
    __decorate([
        lazy
    ], Assembly.prototype, "name", null);
    __decorate([
        lazy
    ], Assembly.prototype, "object", null);
    Assembly = __decorate([
        recycle
    ], Assembly);
    Il2Cpp.Assembly = Assembly;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    let Class = class Class extends NativeStruct {
        /** Gets the actual size of the instance of the current class. */
        get actualInstanceSize() {
            const SystemString = Il2Cpp.corlib.class("System.String");
            // prettier-ignore
            const offset = SystemString.handle.offsetOf(_ => _.readInt() == SystemString.instanceSize - 2)
                ?? raise("couldn't find the actual instance size offset in the native class struct");
            // prettier-ignore
            getter(Il2Cpp.Class.prototype, "actualInstanceSize", function () {
                return this.handle.add(offset).readS32();
            }, lazy);
            return this.actualInstanceSize;
        }
        /** Gets the array class which encompass the current class. */
        get arrayClass() {
            return new Il2Cpp.Class(Il2Cpp.api.classGetArrayClass(this, 1));
        }
        /** Gets the size of the object encompassed by the current array class. */
        get arrayElementSize() {
            return Il2Cpp.api.classGetArrayElementSize(this);
        }
        /** Gets the name of the assembly in which the current class is defined. */
        get assemblyName() {
            return Il2Cpp.api.classGetAssemblyName(this).readUtf8String();
        }
        /** Gets the class that declares the current nested class. */
        get declaringClass() {
            return new Il2Cpp.Class(Il2Cpp.api.classGetDeclaringType(this)).asNullable();
        }
        /** Gets the encompassed type of this array, reference, pointer or enum type. */
        get baseType() {
            return new Il2Cpp.Type(Il2Cpp.api.classGetBaseType(this)).asNullable();
        }
        /** Gets the class of the object encompassed or referred to by the current array, pointer or reference class. */
        get elementClass() {
            return new Il2Cpp.Class(Il2Cpp.api.classGetElementClass(this)).asNullable();
        }
        /** Gets the fields of the current class. */
        get fields() {
            return readNativeIterator(_ => Il2Cpp.api.classGetFields(this, _)).map(_ => new Il2Cpp.Field(_));
        }
        /** Gets the flags of the current class. */
        get flags() {
            return Il2Cpp.api.classGetFlags(this);
        }
        /** Gets the full name (namespace + name) of the current class. */
        get fullName() {
            return this.namespace ? `${this.namespace}.${this.name}` : this.name;
        }
        /** Gets the generics parameters of this generic class. */
        get generics() {
            if (!this.isGeneric && !this.isInflated) {
                return [];
            }
            const types = this.type.object.method("GetGenericArguments").invoke();
            return globalThis.Array.from(types).map(_ => new Il2Cpp.Class(Il2Cpp.api.classFromObject(_)));
        }
        /** Determines whether the GC has tracking references to the current class instances. */
        get hasReferences() {
            return !!Il2Cpp.api.classHasReferences(this);
        }
        /** Determines whether ther current class has a valid static constructor. */
        get hasStaticConstructor() {
            const staticConstructor = this.tryMethod(".cctor");
            return staticConstructor != null && !staticConstructor.virtualAddress.isNull();
        }
        /** Gets the image in which the current class is defined. */
        get image() {
            return new Il2Cpp.Image(Il2Cpp.api.classGetImage(this));
        }
        /** Gets the size of the instance of the current class. */
        get instanceSize() {
            return Il2Cpp.api.classGetInstanceSize(this);
        }
        /** Determines whether the current class is abstract. */
        get isAbstract() {
            return !!Il2Cpp.api.classIsAbstract(this);
        }
        /** Determines whether the current class is blittable. */
        get isBlittable() {
            return !!Il2Cpp.api.classIsBlittable(this);
        }
        /** Determines whether the current class is an enumeration. */
        get isEnum() {
            return !!Il2Cpp.api.classIsEnum(this);
        }
        /** Determines whether the current class is a generic one. */
        get isGeneric() {
            return !!Il2Cpp.api.classIsGeneric(this);
        }
        /** Determines whether the current class is inflated. */
        get isInflated() {
            return !!Il2Cpp.api.classIsInflated(this);
        }
        /** Determines whether the current class is an interface. */
        get isInterface() {
            return !!Il2Cpp.api.classIsInterface(this);
        }
        /** Determines whether the current class is a value type. */
        get isValueType() {
            return !!Il2Cpp.api.classIsValueType(this);
        }
        /** Gets the interfaces implemented or inherited by the current class. */
        get interfaces() {
            return readNativeIterator(_ => Il2Cpp.api.classGetInterfaces(this, _)).map(_ => new Il2Cpp.Class(_));
        }
        /** Gets the methods implemented by the current class. */
        get methods() {
            return readNativeIterator(_ => Il2Cpp.api.classGetMethods(this, _)).map(_ => new Il2Cpp.Method(_));
        }
        /** Gets the name of the current class. */
        get name() {
            return Il2Cpp.api.classGetName(this).readUtf8String();
        }
        /** Gets the namespace of the current class. */
        get namespace() {
            return Il2Cpp.api.classGetNamespace(this).readUtf8String();
        }
        /** Gets the classes nested inside the current class. */
        get nestedClasses() {
            return readNativeIterator(_ => Il2Cpp.api.classGetNestedClasses(this, _)).map(_ => new Il2Cpp.Class(_));
        }
        /** Gets the class from which the current class directly inherits. */
        get parent() {
            return new Il2Cpp.Class(Il2Cpp.api.classGetParent(this)).asNullable();
        }
        /** Gets the rank (number of dimensions) of the current array class. */
        get rank() {
            let rank = 0;
            const name = this.name;
            for (let i = this.name.length - 1; i > 0; i--) {
                const c = name[i];
                if (c == "]")
                    rank++;
                else if (c == "[" || rank == 0)
                    break;
                else if (c == ",")
                    rank++;
                else
                    break;
            }
            return rank;
        }
        /** Gets a pointer to the static fields of the current class. */
        get staticFieldsData() {
            return Il2Cpp.api.classGetStaticFieldData(this);
        }
        /** Gets the size of the instance - as a value type - of the current class. */
        get valueTypeSize() {
            return Il2Cpp.api.classGetValueTypeSize(this, NULL);
        }
        /** Gets the type of the current class. */
        get type() {
            return new Il2Cpp.Type(Il2Cpp.api.classGetType(this));
        }
        /** Allocates a new object of the current class. */
        alloc() {
            return new Il2Cpp.Object(Il2Cpp.api.objectNew(this));
        }
        /** Gets the field identified by the given name. */
        field(name) {
            return this.tryField(name) ?? raise(`couldn't find field ${name} in class ${this.type.name}`);
        }
        /** Builds a generic instance of the current generic class. */
        inflate(...classes) {
            if (!this.isGeneric) {
                raise(`cannot inflate class ${this.type.name} as it has no generic parameters`);
            }
            if (this.generics.length != classes.length) {
                raise(`cannot inflate class ${this.type.name} as it needs ${this.generics.length} generic parameter(s), not ${classes.length}`);
            }
            const types = classes.map(_ => _.type.object);
            const typeArray = Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), types);
            const inflatedType = this.type.object.method("MakeGenericType", 1).invoke(typeArray);
            return new Il2Cpp.Class(Il2Cpp.api.classFromObject(inflatedType));
        }
        /** Calls the static constructor of the current class. */
        initialize() {
            Il2Cpp.api.classInitialize(this);
            return this;
        }
        /** Determines whether an instance of `other` class can be assigned to a variable of the current type. */
        isAssignableFrom(other) {
            return !!Il2Cpp.api.classIsAssignableFrom(this, other);
        }
        /** Determines whether the current class derives from `other` class. */
        isSubclassOf(other, checkInterfaces) {
            return !!Il2Cpp.api.classIsSubclassOf(this, other, +checkInterfaces);
        }
        /** Gets the method identified by the given name and parameter count. */
        method(name, parameterCount = -1) {
            return this.tryMethod(name, parameterCount) ?? raise(`couldn't find method ${name} in class ${this.type.name}`);
        }
        /** Gets the nested class with the given name. */
        nested(name) {
            return this.tryNested(name) ?? raise(`couldn't find nested class ${name} in class ${this.type.name}`);
        }
        /** Allocates a new object of the current class and calls its default constructor. */
        new() {
            const object = this.alloc();
            const exceptionArray = Memory.alloc(Process.pointerSize);
            Il2Cpp.api.objectInitialize(object, exceptionArray);
            const exception = exceptionArray.readPointer();
            if (!exception.isNull()) {
                raise(new Il2Cpp.Object(exception).toString());
            }
            return object;
        }
        /** Gets the field with the given name. */
        tryField(name) {
            return new Il2Cpp.Field(Il2Cpp.api.classGetFieldFromName(this, Memory.allocUtf8String(name))).asNullable();
        }
        /** Gets the method with the given name and parameter count. */
        tryMethod(name, parameterCount = -1) {
            return new Il2Cpp.Method(Il2Cpp.api.classGetMethodFromName(this, Memory.allocUtf8String(name), parameterCount)).asNullable();
        }
        /** Gets the nested class with the given name. */
        tryNested(name) {
            return this.nestedClasses.find(_ => _.name == name);
        }
        /** */
        toString() {
            const inherited = [this.parent].concat(this.interfaces);
            return `\
// ${this.assemblyName}
${this.isEnum ? `enum` : this.isValueType ? `struct` : this.isInterface ? `interface` : `class`} \
${this.type.name}\
${inherited ? ` : ${inherited.map(_ => _?.type.name).join(`, `)}` : ``}
{
    ${this.fields.join(`\n    `)}
    ${this.methods.join(`\n    `)}
}`;
        }
        /** Executes a callback for every defined class. */
        static enumerate(block) {
            const callback = new NativeCallback(_ => block(new Il2Cpp.Class(_)), "void", ["pointer", "pointer"]);
            return Il2Cpp.api.classForEach(callback, NULL);
        }
    };
    __decorate([
        lazy
    ], Class.prototype, "arrayClass", null);
    __decorate([
        lazy
    ], Class.prototype, "arrayElementSize", null);
    __decorate([
        lazy
    ], Class.prototype, "assemblyName", null);
    __decorate([
        lazy
    ], Class.prototype, "declaringClass", null);
    __decorate([
        lazy
    ], Class.prototype, "baseType", null);
    __decorate([
        lazy
    ], Class.prototype, "elementClass", null);
    __decorate([
        lazy
    ], Class.prototype, "fields", null);
    __decorate([
        lazy
    ], Class.prototype, "flags", null);
    __decorate([
        lazy
    ], Class.prototype, "fullName", null);
    __decorate([
        lazy
    ], Class.prototype, "generics", null);
    __decorate([
        lazy
    ], Class.prototype, "hasReferences", null);
    __decorate([
        lazy
    ], Class.prototype, "hasStaticConstructor", null);
    __decorate([
        lazy
    ], Class.prototype, "image", null);
    __decorate([
        lazy
    ], Class.prototype, "instanceSize", null);
    __decorate([
        lazy
    ], Class.prototype, "isAbstract", null);
    __decorate([
        lazy
    ], Class.prototype, "isBlittable", null);
    __decorate([
        lazy
    ], Class.prototype, "isEnum", null);
    __decorate([
        lazy
    ], Class.prototype, "isGeneric", null);
    __decorate([
        lazy
    ], Class.prototype, "isInflated", null);
    __decorate([
        lazy
    ], Class.prototype, "isInterface", null);
    __decorate([
        lazy
    ], Class.prototype, "isValueType", null);
    __decorate([
        lazy
    ], Class.prototype, "interfaces", null);
    __decorate([
        lazy
    ], Class.prototype, "methods", null);
    __decorate([
        lazy
    ], Class.prototype, "name", null);
    __decorate([
        lazy
    ], Class.prototype, "namespace", null);
    __decorate([
        lazy
    ], Class.prototype, "nestedClasses", null);
    __decorate([
        lazy
    ], Class.prototype, "parent", null);
    __decorate([
        lazy
    ], Class.prototype, "rank", null);
    __decorate([
        lazy
    ], Class.prototype, "staticFieldsData", null);
    __decorate([
        lazy
    ], Class.prototype, "valueTypeSize", null);
    __decorate([
        lazy
    ], Class.prototype, "type", null);
    Class = __decorate([
        recycle
    ], Class);
    Il2Cpp.Class = Class;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    /** Creates a delegate object of the given delegate class. */
    function delegate(klass, block) {
        const SystemDelegate = Il2Cpp.corlib.class("System.Delegate");
        const SystemMulticastDelegate = Il2Cpp.corlib.class("System.MulticastDelegate");
        if (!SystemDelegate.isAssignableFrom(klass)) {
            raise(`cannot create a delegate for ${klass.type.name} as it's a non-delegate class`);
        }
        if (klass.equals(SystemDelegate) || klass.equals(SystemMulticastDelegate)) {
            raise(`cannot create a delegate for neither ${SystemDelegate.type.name} nor ${SystemMulticastDelegate.type.name}, use a subclass instead`);
        }
        const delegate = klass.alloc();
        const key = delegate.handle.toString();
        const Invoke = delegate.tryMethod("Invoke") ?? raise(`cannot create a delegate for ${klass.type.name}, there is no Invoke method`);
        delegate.method(".ctor").invoke(delegate, Invoke.handle);
        const callback = Invoke.wrap(block);
        delegate.field("method_ptr").value = callback;
        delegate.field("invoke_impl").value = callback;
        Il2Cpp._callbacksToKeepAlive[key] = callback;
        return delegate;
    }
    Il2Cpp.delegate = delegate;
    /** @internal Used to prevent eager garbage collection against NativeCallbacks. */
    Il2Cpp._callbacksToKeepAlive = {};
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    let Domain = class Domain extends NativeStruct {
        /** Gets the assemblies that have been loaded into the execution context of the application domain. */
        get assemblies() {
            let handles = readNativeList(_ => Il2Cpp.api.domainGetAssemblies(this, _));
            if (handles.length == 0) {
                const assemblyObjects = this.object.method("GetAssemblies").overload().invoke();
                handles = globalThis.Array.from(assemblyObjects).map(_ => _.field("_mono_assembly").value);
            }
            return handles.map(_ => new Il2Cpp.Assembly(_));
        }
        /** Gets the encompassing object of the application domain. */
        get object() {
            return Il2Cpp.corlib.class("System.AppDomain").method("get_CurrentDomain").invoke();
        }
        /** Opens and loads the assembly with the given name. */
        assembly(name) {
            return this.tryAssembly(name) ?? raise(`couldn't find assembly ${name}`);
        }
        /** Attached a new thread to the application domain. */
        attach() {
            return new Il2Cpp.Thread(Il2Cpp.api.threadAttach(this));
        }
        /** Opens and loads the assembly with the given name. */
        tryAssembly(name) {
            return new Il2Cpp.Assembly(Il2Cpp.api.domainGetAssemblyFromName(this, Memory.allocUtf8String(name))).asNullable();
        }
    };
    __decorate([
        lazy
    ], Domain.prototype, "assemblies", null);
    __decorate([
        lazy
    ], Domain.prototype, "object", null);
    Domain = __decorate([
        recycle
    ], Domain);
    Il2Cpp.Domain = Domain;
    // prettier-ignore
    getter(Il2Cpp, "domain", () => {
        return new Il2Cpp.Domain(Il2Cpp.api.domainGet());
    }, lazy);
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class Field extends NativeStruct {
        /** Gets the class in which this field is defined. */
        get class() {
            return new Il2Cpp.Class(Il2Cpp.api.fieldGetClass(this));
        }
        /** Gets the flags of the current field. */
        get flags() {
            return Il2Cpp.api.fieldGetFlags(this);
        }
        /** Determines whether this field value is known at compile time. */
        get isLiteral() {
            return (this.flags & 64 /* Il2Cpp.Field.Attributes.Literal */) != 0;
        }
        /** Determines whether this field is static. */
        get isStatic() {
            return (this.flags & 16 /* Il2Cpp.Field.Attributes.Static */) != 0;
        }
        /** Determines whether this field is thread static. */
        get isThreadStatic() {
            const offset = Il2Cpp.corlib.class("System.AppDomain").field("type_resolve_in_progress").offset;
            // prettier-ignore
            getter(Il2Cpp.Field.prototype, "isThreadStatic", function () {
                return this.offset == offset;
            }, lazy);
            return this.isThreadStatic;
        }
        /** Gets the access modifier of this field. */
        get modifier() {
            switch (this.flags & 7 /* Il2Cpp.Field.Attributes.FieldAccessMask */) {
                case 1 /* Il2Cpp.Field.Attributes.Private */:
                    return "private";
                case 2 /* Il2Cpp.Field.Attributes.FamilyAndAssembly */:
                    return "private protected";
                case 3 /* Il2Cpp.Field.Attributes.Assembly */:
                    return "internal";
                case 4 /* Il2Cpp.Field.Attributes.Family */:
                    return "protected";
                case 5 /* Il2Cpp.Field.Attributes.FamilyOrAssembly */:
                    return "protected internal";
                case 6 /* Il2Cpp.Field.Attributes.Public */:
                    return "public";
            }
        }
        /** Gets the name of this field. */
        get name() {
            return Il2Cpp.api.fieldGetName(this).readUtf8String();
        }
        /** Gets the offset of this field, calculated as the difference with its owner virtual address. */
        get offset() {
            return Il2Cpp.api.fieldGetOffset(this);
        }
        /** Gets the type of this field. */
        get type() {
            return new Il2Cpp.Type(Il2Cpp.api.fieldGetType(this));
        }
        /** Gets the value of this field. */
        get value() {
            if (!this.isStatic) {
                raise(`cannot access instance field ${this.class.type.name}::${this.name} from a class, use an object instead`);
            }
            const handle = Memory.alloc(Process.pointerSize);
            Il2Cpp.api.fieldGetStaticValue(this.handle, handle);
            return Il2Cpp.read(handle, this.type);
        }
        /** Sets the value of this field. Thread static or literal values cannot be altered yet. */
        set value(value) {
            if (!this.isStatic) {
                raise(`cannot access instance field ${this.class.type.name}::${this.name} from a class, use an object instead`);
            }
            if (this.isThreadStatic || this.isLiteral) {
                raise(`cannot write the value of field ${this.name} as it's thread static or literal`);
            }
            const handle = Memory.alloc(Process.pointerSize);
            Il2Cpp.write(handle, value, this.type);
            Il2Cpp.api.fieldSetStaticValue(this.handle, handle);
        }
        /** */
        toString() {
            return `\
${this.isThreadStatic ? `[ThreadStatic] ` : ``}\
${this.isStatic ? `static ` : ``}\
${this.type.name} \
${this.name}\
${this.isLiteral ? ` = ${this.type.class.isEnum ? Il2Cpp.read(this.value.handle, this.type.class.baseType) : this.value}` : ``};\
${this.isThreadStatic || this.isLiteral ? `` : ` // 0x${this.offset.toString(16)}`}`;
        }
        /** @internal */
        withHolder(instance) {
            if (this.isStatic) {
                raise(`cannot access static field ${this.class.type.name}::${this.name} from an object, use a class instead`);
            }
            let valueHandle = instance.handle.add(this.offset);
            if (instance instanceof Il2Cpp.ValueType) {
                valueHandle = valueHandle.sub(Il2Cpp.Object.headerSize);
            }
            return new Proxy(this, {
                get(target, property) {
                    if (property == "value") {
                        return Il2Cpp.read(valueHandle, target.type);
                    }
                    return Reflect.get(target, property);
                },
                set(target, property, value) {
                    if (property == "value") {
                        Il2Cpp.write(valueHandle, value, target.type);
                        return true;
                    }
                    return Reflect.set(target, property, value);
                }
            });
        }
    }
    __decorate([
        lazy
    ], Field.prototype, "class", null);
    __decorate([
        lazy
    ], Field.prototype, "flags", null);
    __decorate([
        lazy
    ], Field.prototype, "isLiteral", null);
    __decorate([
        lazy
    ], Field.prototype, "isStatic", null);
    __decorate([
        lazy
    ], Field.prototype, "isThreadStatic", null);
    __decorate([
        lazy
    ], Field.prototype, "modifier", null);
    __decorate([
        lazy
    ], Field.prototype, "name", null);
    __decorate([
        lazy
    ], Field.prototype, "offset", null);
    __decorate([
        lazy
    ], Field.prototype, "type", null);
    Il2Cpp.Field = Field;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class GCHandle {
        handle;
        /** @internal */
        constructor(handle) {
            this.handle = handle;
        }
        /** Gets the object associated to this handle. */
        get target() {
            return new Il2Cpp.Object(Il2Cpp.api.gcHandleGetTarget(this.handle)).asNullable();
        }
        /** Frees this handle. */
        free() {
            return Il2Cpp.api.gcHandleFree(this.handle);
        }
    }
    Il2Cpp.GCHandle = GCHandle;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    let Image = class Image extends NativeStruct {
        /** Gets the assembly in which the current image is defined. */
        get assembly() {
            return new Il2Cpp.Assembly(Il2Cpp.api.imageGetAssembly(this));
        }
        /** Gets the amount of classes defined in this image. */
        get classCount() {
            return Il2Cpp.api.imageGetClassCount(this);
        }
        /** Gets the classes defined in this image. */
        get classes() {
            if (Il2Cpp.unityVersionIsBelow201830) {
                const types = this.assembly.object.method("GetTypes").invoke(false);
                // In Unity 5.3.8f1, getting System.Reflection.Emit.OpCodes type name
                // without iterating all the classes first somehow blows things up at
                // app startup, hence the `Array.from`.
                return globalThis.Array.from(types).map(_ => new Il2Cpp.Class(Il2Cpp.api.classFromObject(_)));
            }
            else {
                return globalThis.Array.from(globalThis.Array(this.classCount), (_, i) => new Il2Cpp.Class(Il2Cpp.api.imageGetClass(this, i)));
            }
        }
        /** Gets the name of this image. */
        get name() {
            return Il2Cpp.api.imageGetName(this).readUtf8String();
        }
        /** Gets the class with the specified name defined in this image. */
        class(name) {
            return this.tryClass(name) ?? raise(`couldn't find class ${name} in assembly ${this.name}`);
        }
        /** Gets the class with the specified name defined in this image. */
        tryClass(name) {
            const dotIndex = name.lastIndexOf(".");
            const classNamespace = Memory.allocUtf8String(dotIndex == -1 ? "" : name.slice(0, dotIndex));
            const className = Memory.allocUtf8String(name.slice(dotIndex + 1));
            return new Il2Cpp.Class(Il2Cpp.api.classFromName(this, classNamespace, className)).asNullable();
        }
    };
    __decorate([
        lazy
    ], Image.prototype, "assembly", null);
    __decorate([
        lazy
    ], Image.prototype, "classCount", null);
    __decorate([
        lazy
    ], Image.prototype, "classes", null);
    __decorate([
        lazy
    ], Image.prototype, "name", null);
    Image = __decorate([
        recycle
    ], Image);
    Il2Cpp.Image = Image;
    // prettier-ignore
    getter(Il2Cpp, "corlib", () => {
        return new Il2Cpp.Image(Il2Cpp.api.getCorlib());
    }, lazy);
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class MemorySnapshot extends NativeStruct {
        /** Captures a memory snapshot. */
        static capture() {
            return new Il2Cpp.MemorySnapshot();
        }
        /** Creates a memory snapshot with the given handle. */
        constructor(handle = Il2Cpp.api.memorySnapshotCapture()) {
            super(handle);
        }
        /** Gets any initialized class. */
        get classes() {
            return readNativeIterator(_ => Il2Cpp.api.memorySnapshotGetClasses(this, _)).map(_ => new Il2Cpp.Class(_));
        }
        /** Gets the objects tracked by this memory snapshot. */
        get objects() {
            // prettier-ignore
            return readNativeList(_ => Il2Cpp.api.memorySnapshotGetObjects(this, _)).filter(_ => !_.isNull()).map(_ => new Il2Cpp.Object(_));
        }
        /** Frees this memory snapshot. */
        free() {
            Il2Cpp.api.memorySnapshotFree(this);
        }
    }
    __decorate([
        lazy
    ], MemorySnapshot.prototype, "classes", null);
    __decorate([
        lazy
    ], MemorySnapshot.prototype, "objects", null);
    Il2Cpp.MemorySnapshot = MemorySnapshot;
    /** */
    function memorySnapshot(block) {
        const memorySnapshot = Il2Cpp.MemorySnapshot.capture();
        const result = block(memorySnapshot);
        memorySnapshot.free();
        return result;
    }
    Il2Cpp.memorySnapshot = memorySnapshot;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class Method extends NativeStruct {
        /** Gets the class in which this method is defined. */
        get class() {
            return new Il2Cpp.Class(Il2Cpp.api.methodGetClass(this));
        }
        /** Gets the flags of the current method. */
        get flags() {
            return Il2Cpp.api.methodGetFlags(this, NULL);
        }
        /** Gets the implementation flags of the current method. */
        get implementationFlags() {
            const implementationFlagsPointer = Memory.alloc(Process.pointerSize);
            Il2Cpp.api.methodGetFlags(this, implementationFlagsPointer);
            return implementationFlagsPointer.readU32();
        }
        /** */
        get fridaSignature() {
            const types = [];
            for (const parameter of this.parameters) {
                types.push(parameter.type.fridaAlias);
            }
            if (!this.isStatic || Il2Cpp.unityVersionIsBelow201830) {
                types.unshift("pointer");
            }
            if (this.isInflated) {
                types.push("pointer");
            }
            return types;
        }
        /** Gets the generic parameters of this generic method. */
        get generics() {
            if (!this.isGeneric && !this.isInflated) {
                return [];
            }
            const types = this.object.method("GetGenericArguments").invoke();
            return globalThis.Array.from(types).map(_ => new Il2Cpp.Class(Il2Cpp.api.classFromObject(_)));
        }
        /** Determines whether this method is external. */
        get isExternal() {
            return (this.implementationFlags & 4096 /* Il2Cpp.Method.ImplementationAttribute.InternalCall */) != 0;
        }
        /** Determines whether this method is generic. */
        get isGeneric() {
            return !!Il2Cpp.api.methodIsGeneric(this);
        }
        /** Determines whether this method is inflated (generic with a concrete type parameter). */
        get isInflated() {
            return !!Il2Cpp.api.methodIsInflated(this);
        }
        /** Determines whether this method is static. */
        get isStatic() {
            return !Il2Cpp.api.methodIsInstance(this);
        }
        /** Determines whether this method is synchronized. */
        get isSynchronized() {
            return (this.implementationFlags & 32 /* Il2Cpp.Method.ImplementationAttribute.Synchronized */) != 0;
        }
        /** Gets the access modifier of this method. */
        get modifier() {
            switch (this.flags & 7 /* Il2Cpp.Method.Attributes.MemberAccessMask */) {
                case 1 /* Il2Cpp.Method.Attributes.Private */:
                    return "private";
                case 2 /* Il2Cpp.Method.Attributes.FamilyAndAssembly */:
                    return "private protected";
                case 3 /* Il2Cpp.Method.Attributes.Assembly */:
                    return "internal";
                case 4 /* Il2Cpp.Method.Attributes.Family */:
                    return "protected";
                case 5 /* Il2Cpp.Method.Attributes.FamilyOrAssembly */:
                    return "protected internal";
                case 6 /* Il2Cpp.Method.Attributes.Public */:
                    return "public";
            }
        }
        /** Gets the name of this method. */
        get name() {
            return Il2Cpp.api.methodGetName(this).readUtf8String();
        }
        /** @internal */
        get nativeFunction() {
            return new NativeFunction(this.virtualAddress, this.returnType.fridaAlias, this.fridaSignature);
        }
        /** Gets the encompassing object of the current method. */
        get object() {
            return new Il2Cpp.Object(Il2Cpp.api.methodGetObject(this, NULL));
        }
        /** Gets the amount of parameters of this method. */
        get parameterCount() {
            return Il2Cpp.api.methodGetParameterCount(this);
        }
        /** Gets the parameters of this method. */
        get parameters() {
            return globalThis.Array.from(globalThis.Array(this.parameterCount), (_, i) => {
                const parameterName = Il2Cpp.api.methodGetParameterName(this, i).readUtf8String();
                const parameterType = Il2Cpp.api.methodGetParameterType(this, i);
                return new Il2Cpp.Parameter(parameterName, i, new Il2Cpp.Type(parameterType));
            });
        }
        /** Gets the relative virtual address (RVA) of this method. */
        get relativeVirtualAddress() {
            return this.virtualAddress.sub(Il2Cpp.module.base);
        }
        /** Gets the return type of this method. */
        get returnType() {
            return new Il2Cpp.Type(Il2Cpp.api.methodGetReturnType(this));
        }
        /** Gets the virtual address (VA) to this method. */
        get virtualAddress() {
            const FilterTypeName = Il2Cpp.corlib.class("System.Reflection.Module").initialize().field("FilterTypeName").value;
            const FilterTypeNameMethodPointer = FilterTypeName.field("method_ptr").value;
            const FilterTypeNameMethod = FilterTypeName.field("method").value;
            // prettier-ignore
            const offset = FilterTypeNameMethod.offsetOf(_ => _.readPointer().equals(FilterTypeNameMethodPointer))
                ?? raise("couldn't find the virtual address offset in the native method struct");
            // prettier-ignore
            getter(Il2Cpp.Method.prototype, "virtualAddress", function () {
                return this.handle.add(offset).readPointer();
            }, lazy);
            // In Unity 2017.4.40f1 (don't know about others), Il2Cpp.Class::initialize
            // somehow triggers a nasty bug during early instrumentation, so that we aren't
            // able to obtain the offset to get the virtual address of a method when the script
            // is reloaded.
            // A workaround consists in manually re-invoking the static constructor.
            Il2Cpp.corlib.class("System.Reflection.Module").method(".cctor").invoke();
            return this.virtualAddress;
        }
        /** Replaces the body of this method. */
        set implementation(block) {
            try {
                Interceptor.replace(this.virtualAddress, this.wrap(block));
            }
            catch (e) {
                switch (e.message) {
                    case "access violation accessing 0x0":
                        raise(`couldn't set implementation for method ${this.name} as it has a NULL virtual address`);
                    case /unable to intercept function at \w+; please file a bug/.exec(e.message)?.input:
                        warn(`couldn't set implementation for method ${this.name} as it may be a thunk`);
                        break;
                    case "already replaced this function":
                        warn(`couldn't set implementation for method ${this.name} as it has already been replaced by a thunk`);
                        break;
                    default:
                        throw e;
                }
            }
        }
        /** Creates a generic instance of the current generic method. */
        inflate(...classes) {
            if (!this.isGeneric) {
                raise(`cannot inflate method ${this.name} as it has no generic parameters`);
            }
            if (this.generics.length != classes.length) {
                raise(`cannot inflate method ${this.name} as it needs ${this.generics.length} generic parameter(s), not ${classes.length}`);
            }
            const types = classes.map(_ => _.type.object);
            const typeArray = Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), types);
            const inflatedMethodObject = this.object.method("MakeGenericMethod", 1).invoke(typeArray);
            return new Il2Cpp.Method(inflatedMethodObject.field("mhandle").value);
        }
        /** Invokes this method. */
        invoke(...parameters) {
            if (!this.isStatic) {
                raise(`cannot invoke non-static method ${this.name} as it must be invoked throught a Il2Cpp.Object, not a Il2Cpp.Class`);
            }
            return this.invokeRaw(NULL, ...parameters);
        }
        /** @internal */
        invokeRaw(instance, ...parameters) {
            const allocatedParameters = parameters.map(Il2Cpp.toFridaValue);
            if (!this.isStatic || Il2Cpp.unityVersionIsBelow201830) {
                allocatedParameters.unshift(instance);
            }
            if (this.isInflated) {
                allocatedParameters.push(this.handle);
            }
            try {
                const returnValue = this.nativeFunction(...allocatedParameters);
                return Il2Cpp.fromFridaValue(returnValue, this.returnType);
            }
            catch (e) {
                if (e == null) {
                    raise("an unexpected native invocation exception occurred, this is due to parameter types mismatch");
                }
                switch (e.message) {
                    case "bad argument count":
                        raise(`couldn't invoke method ${this.name} as it needs ${this.parameterCount} parameter(s), not ${parameters.length}`);
                    case "expected a pointer":
                    case "expected number":
                    case "expected array with fields":
                        raise(`couldn't invoke method ${this.name} using incorrect parameter types`);
                }
                throw e;
            }
        }
        /** Gets the overloaded method with the given parameter types. */
        overload(...parameterTypes) {
            const result = this.tryOverload(...parameterTypes);
            if (result != undefined)
                return result;
            raise(`couldn't find overloaded method ${this.name}(${parameterTypes})`);
        }
        /** Gets the parameter with the given name. */
        parameter(name) {
            return this.tryParameter(name) ?? raise(`couldn't find parameter ${name} in method ${this.name}`);
        }
        /** Restore the original method implementation. */
        revert() {
            Interceptor.revert(this.virtualAddress);
            Interceptor.flush();
        }
        /** Gets the overloaded method with the given parameter types. */
        tryOverload(...parameterTypes) {
            return this.class.methods.find(method => {
                return (method.name == this.name &&
                    method.parameterCount == parameterTypes.length &&
                    method.parameters.every((e, i) => e.type.name == parameterTypes[i]));
            });
        }
        /** Gets the parameter with the given name. */
        tryParameter(name) {
            return this.parameters.find(_ => _.name == name);
        }
        /** */
        toString() {
            return `\
${this.isStatic ? `static ` : ``}\
${this.returnType.name} \
${this.name}\
(${this.parameters.join(`, `)});\
${this.virtualAddress.isNull() ? `` : ` // 0x${this.relativeVirtualAddress.toString(16).padStart(8, `0`)}`}`;
        }
        /** @internal */
        withHolder(instance) {
            if (this.isStatic) {
                raise(`cannot access static method ${this.class.type.name}::${this.name} from an object, use a class instead`);
            }
            return new Proxy(this, {
                get(target, property) {
                    switch (property) {
                        case "invoke":
                            let instanceHandle = instance.handle;
                            if (!Il2Cpp.unityVersionIsBelow202120 && instance.class.isValueType && !instance.class.isEnum) {
                                instanceHandle = instanceHandle.add(Il2Cpp.Object.headerSize);
                            }
                            return target.invokeRaw.bind(target, instanceHandle);
                        case "inflate":
                        case "overload":
                        case "tryOverload":
                            return function (...args) {
                                return target[property](...args)?.withHolder(instance);
                            };
                    }
                    return Reflect.get(target, property);
                }
            });
        }
        /** @internal */
        wrap(block) {
            const startIndex = +!this.isStatic | +Il2Cpp.unityVersionIsBelow201830;
            // prettier-ignore
            return new NativeCallback((...args) => {
                const thisObject = this.isStatic ? this.class : new Il2Cpp.Object(args[0]);
                const parameters = this.parameters.map((e, i) => Il2Cpp.fromFridaValue(args[i + startIndex], e.type));
                const result = block.call(thisObject, ...parameters);
                return Il2Cpp.toFridaValue(result);
            }, this.returnType.fridaAlias, this.fridaSignature);
        }
    }
    __decorate([
        lazy
    ], Method.prototype, "class", null);
    __decorate([
        lazy
    ], Method.prototype, "flags", null);
    __decorate([
        lazy
    ], Method.prototype, "implementationFlags", null);
    __decorate([
        lazy
    ], Method.prototype, "fridaSignature", null);
    __decorate([
        lazy
    ], Method.prototype, "generics", null);
    __decorate([
        lazy
    ], Method.prototype, "isExternal", null);
    __decorate([
        lazy
    ], Method.prototype, "isGeneric", null);
    __decorate([
        lazy
    ], Method.prototype, "isInflated", null);
    __decorate([
        lazy
    ], Method.prototype, "isStatic", null);
    __decorate([
        lazy
    ], Method.prototype, "isSynchronized", null);
    __decorate([
        lazy
    ], Method.prototype, "modifier", null);
    __decorate([
        lazy
    ], Method.prototype, "name", null);
    __decorate([
        lazy
    ], Method.prototype, "nativeFunction", null);
    __decorate([
        lazy
    ], Method.prototype, "object", null);
    __decorate([
        lazy
    ], Method.prototype, "parameterCount", null);
    __decorate([
        lazy
    ], Method.prototype, "parameters", null);
    __decorate([
        lazy
    ], Method.prototype, "relativeVirtualAddress", null);
    __decorate([
        lazy
    ], Method.prototype, "returnType", null);
    Il2Cpp.Method = Method;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class Object extends NativeStruct {
        /** Gets the Il2CppObject struct size, possibly equal to `Process.pointerSize * 2`. */
        static get headerSize() {
            return Il2Cpp.corlib.class("System.Object").instanceSize;
        }
        /** Gets the class of this object. */
        get class() {
            return new Il2Cpp.Class(Il2Cpp.api.objectGetClass(this));
        }
        /** Gets the size of the current object. */
        get size() {
            return Il2Cpp.api.objectGetSize(this);
        }
        /** Acquires an exclusive lock on the current object. */
        enter() {
            return Il2Cpp.api.monitorEnter(this);
        }
        /** Release an exclusive lock on the current object. */
        exit() {
            return Il2Cpp.api.monitorExit(this);
        }
        /** Gets the field with the given name. */
        field(name) {
            return this.class.field(name).withHolder(this);
        }
        /** Gets the method with the given name. */
        method(name, parameterCount = -1) {
            return this.class.method(name, parameterCount).withHolder(this);
        }
        /** Notifies a thread in the waiting queue of a change in the locked object's state. */
        pulse() {
            return Il2Cpp.api.monitorPulse(this);
        }
        /** Notifies all waiting threads of a change in the object's state. */
        pulseAll() {
            return Il2Cpp.api.monitorPulseAll(this);
        }
        /** Creates a reference to this object. */
        ref(pin) {
            return new Il2Cpp.GCHandle(Il2Cpp.api.gcHandleNew(this, +pin));
        }
        /** Gets the correct virtual method from the given virtual method. */
        virtualMethod(method) {
            return new Il2Cpp.Method(Il2Cpp.api.objectGetVirtualMethod(this, method)).withHolder(this);
        }
        /** Attempts to acquire an exclusive lock on the current object. */
        tryEnter(timeout) {
            return !!Il2Cpp.api.monitorTryEnter(this, timeout);
        }
        /** Gets the field with the given name. */
        tryField(name) {
            return this.class.tryField(name)?.withHolder(this);
        }
        /** Gets the field with the given name. */
        tryMethod(name, parameterCount = -1) {
            return this.class.tryMethod(name, parameterCount)?.withHolder(this);
        }
        /** Releases the lock on an object and attempts to block the current thread until it reacquires the lock. */
        tryWait(timeout) {
            return !!Il2Cpp.api.monitorTryWait(this, timeout);
        }
        /** */
        toString() {
            return this.isNull() ? "null" : this.method("ToString").invoke().content ?? "null";
        }
        /** Unboxes the value type out of this object. */
        unbox() {
            return new Il2Cpp.ValueType(Il2Cpp.api.objectUnbox(this), this.class.type);
        }
        /** Releases the lock on an object and blocks the current thread until it reacquires the lock. */
        wait() {
            return Il2Cpp.api.monitorWait(this);
        }
        /** Creates a weak reference to this object. */
        weakRef(trackResurrection) {
            return new Il2Cpp.GCHandle(Il2Cpp.api.gcHandleNewWeakRef(this, +trackResurrection));
        }
    }
    __decorate([
        lazy
    ], Object.prototype, "class", null);
    __decorate([
        lazy
    ], Object.prototype, "size", null);
    __decorate([
        lazy
    ], Object, "headerSize", null);
    Il2Cpp.Object = Object;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class Parameter {
        /** Name of this parameter. */
        name;
        /** Position of this parameter. */
        position;
        /** Type of this parameter. */
        type;
        constructor(name, position, type) {
            this.name = name;
            this.position = position;
            this.type = type;
        }
        /** */
        toString() {
            return `${this.type.name} ${this.name}`;
        }
    }
    Il2Cpp.Parameter = Parameter;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class Pointer extends NativeStruct {
        type;
        constructor(handle, type) {
            super(handle);
            this.type = type;
        }
        /** Gets the element at the given index. */
        get(index) {
            return Il2Cpp.read(this.handle.add(index * this.type.class.arrayElementSize), this.type);
        }
        /** Reads the given amount of elements starting at the given offset. */
        read(length, offset = 0) {
            const values = new globalThis.Array(length);
            for (let i = 0; i < length; i++) {
                values[i] = this.get(i + offset);
            }
            return values;
        }
        /** Sets the given element at the given index */
        set(index, value) {
            Il2Cpp.write(this.handle.add(index * this.type.class.arrayElementSize), value, this.type);
        }
        /** */
        toString() {
            return this.handle.toString();
        }
        /** Writes the given elements starting at the given index. */
        write(values, offset = 0) {
            for (let i = 0; i < values.length; i++) {
                this.set(i + offset, values[i]);
            }
        }
    }
    Il2Cpp.Pointer = Pointer;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class Reference extends NativeStruct {
        type;
        constructor(handle, type) {
            super(handle);
            this.type = type;
        }
        /** Gets the element referenced by the current reference. */
        get value() {
            return Il2Cpp.read(this.handle, this.type);
        }
        /** Sets the element referenced by the current reference. */
        set value(value) {
            Il2Cpp.write(this.handle, value, this.type);
        }
        /** */
        toString() {
            return this.isNull() ? "null" : `->${this.value}`;
        }
    }
    Il2Cpp.Reference = Reference;
    /** Creates a reference to the specified value. */
    function reference(value, type) {
        const handle = Memory.alloc(Process.pointerSize);
        switch (typeof value) {
            case "boolean":
                return new Il2Cpp.Reference(handle.writeS8(+value), Il2Cpp.corlib.class("System.Boolean").type);
            case "number":
                switch (type?.typeEnum) {
                    case Il2Cpp.Type.enum.unsignedByte:
                        return new Il2Cpp.Reference(handle.writeU8(value), type);
                    case Il2Cpp.Type.enum.byte:
                        return new Il2Cpp.Reference(handle.writeS8(value), type);
                    case Il2Cpp.Type.enum.char:
                    case Il2Cpp.Type.enum.unsignedShort:
                        return new Il2Cpp.Reference(handle.writeU16(value), type);
                    case Il2Cpp.Type.enum.short:
                        return new Il2Cpp.Reference(handle.writeS16(value), type);
                    case Il2Cpp.Type.enum.unsignedInt:
                        return new Il2Cpp.Reference(handle.writeU32(value), type);
                    case Il2Cpp.Type.enum.int:
                        return new Il2Cpp.Reference(handle.writeS32(value), type);
                    case Il2Cpp.Type.enum.unsignedLong:
                        return new Il2Cpp.Reference(handle.writeU64(value), type);
                    case Il2Cpp.Type.enum.long:
                        return new Il2Cpp.Reference(handle.writeS64(value), type);
                    case Il2Cpp.Type.enum.float:
                        return new Il2Cpp.Reference(handle.writeFloat(value), type);
                    case Il2Cpp.Type.enum.double:
                        return new Il2Cpp.Reference(handle.writeDouble(value), type);
                }
            case "object":
                if (value instanceof Il2Cpp.ValueType || value instanceof Il2Cpp.Pointer) {
                    return new Il2Cpp.Reference(handle.writePointer(value), value.type);
                }
                else if (value instanceof Il2Cpp.Object) {
                    return new Il2Cpp.Reference(handle.writePointer(value), value.class.type);
                }
                else if (value instanceof Il2Cpp.String || value instanceof Il2Cpp.Array) {
                    return new Il2Cpp.Reference(handle.writePointer(value), value.object.class.type);
                }
                else if (value instanceof NativePointer) {
                    switch (type?.typeEnum) {
                        case Il2Cpp.Type.enum.unsignedNativePointer:
                        case Il2Cpp.Type.enum.nativePointer:
                            return new Il2Cpp.Reference(handle.writePointer(value), type);
                    }
                }
                else if (value instanceof Int64) {
                    return new Il2Cpp.Reference(handle.writeS64(value), Il2Cpp.corlib.class("System.Int64").type);
                }
                else if (value instanceof UInt64) {
                    return new Il2Cpp.Reference(handle.writeU64(value), Il2Cpp.corlib.class("System.UInt64").type);
                }
            default:
                raise(`couldn't create a reference to ${value} using an unhandled type ${type?.name}`);
        }
    }
    Il2Cpp.reference = reference;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class String extends NativeStruct {
        /** Gets the content of this string. */
        get content() {
            return Il2Cpp.api.stringGetChars(this).readUtf16String(this.length);
        }
        /** Sets the content of this string. */
        set content(value) {
            // prettier-ignore
            const offset = Il2Cpp.string("vfsfitvnm").handle.offsetOf(_ => _.readInt() == 32)
                ?? raise("couldn't find the length offset in the native string struct");
            globalThis.Object.defineProperty(Il2Cpp.String.prototype, "content", {
                set(value) {
                    Il2Cpp.api.stringGetChars(this).writeUtf16String(value ?? "");
                    this.handle.add(offset).writeS32(value?.length ?? 0);
                }
            });
            this.content = value;
        }
        /** Gets the length of this string. */
        get length() {
            return Il2Cpp.api.stringGetLength(this);
        }
        /** Gets the encompassing object of the current string. */
        get object() {
            return new Il2Cpp.Object(this);
        }
        /** */
        toString() {
            return this.isNull() ? "null" : `"${this.content}"`;
        }
    }
    Il2Cpp.String = String;
    /** Creates a new string with the specified content. */
    function string(content) {
        return new Il2Cpp.String(Il2Cpp.api.stringNew(Memory.allocUtf8String(content ?? "")));
    }
    Il2Cpp.string = string;
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class Thread extends NativeStruct {
        /** Gets the native id of the current thread. */
        get id() {
            let get = function () {
                return this.internal.field("thread_id").value.toNumber();
            };
            // https://github.com/mono/linux-packaging-mono/blob/d586f84dfea30217f34b076a616a098518aa72cd/mono/utils/mono-threads.h#L642
            if (Process.platform != "windows") {
                const currentThreadId = Process.getCurrentThreadId();
                const currentPosixThread = ptr(get.apply(Il2Cpp.currentThread));
                // prettier-ignore
                const offset = currentPosixThread.offsetOf(_ => _.readS32() == currentThreadId, 1024) ??
                    raise(`couldn't find the offset for determining the kernel id of a posix thread`);
                const _get = get;
                get = function () {
                    return ptr(_get.apply(this)).add(offset).readS32();
                };
            }
            getter(Il2Cpp.Thread.prototype, "id", get, lazy);
            return this.id;
        }
        /** Gets the encompassing internal object (System.Threding.InternalThreead) of the current thread. */
        get internal() {
            return this.object.tryField("internal_thread")?.value ?? this.object;
        }
        /** Determines whether the current thread is the garbage collector finalizer one. */
        get isFinalizer() {
            return !Il2Cpp.api.threadIsVm(this);
        }
        /** Gets the managed id of the current thread. */
        get managedId() {
            return this.object.method("get_ManagedThreadId").invoke();
        }
        /** Gets the encompassing object of the current thread. */
        get object() {
            return new Il2Cpp.Object(this);
        }
        /** @internal */
        get staticData() {
            return this.internal.field("static_data").value;
        }
        /** @internal */
        get synchronizationContext() {
            const get_ExecutionContext = this.object.tryMethod("GetMutableExecutionContext") ?? this.object.method("get_ExecutionContext");
            const executionContext = get_ExecutionContext.invoke();
            let synchronizationContext = executionContext.tryField("_syncContext")?.value ??
                executionContext.tryMethod("get_SynchronizationContext")?.invoke() ??
                this.tryLocalValue(Il2Cpp.corlib.class("System.Threading.SynchronizationContext"));
            if (synchronizationContext == null || synchronizationContext.isNull()) {
                if (this.handle.equals(Il2Cpp.mainThread.handle)) {
                    raise(`couldn't find the synchronization context of the main thread, perhaps this is early instrumentation?`);
                }
                else {
                    raise(`couldn't find the synchronization context of thread #${this.managedId}, only the main thread is expected to have one`);
                }
            }
            return synchronizationContext;
        }
        /** Detaches the thread from the application domain. */
        detach() {
            return Il2Cpp.api.threadDetach(this);
        }
        /** Schedules a callback on the current thread. */
        schedule(block) {
            const Post = this.synchronizationContext.method("Post");
            return new Promise(resolve => {
                const delegate = Il2Cpp.delegate(Il2Cpp.corlib.class("System.Threading.SendOrPostCallback"), () => {
                    const result = block();
                    setImmediate(() => resolve(result));
                });
                // This is to replace pending scheduled callbacks when the script is about to get unlaoded.
                // If we skip this cleanup, Frida's native callbacks will point to invalid memory, making
                // the application crash as soon as the IL2CPP runtime tries to execute such callbacks.
                // For instance, without the following code, this is how you can trigger a crash:
                // 1) unfocus the application;
                // 2) schedule a callback;
                // 3) reload the script;
                // 4) focus application.
                //
                // The "proper" solution consists in removing our delegates from the Unity synchroniztion
                // context, but the interface is not consisent across Unity versions - e.g. 2017.4.40f1 uses
                // a queue instead of a list, whereas newer versions do not allow null work requests.
                // The following solution, which basically redirects the invocation to a native function that
                // survives the script reloading, is much simpler, honestly.
                Script.bindWeak(globalThis, () => {
                    delegate.field("method_ptr").value = delegate.field("invoke_impl").value = Il2Cpp.api.domainGet;
                });
                Post.invoke(delegate, NULL);
            });
        }
        /** @internal */
        tryLocalValue(klass) {
            for (let i = 0; i < 16; i++) {
                const base = this.staticData.add(i * Process.pointerSize).readPointer();
                if (!base.isNull()) {
                    const object = new Il2Cpp.Object(base.readPointer()).asNullable();
                    if (object?.class?.isSubclassOf(klass, false)) {
                        return object;
                    }
                }
            }
        }
    }
    __decorate([
        lazy
    ], Thread.prototype, "internal", null);
    __decorate([
        lazy
    ], Thread.prototype, "isFinalizer", null);
    __decorate([
        lazy
    ], Thread.prototype, "managedId", null);
    __decorate([
        lazy
    ], Thread.prototype, "object", null);
    __decorate([
        lazy
    ], Thread.prototype, "staticData", null);
    __decorate([
        lazy
    ], Thread.prototype, "synchronizationContext", null);
    Il2Cpp.Thread = Thread;
    getter(Il2Cpp, "attachedThreads", () => {
        return readNativeList(Il2Cpp.api.threadGetAttachedThreads).map(_ => new Il2Cpp.Thread(_));
    });
    getter(Il2Cpp, "currentThread", () => {
        return new Il2Cpp.Thread(Il2Cpp.api.threadGetCurrent()).asNullable();
    });
    getter(Il2Cpp, "mainThread", () => {
        // I'm not sure if this is always the case. Typically, the main
        // thread managed id is 1, but this isn't always true: spawning
        // an Android application with Unity 5.3.8f1 will cause the Frida
        // thread to have the managed id equal to 1, whereas the main thread
        // managed id is 2.
        return Il2Cpp.attachedThreads[0];
    });
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    let Type = class Type extends NativeStruct {
        /** */
        static get enum() {
            const _ = (_, block = (_) => _) => block(Il2Cpp.corlib.class(_)).type.typeEnum;
            return {
                void: _("System.Void"),
                boolean: _("System.Boolean"),
                char: _("System.Char"),
                byte: _("System.SByte"),
                unsignedByte: _("System.Byte"),
                short: _("System.Int16"),
                unsignedShort: _("System.UInt16"),
                int: _("System.Int32"),
                unsignedInt: _("System.UInt32"),
                long: _("System.Int64"),
                unsignedLong: _("System.UInt64"),
                nativePointer: _("System.IntPtr"),
                unsignedNativePointer: _("System.UIntPtr"),
                float: _("System.Single"),
                double: _("System.Double"),
                pointer: _("System.IntPtr", _ => _.field("m_value")),
                valueType: _("System.Decimal"),
                object: _("System.Object"),
                string: _("System.String"),
                class: _("System.Array"),
                array: _("System.Void", _ => _.arrayClass),
                multidimensionalArray: _("System.Void", _ => new Il2Cpp.Class(Il2Cpp.api.classGetArrayClass(_, 2))),
                genericInstance: _("System.Int32", _ => _.interfaces.find(_ => _.name.endsWith("`1")))
            };
        }
        /** Gets the class of this type. */
        get class() {
            return new Il2Cpp.Class(Il2Cpp.api.typeGetClass(this));
        }
        /** */
        get fridaAlias() {
            if (this.isByReference) {
                return "pointer";
            }
            switch (this.typeEnum) {
                case Il2Cpp.Type.enum.void:
                    return "void";
                case Il2Cpp.Type.enum.boolean:
                    return "bool";
                case Il2Cpp.Type.enum.char:
                    return "uchar";
                case Il2Cpp.Type.enum.byte:
                    return "int8";
                case Il2Cpp.Type.enum.unsignedByte:
                    return "uint8";
                case Il2Cpp.Type.enum.short:
                    return "int16";
                case Il2Cpp.Type.enum.unsignedShort:
                    return "uint16";
                case Il2Cpp.Type.enum.int:
                    return "int32";
                case Il2Cpp.Type.enum.unsignedInt:
                    return "uint32";
                case Il2Cpp.Type.enum.long:
                    return "int64";
                case Il2Cpp.Type.enum.unsignedLong:
                    return "uint64";
                case Il2Cpp.Type.enum.float:
                    return "float";
                case Il2Cpp.Type.enum.double:
                    return "double";
                case Il2Cpp.Type.enum.valueType:
                    return getValueTypeFields(this);
                case Il2Cpp.Type.enum.nativePointer:
                case Il2Cpp.Type.enum.unsignedNativePointer:
                case Il2Cpp.Type.enum.pointer:
                case Il2Cpp.Type.enum.string:
                case Il2Cpp.Type.enum.array:
                case Il2Cpp.Type.enum.multidimensionalArray:
                    return "pointer";
                case Il2Cpp.Type.enum.class:
                case Il2Cpp.Type.enum.object:
                case Il2Cpp.Type.enum.genericInstance:
                    return this.class.isValueType ? getValueTypeFields(this) : "pointer";
                default:
                    return "pointer";
            }
        }
        /** Determines whether this type is passed by reference. */
        get isByReference() {
            return this.name.endsWith("&");
        }
        /** Determines whether this type is primitive. */
        get isPrimitive() {
            return ((this.typeEnum >= Il2Cpp.Type.enum.boolean && this.typeEnum <= Il2Cpp.Type.enum.double) ||
                this.typeEnum == Il2Cpp.Type.enum.nativePointer ||
                this.typeEnum == Il2Cpp.Type.enum.unsignedNativePointer);
        }
        /** Gets the name of this type. */
        get name() {
            const handle = Il2Cpp.api.typeGetName(this);
            try {
                return handle.readUtf8String();
            }
            finally {
                Il2Cpp.free(handle);
            }
        }
        /** Gets the encompassing object of the current type. */
        get object() {
            return new Il2Cpp.Object(Il2Cpp.api.typeGetObject(this));
        }
        /** Gets the type enum of the current type. */
        get typeEnum() {
            return Il2Cpp.api.typeGetTypeEnum(this);
        }
        /** */
        toString() {
            return this.name;
        }
    };
    __decorate([
        lazy
    ], Type.prototype, "class", null);
    __decorate([
        lazy
    ], Type.prototype, "fridaAlias", null);
    __decorate([
        lazy
    ], Type.prototype, "isByReference", null);
    __decorate([
        lazy
    ], Type.prototype, "isPrimitive", null);
    __decorate([
        lazy
    ], Type.prototype, "name", null);
    __decorate([
        lazy
    ], Type.prototype, "object", null);
    __decorate([
        lazy
    ], Type.prototype, "typeEnum", null);
    __decorate([
        lazy
    ], Type, "enum", null);
    Type = __decorate([
        recycle
    ], Type);
    Il2Cpp.Type = Type;
    function getValueTypeFields(type) {
        const instanceFields = type.class.fields.filter(_ => !_.isStatic);
        return instanceFields.length == 0 ? ["char"] : instanceFields.map(_ => _.type.fridaAlias);
    }
})(Il2Cpp || (Il2Cpp = {}));
var Il2Cpp;
(function (Il2Cpp) {
    class ValueType extends NativeStruct {
        type;
        constructor(handle, type) {
            super(handle);
            this.type = type;
        }
        /** Boxes the current value type in a object. */
        box() {
            return new Il2Cpp.Object(Il2Cpp.api.valueTypeBox(this.type.class, this));
        }
        /** Gets the field with the given name. */
        field(name) {
            return this.type.class.field(name).withHolder(this);
        }
        /** Gets the field with the given name. */
        tryField(name) {
            return this.type.class.tryField(name)?.withHolder(this);
        }
        /** */
        toString() {
            return this.isNull() ? "null" : this.box().toString();
        }
    }
    Il2Cpp.ValueType = ValueType;
})(Il2Cpp || (Il2Cpp = {}));
/// <reference path="./utils/console.ts">/>
/// <reference path="./utils/getter.ts">/>
/// <reference path="./utils/lazy.ts">/>
/// <reference path="./utils/native-struct.ts">/>
/// <reference path="./utils/native-wait.ts">/>
/// <reference path="./utils/offset-of.ts">/>
/// <reference path="./utils/read-native-iterator.ts">/>
/// <reference path="./utils/read-native-list.ts">/>
/// <reference path="./utils/recycle.ts">/>
/// <reference path="./utils/unity-version.ts">/>
/// <reference path="./il2cpp/api.ts">/>
/// <reference path="./il2cpp/application.ts">/>
/// <reference path="./il2cpp/dump.ts">/>
/// <reference path="./il2cpp/exception-listener.ts">/>
/// <reference path="./il2cpp/filters.ts">/>
/// <reference path="./il2cpp/gc.ts">/>
/// <reference path="./il2cpp/memory.ts">/>
/// <reference path="./il2cpp/module.ts">/>
/// <reference path="./il2cpp/perform.ts">/>
/// <reference path="./il2cpp/tracer.ts">/>
/// <reference path="./il2cpp/structs/array.ts">/>
/// <reference path="./il2cpp/structs/assembly.ts">/>
/// <reference path="./il2cpp/structs/class.ts">/>
/// <reference path="./il2cpp/structs/delegate.ts">/>
/// <reference path="./il2cpp/structs/domain.ts">/>
/// <reference path="./il2cpp/structs/field.ts">/>
/// <reference path="./il2cpp/structs/gc-handle.ts">/>
/// <reference path="./il2cpp/structs/image.ts">/>
/// <reference path="./il2cpp/structs/memory-snapshot.ts">/>
/// <reference path="./il2cpp/structs/method.ts">/>
/// <reference path="./il2cpp/structs/object.ts">/>
/// <reference path="./il2cpp/structs/parameter.ts">/>
/// <reference path="./il2cpp/structs/pointer.ts">/>
/// <reference path="./il2cpp/structs/reference.ts">/>
/// <reference path="./il2cpp/structs/string.ts">/>
/// <reference path="./il2cpp/structs/thread.ts">/>
/// <reference path="./il2cpp/structs/type.ts">/>
/// <reference path="./il2cpp/structs/value-type.ts">/>
globalThis.Il2Cpp = Il2Cpp;
/** @internal */
function decorate(target, decorator, descriptors = Object.getOwnPropertyDescriptors(target)) {
    for (const key in descriptors) {
        descriptors[key] = decorator(target, key, descriptors[key]);
    }
    Object.defineProperties(target, descriptors);
    return target;
}


}).call(this)}).call(this,require("timers").setImmediate)

},{"timers":10}],9:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],10:[function(require,module,exports){
(function (setImmediate,clearImmediate){(function (){
var nextTick = require('process/browser.js').nextTick;
var apply = Function.prototype.apply;
var slice = Array.prototype.slice;
var immediateIds = {};
var nextImmediateId = 0;

// DOM APIs, for completeness

exports.setTimeout = function() {
  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
};
exports.setInterval = function() {
  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
};
exports.clearTimeout =
exports.clearInterval = function(timeout) { timeout.close(); };

function Timeout(id, clearFn) {
  this._id = id;
  this._clearFn = clearFn;
}
Timeout.prototype.unref = Timeout.prototype.ref = function() {};
Timeout.prototype.close = function() {
  this._clearFn.call(window, this._id);
};

// Does not start the time, just sets up the members needed.
exports.enroll = function(item, msecs) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = msecs;
};

exports.unenroll = function(item) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = -1;
};

exports._unrefActive = exports.active = function(item) {
  clearTimeout(item._idleTimeoutId);

  var msecs = item._idleTimeout;
  if (msecs >= 0) {
    item._idleTimeoutId = setTimeout(function onTimeout() {
      if (item._onTimeout)
        item._onTimeout();
    }, msecs);
  }
};

// That's not how node.js implements it but the exposed api is the same.
exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function(fn) {
  var id = nextImmediateId++;
  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

  immediateIds[id] = true;

  nextTick(function onNextTick() {
    if (immediateIds[id]) {
      // fn.call() is faster so we optimize for the common use-case
      // @see http://jsperf.com/call-apply-segu
      if (args) {
        fn.apply(null, args);
      } else {
        fn.call(null);
      }
      // Prevent ids from leaking
      exports.clearImmediate(id);
    }
  });

  return id;
};

exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function(id) {
  delete immediateIds[id];
};
}).call(this)}).call(this,require("timers").setImmediate,require("timers").clearImmediate)

},{"process/browser.js":9,"timers":10}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPC = exports.initNotifier = exports.loadSceneNotifier = void 0;
require("frida-il2cpp-bridge");
const loader_1 = require("./loader");
const utils_1 = require("./utils");
exports.loadSceneNotifier = new Int32Array(new SharedArrayBuffer(1024));
exports.initNotifier = new Int32Array(new SharedArrayBuffer(1024));
const DEFAULT_TIMEOUT = 600000;
class RPC {
    static healthCheckCount = 0;
    constructor() { }
    /* Simple RPC to check if the frida instance is responding. */
    static checkHealth() {
        RPC.healthCheckCount++;
        return RPC.healthCheckCount;
    }
    static getUnityVersion() {
        RPC.healthCheckCount = 0;
        return Il2Cpp.unityVersion;
    }
    // Input
    /*
      {
        [
          '0x80000000'
          '0x80000001'
          '0x80000002'
        ]
      }
     */
    // Output
    /*
      {
        "addr": {
          "instructions":
            [
              {
                "instruction": 'mov x8, x8',
                "mnemonic": 'mov',
                "groups": 'branch_relative',
              },
             ...
            ],
           "branches":
             [
               '0x800000',
               '0x800001',
              ...
             ]
        }
      }
     */
    static getInstructions(payload) {
        RPC.healthCheckCount = 0;
        let instance = loader_1.AllMethods.getInstance();
        let parse = JSON.parse(payload);
        let methods = parse.methods;
        let returnPayload = {};
        for (const meta of methods) {
            let addr = meta;
            if (addr !== '0x0') {
                // let shouldResolve = meta.resolveBranches === 'True' ? true : false;
                const shouldResolve = true;
                let name = addr;
                if (instance.contains(addr)) {
                    name = instance.getMethodName(addr);
                    let handle = new NativePointer(instance.methods.get(addr));
                    let method = new Il2Cpp.Method(handle);
                    if (method.class.namespace === "System") {
                        continue;
                    }
                }
                let instructions = utils_1.Util.resolveInstructions(new NativePointer(addr), name, shouldResolve);
                returnPayload[addr] = instructions.toJson();
            }
        }
        return JSON.stringify(returnPayload);
    }
    static getInstructionsInterval(payload) {
        RPC.healthCheckCount = 0;
        let instance = loader_1.AllMethods.getInstance();
        let parse = JSON.parse(payload);
        let start = parse.start;
        let end = parse.end;
        let returnPayload = {};
        if (start !== '0x0' || end !== '0x0') {
            // let shouldResolve = meta.resolveBranches === 'True' ? true : false;
            const shouldResolve = true;
            let name = start;
            let instructions = utils_1.Util.resolveInstructionsInterval(new NativePointer(start), new NativePointer(end), name, shouldResolve);
            returnPayload[start] = instructions.toJson();
        }
        return JSON.stringify(returnPayload);
    }
    static getMethodsOfClassMethod(payload) {
        RPC.healthCheckCount = 0;
        let instance = loader_1.AllMethods.getInstance();
        let mAddr = payload;
        if (instance.contains(mAddr)) {
            let method = new NativePointer(instance.methods.get(mAddr));
            let il2cppMethod = new Il2Cpp.Method(method);
            let clazz = il2cppMethod.class;
            return clazz.methods.map(cMethod => cMethod.virtualAddress.toString());
        }
        return [];
    }
    /** @deprecated */
    static getReturnType(payload) {
        RPC.healthCheckCount = 0;
        let addr = JSON.parse(payload).toString();
        let m = new Il2Cpp.Method(addr);
        return m.class.name;
    }
    /*
       {
         symbols: [
           '0x12345',
           '0x12346',
           '0x12347',
           '0x12348'
         ]
       }
     */
    static resolveSymbols(payload) {
        RPC.healthCheckCount = 0;
        let symbol = JSON.parse(payload).toString();
        let returnPayload = {};
        let ref = new NativePointer(symbol);
        let symb = DebugSymbol.fromAddress(ref.readPointer());
        // console.log(ResolvedSymbols.getInstance().symbolsMap());
        let symAddr = loader_1.ResolvedSymbols.getInstance().symbol(symb.name);
        let methodAddr = Number(symAddr);
        // console.log(symAddr,
        //             AllMethods.getInstance().methods.get(returnPayload[symbol]),
        //             returnPayload[symbol]);
        if (symAddr && loader_1.AllMethods.getInstance().contains(symAddr)) {
            // console.log(
            //     AllMethods.getInstance().methods.get("0x" +
            //     methodAddr.toString(16)));
            returnPayload[symbol] = "0x" + methodAddr.toString(16);
        }
        else {
            returnPayload[symbol] = '0x0';
        }
        return JSON.stringify(returnPayload);
    }
    static getAllMethods() {
        RPC.healthCheckCount = 0;
        return JSON.stringify(Array.from(loader_1.AllMethods.getInstance().methods.entries()));
    }
    static async countAllScenes() {
        RPC.healthCheckCount = 0;
        return loader_1.Loader.countAllScenes();
    }
    static loadSceneEvents(scene_index) {
        RPC.healthCheckCount = 0;
        return loader_1.Loader.loadSceneEvents(scene_index);
    }
    static async triggerEvent(payload) {
        RPC.healthCheckCount = 0;
        let event = JSON.parse(payload);
        if (event === undefined) {
            return;
        }
        return await loader_1.Loader.triggerEvent(event);
    }
    static async triggerAllEvents(payload) {
        RPC.healthCheckCount = 0;
        let parse = JSON.parse(payload);
        const events = new Map(Object.entries(parse));
        console.log("TRIGGER ALL", events);
        return await loader_1.Loader.triggerAllEvents(events);
    }
    static init() {
        RPC.healthCheckCount = 0;
        return loader_1.Loader.start();
    }
}
exports.RPC = RPC;

},{"./loader":5,"./utils":13,"frida-il2cpp-bridge":8}],12:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnityObject = exports.UnityMethod = exports.UnityClass = void 0;
require("frida-il2cpp-bridge");
const assert_ts_1 = __importDefault(require("assert-ts"));
const loader_1 = require("./loader");
const targetMethods = ["LoadSceneAsyncNameIndexInternal"];
var currMethodName = '';
class UnityClass {
    imageClass; // TODO: Add Mono class descriptor once built.
    methods; // Method name to
    // UnityMethod obj
    parentClass;
    nestedClasses;
    constructor(uClass) {
        if (uClass) {
            this.imageClass = uClass.imageClass;
            this.methods = new Map(uClass.methods);
            this.parentClass = uClass.parentClass;
            this.nestedClasses = [];
        }
    }
    new() {
        let obj = this.imageClass.new();
        let instance = loader_1.ResolvedObjects.getInstance();
        instance.putIl2CppObject(obj);
        return new UnityObject(obj, this);
    }
    /** Checks if this UnityClass inherits from the @param parentClass. */
    inherits(parentClass, includeInterfaces) {
        (0, assert_ts_1.default)(parentClass != null);
        (0, assert_ts_1.default)(this.imageClass != null);
        if (this.parentClass != null) {
            return this.imageClass.isSubclassOf(parentClass.rawImageClass, includeInterfaces);
        }
        return false;
    }
    get name() { return this.rawImageClass.name; }
    /** @internal */
    get rawImageClass() {
        (0, assert_ts_1.default)(this.imageClass != null);
        return this.imageClass;
    }
    /** Gets direct parent UnityClass */
    get parent() { return this.parentClass; }
    get il2cppType() { return this.rawImageClass.type; }
    tryMethod(name) {
        (0, assert_ts_1.default)(this.methods != null);
        if (!this.methods.has(name))
            return undefined;
        return this.methods.get(name);
    }
    method(name) {
        (0, assert_ts_1.default)(this.methods != null);
        (0, assert_ts_1.default)(this.methods.has(name));
        return this.methods.get(name);
    }
    get resolvedMethods() {
        (0, assert_ts_1.default)(this.methods != null);
        return this.methods;
    }
    /** Resolves fully qualified className from assembly image. */
    resolve(image, className) {
        (0, assert_ts_1.default)(image != null);
        (0, assert_ts_1.default)(className != null);
        (0, assert_ts_1.default)(this.imageClass == null);
        (0, assert_ts_1.default)(this.methods == null);
        let classTemp = image.tryClass(className);
        if (classTemp != null) {
            this.methods = new Map();
            this.imageClass = classTemp;
            let id = this.imageClass.name;
            loader_1.ResolvedClasses.getInstance().putClass(id, this);
            this.resolveNestedClasses(this.imageClass.nestedClasses);
        }
        return classTemp;
    }
    /** Resolves fully qualified className from assembly image. */
    resolveClass(clazz) {
        (0, assert_ts_1.default)(clazz != null);
        (0, assert_ts_1.default)(this.imageClass == null);
        (0, assert_ts_1.default)(this.methods == null);
        this.methods = new Map();
        this.imageClass = clazz;
        this.nestedClasses = [];
        let image = this.imageClass.image;
        let id = this.imageClass.name;
        loader_1.ResolvedClasses.getInstance().putClass(id, this);
        this.resolveNestedClasses(this.imageClass.nestedClasses);
        return clazz;
    }
    resolveNestedClasses(nested) {
        this.nestedClasses = [];
        if (nested.length > 0) {
            nested.forEach(imgClass => {
                let nClass = new UnityClass();
                let result = nClass.resolveClass(imgClass);
                if (result) {
                    loader_1.ResolvedClasses.getInstance().putClass(imgClass.name, nClass);
                    this.nestedClasses.push(nClass);
                }
            });
        }
    }
    /**
     * Resolves all methods depending on filter, true to resolve, false to
     * ignore.
     */
    resolveMethods(filter) {
        (0, assert_ts_1.default)(this.imageClass);
        this.imageClass.methods.forEach(imgMethod => {
            let uMethod = new UnityMethod(this).resolve(imgMethod);
            if (typeof filter !== 'undefined') {
                if (filter.call(this, uMethod)) {
                    if (this.methods.has(imgMethod.name)) {
                        this.methods.get(imgMethod.name).addOverload(uMethod);
                    }
                    else {
                        this.methods.set(imgMethod.name, uMethod);
                    }
                }
            }
            else {
                if (this.methods.has(imgMethod.name)) {
                    this.methods.get(imgMethod.name).addOverload(uMethod);
                }
                else {
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
        (0, assert_ts_1.default)(this.imageClass != null);
        (0, assert_ts_1.default)(this.methods != null);
        let allMethodAddrs = loader_1.AllMethods.getInstance();
        if (allMethodAddrs.size > 0) {
            let queue = [];
            this.methods.forEach((uMethod, methodName) => {
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
            let obj = { "type": "resolve_methods", "to_resolve": queue };
        }
        this.nestedClasses.forEach(nClass => { nClass.resolveMethodInstructions(); });
    }
}
exports.UnityClass = UnityClass;
class Boxable {
    isMono = false;
    il2CppType;
    // MONO types
    il2CppValue;
    box(val) {
        let object = val.box();
        return new UnityObject(object);
    }
}
class UnityMethod {
    parentClass;
    initialized = false;
    methodSignature = null;
    // private methodInstructions: MethodInstructions|null = null;
    overloadingMethods = [];
    name;
    isGeneric = false;
    paramTypes = [];
    readOffsets = [];
    writeOffsets = [];
    base = Number(0);
    constructor(parentClass) { this.parentClass = parentClass; }
    /** @internal */
    addOverload(overload) {
        (0, assert_ts_1.default)(this.initialized);
        this.overloadingMethods.push(overload);
    }
    /** @internal */
    get overloads() {
        (0, assert_ts_1.default)(this.initialized);
        return this.overloadingMethods;
    }
    overload(...params) {
        (0, assert_ts_1.default)(this.initialized);
        for (var i = 0; i < this.overloadingMethods.length; i++) {
            let overloadParams = this.overloadingMethods[i].parameterTypes;
            if (this.arrayEquals(overloadParams, params)) {
                return this.overloadingMethods[i];
            }
        }
        throw new Error("No overload suited for " + this.name);
    }
    /** @internal */
    arrayEquals(arr1, arr2) {
        if (arr1.length != arr2.length)
            return false;
        for (var i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i])
                return false;
        }
        return true;
    }
    get parameterTypes() {
        (0, assert_ts_1.default)(this.initialized);
        return this.paramTypes;
    }
    /** @internal */
    get il2cppMethod() {
        (0, assert_ts_1.default)(this.initialized);
        (0, assert_ts_1.default)(this.methodSignature != null);
        return this.methodSignature;
    }
    get virtualAddress() {
        (0, assert_ts_1.default)(this.initialized);
        return this.il2cppMethod.virtualAddress;
    }
    execute(obj, ...args) {
        (0, assert_ts_1.default)(this.initialized);
        (0, assert_ts_1.default)(this.methodSignature != null);
        (0, assert_ts_1.default)(this.methodSignature.parameterCount == args.length);
        let imageObject;
        if (obj) {
            imageObject = obj.unbox();
        }
        else if (this.base != Number(0)) {
            let baseAddr = '0x' + this.base.toString(16);
            let instance = loader_1.ResolvedObjects.getInstance();
            if (instance.hasObject(baseAddr)) {
                imageObject = instance.object(baseAddr).unbox();
            }
            else {
                // Something happened? Sequence may not have caught this base addr
                console.log("Should not happen");
                return undefined;
            }
        }
        return this.executeIl2Cpp(imageObject, ...args);
    }
    executeIl2Cpp(obj, ...args) {
        (0, assert_ts_1.default)(this.initialized);
        (0, assert_ts_1.default)(this.methodSignature != null);
        (0, assert_ts_1.default)(this.methodSignature.parameterCount == args.length);
        return obj.method(this.methodSignature.name, args.length)
            .invoke(...args);
    }
    executeStatic(...args) {
        (0, assert_ts_1.default)(this.initialized);
        (0, assert_ts_1.default)(this.methodSignature != null);
        console.log("Executing");
        return this.methodSignature.invoke(...args);
    }
    set implementation(block) {
        (0, assert_ts_1.default)(this.initialized);
        (0, assert_ts_1.default)(this.methodSignature != null);
        this.methodSignature.implementation = block;
    }
    revert() {
        (0, assert_ts_1.default)(this.initialized);
        (0, assert_ts_1.default)(this.methodSignature != null);
        this.methodSignature.revert();
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
    addBase(offset) {
        if (offset instanceof Number) {
            this.base = offset;
        }
        else {
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
        (0, assert_ts_1.default)(this.name);
        return this.name;
    }
    /** @internal */
    resolve(methodSignature) {
        (0, assert_ts_1.default)(!this.initialized);
        (0, assert_ts_1.default)(this.methodSignature == null);
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
exports.UnityMethod = UnityMethod;
class UnityObject extends Boxable {
    imageObject;
    uClass;
    constructor(imageObject, uClass) {
        super();
        this.uClass = uClass;
        this.imageObject = imageObject;
    }
    il2cppUnbox() { return this.imageObject.unbox(); }
    unbox() { return this.imageObject; }
    get class() { return this.uClass; }
    get base() { return this.imageObject.handle; }
    resolveClassIfNeeded() {
        (0, assert_ts_1.default)(this.imageObject || this.uClass);
        let instance = loader_1.ResolvedClasses.getInstance();
        let uClass = loader_1.ClassLoader.resolveClassFromObject(this.imageObject);
        if (uClass) {
            let id = uClass.name;
            if (!instance.hasClass(id)) {
                instance.putClass(id, uClass);
            }
            this.uClass = instance.classes.get(id);
            let methods = this.uClass.resolvedMethods;
            methods.forEach(method => { method.addBase(this.base.toString()); });
        }
        else {
            console.log("Unable to resolve class from: ", this.imageObject);
        }
    }
    tryMethod(name, paramCount) {
        (0, assert_ts_1.default)(this.uClass);
        return this.imageObject.tryMethod(name, paramCount);
    }
    invokeMethod(methodName, ...params) {
        this.resolveClassIfNeeded();
        let methods = this.uClass.methods;
        if (methods.has(methodName)) {
            let method = methods.get(methodName);
            return method.execute(this, params);
        }
    }
    toString() { return this.imageObject.toString(); }
}
exports.UnityObject = UnityObject;

},{"./loader":5,"assert-ts":7,"frida-il2cpp-bridge":8}],13:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MethodInstructions = exports.MethodInstructionsBuilder = exports.Util = exports.promiseTimeout = exports.promiseTimeoutRevert = void 0;
const classes_1 = require("./classes");
const loader_1 = require("./loader");
const promiseTimeoutRevert = function (ms, promise, method) {
    let timeout = new Promise((resolve, reject) => {
        let id = setTimeout(() => {
            clearTimeout(id);
            method.revert();
            resolve('0x0');
        }, ms);
    });
    return Promise.race([promise, timeout]);
};
exports.promiseTimeoutRevert = promiseTimeoutRevert;
const promiseTimeout = function (ms, promise) {
    let timeout = new Promise((resolve, reject) => {
        let id = setTimeout(() => {
            console.log("TIME");
            clearTimeout(id);
            resolve('0x0');
        }, ms);
    });
    return Promise.race([promise, timeout]);
};
exports.promiseTimeout = promiseTimeout;
class Util {
    static resolveInstructions(address, methodName, shouldResolveBranches = true) {
        let allMethodAddrs = loader_1.AllMethods.getInstance();
        let builder = new MethodInstructionsBuilder(methodName, shouldResolveBranches);
        if (!address.isNull() && allMethodAddrs.size > 0) {
            let instruction = Instruction.parse(address);
            do {
                try {
                    builder.addInstruction(address, instruction);
                    instruction = Instruction.parse(instruction.next);
                    address = instruction.address;
                }
                catch (e) {
                    // Assume any exceptions are result of ending a class' method
                    // addresses
                    break;
                }
            } while (!allMethodAddrs.contains(address.toString()) &&
                instruction.mnemonic !== "udf");
        }
        return builder.buildAndClear();
    }
    static resolveInstructionsInterval(start, end, methodName, shouldResolveBranches = true) {
        let allMethodAddrs = loader_1.AllMethods.getInstance();
        let builder = new MethodInstructionsBuilder(methodName, shouldResolveBranches);
        if (!start.isNull() && allMethodAddrs.size > 0) {
            let instruction = Instruction.parse(start);
            do {
                try {
                    builder.addInstruction(start, instruction);
                    instruction = Instruction.parse(instruction.next);
                    start = instruction.address;
                }
                catch (e) {
                    // Assume any exceptions are result of ending a class' method
                    // addresses
                    break;
                }
            } while (end.toString() !== start.toString());
        }
        return builder.buildAndClear();
    }
    static objectsOfClass(clazz, objs) {
        return objs.filter(obj => clazz.isAssignableFrom(obj.class));
    }
    static async tryObjectsOnThread() {
        let classes = classes_1.Classes.getInstance();
        if (classes.GameObject && classes.Object) {
            let GameObject = classes.GameObject.rawImageClass;
            let Component = classes.Component.rawImageClass;
            return await Il2Cpp.perform(() => {
                let threads = Il2Cpp.attachedThreads.filter(thread => thread && !thread.isNull());
                let promises = new Array();
                for (const thread of threads) {
                    try {
                        promises.push(thread.schedule(() => {
                            try {
                                let findObjectsMethod = GameObject.tryMethod("FindObjectsOfType");
                                if (findObjectsMethod) {
                                    console.log("Getting Objects...");
                                    return Array.from(findObjectsMethod.overload("System.Type")
                                        .invoke(Component.type.object));
                                }
                                return Il2Cpp.MemorySnapshot.capture().objects;
                            }
                            catch (e) {
                                // console.log("tryObjectsOnThread", e);
                            }
                            return new Array();
                        }));
                    }
                    catch (e) {
                        // console.log("threads:", e);
                        promises.push(Promise.resolve(new Array()));
                        continue;
                    }
                }
                return promises;
            });
        }
    }
    static async getAllObjects() {
        let classes = classes_1.Classes.getInstance();
        if (classes.GameObject && classes.Object) {
            let objs = new Array();
            try {
                let promiseObjs = await Util.tryObjectsOnThread();
                if (promiseObjs) {
                    for (const promise of promiseObjs) {
                        let promiseObj = await promise;
                        objs.push(...promiseObj);
                    }
                }
            }
            catch (e) {
                let err = e;
                console.log("GetAllObjects", e, err.stack);
            }
            if (objs.length > 0) {
                return objs;
            }
        }
        console.log("Getting other objects instead...");
        return Il2Cpp.MemorySnapshot.capture().objects;
    }
    static getActiveObjects(objects) {
        let instance = classes_1.Classes.getInstance();
        // return objects;
        return Util.objectsOfClass(instance.Component.rawImageClass, objects)
            .filter(obj => {
            try {
                if (obj.isNull()) {
                    return false;
                }
                let gameObj = obj.method("get_gameObject").invoke();
                if (gameObj && gameObj.isNull()) {
                    return false;
                }
                let active = gameObj.tryMethod("get_activeInHierarchy");
                if (active) {
                    return active.invoke();
                }
                else {
                    return false;
                }
            }
            catch (e) {
                return false;
            }
        });
    }
    static async getAllActiveObjects() {
        return Util.getActiveObjects(await Util.getAllObjects());
    }
    static isCollider(comp) {
        try {
            return comp.name.includes("Collider") ||
                (comp.parent !== null && Util.isCollider(comp.parent));
        }
        catch {
            return false;
        }
    }
    static isActiveObject(comp) {
        try {
            return comp.method("get_gameObject")
                .invoke()
                .method("get_activeInHierarchy")
                .invoke();
        }
        catch (err) {
            // console.log(err);
            return false;
        }
    }
    static findActiveColliders(comps) {
        return comps.filter(comp => Util.isCollider(comp.class) &&
            Util.isActiveObject(comp));
    }
    static getRigidbody(collider) {
        let rb = collider.method('get_attachedRigidbody').invoke();
        return rb;
    }
    static isStaticCollider(collider) {
        try {
            return Util.getRigidbody(collider).isNull();
        }
        catch (err) {
            return false;
        }
    }
    static findStaticColliders(colliders) {
        return colliders.filter(collider => Util.isStaticCollider(collider));
    }
    static isKinematicCollider(collider) {
        try {
            return !Util.isStaticCollider(collider) &&
                Util.getRigidbody(collider)
                    .method("get_isKinematic")
                    .invoke();
        }
        catch (err) {
            return false;
        }
    }
    static findKinematicColliders(colliders) {
        return colliders.filter(collider => !Util.isKinematicCollider(collider));
    }
    static isTrigger(comp) {
        try {
            return comp.method("get_isTrigger").invoke();
        }
        catch (err) {
            // console.log(err);
            return false;
        }
    }
    // Potential triggers since we don't know if both sink and source are both
    // static colliders.
    static findPotentialTriggerables(colliders) {
        return colliders.filter(collider => {
            try {
                return Util.isTrigger(collider);
            }
            catch (e) {
                return false;
            }
        });
    }
    static removeStaticTriggerables(colliders) {
        return colliders.filter(collider => {
            try {
                return !Util.isStaticCollider(collider);
            }
            catch (e) {
                return false;
            }
        });
    }
    static findTriggerablesSink(comps) {
        return comps.filter(comp => (comp.tryMethod("OnTriggerEnter") ||
            comp.tryMethod("OnTriggerStay") ||
            comp.tryMethod("OnTriggerExit")) &&
            Util.isActiveObject(comp)
            ? true
            : false);
    }
    static findCollisionables(colliders) {
        return colliders.filter(collider => {
            try {
                // Is not static collider means rigidbody exists.
                // Is not kinematic means its a valid collision sink.
                return !Util.isTrigger(collider) &&
                    ((!Util.isStaticCollider(collider) &&
                        !Util.isKinematicCollider(collider)) ||
                        Util.isStaticCollider(collider) ||
                        Util.isKinematicCollider(collider));
            }
            catch (e) {
                return false;
            }
        });
    }
    static findCollisionSinks(comps) {
        return comps.filter(comp => (comp.tryMethod("OnCollisionEnter") ||
            comp.tryMethod("OnCollisionStay") ||
            comp.tryMethod("OnCollisionExit")) &&
            Util.isActiveObject(comp)
            ? true
            : false);
    }
}
exports.Util = Util;
class MethodInstructionsBuilder {
    instructions = new Map();
    methodName;
    mAddress;
    classHandle;
    shouldResolveBranches = true;
    // Calling object's register trace
    coReg = 'x0';
    adrpRegs = new Map();
    constructor(methodName, resolveBranches) {
        this.shouldResolveBranches = resolveBranches;
        this.methodName = methodName;
    }
    addInstruction(addr, ins) {
        this.instructions.set(addr.toString(), ins);
    }
    clear() { this.instructions.clear(); }
    buildAndClear() {
        let mi = this.build();
        this.clear();
        return mi;
    }
    build() {
        return new MethodInstructions(this.instructions);
    }
}
exports.MethodInstructionsBuilder = MethodInstructionsBuilder;
class MethodInstructions {
    instructions;
    constructor(instructions) {
        this.instructions = new Map(instructions);
    }
    toJson() {
        let jsonInstructions = [];
        this.instructions.forEach((instr, addr) => {
            jsonInstructions.push({
                instruction: instr.toString(),
                groups: instr.groups,
                mnemonic: instr.mnemonic,
                addr: addr
            });
        });
        return { "instructions": jsonInstructions };
    }
}
exports.MethodInstructions = MethodInstructions;

},{"./classes":1,"./loader":5}]},{},[4])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJjbGFzc2VzLnRzIiwiZXZlbnRzLnRzIiwiaG9va3MudHMiLCJpbmRleC50cyIsImxvYWRlci50cyIsIm5vZGVfbW9kdWxlcy9hc3NlcnQtdHMvbGliL2Fzc2VydC5qcyIsIm5vZGVfbW9kdWxlcy9hc3NlcnQtdHMvbGliL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2ZyaWRhLWlsMmNwcC1icmlkZ2UvZGlzdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvdGltZXJzLWJyb3dzZXJpZnkvbWFpbi5qcyIsInJwYy50cyIsInVuaXR5X3R5cGVzLnRzIiwidXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7QUNFQSxNQUFhLE9BQU87SUFDVixNQUFNLENBQUMsUUFBUSxDQUFVO0lBRWpDLGdCQUF1QixDQUFDO0lBRWpCLE1BQU0sQ0FBQyxXQUFXO1FBQ3ZCLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFO1lBQ3JCLE9BQU8sQ0FBQyxRQUFRLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztTQUNsQztRQUNELE9BQU8sT0FBTyxDQUFDLFFBQVEsQ0FBQztJQUMxQixDQUFDO0lBRUQsd0JBQXdCO0lBQ2pCLE1BQU0sR0FBb0IsSUFBSSxDQUFDO0lBQy9CLFNBQVMsR0FBb0IsSUFBSSxDQUFDO0lBRXpDLDJCQUEyQjtJQUNwQixZQUFZLEdBQW9CLElBQUksQ0FBQztJQUNyQyxtQkFBbUIsR0FBb0IsSUFBSSxDQUFDO0lBQzVDLGFBQWEsR0FBb0IsSUFBSSxDQUFDO0lBQ3RDLGtCQUFrQixHQUFvQixJQUFJLENBQUM7SUFDM0MsY0FBYyxHQUFvQixJQUFJLENBQUM7SUFFOUMsMkJBQTJCO0lBQ3BCLFNBQVMsR0FBb0IsSUFBSSxDQUFDO0lBQ2xDLFVBQVUsR0FBb0IsSUFBSSxDQUFDO0lBQ25DLFFBQVEsR0FB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QztDQUNGO0FBL1NELGtDQStTQzs7O0FDMzRCRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDbnBHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN4TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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

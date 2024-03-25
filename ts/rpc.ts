import "frida-il2cpp-bridge"

import {Event} from './events'
import {
  AllClasses,
  AllMethods,
  Loader,
  ResolvedSymbols,
} from "./loader"
import {promiseTimeout, Util} from "./utils"

export const loadSceneNotifier = new Int32Array(new SharedArrayBuffer(1024))
export const initNotifier = new Int32Array(new SharedArrayBuffer(1024))

const DEFAULT_TIMEOUT = 600000;

export class RPC {
  public static healthCheckCount = 0;

  protected constructor() {}

  /* Simple RPC to check if the frida instance is responding. */
  static checkHealth(): number {
    RPC.healthCheckCount++;
    return RPC.healthCheckCount;
  }

  static getUnityVersion(): string {
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

  static getInstructions(payload: string): string {
    RPC.healthCheckCount = 0;
    let instance = AllMethods.getInstance();
    let parse: InstructionsPayload = JSON.parse(payload);
    let methods = parse.methods;
    let returnPayload: any = {};
    for (const meta of methods) {
      let addr = meta;
      if (addr !== '0x0') {
        // let shouldResolve = meta.resolveBranches === 'True' ? true : false;
        const shouldResolve = true;
        let name = addr;
        if (instance.contains(addr)) {
          name = instance.getMethodName(addr)!;
          let handle = new NativePointer(instance.methods.get(addr)!);
          let method = new Il2Cpp.Method(handle);
          if (method.class.namespace === "System") {
            continue;
          }
        }
        let instructions = Util.resolveInstructions(new NativePointer(addr),
                                                    name, shouldResolve);
        returnPayload[addr] = instructions.toJson();
      }
    }
    return JSON.stringify(returnPayload);
  }

  static getInstructionsInterval(payload: string): string {
    RPC.healthCheckCount = 0;
    let instance = AllMethods.getInstance();
    let parse: InstructionsIntervalPayload = JSON.parse(payload);
    let start = parse.start;
    let end = parse.end;
    let returnPayload: any = {};
    if (start !== '0x0' || end !== '0x0') {
      // let shouldResolve = meta.resolveBranches === 'True' ? true : false;
      const shouldResolve = true;
      let name = start;
      let instructions = Util.resolveInstructionsInterval(
          new NativePointer(start), new NativePointer(end), name,
          shouldResolve);
      returnPayload[start] = instructions.toJson();
    }
    return JSON.stringify(returnPayload);
  }

  static getMethodsOfClassMethod(payload: string): string[] {
    RPC.healthCheckCount = 0;
    let instance = AllMethods.getInstance();
    let mAddr = payload;
    if (instance.contains(mAddr)) {
      let method = new NativePointer(instance.methods.get(mAddr)!);
      let il2cppMethod = new Il2Cpp.Method(method);
      let clazz = il2cppMethod.class;
      return clazz.methods.map(cMethod => cMethod.virtualAddress.toString());
    }
    return [];
  }

  /** @deprecated */
  static getReturnType(payload: string): string {
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

  static resolveSymbols(payload: string): string {
    RPC.healthCheckCount = 0;
    let symbol = JSON.parse(payload).toString();
    let returnPayload: any = {};
    let ref = new NativePointer(symbol);
    let symb = DebugSymbol.fromAddress(ref.readPointer());
    // console.log(ResolvedSymbols.getInstance().symbolsMap());
    let symAddr = ResolvedSymbols.getInstance().symbol(symb.name!);
    let methodAddr = Number(symAddr);
    // console.log(symAddr,
    //             AllMethods.getInstance().methods.get(returnPayload[symbol]),
    //             returnPayload[symbol]);
    if (symAddr && AllMethods.getInstance().contains(symAddr!)) {
      // console.log(
      //     AllMethods.getInstance().methods.get("0x" +
      //     methodAddr.toString(16)));
      returnPayload[symbol] = "0x" + methodAddr.toString(16);
    } else {
      returnPayload[symbol] = '0x0';
    }
    return JSON.stringify(returnPayload);
  }

  static getAllMethods(): string {
    RPC.healthCheckCount = 0;
    let allMethods =
        JSON.stringify(Array.from(AllMethods.getInstance().methods.entries()));
    console.log("getAllMethods:", allMethods);
    return allMethods;
  }

  static async countAllScenes() {
    RPC.healthCheckCount = 0;
    let count = Loader.countAllScenes();
    console.log("countAllScenes:", count);
    return count;
  }

  static loadSceneEvents(scene_index: number, delay_scenes_ms: number = 5000) {
    RPC.healthCheckCount = 0;
    let eventNames = Loader.loadSceneEvents(scene_index, delay_scenes_ms);
    console.log("eventNames:", eventNames)
    return eventNames;
  }

  static loadScene(scene_index: number) {
    RPC.healthCheckCount = 0;
    console.log("loadScene:")
    return Loader.loadScene("", scene_index, true);
  }

  static unloadScene(scene_index: number) {
    RPC.healthCheckCount = 0;
    console.log("unloadScene:")
    return Loader.unloadScene("", scene_index);
  }

  static async triggerEvent(payload: string) {
    RPC.healthCheckCount = 0;
    let event: Event = JSON.parse(payload);
    if (event === undefined) {
      return;
    }
    let nextEvents = await Loader.triggerEvent(event);
    console.log("triggerEvent:", nextEvents);
    return nextEvents;
  }

  static async triggerAllEvents(payload: string) {
    RPC.healthCheckCount = 0;
    let parse = JSON.parse(payload);
    const events = new Map<string, string[]>(Object.entries(parse));
    console.log("TRIGGER ALL", events);
    let nextEvents = await Loader.triggerAllEvents(events);
    console.log("triggerAllEvents:", nextEvents);
    return nextEvents;
  }

  static init() {
    RPC.healthCheckCount = 0;
    console.log("init:");
    return Loader.start();
  }
}

interface EventSequence {
  sequence: string[];
}

interface InstructionsPayload {
  methods: string[];
}

interface InstructionsIntervalPayload {
  start: string;
  end: string;
}

interface InstructionsAddressPayload {
  methodAddr: string;
}

interface SymbolsPayload {
  symbols: string;
}

import {Classes} from './classes';
import {TriggeredEvents} from './events';
import {AllMethods} from './loader';

const libunity = "libunity.so";
const mbedtls = "mbedtls_x509_crt_verify_with_profile";
const tls = "x509_crt_verify_restartable_ca_cb";

export class APIHooker {

  static enableLeaks: boolean = false;
  static enableEntitlement: boolean = true;

  protected constructor() {}

  // Bypass Java Android SSL Pinning
  // Source: https://codeshare.frida.re/@masbog/frida-android-unpinning-ssl/
  public static bypassJavaSSLPinning() {
    setTimeout(function() {
      Java.perform(function() {
        console.log("");
        console.log("[.] Android Cert Pinning Bypass");

        var CertificateFactory =
            Java.use("java.security.cert.CertificateFactory");
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
          var TrustManagerImpl =
              Java.use('com.android.org.conscrypt.TrustManagerImpl');
          var ArrayList = Java.use("java.util.ArrayList");
          TrustManagerImpl.verifyChain.implementation = function(
              untrustedChain: any, trustAnchorChain: any, host: any,
              clientAuth: any, ocspData: any, tlsSctData: any) {
            console.log("[+] Bypassing TrustManagerImpl->verifyChain()");
            return untrustedChain;
          };

          TrustManagerImpl.checkTrustedRecursive.implementation = function(
              certs: any, host: any, clientAuth: any, untrustedChain: any,
              trustAnchorChain: any, used: any) {
            console.log(
                "[+] Bypassing TrustManagerImpl->checkTrustedRecursive()");
            return ArrayList.$new();
          };
        } catch (err) {
          console.log("[-] TrustManagerImpl Not Found");
        }

        // if (is_android_n === 0) {
        //--------
        console.log("[.] TrustManager Android < 7 detection...");
        // Implement a new TrustManager
        // ref: https://gist.github.com/oleavr/3ca67a173ff7d207c6b8c3b0ca65a9d8
        var TrustManager = Java.registerClass({
          name : 'com.sensepost.test.TrustManager',
          implements : [ X509TrustManager ],
          methods : {
            checkClientTrusted : function(chain, authType) {},
            checkServerTrusted : function(chain, authType) {},
            getAcceptedIssuers : function() { return []; }
          }
        });

        // Prepare the TrustManagers array to pass to SSLContext.init()
        var TrustManagers = [ TrustManager.$new() ];

        // Get a handle on the init() on the SSLContext class
        var SSLContext_init = SSLContext.init.overload(
            '[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;',
            'java.security.SecureRandom');

        try {
          // Override the init method, specifying our new TrustManager
          SSLContext_init.implementation = function(
              keyManager: any, trustManager: any, secureRandom: any) {
            console.log(
                "[+] Overriding SSLContext.init() with the custom TrustManager android < 7");
            SSLContext_init.call(this, keyManager, TrustManagers, secureRandom);
          };
        } catch (err) {
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
              .implementation = function() {
            console.log(
                "[+] OkHTTP 3.x check() called. Not throwing an exception.");
          };
        } catch (err) {
          // If we dont have a ClassNotFoundException exception, raise the
          // problem encountered.
          console.log("[-] OkHTTP 3.x Not Found")
        }

        //--------
        console.log("[.] Appcelerator Titanium detection...");
        // Appcelerator Titanium PinningTrustManager
        // Wrap the logic in a try/catch as not all applications will have
        // appcelerator as part of the app.
        try {
          var PinningTrustManager =
              Java.use('appcelerator.https.PinningTrustManager');
          console.log("[+] Appcelerator Titanium Found");
          PinningTrustManager.checkServerTrusted.implementation = function() {
            console.log(
                "[+] Appcelerator checkServerTrusted() called. Not throwing an exception.");
          }

        } catch (err) {
          // If we dont have a ClassNotFoundException exception, raise the
          // problem encountered.
          console.log("[-] Appcelerator Titanium Not Found");
        }
      });
    }, 0);
  }

  // Adapted from OVRSeen.
  // https://github.com/UCI-Networking-Group/OVRseen
  public static bypassUnitySSLPinning(function_offset: NativePointer,
                                      use_mbed_tls: boolean) {
    var modulesArray = Process.enumerateModules();
    for (var i = 0; i < modulesArray.length; i++) {
      if (modulesArray[i].path.indexOf(libunity) != -1) {
        var base_address = Module.findBaseAddress(libunity);
        if (base_address) {
          var function_address =
              base_address.add(function_offset); // Spatial for function
          let hooked_function = use_mbed_tls ? mbedtls : tls;
          console.log("Hooking", hooked_function, "at", function_address);
          Interceptor.attach(function_address, {
            onEnter(args: any[]) {
              if (use_mbed_tls) {
                console.log("FOUND:", hooked_function, args[5]);
                this.flags =
                    args[5]; // mbedtls_x509_crt_verify_with_profile flag at 5
              } else {
                console.log("FOUND:", hooked_function, args[5]);
                this.flags =
                    args[5]; // x509_cert_verify_restartable_ca_cb flag at 5
              }
            },
            onLeave(retval: any) {
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

  public static bypassUnitySSLPinningIl2Cpp() {
    let classes = Classes.getInstance();
    if (classes.CertificateHandler) {
      let certificateHandler = classes.CertificateHandler!.rawImageClass;
      let validate = certificateHandler.tryMethod("ValidateCertificateNative");
      if (validate) {
        validate.implementation = function() {
          console.log("Bypass Validation!");
          return true;
        }
      }
    }
    if (classes.UnityWebRequest) {
      let uwr = classes.UnityWebRequest!.rawImageClass;
      uwr.methods.forEach(method => {
        if (method.name.includes(".ctor")) {
          method.implementation = function(args: any[]) {
            let ret = method.invoke(...args) as Il2Cpp.Object;
            let field = ret.tryField<Il2Cpp.Object>("m_CertificateHandler");
            if (field) {
              console.log("Nullifying certificateHandler");
              field.value = new Il2Cpp.Object(ptr(0x0));
            }
            return ret;
          }
        }
      });
    }
  }

  public static revertEntitlementCheck_alt() {
    let instance = Classes.getInstance();
    let uCAPI = instance.CAPI;
    if (uCAPI && APIHooker.enableEntitlement) {
      let CAPI = uCAPI.rawImageClass;
      let MessageIsError = CAPI.method<boolean>("ovr_Message_IsError", 1);
      MessageIsError.revert();
    }
  }

  public static hookEntitlementCheck_alt2() {
    let instance = Classes.getInstance();
    let uCAPI = instance.CAPI;
    const USER_ENTITLEMENT = "ovr_Entitlement_GetIsViewerEntitled";
    if (uCAPI && APIHooker.enableEntitlement) {
      let CAPI = uCAPI.rawImageClass;
      let ovrGetIsViewerEntitled = CAPI.method<void>(USER_ENTITLEMENT);
      console.log("HOOKING");
      ovrGetIsViewerEntitled.implementation = function() {
        console.log(USER_ENTITLEMENT);
        return
      }
    }
  }

  public static hookEntitlementCheck_alt() {
    let instance = Classes.getInstance();
    let uCAPI = instance.CAPI;
    const USER_ENTITLEMENT = "Entitlement_GetIsViewerEntitled";
    if (uCAPI && APIHooker.enableEntitlement) {
      let CAPI = uCAPI.rawImageClass;
      let MessageGetType = CAPI.method<Il2Cpp.Object>("ovr_Message_GetType", 1);
      let MessageIsError = CAPI.method<boolean>("ovr_Message_IsError", 1);

      MessageGetType.implementation = function(
                                          v1: NativePointer): Il2Cpp.Object {
        let retType = MessageGetType.invoke(v1);
        console.log(retType, ":", v1);
        if (retType.toString() == USER_ENTITLEMENT) {
          let message = v1;
          MessageIsError.implementation = function(v1: NativePointer): boolean {
            console.log("MESSAGE IS ERROR", v1);
            if (message.toString() == v1.toString()) {
              console.log("FOUND ERROR");
              return false;
            }
            let ret = MessageIsError.invoke(v1);
            return ret;
          }
        }
        return retType;
      }
    }
  }

  public static hookEntitlementCheck() {
    let instance = Classes.getInstance();
    let uCAPI = instance.CAPI;
    let uMessage = instance.Message;
    let uEntitlements = instance.Entitlements;
    if (uCAPI && uMessage && uEntitlements && APIHooker.enableEntitlement) {
      let Message = uMessage.rawImageClass;
      let CAPI = uCAPI.rawImageClass;
      let Entitlements = uEntitlements.rawImageClass;
      if (CAPI && Message && Entitlements) {
        let isUserEntitled =
            Entitlements.method<Il2Cpp.Object>("IsUserEntitledToApplication");
        isUserEntitled.implementation = function(): any {
          let ret = isUserEntitled.invoke();
          if (ret) {
            let onComplete = ret.method("OnComplete", 1);
            console.log(onComplete);
            onComplete.implementation = function(v1: Il2Cpp.Object): any {
              v1.method("Invoke", 1).implementation = function(
                  message: Il2Cpp.Object) {
                let isErr = message.method<boolean>("get_IsError");
                isErr.implementation = function() {
                  console.log("RETURNING NO ERROR");
                  return false;
                };
                let err = message.method<Il2Cpp.Object>("GetError");
                err.implementation = function() {
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

  private static bytesToString(bytes: number[]) {
    const asciiString = bytes.map((byte) => String.fromCharCode(byte)).join('');
    console.log(asciiString);
  }

  public static hookUploadHandlerData(curr_scene: number) {
    let instance = Classes.getInstance();
    if (instance.UploadHandlerRaw) {
      let createMethod =
          instance.UploadHandlerRaw.rawImageClass.method("Create");
      createMethod.implementation = function(
          v1: any, v2: Il2Cpp.Array<Il2Cpp.ValueType>): any {
        let ret = createMethod.invoke(v1, v2);
        console.log("!!!!UPLOAD!!!! From scene:", curr_scene,
                    "method:", createMethod.name, "args:", v1, v2, "ret:", ret);
        console.log("!!!!DATA!!!!!", v2.toString());
        if (!v2.isNull()) {
          let stringRep = v2.toString();
          let byteArr =
              stringRep.replace("[", '').replace("]", '').split(",").map(
                  function(item) { return parseInt(item, 10); });
          APIHooker.bytesToString(byteArr);
        }
        return ret;
      }
    }
  }
  public static hookAnalytics() {
    let instance = Classes.getInstance();
    if (instance.Analytics) {
      let Analytics = instance.Analytics!.rawImageClass;
      let methods = Analytics.methods;
      let CustomEventName = Analytics.method("CustomEvent", 1);
      let CustomEvent = Analytics.method("CustomEvent", 2);

      CustomEventName.implementation = function(v1: Il2Cpp.String) {
        let ret = CustomEventName.invoke(v1);
        console.log("!!!!ANALYTICS!!!!", "method:", CustomEventName.name,
                    "args:", v1, "ret:", ret);
        return ret;
      };
      CustomEvent.implementation = function(v1: Il2Cpp.String,
                                            eventData: Il2Cpp.Object) {
        let ret = CustomEventName.invoke(v1);
        let data = new Map<string, Il2Cpp.Object>();
        let keys =
            eventData.method<Il2Cpp.Array<Il2Cpp.String>>("get_Keys").invoke();
        console.log("!!!!ANALYTICS!!!!", "method:", CustomEvent.name,
                    "args:", v1, eventData, "ret:", ret);
        for (const key of keys) {
          let value =
              eventData.method<Il2Cpp.Object>("get_Item", 1).invoke(key);
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

  public static hookNetworkSends(curr_scene: number) {
    let instance = Classes.getInstance();
    if (instance.Socket) {
      let Socket = instance.Socket!.rawImageClass;
      let methods = Socket.methods;
      methods.forEach(method => {
        if (method.name.startsWith("Send_internal")) {
          console.log("Found send method:", method.name);
          method.implementation = function(
              v1: any, buffer: Il2Cpp.Pointer<Il2Cpp.ValueType>, count: number,
              ...args: any): any {
            let ret = method.invoke(v1, buffer, count, ...args);
            console.log("!!!!SEND!!!! From scene:", curr_scene,
                        "method:", method.name, "args:", buffer, count,
                        "ret:", ret);
            console.log("!!!!DATA!!!!!", buffer.toString());
            if (!buffer.isNull()) {
              let stringRep = buffer.toString();
              let byteArr =
                  stringRep.replace("[", '').replace("]", '').split(",").map(
                      function(item) { return parseInt(item, 10); });
              APIHooker.bytesToString(byteArr);
            }
            return ret;
          }
        } else {
          method.implementation = function(...args: any) {
            let ret = method.invoke(...args);
            console.log("!!!!SEND!!!! From scene:", curr_scene,
                        "method:", method.name, "args:", ...args, "ret:", ret);
            return ret;
          }
        }
      });
    }
  }

  public static hookSysInfo(curr_scene: number) {
    let instance = Classes.getInstance();
    if (instance.SystemInfo && APIHooker.enableLeaks) {
      let allMethods = AllMethods.getInstance();
      let sysInfo = instance.SystemInfo;
      let methods = sysInfo.rawImageClass.methods;
      methods.forEach(method => {
        if (method.name.includes("get_device")) {
          method.implementation = function(...args: any): any {
            let ret = method.invoke(...args);
            console.log("!!!!SYSINFO!!!! From scene:", curr_scene,
                        "method:", method.name, "args:", args, "ret:", ret);
            TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                                                   method.name);
            return ret;
          };
        }
      });
    }
  }

  public static hookBodyTracking(curr_scene: number, obj: Il2Cpp.Object) {
    let instance = Classes.getInstance();
    if (instance.OVRBody && APIHooker.enableLeaks) {
      let allMethods = AllMethods.getInstance();
      let OVRBody = instance.OVRBody;
      let methods = OVRBody.rawImageClass.methods;
      methods.forEach(method => {
        method.implementation = function(...args: any): any {
          console.log("Body");
          let ret =
              obj.method(method.name, method.parameterCount).invoke(...args);
          console.log("!!!!BODY!!!! From scene:", curr_scene,
                      "method:", method.name, "args:", args, "ret:", ret);
          TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                                                 method.name);
          return ret;
        };
      });
    }
  }

  public static hookBoundsTracking(curr_scene: number) {
    let instance = Classes.getInstance();
    if (instance.OVRBoundary && APIHooker.enableLeaks) {
      let allMethods = AllMethods.getInstance();
      let OVRBoundary = instance.OVRBoundary;
      let methods = OVRBoundary.rawImageClass.methods;
      methods.forEach(method => {
        method.implementation = function(...args: any): any {
          let ret = method.invoke(...args);
          console.log("!!!!BOUNDS!!!! From scene:", curr_scene,
                      "method:", method.name, "args:", args, "ret:", ret);
          TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                                                 method.name);
          return ret;
        };
      });
    }
  }

  public static hookEyeTracking(curr_scene: number, obj: Il2Cpp.Object) {
    let instance = Classes.getInstance();
    if (instance.OVREyeGaze && APIHooker.enableLeaks) {
      let allMethods = AllMethods.getInstance();
      let OVREyeGaze = instance.OVREyeGaze;
      let methods = OVREyeGaze.rawImageClass.methods;
      methods.forEach(method => {
        method.implementation = function(...args: any): any {
          console.log("Eye");
          let ret =
              obj.method(method.name, method.parameterCount).invoke(...args);
          console.log("!!!!EYE!!!! From scene:", curr_scene,
                      "method:", method.name, "args:", args, "ret:", ret);
          TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                                                 method.name);
          return ret;
        };
      });
    }
  }
  public static hookFaceTracking(curr_scene: number, obj: Il2Cpp.Object) {
    let instance = Classes.getInstance();
    if (instance.OVRFace && APIHooker.enableLeaks) {
      let allMethods = AllMethods.getInstance();
      let OVRFace = instance.OVRFace;
      let methods = OVRFace.rawImageClass.methods;
      methods.forEach(method => {
        method.implementation = function(...args: any): any {
          console.log("Face");
          let ret =
              obj.method(method.name, method.parameterCount).invoke(...args);
          console.log("!!!!FACE!!!! From scene:", curr_scene,
                      "method:", method.name, "args:", args, "ret:", ret);
          TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                                                 method.name);
          return ret;
        };
      });
    }
  }

  public static hookFaceExpressionsTracking(curr_scene: number,
                                            obj: Il2Cpp.Object) {
    let instance = Classes.getInstance();
    if (instance.OVRFaceExpressions && APIHooker.enableLeaks) {
      let allMethods = AllMethods.getInstance();
      let OVRFaceExpressions = instance.OVRFaceExpressions;
      let methods = OVRFaceExpressions.rawImageClass.methods;
      methods.forEach(method => {
        method.implementation = function(...args: any): any {
          console.log("Face");
          let ret =
              obj.method(method.name, method.parameterCount).invoke(...args);
          console.log("!!!!FACE!!!! From scene:", curr_scene,
                      "method:", method.name, "args:", args, "ret:", ret);
          TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                                                 method.name);
          return ret;
        };
      });
    }
  }

  public static hookLocation(curr_scene: number) {
    let instance = Classes.getInstance();
    if (instance.LocationService && APIHooker.enableLeaks) {
      let allMethods = AllMethods.getInstance();
      let LocationService = instance.LocationService;
      let methods = LocationService.rawImageClass.methods;
      methods.forEach(method => {
        if (!method.name.includes("FreeMessage") &&
            !method.name.includes("PopMessage")) {
          method.implementation = function(...args: any): any {
            console.log("Location");
            let ret = method.invoke(...args);
            console.log("!!!!LOCATION!!!! From scene:", curr_scene,
                        "method:", method.name, "args:", args, "ret:", ret);
            TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                                                   method.name);
            return ret;
          };
        }
      });
    }
  }

  public static hookCAPI(curr_scene: number) {
    let instance = Classes.getInstance();
    if (instance.CAPI) {
      let allMethods = AllMethods.getInstance();
      let CAPI = instance.CAPI;
      let methods = CAPI.rawImageClass.methods;
      methods.forEach(method => {
        if (!method.name.includes("FreeMessage") &&
            !method.name.includes("PopMessage")) {
          method.implementation = function(...args: any): any {
            let ret = method.invoke(...args);
            console.log("!!!!CAPI!!!! From scene:", curr_scene,
                        "method:", method.name, "args:", args, "ret:", ret);
            TriggeredEvents.getInstance().addEvent(method.class.name + "$$" +
                                                   method.name);
            return ret;
          };
        }
      });
    }
  }

  public static hookVRTrackingAPI(curr_scene: number,
                                  activeObjects: Il2Cpp.Object[]) {
    let classes = Classes.getInstance();
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
            if (classes.OVRFaceExpressions.rawImageClass.isAssignableFrom(
                    object.class)) {
              APIHooker.hookFaceExpressionsTracking(curr_scene, object);
            }
          }
          if (classes.OVRBody && classes.OVRBody.rawImageClass) {
            if (classes.OVRBody.rawImageClass.isAssignableFrom(object.class)) {
              APIHooker.hookBodyTracking(curr_scene, object);
            }
          }
          if (classes.OVREyeGaze && classes.OVREyeGaze.rawImageClass) {
            if (classes.OVREyeGaze.rawImageClass.isAssignableFrom(
                    object.class)) {
              APIHooker.hookEyeTracking(curr_scene, object);
            }
          }
        }
      } catch (e) {
        console.log(e)
      }
    });
  }

  public static revertHookOVR() {
    let instance = Classes.getInstance();
    if (instance.OVRBody) {
      let OVRBody = instance.OVRBody;
      let methods = OVRBody.rawImageClass.methods;
      methods.forEach(method => {method.revert()});
    }
    if (instance.OVRBoundary) {
      let OVRBoundary = instance.OVRBoundary;
      let methods = OVRBoundary.rawImageClass.methods;
      methods.forEach(method => {method.revert()});
    }
    if (instance.OVREyeGaze) {
      let OVREyeGaze = instance.OVREyeGaze;
      let methods = OVREyeGaze.rawImageClass.methods;
      methods.forEach(method => {method.revert()});
    }
    if (instance.OVRFace) {
      let OVRFace = instance.OVRFace;
      let methods = OVRFace.rawImageClass.methods;
      methods.forEach(method => {method.revert()});
    }
  }

  public static revertHookSysInfo() {
    let instance = Classes.getInstance();
    if (instance.SystemInfo) {
      let SysInfo = instance.SystemInfo;
      let methods = SysInfo.rawImageClass.methods;
      methods.forEach(method => {method.revert()});
    }
  }
  public static revertHookCAPI() {
    let instance = Classes.getInstance();
    if (instance.CAPI) {
      let CAPI = instance.CAPI;
      let methods = CAPI.rawImageClass.methods;
      methods.forEach(method => {method.revert()});
    }
  }

  public static revertHookUploadHandlerData() {
    let instance = Classes.getInstance();
    if (instance.UploadHandlerRaw) {
      let UploadHandlerRaw = instance.UploadHandlerRaw;
      let methods = UploadHandlerRaw.rawImageClass.methods;
      methods.forEach(method => {method.revert()});
    }
  }
}

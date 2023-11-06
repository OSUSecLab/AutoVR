import {UnityClass, UnityMethod} from "./unity_types"

export class Classes {
  private static instance: Classes;

  private constructor() {}

  public static getInstance(): Classes {
    if (!Classes.instance) {
      Classes.instance = new Classes();
    }
    return Classes.instance;
  }

  /* Unity base classes */
  public Object: UnityClass|null = null;
  public Resources: UnityClass|null = null;

  /* Scene related classes */
  public SceneManager: UnityClass|null = null;
  public LoadSceneParameters: UnityClass|null = null;
  public LoadSceneMode: UnityClass|null = null;
  public UnloadSceneOptions: UnityClass|null = null;
  public AsyncOperation: UnityClass|null = null;

  /* General Unity objects */
  public Component: UnityClass|null = null;
  public GameObject: UnityClass|null = null;
  public Collider: UnityClass|null = null;
  public Rigidbody: UnityClass|null = null;

  /* UI event handlers */
  public IBeginDragHandler: UnityClass|null = null;
  public ICancelHandler: UnityClass|null = null;
  public IDeselectHandler: UnityClass|null = null;
  public IDragHandler: UnityClass|null = null;
  public IDropHandler: UnityClass|null = null;
  public IEndDragHandler: UnityClass|null = null;
  public IInitializePotentialDragHandler: UnityClass|null = null;
  public IMoveHandler: UnityClass|null = null;
  public IPointerClickHandler: UnityClass|null = null;
  public IPointerDownHandler: UnityClass|null = null;
  public IPointerEnterHandler: UnityClass|null = null;
  public IPointerExitHandler: UnityClass|null = null;
  public IPointerUpHandler: UnityClass|null = null;
  public IScrollHandler: UnityClass|null = null;
  public ISelectHandler: UnityClass|null = null;
  public ISubmitHandler: UnityClass|null = null;
  public IUpdateSelectedHandler: UnityClass|null = null;

  /* UI event handlers in array form */
  public EventHandlers: UnityClass[] = [];

  /* UI event helpers */
  public UnityAction: UnityClass|null = null;
  public UnityEvent: UnityClass|null = null;
  public UnityEventBase: UnityClass|null = null;
  public InvokableCall: UnityClass|null = null;
  public InvokableCallList: UnityClass|null = null;
  public PersistentCall: UnityClass|null = null;
  public ExecuteEvents: UnityClass|null = null;
  public PointerEventData: UnityClass|null = null;
  public EventSystem: UnityClass|null = null;

  /* Oculus API bridge */
  public CAPI: UnityClass|null = null;
  public Message: UnityClass|null = null;

  /* Entitlements */
  public Entitlements: UnityClass|null = null;

  /* Oculus VR Tracking */
  public OVRBody: UnityClass|null = null;
  public OVRBoundary: UnityClass|null = null;
  public OVREyeGaze: UnityClass|null = null;
  public OVRFace: UnityClass|null = null;
  public OVRFaceExpressions: UnityClass|null = null;

  /* Unity LocationService API */
  public LocationService: UnityClass|null = null;

  /* Unity SystemInfo API */
  public SystemInfo: UnityClass|null = null;

  /* Application */
  public Application: UnityClass|null = null;

  /* Analytics */
  public Analytics: UnityClass|null = null;

  /* Sockets */
  public Socket: UnityClass|null = null;

  /* UnityWebRequest UploadHandler */
  public UploadHandlerRaw: UnityClass|null = null;

  /* UnityWebRequest CertificateHandler */
  public CertificateHandler: UnityClass|null = null;

  /* UnityWebRequest */
  public UnityWebRequest: UnityClass|null = null;
}

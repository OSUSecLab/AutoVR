function assert(value: unknown): asserts value {
  if (!value) {
    throw new Error("Assertion failed");
  }
}

export interface SceneIndex {
  raw: number|string|null;
}

export enum SceneType {
  Unknown = 0,
  Build = 1,
  AssetBundle = 2,
  Addressable = 3,
  Count = 4,
}

export interface Scene {
  raw: number | string | null;
  type: SceneType;
  assetBundle: Il2Cpp.Object | null;
}

// TODO: SceneMap should be queue-like instead of a known number of entries.
export class SceneMap {
  private static instance: SceneMap;

  sceneMap: Map<number, Scene>;

  constructor() { this.sceneMap = new Map<number, Scene>(); }

  public static getInstance(): SceneMap {
    if (!SceneMap.instance) {
      SceneMap.instance = new SceneMap();
    }
    return SceneMap.instance;
  }

  setScene(index: number, scene: Scene) {
    this.sceneMap.set(index, scene);
  }

  addScene(scene: Scene) {
    this.sceneMap.set(this.sceneMap.size, scene);
  }

  getScene(index: number): Scene {
    assert(index <= this.sceneMap.size);
    return this.sceneMap.get(index)!;
  }

  hasScene(index: number): boolean {
    return this.sceneMap.has(index);
  }

  forEach(callback: (value: Scene, key: number, map: Map<number, Scene>) => void) {
    this.sceneMap.forEach(callback);
  }

  findSceneByName(name: string): Scene | null {
    for (const scene of this.sceneMap.values()) {
      if (scene.raw === name) return scene;
    }
    return null;
  }

  filterScenesByType(type: SceneType): Scene[] {
    return Array.from(this.sceneMap.values()).filter(scene => scene.type === type);
  }

  get count(): number { return this.sceneMap.size; }
}


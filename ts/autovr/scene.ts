function assert(value: unknown): asserts value {
  if (!value) {
    throw new Error("Assertion failed");
  }
}

export interface SceneIndex {
  raw: number|string|null;
}

export class SceneMap {
  sceneMap: Map<number, SceneIndex>;

  constructor() { this.sceneMap = new Map<number, SceneIndex>(); }

  setSceneIdentifier(index: number, sceneInstance: SceneIndex) {
    this.sceneMap.set(index, sceneInstance);
  }

  get(index: number): SceneIndex {
    assert(index <= this.sceneMap.size);
    return this.sceneMap.get(index)!;
  }

  get count(): number { return this.sceneMap.size; }
}

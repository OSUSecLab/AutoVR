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

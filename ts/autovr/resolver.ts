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
import {AllMethods, ResolvedClasses, ResolvedObjects} from "./loader.js"

export class Resolver {
  protected constructor() {}

  public resolveEvents(payload: string) {
    let parsed: MethodMeta[] = JSON.parse(payload);
    for (const meta of parsed) {
      if (meta.contains_target) {
        // Start analysis
      }
    }
  }
}

interface MethodMeta {
  m_name: string;
  reads: string[];
  writes: string[];
  branches: string[];
  contains_target: boolean;
}

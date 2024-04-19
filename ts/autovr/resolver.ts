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

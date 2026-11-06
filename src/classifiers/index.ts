import type { Verdict } from "../shared/types";
import type { Classifier } from "./types";
import { rulesClassifier } from "./rules";
import { keywordClassifier } from "./keywords";

/** Order matters: the first classifier to return a category wins. */
export const classifiers: Classifier[] = [rulesClassifier, keywordClassifier];

/** Run every classifier on one post and merge results by category. */
export async function classifyAll(text: string): Promise<Verdict[]> {
  const parts = await Promise.all(
    classifiers.map(async (c) => {
      try {
        return await c.classify(text);
      } catch (err) {
        console.warn(`[x-post-analyzer] classifier "${c.name}" failed`, err);
        return [] as Verdict[];
      }
    }),
  );
  const merged = new Map<string, Verdict>();
  for (const verdicts of parts) {
    for (const v of verdicts) if (!merged.has(v.category)) merged.set(v.category, v);
  }
  return [...merged.values()];
}

/** Overlay `refined` verdicts on `base`: a refined category replaces the baseline one. */
export function mergeVerdicts(base: Verdict[], refined: Verdict[]): Verdict[] {
  const replaced = new Set(refined.map((v) => v.category));
  return [...base.filter((v) => !replaced.has(v.category)), ...refined];
}

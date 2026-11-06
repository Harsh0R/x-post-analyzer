import type { CategoryId } from "../shared/categories";
import type { Verdict } from "../shared/types";

/**
 * Every backend (rules, keyword baseline, Transformers.js, local LLM, Jev...)
 * implements this. Add a new one to the list in index.ts; earlier entries win
 * when two classifiers handle the same category.
 */
export interface Classifier {
  readonly name: string;
  readonly handles: readonly CategoryId[];
  classify(text: string): Verdict[] | Promise<Verdict[]>;
}

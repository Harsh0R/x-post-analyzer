import type { CategoryId } from "./categories";

/**
 * One classifier output.
 * - choice: label is the chosen option, confidence is its probability
 * - yesno:  label is "yes" or "no", confidence is the probability of that label
 * - score:  value is 0..1, label is a short tag, confidence is how sure we are
 */
export interface Verdict {
  category: CategoryId;
  label: string;
  confidence: number;
  value?: number;
}

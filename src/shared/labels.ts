import type { CategoryId } from "./categories";
import type { Verdict } from "./types";

export const LABELS_KEY = "labels";

export interface PredictedLabel {
  label: string;
  confidence: number;
  value?: number;
}

/** One post you labeled by hand. Stored locally only. */
export interface LabelRecord {
  id: string;
  text: string;
  ts: number;
  /** Your answers. yes/no (and toxicity) use "yes"/"no"; choice categories use the option. */
  truth: Partial<Record<CategoryId, string>>;
  /** What the extension showed at the time, so accuracy can be measured later. */
  predicted: Partial<Record<CategoryId, PredictedLabel>>;
}

export function predictedFrom(verdicts: Verdict[]): LabelRecord["predicted"] {
  const out: LabelRecord["predicted"] = {};
  for (const v of verdicts) {
    out[v.category] = { label: v.label, confidence: v.confidence, value: v.value };
  }
  return out;
}

export async function getLabels(): Promise<LabelRecord[]> {
  const stored = await chrome.storage.local.get(LABELS_KEY);
  return (stored[LABELS_KEY] as LabelRecord[] | undefined) ?? [];
}

/** Insert or replace by post id (relabeling a post overwrites the earlier answer). */
export async function addLabel(rec: LabelRecord): Promise<number> {
  const all = await getLabels();
  const next = all.filter((r) => r.id !== rec.id);
  next.push(rec);
  await chrome.storage.local.set({ [LABELS_KEY]: next });
  return next.length;
}

export async function clearLabels(): Promise<void> {
  await chrome.storage.local.remove(LABELS_KEY);
}

export function exportJson(records: LabelRecord[]): string {
  return JSON.stringify({ version: 1, labels: records }, null, 2);
}

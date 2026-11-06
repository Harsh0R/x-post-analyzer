import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "../shared/categories";
import type { LabelRecord } from "../shared/labels";

export interface CategoryReport {
  category: CategoryId;
  kind: "choice" | "yesno" | "score";
  n: number;
  accuracy: number;
  /** yes/no and score categories only */
  precision?: number;
  recall?: number;
  f1?: number;
  /** yes/no and score categories only: threshold with the best F1 on your labels */
  bestThreshold?: number;
  bestF1?: number;
}

const THRESHOLDS = Array.from({ length: 14 }, (_, i) => +(0.3 + i * 0.05).toFixed(2));

/** Probability that the answer is "yes", reconstructed from what was predicted. */
function probYes(kind: "yesno" | "score", p: { label: string; confidence: number; value?: number }): number {
  if (kind === "score") return p.value ?? 0;
  return p.label === "yes" ? p.confidence : 1 - p.confidence;
}

function prf(tp: number, fp: number, fn: number) {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export function evaluate(records: LabelRecord[]): CategoryReport[] {
  const reports: CategoryReport[] = [];
  for (const category of CATEGORY_IDS) {
    const def = CATEGORIES[category];
    const rows = records.filter((r) => r.truth[category] !== undefined && r.predicted[category]);
    if (rows.length === 0) continue;

    if (def.kind === "choice") {
      const correct = rows.filter((r) => r.predicted[category]!.label === r.truth[category]).length;
      reports.push({ category, kind: "choice", n: rows.length, accuracy: correct / rows.length });
      continue;
    }

    const kind = def.kind;
    const scored = rows.map((r) => ({
      p: probYes(kind, r.predicted[category]!),
      truth: r.truth[category] === "yes",
    }));
    const at = (t: number) => {
      let tp = 0, fp = 0, fn = 0, tn = 0;
      for (const s of scored) {
        const pred = s.p >= t;
        if (pred && s.truth) tp++;
        else if (pred && !s.truth) fp++;
        else if (!pred && s.truth) fn++;
        else tn++;
      }
      return { tp, fp, fn, tn };
    };

    const base = at(0.5);
    const { precision, recall, f1 } = prf(base.tp, base.fp, base.fn);
    let bestThreshold = 0.5;
    let bestF1 = -1;
    for (const t of THRESHOLDS) {
      const c = at(t);
      const m = prf(c.tp, c.fp, c.fn);
      if (m.f1 > bestF1) {
        bestF1 = m.f1;
        bestThreshold = t;
      }
    }
    reports.push({
      category,
      kind,
      n: rows.length,
      accuracy: (base.tp + base.tn) / rows.length,
      precision,
      recall,
      f1,
      bestThreshold,
      bestF1,
    });
  }
  return reports;
}

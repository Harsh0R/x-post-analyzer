/**
 * Measure how accurate the badges were on posts you labeled.
 *
 *   1. In the popup, turn on "Labeling mode", label some posts with the pencil button.
 *   2. Click "Export labels" in the popup to get labels.json.
 *   3. npm run evaluate -- path/to/labels.json
 */
import { readFileSync } from "node:fs";
import { evaluate } from "../src/eval/metrics";
import type { LabelRecord } from "../src/shared/labels";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run evaluate -- path/to/labels.json");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(path, "utf8")) as { labels?: LabelRecord[] } | LabelRecord[];
const records = Array.isArray(raw) ? raw : (raw.labels ?? []);
console.log(`${records.length} labeled posts\n`);

const pct = (x: number | undefined) => (x === undefined ? "" : `${(x * 100).toFixed(0)}%`);
console.table(
  evaluate(records).map((r) => ({
    category: r.category,
    kind: r.kind,
    n: r.n,
    accuracy: pct(r.accuracy),
    precision: pct(r.precision),
    recall: pct(r.recall),
    f1: pct(r.f1),
    bestThreshold: r.bestThreshold ?? "",
    bestF1: pct(r.bestF1),
  })),
);
console.log("\nbestThreshold = the confidence cut-off that scored highest F1 on your labels.");
console.log("Set that as the threshold, and expect noisy numbers below ~30 labels per category.");

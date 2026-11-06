import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../src/eval/metrics";
import type { LabelRecord } from "../src/shared/labels";

const rec = (truth: LabelRecord["truth"], predicted: LabelRecord["predicted"]): LabelRecord => ({
  id: String(Math.random()),
  text: "",
  ts: 0,
  truth,
  predicted,
});

test("yes/no precision, recall and a best threshold", () => {
  const rows = [
    rec({ promo: "yes" }, { promo: { label: "yes", confidence: 0.9 } }),
    rec({ promo: "yes" }, { promo: { label: "yes", confidence: 0.55 } }),
    rec({ promo: "no" }, { promo: { label: "yes", confidence: 0.6 } }),
    rec({ promo: "no" }, { promo: { label: "no", confidence: 0.7 } }),
  ];
  const r = evaluate(rows).find((x) => x.category === "promo")!;
  assert.equal(r.n, 4);
  assert.equal(r.kind, "yesno");
  // at 0.5: predicted yes = rows 1,2,3 -> tp 2, fp 1, fn 0
  assert.ok(Math.abs(r.precision! - 2 / 3) < 1e-9);
  assert.equal(r.recall, 1);
  assert.ok(r.bestThreshold! >= 0.3 && r.bestThreshold! <= 0.95);
  assert.ok(r.bestF1! >= r.f1!);
});

test("choice accuracy", () => {
  const rows = [
    rec({ topic: "tech" }, { topic: { label: "tech", confidence: 0.8 } }),
    rec({ topic: "sports" }, { topic: { label: "tech", confidence: 0.6 } }),
  ];
  const r = evaluate(rows).find((x) => x.category === "topic")!;
  assert.equal(r.accuracy, 0.5);
});

test("toxicity is scored by its value", () => {
  const rows = [
    rec({ toxicity: "yes" }, { toxicity: { label: "toxic", confidence: 0.7, value: 0.9 } }),
    rec({ toxicity: "no" }, { toxicity: { label: "ok", confidence: 0.6, value: 0.1 } }),
  ];
  const r = evaluate(rows).find((x) => x.category === "toxicity")!;
  assert.equal(r.accuracy, 1);
});

test("posts without an answer for a category are ignored", () => {
  const rows = [rec({ promo: "yes" }, { promo: { label: "yes", confidence: 0.9 }, topic: { label: "tech", confidence: 0.9 } })];
  assert.equal(evaluate(rows).some((x) => x.category === "topic"), false);
});

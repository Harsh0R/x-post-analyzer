import test from "node:test";
import assert from "node:assert/strict";
import { runZeroShot, type ZeroShotFn } from "../src/model/zeroshot";
import { mergeVerdicts } from "../src/classifiers";
import type { Verdict } from "../src/shared/types";

/** A fake zero-shot model: scores a label high if it contains a wanted word. */
function fake(wanted: string): ZeroShotFn {
  return async (_text, labels) => {
    const scored = labels.map((l) => ({ l, s: l.includes(wanted) ? 0.9 : 0.1 / labels.length }));
    scored.sort((a, b) => b.s - a.s);
    return { labels: scored.map((x) => x.l), scores: scored.map((x) => x.s) };
  };
}

test("choice categories map phrases back to option ids", async () => {
  const topic = await runZeroShot(fake("technology"), "new gpu released", ["topic"]);
  assert.deepEqual(topic, [{ category: "topic", label: "tech", confidence: 0.9 }]);

  const sentiment = await runZeroShot(fake("negative"), "awful", ["sentiment"]);
  assert.equal(sentiment[0]?.label, "negative");

  const emotion = await runZeroShot(fake("no particular"), "ok", ["emotion"]);
  assert.equal(emotion[0]?.label, "none");
});

test("rage-bait is yes only when the outrage phrase wins", async () => {
  const yes = await runZeroShot(fake("outrage"), "WAKE UP", ["rageBait"]);
  assert.equal(yes[0]?.label, "yes");
  const no = await runZeroShot(fake("calm"), "nice day", ["rageBait"]);
  assert.equal(no[0]?.label, "no");
});

test("categories the model does not handle are skipped", async () => {
  const out = await runZeroShot(fake("x"), "text", ["promo", "toxicity"]);
  assert.deepEqual(out, []);
});

test("long text is truncated before it reaches the model", async () => {
  let seen = 0;
  const zs: ZeroShotFn = async (text, labels) => {
    seen = text.length;
    return { labels, scores: labels.map(() => 0.5) };
  };
  await runZeroShot(zs, "a".repeat(5000), ["sentiment"]);
  assert.ok(seen <= 600);
});

test("mergeVerdicts lets refined categories replace baseline ones", () => {
  const base: Verdict[] = [
    { category: "topic", label: "other", confidence: 0.4 },
    { category: "promo", label: "no", confidence: 0.7 },
  ];
  const refined: Verdict[] = [{ category: "topic", label: "tech", confidence: 0.9 }];
  const merged = mergeVerdicts(base, refined);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((v) => v.category === "topic")?.label, "tech");
  assert.equal(merged.find((v) => v.category === "promo")?.label, "no");
});

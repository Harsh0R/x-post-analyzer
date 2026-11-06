import test from "node:test";
import assert from "node:assert/strict";
import { decideHide, matchKeyword, parseKeywords } from "../src/shared/hide";
import { DEFAULT_HIDE } from "../src/shared/settings";
import type { Verdict } from "../src/shared/types";

const hide = (over: Partial<typeof DEFAULT_HIDE>) => ({ ...DEFAULT_HIDE, ...over });
const yes = (category: Verdict["category"], confidence: number): Verdict => ({ category, label: "yes", confidence });

test("nothing is hidden by default", () => {
  assert.equal(decideHide([yes("scam", 0.99)], "free crypto", DEFAULT_HIDE).hide, false);
});

test("a flagged category hides only above the confidence floor", () => {
  const rules = hide({ flags: ["scam"], minConfidence: 0.75 });
  assert.equal(decideHide([yes("scam", 0.8)], "x", rules).hide, true);
  assert.equal(decideHide([yes("scam", 0.7)], "x", rules).hide, false);
  assert.equal(decideHide([{ category: "scam", label: "no", confidence: 0.99 }], "x", rules).hide, false);
});

test("toxicity uses its score value", () => {
  const rules = hide({ flags: ["toxicity"], minConfidence: 0.7 });
  const v: Verdict = { category: "toxicity", label: "toxic", confidence: 0.7, value: 0.8 };
  assert.equal(decideHide([v], "x", rules).hide, true);
  assert.equal(decideHide([{ ...v, value: 0.4 }], "x", rules).hide, false);
});

test("topic hiding", () => {
  const rules = hide({ topics: ["politics"], minConfidence: 0.7 });
  const t: Verdict = { category: "topic", label: "politics", confidence: 0.8 };
  assert.deepEqual(decideHide([t], "x", rules), { hide: true, reason: "Topic: politics" });
  assert.equal(decideHide([{ ...t, label: "sports" }], "x", rules).hide, false);
});

test("keywords match whole words, case-insensitively", () => {
  assert.equal(matchKeyword("Big GIVEAWAY today", ["giveaway"]), "giveaway");
  assert.equal(matchKeyword("that was bad", ["ad"]), null);
  assert.equal(matchKeyword("read this", ["ad"]), null);
  assert.equal(matchKeyword("an ad for stuff", ["ad"]), "ad");
  assert.equal(matchKeyword("#spoiler alert", ["#spoiler"]), "#spoiler");
  assert.equal(decideHide([], "huge GIVEAWAY", hide({ keywords: ["giveaway"] })).hide, true);
});

test("keyword text parsing", () => {
  assert.deepEqual(parseKeywords("spoiler\n giveaway , x, \n"), ["spoiler", "giveaway"]);
});

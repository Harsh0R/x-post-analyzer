import test from "node:test";
import assert from "node:assert/strict";
import { classifyAll } from "../src/classifiers";
import { CATEGORY_IDS } from "../src/shared/categories";
import type { Verdict } from "../src/shared/types";

const get = (vs: Verdict[], c: string) => vs.find((v) => v.category === c);

test("every category gets exactly one verdict", async () => {
  const vs = await classifyAll("Just a plain sentence about nothing in particular.");
  assert.equal(vs.length, CATEGORY_IDS.length);
  assert.deepEqual([...vs.map((v) => v.category)].sort(), [...CATEGORY_IDS].sort());
});

test("promo", async () => {
  const vs = await classifyAll("Use code SAVE20 for 20% off, limited time!");
  assert.equal(get(vs, "promo")?.label, "yes");
});

test("engagement bait", async () => {
  const vs = await classifyAll("Retweet if you agree. Follow for more.");
  assert.equal(get(vs, "engagementBait")?.label, "yes");
});

test("scam-like", async () => {
  const vs = await classifyAll("FREE CRYPTO airdrop, DM me to claim your 100x tokens");
  assert.equal(get(vs, "scam")?.label, "yes");
});

test("checkable claim", async () => {
  const vs = await classifyAll("A new study shows 63% of users switched last year.");
  assert.equal(get(vs, "hasClaim")?.label, "yes");
});

test("rage-bait needs two signals", async () => {
  const one = await classifyAll("This is disgusting.");
  assert.equal(get(one, "rageBait")?.label, "no");
  const two = await classifyAll("WAKE UP PEOPLE THIS IS DISGUSTING AND SHAMEFUL!!");
  assert.equal(get(two, "rageBait")?.label, "yes");
});

test("toxicity score rises with insults", async () => {
  const clean = await classifyAll("Lovely weather today.");
  const rude = await classifyAll("You are a pathetic idiot, shut up.");
  assert.ok((get(rude, "toxicity")?.value ?? 0) > (get(clean, "toxicity")?.value ?? 0));
});

test("topic and sentiment baselines", async () => {
  const vs = await classifyAll("The senate vote on the new policy was terrible and awful.");
  assert.equal(get(vs, "topic")?.label, "politics");
  assert.equal(get(vs, "sentiment")?.label, "negative");
});

test("promo: brand marketing post with availability + link", async () => {
  const vs = await classifyAll(
    "Survive the bloody streets of Dead Island 2 \u{1F334}\n\nAvailable as a PlayStation Plus Monthly Game for November: play.st/4iFbDKb",
  );
  assert.equal(get(vs, "promo")?.label, "yes");
});

test("promo: ordinary posts are not flagged", async () => {
  const goal = await classifyAll("\u26BD 12' | 1-0 | Goal by Koita.");
  assert.equal(get(goal, "promo")?.label, "no");
  const fan = await classifyAll("my support goes to #BTS at #2026MAMAVOTE");
  assert.equal(get(fan, "promo")?.label, "no");
});

test("bts is recognised as entertainment", async () => {
  const vs = await classifyAll("my support goes to #BTS at #2026MAMAVOTE");
  assert.equal(get(vs, "topic")?.label, "entertainment");
});

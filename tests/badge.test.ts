import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { DEFAULT_SETTINGS } from "../src/shared/settings";
import type { Verdict } from "../src/shared/types";

const dom = new JSDOM(`<body></body>`);
Object.assign(globalThis, { document: dom.window.document, HTMLElement: dom.window.HTMLElement });

const { renderBadge, pageStyles } = await import("../src/content/badge");
const { isNativeAd } = await import("../src/content/dom");

function makeArticle(extra = ""): HTMLElement {
  const a = dom.window.document.createElement("article");
  a.setAttribute("data-testid", "tweet");
  a.innerHTML = `<div><div data-testid="tweetText"><span>hello</span></div></div>${extra}`;
  dom.window.document.body.append(a);
  return a as unknown as HTMLElement;
}

const CTX = { id: "1", text: "hello" };
const promoYes: Verdict = { category: "promo", label: "yes", confidence: 0.85 };

test("promo post gets a red skip label and the dim attributes", () => {
  const a = makeArticle();
  renderBadge(a, [promoYes], DEFAULT_SETTINGS, CTX);
  const host = a.querySelector("[data-xpa-badge]")!;
  assert.ok(host);
  assert.match(host.shadowRoot!.textContent ?? "", /Promotional/);
  assert.ok(host.shadowRoot!.querySelector(".promo"));
  assert.ok(a.hasAttribute("data-xpa-promo"));
  assert.ok(a.hasAttribute("data-xpa-dim"));
});

test("dimming can be switched off but the label stays", () => {
  const a = makeArticle();
  renderBadge(a, [promoYes], { ...DEFAULT_SETTINGS, dimPromo: false }, CTX);
  assert.ok(a.hasAttribute("data-xpa-promo"));
  assert.ok(!a.hasAttribute("data-xpa-dim"));
});

test("non-promo post gets no label", () => {
  const a = makeArticle();
  renderBadge(a, [{ category: "promo", label: "no", confidence: 0.7 }], DEFAULT_SETTINGS, CTX);
  assert.equal(a.querySelector("[data-xpa-badge]"), null);
  assert.ok(!a.hasAttribute("data-xpa-promo"));
});

test("X's native Ad label is detected, but not the word 'Ad' inside post text", () => {
  const ad = makeArticle(`<div><span>Ad</span></div>`);
  assert.equal(isNativeAd(ad), true);
  const plain = makeArticle();
  plain.querySelector('[data-testid="tweetText"]')!.innerHTML = "<span>Ad</span>";
  assert.equal(isNativeAd(plain), false);
});

test("page styles target text, media and hover reveal", () => {
  const css = pageStyles();
  assert.match(css, /data-xpa-promo/);
  assert.match(css, /:hover/);
  assert.match(css, /tweetText/);
});

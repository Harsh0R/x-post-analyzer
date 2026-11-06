import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { DEFAULT_SETTINGS } from "../src/shared/settings";
import type { LabelRecord } from "../src/shared/labels";
import type { Verdict } from "../src/shared/types";

const dom = new JSDOM(`<body></body>`);
Object.assign(globalThis, { document: dom.window.document, HTMLElement: dom.window.HTMLElement });

const { buildLabeler } = await import("../src/content/labeler");
const { applyHide, hidePageStyles } = await import("../src/content/hider");
const { renderBadge } = await import("../src/content/badge");

const doc = dom.window.document;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function makeArticle(): HTMLElement {
  const a = doc.createElement("article");
  a.setAttribute("data-testid", "tweet");
  a.innerHTML = `<div id="body"><div data-testid="tweetText"><span>hello</span></div></div>`;
  doc.body.append(a);
  return a as unknown as HTMLElement;
}

test("labeler saves your answers together with what was predicted", async () => {
  const verdicts: Verdict[] = [
    { category: "promo", label: "yes", confidence: 0.85 },
    { category: "topic", label: "tech", confidence: 0.7 },
  ];
  const saved: LabelRecord[] = [];
  const el = buildLabeler({ id: "42", text: "hello" }, verdicts, DEFAULT_SETTINGS, async (r) => void saved.push(r));
  doc.body.append(el);

  (el.querySelector(".lbtn") as HTMLElement).click();
  const selects = el.querySelectorAll("select");
  assert.ok(selects.length >= 2);
  const byTitle = (cat: string) => {
    const idx = DEFAULT_SETTINGS.categories.indexOf(cat as never);
    return selects[idx] as HTMLSelectElement;
  };
  byTitle("promo").value = "no";
  byTitle("topic").value = "sports";
  const saveBtn = Array.from(el.querySelectorAll(".actions button")).find((b) => b.textContent === "Save") as HTMLElement;
  saveBtn.click();
  await tick();

  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0]?.truth, { promo: "no", topic: "sports" });
  assert.equal(saved[0]?.id, "42");
  assert.equal(saved[0]?.predicted.promo?.label, "yes");
});

test("labeler refuses to save an empty form", async () => {
  const saved: LabelRecord[] = [];
  const el = buildLabeler({ id: "1", text: "t" }, [], DEFAULT_SETTINGS, async (r) => void saved.push(r));
  doc.body.append(el);
  (el.querySelector(".lbtn") as HTMLElement).click();
  (Array.from(el.querySelectorAll(".actions button")).find((b) => b.textContent === "Save") as HTMLElement).click();
  await tick();
  assert.equal(saved.length, 0);
  assert.match(el.querySelector(".status")?.textContent ?? "", /at least one/);
});

test("hide bar collapses a post and can be revealed", () => {
  const a = makeArticle();
  applyHide(a, { hide: true, reason: "Scam-like" });
  assert.ok(a.hasAttribute("data-xpa-hidden"));
  const bar = a.firstElementChild as HTMLElement;
  assert.ok(bar.hasAttribute("data-xpa-hidebar"));
  assert.match(bar.shadowRoot!.textContent ?? "", /Hidden: Scam-like/);

  (bar.shadowRoot!.querySelector("button") as HTMLElement).click();
  assert.ok(a.hasAttribute("data-xpa-revealed"));

  applyHide(a, { hide: false, reason: "" });
  assert.ok(!a.hasAttribute("data-xpa-hidden"));
  assert.ok(!a.hasAttribute("data-xpa-revealed"));
  assert.equal(a.querySelector("[data-xpa-hidebar]"), null);
});

test("hide styles collapse everything except the bar", () => {
  const css = hidePageStyles();
  assert.match(css, /display: none/);
  assert.match(css, /:not\(\[data-xpa-hidebar\]\)/);
});

test("labeling mode adds the pencil even when there is no badge", () => {
  const a = makeArticle();
  renderBadge(a, [], { ...DEFAULT_SETTINGS, labeling: true }, { id: "9", text: "hello" });
  const host = a.querySelector("[data-xpa-badge]");
  assert.ok(host);
  assert.ok(host!.shadowRoot!.querySelector(".lbtn"));

  const b = makeArticle();
  renderBadge(b, [], DEFAULT_SETTINGS, { id: "10", text: "hello" });
  assert.equal(b.querySelector("[data-xpa-badge]"), null);
});

test("clicks on our controls do not bubble into the post", () => {
  const a = makeArticle();
  renderBadge(a, [{ category: "promo", label: "yes", confidence: 0.9 }], DEFAULT_SETTINGS, { id: "5", text: "t" });
  let bubbled = false;
  a.addEventListener("click", () => (bubbled = true));
  (a.querySelector("[data-xpa-badge]") as HTMLElement).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  assert.equal(bubbled, false);
});

const { isDarkColor } = await import("../src/content/dom");
const { LABELER_STYLE } = await import("../src/content/labeler");

test("theme detection reads X's background color", () => {
  assert.equal(isDarkColor("rgb(0, 0, 0)"), true);
  assert.equal(isDarkColor("rgb(21, 32, 43)"), true);
  assert.equal(isDarkColor("rgb(255, 255, 255)"), false);
  assert.equal(isDarkColor("rgba(0, 0, 0, 0)"), undefined);
  assert.equal(isDarkColor("transparent"), undefined);
});

test("badge host gets a theme so dropdowns are readable", () => {
  const a = makeArticle();
  renderBadge(a, [], { ...DEFAULT_SETTINGS, labeling: true }, { id: "11", text: "t" });
  const host = a.querySelector("[data-xpa-badge]")!;
  assert.ok(["dark", "light"].includes(host.getAttribute("data-theme") ?? ""));
  const css = host.shadowRoot!.querySelector("style")!.textContent ?? "";
  assert.match(css, /align-items: flex-start/);
  assert.match(css, /select option \{ background-color: var\(--ctl-bg\)/);
});

test("label panel drops to its own line instead of stretching the chips", () => {
  assert.match(LABELER_STYLE, /\.labeler \{ display: contents; \}/);
  assert.match(LABELER_STYLE, /\.panel \{[^}]*flex: 1 0 100%/);
});

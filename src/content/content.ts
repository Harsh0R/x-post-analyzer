import { loadSettings, SETTINGS_KEY, type Settings, DEFAULT_SETTINGS } from "../shared/settings";
import { RefineMessage, type AnalyzeResponse } from "../shared/messages";
import { decideHide, matchKeyword } from "../shared/hide";
import type { Verdict } from "../shared/types";
import { findPosts, isNativeAd, postId, postText } from "./dom";
import { pageStyles, removeBadge, renderBadge } from "./badge";
import { applyHide, hidePageStyles } from "./hider";

let settings: Settings = DEFAULT_SETTINGS;

interface PostState {
  id: string;
  text: string;
  verdicts: Verdict[];
}

const registered = new WeakSet<Element>();
const analyzed = new WeakSet<Element>();
const stateByPost = new WeakMap<Element, PostState>();
const tracked = new Set<WeakRef<HTMLElement>>();
const elById = new Map<string, WeakRef<HTMLElement>>();

/** Draw badges and apply hide rules for one post from its current state. */
function render(el: HTMLElement): void {
  const st = stateByPost.get(el);
  if (!st) return;
  if (!settings.enabled) {
    removeBadge(el);
    applyHide(el, { hide: false, reason: "" });
    return;
  }
  applyHide(el, decideHide(st.verdicts, st.text, settings.hide));
  renderBadge(el, st.verdicts, settings, { id: st.id, text: st.text });
}

/** If X itself labels the post as an ad, trust that over our guess. */
function withNativeAd(el: HTMLElement, verdicts: Verdict[]): Verdict[] {
  if (!isNativeAd(el)) return verdicts;
  return [
    ...verdicts.filter((v) => v.category !== "promo"),
    { category: "promo", label: "yes", confidence: 1 },
  ];
}

// Only analyze posts that are actually on screen; this keeps calls (and cost) low.
const visibility = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !settings.enabled) continue;
      const el = entry.target as HTMLElement;
      visibility.unobserve(el);
      void analyze(el);
    }
  },
  { threshold: 0.5 },
);

function track(el: HTMLElement, id: string): void {
  tracked.add(new WeakRef(el));
  elById.set(id, new WeakRef(el));
  if (elById.size > 2000) {
    for (const [key, ref] of elById) if (!ref.deref()?.isConnected) elById.delete(key);
  }
}

async function analyze(el: HTMLElement): Promise<void> {
  if (analyzed.has(el)) return;
  const id = postId(el);
  const text = postText(el);
  if (!id || !text) {
    // Post text may not be rendered yet; try again on next intersection.
    visibility.observe(el);
    return;
  }
  analyzed.add(el);

  // Keyword hiding needs no classification, so apply it right away.
  stateByPost.set(el, { id, text, verdicts: [] });
  track(el, id);
  if (matchKeyword(text, settings.hide.keywords) || settings.labeling) render(el);

  try {
    const res = (await chrome.runtime.sendMessage({ type: "analyze", id, text })) as
      | AnalyzeResponse
      | undefined;
    if (!res) return;
    stateByPost.set(el, { id, text, verdicts: withNativeAd(el, res.verdicts) });
    render(el);
  } catch {
    // Extension was reloaded or the worker is restarting: skip this post.
    analyzed.delete(el);
  }
}

// The background pushes better labels here once the on-device model has run.
chrome.runtime.onMessage.addListener((msg) => {
  const parsed = RefineMessage.safeParse(msg);
  if (!parsed.success) return;
  const el = elById.get(parsed.data.id)?.deref();
  const st = el ? stateByPost.get(el) : undefined;
  if (!el || !st) return;
  stateByPost.set(el, { ...st, verdicts: withNativeAd(el, parsed.data.verdicts) });
  render(el);
});

function register(el: HTMLElement): void {
  if (registered.has(el)) return;
  registered.add(el);
  visibility.observe(el);
}

function scan(root: ParentNode): void {
  for (const el of findPosts(root)) register(el);
}

// Batch DOM mutations: X's timeline mutates constantly while scrolling.
const pending = new Set<Node>();
let scheduled = false;
const mutations = new MutationObserver((records) => {
  for (const r of records) r.addedNodes.forEach((n) => n.nodeType === 1 && pending.add(n));
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    for (const n of pending) scan(n as ParentNode);
    pending.clear();
  });
});

function rerenderAll(): void {
  for (const ref of tracked) {
    const el = ref.deref();
    if (!el || !el.isConnected) {
      tracked.delete(ref);
      continue;
    }
    render(el);
  }
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !(SETTINGS_KEY in changes)) return;
  settings = await loadSettings();
  rerenderAll();
});

function injectPageStyles(): void {
  if (document.getElementById("xpa-style")) return;
  const style = document.createElement("style");
  style.id = "xpa-style";
  style.textContent = `${pageStyles()}\n${hidePageStyles()}`;
  document.head.append(style);
}

async function init(): Promise<void> {
  settings = await loadSettings();
  injectPageStyles();
  scan(document);
  mutations.observe(document.body, { childList: true, subtree: true });
}

void init();

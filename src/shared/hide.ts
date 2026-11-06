import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "./categories";
import type { HideSettings } from "./settings";
import type { Verdict } from "./types";

export interface HideDecision {
  hide: boolean;
  reason: string;
}

/** Categories that make sense as "hide when flagged": yes/no and score ones. */
export const HIDEABLE_FLAGS: CategoryId[] = CATEGORY_IDS.filter(
  (id) => CATEGORIES[id].kind !== "choice",
);

/** Split a textarea into clean keyword entries (one per line or comma). */
export function parseKeywords(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive match, so "ad" does not hide "bad" or "read". */
export function matchKeyword(text: string, keywords: string[]): string | null {
  for (const k of keywords) {
    if (!k.trim()) continue;
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRegExp(k.trim())}(?![\\p{L}\\p{N}_])`,
      "iu",
    );
    if (re.test(text)) return k.trim();
  }
  return null;
}

/** Pure decision: should this post be collapsed, and why? */
export function decideHide(verdicts: Verdict[], text: string, hide: HideSettings): HideDecision {
  const kw = matchKeyword(text, hide.keywords);
  if (kw) return { hide: true, reason: `keyword "${kw}"` };

  for (const flag of hide.flags) {
    const def = CATEGORIES[flag];
    const v = verdicts.find((x) => x.category === flag);
    if (!v) continue;
    if (def.kind === "yesno" && v.label === "yes" && v.confidence >= hide.minConfidence) {
      return { hide: true, reason: def.title };
    }
    if (def.kind === "score" && (v.value ?? 0) >= hide.minConfidence) {
      return { hide: true, reason: `${def.title} ${Math.round((v.value ?? 0) * 100)}` };
    }
  }

  if (hide.topics.length > 0) {
    const t = verdicts.find((x) => x.category === "topic");
    if (t && hide.topics.includes(t.label) && t.confidence >= hide.minConfidence) {
      return { hide: true, reason: `Topic: ${t.label}` };
    }
  }
  return { hide: false, reason: "" };
}

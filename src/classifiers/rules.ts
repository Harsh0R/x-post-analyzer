import type { CategoryId } from "../shared/categories";
import type { Verdict } from "../shared/types";
import type { Classifier } from "./types";

const yesno = (category: CategoryId, yes: boolean, pYes: number): Verdict => ({
  category,
  label: yes ? "yes" : "no",
  confidence: yes ? pYes : 0.7,
});

const PROMO =
  /\b(use code|promo code|discount|\d+% off|limited time|buy now|shop now|shop the|order now|sign up|link in bio|sale ends|on sale|free trial|subscribe|check out my|new video|out now|now available|available (now|as|on|in|from)|pre-?order|watch now|stream now|play now|download now|get yours|learn more|register now|join now|coming soon|tickets? (on sale|available)|monthly game)\b/i;
const LINK = /\b[a-z0-9-]+\.[a-z]{2,}\/\S+/i;
const PROMO_WEAK =
  /\b(available|monthly|season|episode|launch(es|ed)?|new (drop|release|collection|feature)|now live|tickets?|stream|download|giveaway)\b/i;
const BAIT =
  /\b(retweet if|rt if|repost if|like if|follow for|follow me|comment below|tag a friend|drop a|who else|thoughts\?|agree\?|ratio)\b/i;
const SCAM =
  /\b(giveaway|airdrop|dm me|dm for|double your|guaranteed returns?|100x|1000x|pump|join (my|our) (telegram|discord|group)|free crypto|send .{1,20} to receive|claim your)\b/i;
const CLAIM =
  /(\d+(\.\d+)?\s?%|\b(study|studies|report|according to|research shows|data shows|scientists|statistics|survey|poll)\b|\b\d{1,3}(,\d{3})+\b|\b(million|billion|trillion)\b)/i;
const OUTRAGE =
  /\b(wake up|disgusting|how dare|outrageous|unbelievable|sick of|they don'?t want you|nobody is talking|this is insane|shameful|furious|enough is enough)\b/i;
const TOXIC_WORDS = [
  "idiot",
  "stupid",
  "moron",
  "trash",
  "shut up",
  "loser",
  "scum",
  "pathetic",
  "garbage",
  "hate you",
  "dumb",
  "clown",
];

function capsRatio(text: string): number {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 15) return 0;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length;
}

export const rulesClassifier: Classifier = {
  name: "rules",
  handles: ["promo", "engagementBait", "scam", "hasClaim", "rageBait", "toxicity"],
  classify(text) {
    const lower = text.toLowerCase();
    const out: Verdict[] = [];

    const promoStrong = PROMO.test(text);
    const promoWeak = LINK.test(text) && PROMO_WEAK.test(text);
    out.push(yesno("promo", promoStrong || promoWeak, promoStrong ? 0.85 : 0.7));
    out.push(yesno("engagementBait", BAIT.test(text), 0.8));
    out.push(yesno("scam", SCAM.test(text), 0.8));
    out.push(yesno("hasClaim", CLAIM.test(text), 0.65));

    // Weak heuristic for rage-bait: needs two independent signals.
    // TODO: replace with a model; this is only a placeholder.
    let signals = 0;
    if (capsRatio(text) > 0.5) signals++;
    if (/!{2,}/.test(text)) signals++;
    if (OUTRAGE.test(text)) signals++;
    out.push(yesno("rageBait", signals >= 2, Math.min(0.55 + 0.1 * signals, 0.8)));

    const hits = TOXIC_WORDS.filter((w) => lower.includes(w)).length;
    const value = Math.min(1, 0.35 * hits + (capsRatio(text) > 0.6 ? 0.15 : 0));
    out.push({
      category: "toxicity",
      label: value >= 0.6 ? "toxic" : "ok",
      confidence: hits > 0 ? 0.7 : 0.6,
      value,
    });
    return out;
  },
};

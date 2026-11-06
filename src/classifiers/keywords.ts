import { CATEGORIES, type CategoryId } from "../shared/categories";
import type { Verdict } from "../shared/types";
import type { Classifier } from "./types";

/**
 * Keyword baseline for the "choice" categories. It is crude on purpose: it
 * gives the UI something to show today. Swap for a zero-shot model later.
 */
const LEXICON: Record<"sentiment" | "emotion" | "topic", Record<string, string[]>> = {
  sentiment: {
    positive: ["love", "great", "amazing", "awesome", "happy", "excellent", "best", "thanks", "congrats", "proud", "wonderful", "win"],
    negative: ["hate", "terrible", "awful", "worst", "angry", "sad", "bad", "fail", "disgusting", "horrible", "annoying", "broken"],
  },
  emotion: {
    anger: ["angry", "furious", "outrage", "outrageous", "hate", "rage", "mad"],
    fear: ["afraid", "scared", "terrified", "panic", "danger", "threat", "worried"],
    joy: ["happy", "joy", "excited", "love", "celebrate", "thrilled", "yay"],
    sadness: ["sad", "heartbroken", "cry", "grief", "miss", "lonely", "tragic"],
    disgust: ["disgusting", "gross", "vile", "sickening", "revolting"],
    surprise: ["shocked", "wow", "unbelievable", "surprised", "stunned", "unexpected"],
  },
  topic: {
    politics: ["election", "president", "senate", "congress", "vote", "policy", "government", "minister", "party", "parliament", "campaign"],
    sports: ["match", "goal", "league", "tournament", "cricket", "nba", "nfl", "playoffs", "coach", "season", "player", "football"],
    tech: ["ai", "software", "app", "startup", "code", "api", "chip", "model", "opensource", "developer", "gpu", "browser"],
    finance: ["stock", "stocks", "market", "bitcoin", "crypto", "inflation", "rates", "earnings", "invest", "investing", "bank", "fed"],
    health: ["health", "doctor", "vaccine", "diet", "disease", "medical", "fitness", "hospital", "mental", "sleep"],
    entertainment: ["movie", "film", "series", "album", "song", "trailer", "actor", "concert", "episode", "netflix", "music", "bts", "kpop", "idol", "fandom", "comeback", "mama", "concert", "tour"],
    science: ["study", "research", "physics", "nasa", "space", "climate", "biology", "scientists", "quantum", "experiment"],
  },
};

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

function pick(
  category: "sentiment" | "emotion" | "topic",
  toks: string[],
  fallback: string,
): Verdict {
  const set = new Set(toks);
  let best = fallback;
  let bestHits = 0;
  let total = 0;
  for (const [label, words] of Object.entries(LEXICON[category])) {
    const hits = words.filter((w) => set.has(w)).length;
    total += hits;
    if (hits > bestHits) {
      best = label;
      bestHits = hits;
    }
  }
  if (bestHits === 0) return { category, label: fallback, confidence: 0.4 };
  const share = bestHits / total;
  return { category, label: best, confidence: Math.min(0.5 + 0.1 * bestHits, 0.85) * (0.6 + 0.4 * share) };
}

function postType(text: string): Verdict {
  const t = text.toLowerCase();
  const category: CategoryId = "postType";
  if (/\?\s*$/.test(text.trim()) || /^(who|what|why|how|when|where|is|are|does|do|can)\b/.test(t))
    return { category, label: "question", confidence: 0.7 };
  if (/\b(breaking|just in|reports?|announced|according to)\b/.test(t))
    return { category, label: "news", confidence: 0.65 };
  if (/\b(lol|lmao|haha)\b/.test(t) || /😂|🤣/.test(text))
    return { category, label: "joke", confidence: 0.65 };
  if (/\b(launch(ing|ed)?|introducing|we('| a)re hiring|excited to (share|announce))\b/.test(t))
    return { category, label: "announcement", confidence: 0.65 };
  if (/\b(i|my|me|we)\b/.test(t) && /\b(today|yesterday|just|finally)\b/.test(t))
    return { category, label: "personal", confidence: 0.6 };
  if (/\b(i think|imo|in my opinion|should|must|overrated|underrated)\b/.test(t))
    return { category, label: "opinion", confidence: 0.6 };
  return { category, label: "opinion", confidence: 0.4 };
}

export const keywordClassifier: Classifier = {
  name: "keywords",
  handles: ["sentiment", "emotion", "topic", "postType"],
  classify(text) {
    const toks = tokens(text);
    const out: Verdict[] = [
      pick("sentiment", toks, "neutral"),
      pick("emotion", toks, "none"),
      pick("topic", toks, "other"),
      postType(text),
    ];
    // Safety net: never return a label that is not in the registry.
    return out.filter((v) => {
      const def = CATEGORIES[v.category];
      return def.kind !== "choice" || (def.options as readonly string[]).includes(v.label);
    });
  },
};

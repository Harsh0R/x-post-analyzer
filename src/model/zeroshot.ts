import { CATEGORIES, type CategoryId } from "../shared/categories";
import type { Verdict } from "../shared/types";

/** Small NLI model used for zero-shot classification. Change here to try another. */
export const MODEL_ID = "Xenova/nli-deberta-v3-xsmall";

/** Categories the model can refine (the rest stay on fast rules). */
export const MODEL_CATEGORY_IDS = [
  "sentiment",
  "emotion",
  "topic",
  "postType",
  "rageBait",
] as const satisfies readonly CategoryId[];
export type ModelCategoryId = (typeof MODEL_CATEGORY_IDS)[number];

export function isModelCategory(id: CategoryId): id is ModelCategoryId {
  return (MODEL_CATEGORY_IDS as readonly string[]).includes(id);
}

/** Runs one zero-shot classification. The offscreen document supplies the real one. */
export type ZeroShotFn = (
  text: string,
  labels: string[],
  hypothesisTemplate: string,
) => Promise<{ labels: string[]; scores: number[] }>;

interface ChoiceSpec {
  template: string;
  /** option id -> natural-language phrase the NLI model scores */
  phrases: Record<string, string>;
}

const CHOICE_SPECS: Partial<Record<ModelCategoryId, ChoiceSpec>> = {
  sentiment: {
    template: "The sentiment of this post is {}.",
    phrases: { positive: "positive", negative: "negative", neutral: "neutral" },
  },
  emotion: {
    template: "This post expresses {}.",
    phrases: {
      anger: "anger",
      fear: "fear",
      joy: "joy",
      sadness: "sadness",
      disgust: "disgust",
      surprise: "surprise",
      none: "no particular emotion",
    },
  },
  topic: {
    template: "This post is about {}.",
    phrases: {
      politics: "politics",
      sports: "sports",
      tech: "technology",
      finance: "finance and markets",
      health: "health and medicine",
      entertainment: "entertainment, music, film or celebrities",
      science: "science",
      other: "something else",
    },
  },
  postType: {
    template: "This post is {}.",
    phrases: {
      news: "a news report",
      opinion: "a personal opinion",
      personal: "a personal life update",
      question: "a question",
      joke: "a joke or meme",
      announcement: "an announcement",
    },
  },
};

const RAGE_YES = "written to provoke anger and outrage";
const RAGE_NO = "calm and neutral";

const MAX_CHARS = 600;

/** Classify one post for the requested model categories. Pure apart from `zs`. */
export async function runZeroShot(
  zs: ZeroShotFn,
  text: string,
  categories: readonly CategoryId[],
): Promise<Verdict[]> {
  const input = text.slice(0, MAX_CHARS);
  const out: Verdict[] = [];

  for (const category of categories) {
    if (!isModelCategory(category)) continue;

    if (category === "rageBait") {
      const r = await zs(input, [RAGE_YES, RAGE_NO], "This post is {}.");
      const top = r.labels[0];
      const score = r.scores[0] ?? 0;
      out.push({ category, label: top === RAGE_YES ? "yes" : "no", confidence: score });
      continue;
    }

    const spec = CHOICE_SPECS[category];
    if (!spec) continue;
    const def = CATEGORIES[category];
    const phraseToOption = new Map(Object.entries(spec.phrases).map(([opt, p]) => [p, opt]));
    const r = await zs(input, Object.values(spec.phrases), spec.template);
    const option = phraseToOption.get(r.labels[0] ?? "");
    const valid = def.kind === "choice" && option && (def.options as readonly string[]).includes(option);
    if (!valid || option === undefined) continue;
    out.push({ category, label: option, confidence: r.scores[0] ?? 0 });
  }
  return out;
}

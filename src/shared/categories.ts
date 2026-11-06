/**
 * Single source of truth for the taxonomy. Result types, popup toggles and the
 * badge renderer are all derived from this registry: add a category here only.
 */
export type CategoryDef =
  | { kind: "choice"; title: string; options: readonly string[] }
  | { kind: "yesno"; title: string; question: string }
  | { kind: "score"; title: string; question: string };

export const CATEGORIES = {
  sentiment: {
    kind: "choice",
    title: "Sentiment",
    options: ["positive", "negative", "neutral"],
  },
  emotion: {
    kind: "choice",
    title: "Emotion",
    options: ["anger", "fear", "joy", "sadness", "disgust", "surprise", "none"],
  },
  postType: {
    kind: "choice",
    title: "Type",
    options: ["news", "opinion", "personal", "question", "joke", "announcement"],
  },
  topic: {
    kind: "choice",
    title: "Topic",
    options: [
      "politics",
      "sports",
      "tech",
      "finance",
      "health",
      "entertainment",
      "science",
      "other",
    ],
  },
  promo: {
    kind: "yesno",
    title: "Promo",
    question: "Is this post promotional or an ad?",
  },
  engagementBait: {
    kind: "yesno",
    title: "Engagement bait",
    question: "Does this post beg for likes, reposts or follows?",
  },
  rageBait: {
    kind: "yesno",
    title: "Rage-bait",
    question: "Is this written mainly to provoke outrage?",
  },
  scam: {
    kind: "yesno",
    title: "Scam-like",
    question: "Does this look like a scam, giveaway or crypto shill?",
  },
  hasClaim: {
    kind: "yesno",
    title: "Checkable claim",
    question: "Does this contain a factual claim that could be checked?",
  },
  toxicity: {
    kind: "score",
    title: "Toxicity",
    question: "How toxic is this post?",
  },
} as const satisfies Record<string, CategoryDef>;

export type CategoryId = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

export function categoryDef(id: CategoryId): CategoryDef {
  return CATEGORIES[id];
}

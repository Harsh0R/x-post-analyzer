import { CATEGORY_IDS, type CategoryId } from "./categories";

export interface HideSettings {
  /** yes/no or score categories that collapse a post when flagged. */
  flags: CategoryId[];
  /** Topic labels (from the "topic" category) that collapse a post. */
  topics: string[];
  /** Words or phrases that collapse a post when they appear in its text. */
  keywords: string[];
  /** Minimum confidence (or score) before a flag/topic hides a post. */
  minConfidence: number;
}

export interface Settings {
  enabled: boolean;
  /** Minimum confidence (or score value) before a chip is shown. */
  threshold: number;
  /** Max chips per post, so the timeline does not turn into confetti. */
  maxChips: number;
  categories: CategoryId[];
  /** Fade the text/media of promotional posts (hover to reveal). */
  dimPromo: boolean;
  /** Refine labels with an on-device model (downloads model files once). */
  useModel: boolean;
  /** Add a small label button to every post so you can record correct answers. */
  labeling: boolean;
  hide: HideSettings;
}

export const SETTINGS_KEY = "settings";

export const DEFAULT_HIDE: HideSettings = {
  flags: [],
  topics: [],
  keywords: [],
  minConfidence: 0.75,
};

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  threshold: 0.6,
  maxChips: 2,
  categories: CATEGORY_IDS.filter((c) => c !== "emotion" && c !== "postType"),
  dimPromo: true,
  useModel: false,
  labeling: false,
  hide: DEFAULT_HIDE,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const s = stored[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...s, hide: { ...DEFAULT_HIDE, ...s?.hide } };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}

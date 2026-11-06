/**
 * Every x.com DOM assumption lives in this file. X changes its markup without
 * notice, so when the extension stops finding posts, this is the only place to fix.
 */
export const SEL = {
  post: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  statusTime: 'a[href*="/status/"] time',
} as const;

export function findPosts(root: ParentNode): HTMLElement[] {
  const found: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(SEL.post)) found.push(root);
  root.querySelectorAll<HTMLElement>(SEL.post).forEach((el) => found.push(el));
  return found;
}

export function postId(article: HTMLElement): string | null {
  const link = article.querySelector(SEL.statusTime)?.closest("a");
  const m = link?.getAttribute("href")?.match(/\/status\/(\d+)/);
  return m?.[1] ?? null;
}

/** Text of the main post (the first tweetText; quoted posts come later in the DOM). */
export function postText(article: HTMLElement): string | null {
  const text = article.querySelector(SEL.text)?.textContent?.trim();
  return text ? text : null;
}

/** Where the badge goes: right after the post text. */
export function badgeAnchor(article: HTMLElement): Element | null {
  const textEl = article.querySelector(SEL.text);
  return textEl?.parentElement ?? textEl ?? null;
}

/** Parts of a post that get faded when it is promotional (the red label stays readable). */
export const DIM_SELECTORS = [
  SEL.text,
  '[data-testid="tweetPhoto"]',
  '[data-testid="videoPlayer"]',
  '[data-testid="card.wrapper"]',
] as const;

const AD_LABELS = new Set(["ad", "promoted"]);

/**
 * X's own "Ad" / "Promoted" label next to a post. Best effort: English UI only,
 * and X may change how the label is rendered.
 */
export function isNativeAd(article: HTMLElement): boolean {
  for (const span of article.querySelectorAll("span")) {
    if (span.childElementCount > 0 || span.closest(SEL.text)) continue;
    if (AD_LABELS.has((span.textContent ?? "").trim().toLowerCase())) return true;
  }
  return false;
}

/** True for dark CSS colors like "rgb(0, 0, 0)". Transparent or unparsable returns undefined. */
export function isDarkColor(css: string): boolean | undefined {
  const m = css.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return undefined;
  if (m[4] !== undefined && Number(m[4]) === 0) return undefined;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

/** Is x.com currently showing a dark theme (Dim or Lights out)? */
export function pageIsDark(): boolean {
  const view = document.defaultView;
  for (const el of [document.body, document.documentElement]) {
    const dark = isDarkColor(view?.getComputedStyle(el).backgroundColor ?? "");
    if (dark !== undefined) return dark;
  }
  return view?.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

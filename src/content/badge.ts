import { CATEGORIES } from "../shared/categories";
import type { Settings } from "../shared/settings";
import type { Verdict } from "../shared/types";
import { badgeAnchor, DIM_SELECTORS, pageIsDark } from "./dom";
import { buildLabeler, LABELER_STYLE, type PostContext, type SaveLabel } from "./labeler";

const HOST_ATTR = "data-xpa-badge";
const PROMO_ATTR = "data-xpa-promo";
const DIM_ATTR = "data-xpa-dim";

const STYLE = `
/* Colors for the label panel's form controls. data-theme follows X's own theme. */
:host {
  display: block; margin-top: 6px;
  color-scheme: light dark;
  --panel-bg: #ffffff; --fg: #0f1419; --ctl-bg: #eff3f4; --border: rgba(128, 128, 128, 0.45);
}
:host([data-theme="dark"]) { color-scheme: dark; --panel-bg: #16181c; --fg: #e7e9ea; --ctl-bg: #272b30; }
:host([data-theme="light"]) { color-scheme: light; }
/* flex-start keeps chips pill-shaped when something taller (the label panel) shares the row */
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; }
.chip {
  font: 600 12px/1 system-ui, sans-serif;
  padding: 3px 8px;
  border-radius: 999px;
  color: inherit;
  background: rgba(128, 128, 128, 0.2);
  border: 1px solid rgba(128, 128, 128, 0.35);
  cursor: default;
}
.promo {
  flex: 1 0 100%;
  font: 700 13px/1.3 system-ui, sans-serif;
  color: rgba(255, 69, 58, 0.85);
  background: rgba(255, 69, 58, 0.1);
  border-left: 3px solid rgba(255, 69, 58, 0.6);
  border-radius: 4px;
  padding: 4px 8px;
}
${LABELER_STYLE}
`;

/** Page-level CSS that fades promotional posts. Injected once by the content script. */
export function pageStyles(): string {
  const base = `article[${PROMO_ATTR}][${DIM_ATTR}]`;
  const dimmed = DIM_SELECTORS.map((s) => `${base} ${s}`).join(",\n");
  const revealed = DIM_SELECTORS.map((s) => `${base}:hover ${s}`).join(",\n");
  return `${dimmed} { opacity: 0.3; transition: opacity 0.15s; }\n${revealed} { opacity: 1; }`;
}

interface Chip {
  text: string;
  tip: string;
  strength: number;
}

/** Decide which verdicts deserve a chip: enabled, above threshold, strongest first. */
export function pickChips(verdicts: Verdict[], settings: Settings): Chip[] {
  const chips: Chip[] = [];
  for (const v of verdicts) {
    if (!settings.categories.includes(v.category)) continue;
    const def = CATEGORIES[v.category];
    const pct = `${Math.round(v.confidence * 100)}%`;

    if (def.kind === "yesno") {
      if (v.label === "yes" && v.confidence >= settings.threshold)
        chips.push({ text: def.title, tip: `${def.question} (${pct})`, strength: v.confidence });
    } else if (def.kind === "choice") {
      if (v.confidence >= settings.threshold)
        chips.push({ text: `${def.title}: ${v.label}`, tip: `${pct} confident`, strength: v.confidence });
    } else {
      const value = v.value ?? 0;
      if (value >= settings.threshold)
        chips.push({
          text: `${def.title} ${Math.round(value * 100)}`,
          tip: def.question,
          strength: value,
        });
    }
  }
  return chips.sort((a, b) => b.strength - a.strength).slice(0, settings.maxChips);
}

/** The promo verdict that should trigger the red "skip" label, if any. */
export function promoVerdict(verdicts: Verdict[], settings: Settings): Verdict | undefined {
  if (!settings.categories.includes("promo")) return undefined;
  return verdicts.find(
    (v) => v.category === "promo" && v.label === "yes" && v.confidence >= settings.threshold,
  );
}

export function removeBadge(article: HTMLElement): void {
  article.querySelectorAll(`[${HOST_ATTR}]`).forEach((n) => n.remove());
  article.removeAttribute(PROMO_ATTR);
  article.removeAttribute(DIM_ATTR);
}

export function renderBadge(
  article: HTMLElement,
  verdicts: Verdict[],
  settings: Settings,
  ctx: PostContext,
  save?: SaveLabel,
): void {
  const promo = promoVerdict(verdicts, settings);
  // Promo gets its own red label, so it is not repeated as a chip.
  const chips = pickChips(
    verdicts.filter((v) => v.category !== "promo"),
    settings,
  );

  if (promo) {
    article.setAttribute(PROMO_ATTR, "");
    if (settings.dimPromo) article.setAttribute(DIM_ATTR, "");
    else article.removeAttribute(DIM_ATTR);
  } else {
    article.removeAttribute(PROMO_ATTR);
    article.removeAttribute(DIM_ATTR);
  }

  let host = article.querySelector<HTMLElement>(`[${HOST_ATTR}]`);

  if (!promo && chips.length === 0 && !settings.labeling) {
    host?.remove();
    return;
  }

  if (!host) {
    const anchor = badgeAnchor(article);
    if (!anchor) return;
    host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "");
    host.attachShadow({ mode: "open" });
    // The post is a clickable article: keep clicks on our controls from opening it.
    for (const type of ["click", "mousedown", "keydown"]) {
      host.addEventListener(type, (e) => e.stopPropagation());
    }
    anchor.insertAdjacentElement("afterend", host);
  }

  host.setAttribute("data-theme", pageIsDark() ? "dark" : "light");
  const root = host.shadowRoot!;
  root.replaceChildren();
  const style = document.createElement("style");
  style.textContent = STYLE;
  const row = document.createElement("div");
  row.className = "row";

  if (promo) {
    const banner = document.createElement("div");
    banner.className = "promo";
    banner.textContent = "Promotional \u2014 skip";
    banner.title =
      promo.confidence >= 1
        ? "Marked as an ad by X"
        : `Looks promotional (${Math.round(promo.confidence * 100)}% confident)`;
    row.append(banner);
  }
  for (const c of chips) {
    const el = document.createElement("span");
    el.className = "chip";
    el.textContent = c.text;
    el.title = c.tip;
    row.append(el);
  }
  if (settings.labeling) row.append(buildLabeler(ctx, verdicts, settings, save));
  root.append(style, row);
}

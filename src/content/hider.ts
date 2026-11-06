import type { HideDecision } from "../shared/hide";

const BAR_ATTR = "data-xpa-hidebar";
const HIDDEN_ATTR = "data-xpa-hidden";
const REVEALED_ATTR = "data-xpa-revealed";

/** Collapses every child of a hidden post except our own bar. */
export function hidePageStyles(): string {
  return `article[${HIDDEN_ATTR}]:not([${REVEALED_ATTR}]) > :not([${BAR_ATTR}]) { display: none !important; }`;
}

const STYLE = `
:host { display: block; }
.bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  font: 13px/1.3 system-ui, sans-serif;
  color: rgba(140, 140, 140, 0.95);
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}
.reason { flex: 1; }
button {
  font: 600 12px system-ui, sans-serif;
  color: inherit; background: transparent;
  border: 1px solid rgba(128, 128, 128, 0.5);
  border-radius: 999px; padding: 3px 10px; cursor: pointer;
}
button:hover { background: rgba(128, 128, 128, 0.15); }
`;

function findBar(article: HTMLElement): HTMLElement | undefined {
  return Array.from(article.children).find((c) => c.hasAttribute(BAR_ATTR)) as HTMLElement | undefined;
}

/** Collapse the post behind a small "Hidden: reason  [Show]" bar, or restore it. */
export function applyHide(article: HTMLElement, decision: HideDecision): void {
  let bar = findBar(article);

  if (!decision.hide) {
    bar?.remove();
    article.removeAttribute(HIDDEN_ATTR);
    article.removeAttribute(REVEALED_ATTR);
    return;
  }

  article.setAttribute(HIDDEN_ATTR, "");
  if (!bar) {
    bar = document.createElement("div");
    bar.setAttribute(BAR_ATTR, "");
    bar.attachShadow({ mode: "open" });
    // The post is a clickable article: keep our clicks from opening it.
    for (const type of ["click", "mousedown", "keydown"]) {
      bar.addEventListener(type, (e) => e.stopPropagation());
    }
    article.prepend(bar);
  }

  const root = bar.shadowRoot!;
  root.replaceChildren();
  const style = document.createElement("style");
  style.textContent = STYLE;
  const row = document.createElement("div");
  row.className = "bar";
  const reason = document.createElement("span");
  reason.className = "reason";
  reason.textContent = `Hidden: ${decision.reason}`;
  const btn = document.createElement("button");
  const sync = () => {
    btn.textContent = article.hasAttribute(REVEALED_ATTR) ? "Hide again" : "Show";
  };
  btn.addEventListener("click", () => {
    if (article.hasAttribute(REVEALED_ATTR)) article.removeAttribute(REVEALED_ATTR);
    else article.setAttribute(REVEALED_ATTR, "");
    sync();
  });
  sync();
  row.append(reason, btn);
  root.append(style, row);
}

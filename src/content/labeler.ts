import { CATEGORIES, type CategoryId } from "../shared/categories";
import { addLabel, predictedFrom, type LabelRecord } from "../shared/labels";
import type { Settings } from "../shared/settings";
import type { Verdict } from "../shared/types";

export interface PostContext {
  id: string;
  text: string;
}

export type SaveLabel = (rec: LabelRecord) => Promise<unknown>;

export const LABELER_STYLE = `
/* display: contents lets the button sit in the chip row while the panel drops to its own line */
.labeler { display: contents; }
.lbtn {
  margin-left: auto; align-self: flex-start;
  font: 600 13px/1 system-ui, sans-serif; color: inherit;
  background: transparent; border: 1px solid var(--border);
  border-radius: 6px; padding: 3px 8px; cursor: pointer; opacity: .5;
}
.lbtn:hover { opacity: 1; }
.panel {
  flex: 1 0 100%; box-sizing: border-box; max-width: 380px;
  margin-top: 6px; padding: 12px; border-radius: 12px;
  background: var(--panel-bg); color: var(--fg);
  border: 1px solid var(--border);
  font: 12px/1.4 system-ui, sans-serif;
}
.panel h4 { margin: 0 0 8px; font-size: 12px; font-weight: 700; }
.grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: center; }
select {
  font: inherit; color: var(--fg); background-color: var(--ctl-bg);
  border: 1px solid var(--border); border-radius: 6px; padding: 3px 6px; width: 100%;
}
select option { background-color: var(--ctl-bg); color: var(--fg); }
.actions { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
.actions button {
  font: 600 12px system-ui, sans-serif; color: var(--fg); background: var(--ctl-bg);
  border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; cursor: pointer;
}
.status { opacity: .8; }
`;

interface Choice {
  value: string;
  text: string;
}

function choicesFor(category: CategoryId): Choice[] {
  const def = CATEGORIES[category];
  if (def.kind === "choice") return def.options.map((o) => ({ value: o, text: o }));
  if (def.kind === "score") {
    return [
      { value: "yes", text: "toxic" },
      { value: "no", text: "not toxic" },
    ];
  }
  return [
    { value: "yes", text: "yes" },
    { value: "no", text: "no" },
  ];
}

function describePrediction(v: Verdict | undefined): string {
  if (!v) return "no prediction";
  const def = CATEGORIES[v.category];
  if (def.kind === "score") return `predicted ${Math.round((v.value ?? 0) * 100)}`;
  return `predicted ${v.label} (${Math.round(v.confidence * 100)}%)`;
}

/**
 * Small pencil button that opens a panel where you record the correct answer for each
 * enabled category. Answers are saved locally and can be exported for evaluation.
 */
export function buildLabeler(
  ctx: PostContext,
  verdicts: Verdict[],
  settings: Settings,
  save: SaveLabel = addLabel,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "labeler";

  const button = document.createElement("button");
  button.className = "lbtn";
  button.textContent = "\u270E";
  button.title = "Label this post (record the correct answers)";
  wrap.append(button);

  let panel: HTMLElement | null = null;
  const close = () => {
    panel?.remove();
    panel = null;
  };

  const open = () => {
    panel = document.createElement("div");
    panel.className = "panel";
    const title = document.createElement("h4");
    title.textContent = "What is the correct answer? (leave blank to skip)";
    const grid = document.createElement("div");
    grid.className = "grid";
    const selects = new Map<CategoryId, HTMLSelectElement>();

    for (const category of settings.categories) {
      const label = document.createElement("label");
      label.textContent = CATEGORIES[category].title;
      const select = document.createElement("select");
      select.title = describePrediction(verdicts.find((v) => v.category === category));
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "\u2014";
      select.append(blank);
      for (const c of choicesFor(category)) {
        const opt = document.createElement("option");
        opt.value = c.value;
        opt.textContent = c.text;
        select.append(opt);
      }
      selects.set(category, select);
      grid.append(label, select);
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    const status = document.createElement("span");
    status.className = "status";
    actions.append(saveBtn, cancel, status);

    cancel.addEventListener("click", close);
    saveBtn.addEventListener("click", async () => {
      const truth: LabelRecord["truth"] = {};
      for (const [category, select] of selects) {
        if (select.value) truth[category] = select.value;
      }
      if (Object.keys(truth).length === 0) {
        status.textContent = "Pick at least one answer";
        return;
      }
      try {
        await save({
          id: ctx.id,
          text: ctx.text,
          ts: Date.now(),
          truth,
          predicted: predictedFrom(verdicts),
        });
        status.textContent = "Saved \u2713";
        setTimeout(close, 700);
      } catch {
        status.textContent = "Could not save";
      }
    });

    panel.append(title, grid, actions);
    wrap.append(panel);
  };

  button.addEventListener("click", () => (panel ? close() : open()));
  return wrap;
}

import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "../shared/categories";
import { HIDEABLE_FLAGS, parseKeywords } from "../shared/hide";
import { clearLabels, exportJson, getLabels, LABELS_KEY } from "../shared/labels";
import { MODEL_STATUS_KEY, type ModelStatus } from "../shared/messages";
import { loadSettings, saveSettings, type Settings } from "../shared/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function checkbox(label: string, checked: boolean, onChange: (on: boolean) => void): HTMLLabelElement {
  const el = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.addEventListener("change", () => onChange(box.checked));
  el.append(box, document.createTextNode(label));
  return el;
}

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  const set = new Set(list);
  if (on) set.add(item);
  else set.delete(item);
  return [...set];
}

function describeStatus(s: ModelStatus | undefined, enabled: boolean): string {
  if (!enabled) return "Model is off.";
  if (!s) return "Starting\u2026";
  if (s.state === "loading") return `Downloading model\u2026 ${Math.round((s.progress ?? 0) * 100)}%`;
  if (s.state === "ready") return "Model ready.";
  if (s.state === "error") return `Model error: ${s.message ?? "unknown"}`;
  return "Idle.";
}

async function main(): Promise<void> {
  const settings: Settings = await loadSettings();
  const save = () => void saveSettings(settings);

  // --- basics
  const enabled = $<HTMLInputElement>("enabled");
  const dimPromo = $<HTMLInputElement>("dimPromo");
  const threshold = $<HTMLInputElement>("threshold");
  const maxChips = $<HTMLInputElement>("maxChips");
  const syncBasics = () => {
    $("thresholdValue").textContent = settings.threshold.toFixed(2);
    $("maxChipsValue").textContent = String(settings.maxChips);
  };
  enabled.checked = settings.enabled;
  dimPromo.checked = settings.dimPromo;
  threshold.value = String(settings.threshold);
  maxChips.value = String(settings.maxChips);
  syncBasics();
  enabled.addEventListener("change", () => ((settings.enabled = enabled.checked), save()));
  dimPromo.addEventListener("change", () => ((settings.dimPromo = dimPromo.checked), save()));
  threshold.addEventListener("input", () => {
    settings.threshold = Number(threshold.value);
    syncBasics();
    save();
  });
  maxChips.addEventListener("input", () => {
    settings.maxChips = Number(maxChips.value);
    syncBasics();
    save();
  });

  // --- categories
  for (const id of CATEGORY_IDS) {
    $("categories").append(
      checkbox(CATEGORIES[id].title, settings.categories.includes(id), (on) => {
        settings.categories = toggle<CategoryId>(settings.categories, id, on);
        save();
      }),
    );
  }

  // --- model
  const useModel = $<HTMLInputElement>("useModel");
  const statusEl = $("modelStatus");
  useModel.checked = settings.useModel;
  let status: ModelStatus | undefined;
  const showStatus = () => (statusEl.textContent = describeStatus(status, settings.useModel));
  useModel.addEventListener("change", () => {
    settings.useModel = useModel.checked;
    save();
    showStatus();
  });
  status = (await chrome.storage.session.get(MODEL_STATUS_KEY))[MODEL_STATUS_KEY] as ModelStatus | undefined;
  showStatus();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && changes[MODEL_STATUS_KEY]) {
      status = changes[MODEL_STATUS_KEY].newValue as ModelStatus | undefined;
      showStatus();
    }
  });

  // --- auto-hide
  const hideConf = $<HTMLInputElement>("hideConf");
  const syncHide = () => ($("hideConfValue").textContent = settings.hide.minConfidence.toFixed(2));
  hideConf.value = String(settings.hide.minConfidence);
  syncHide();
  hideConf.addEventListener("input", () => {
    settings.hide.minConfidence = Number(hideConf.value);
    syncHide();
    save();
  });
  for (const id of HIDEABLE_FLAGS) {
    $("hideFlags").append(
      checkbox(CATEGORIES[id].title, settings.hide.flags.includes(id), (on) => {
        settings.hide.flags = toggle<CategoryId>(settings.hide.flags, id, on);
        save();
      }),
    );
  }
  const topicDef = CATEGORIES.topic;
  for (const topic of topicDef.options.filter((t) => t !== "other")) {
    $("hideTopics").append(
      checkbox(topic, settings.hide.topics.includes(topic), (on) => {
        settings.hide.topics = toggle(settings.hide.topics, topic, on);
        save();
      }),
    );
  }
  const keywords = $<HTMLTextAreaElement>("hideKeywords");
  keywords.value = settings.hide.keywords.join("\n");
  keywords.addEventListener("change", () => {
    settings.hide.keywords = parseKeywords(keywords.value);
    save();
  });

  // --- labeling
  const labeling = $<HTMLInputElement>("labeling");
  labeling.checked = settings.labeling;
  labeling.addEventListener("change", () => ((settings.labeling = labeling.checked), save()));
  const countEl = $("labelCount");
  const refreshCount = async () => {
    const n = (await getLabels()).length;
    countEl.textContent = `${n} label${n === 1 ? "" : "s"}`;
  };
  await refreshCount();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[LABELS_KEY]) void refreshCount();
  });
  $("exportLabels").addEventListener("click", async () => {
    const blob = new Blob([exportJson(await getLabels())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "labels.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("clearLabels").addEventListener("click", async () => {
    if (confirm("Delete all saved labels?")) await clearLabels();
  });
}

void main();

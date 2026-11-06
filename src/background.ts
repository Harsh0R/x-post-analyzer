import {
  AnalyzeRequest,
  ModelStatusMessage,
  MODEL_STATUS_KEY,
  type AnalyzeResponse,
  type RefineMessage,
} from "./shared/messages";
import { classifyAll, mergeVerdicts } from "./classifiers";
import { isModelCategory } from "./model/zeroshot";
import { classifyWithModel, warmupModel } from "./model/client";
import { loadSettings, SETTINGS_KEY } from "./shared/settings";
import type { CategoryId } from "./shared/categories";
import type { Verdict } from "./shared/types";

/** Bump when classifier behaviour changes so stale cached verdicts are ignored. */
const CACHE_VERSION = 2;
const MAX_MEMORY_ENTRIES = 2000;

interface Entry {
  verdicts: Verdict[];
  /** Model categories already refined for this post, so they are not run twice. */
  refined: CategoryId[];
}

// Service workers sleep, so keep a small in-memory layer on top of storage.session.
const memory = new Map<string, Entry>();

function remember(key: string, entry: Entry): void {
  memory.delete(key);
  memory.set(key, entry);
  if (memory.size > MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
}

async function getEntry(key: string): Promise<Entry | undefined> {
  const hit = memory.get(key);
  if (hit) return hit;
  try {
    const stored = await chrome.storage.session.get(key);
    const entry = stored[key] as Entry | undefined;
    if (entry) {
      remember(key, entry);
      return entry;
    }
  } catch {
    // storage.session unavailable: caller recomputes
  }
  return undefined;
}

async function putEntry(key: string, entry: Entry): Promise<void> {
  remember(key, entry);
  try {
    await chrome.storage.session.set({ [key]: entry });
  } catch {
    // quota exceeded: the memory layer still works
  }
}

const inflight = new Set<string>();
let modelFailedAt = 0;
let warmed = false;

/** Run the model in the background and push better labels to the tab when ready. */
async function refine(
  key: string,
  req: AnalyzeRequest,
  needed: CategoryId[],
  tabId: number,
): Promise<void> {
  const flightKey = `${key}:${needed.join(",")}`;
  if (inflight.has(flightKey) || Date.now() - modelFailedAt < 30_000) return;
  inflight.add(flightKey);
  try {
    const refined = await classifyWithModel(req.text, needed);
    const current = (await getEntry(key)) ?? { verdicts: [], refined: [] };
    const next: Entry = {
      verdicts: mergeVerdicts(current.verdicts, refined),
      refined: [...new Set([...current.refined, ...needed])],
    };
    await putEntry(key, next);
    const msg: RefineMessage = { type: "refine", id: req.id, verdicts: next.verdicts };
    await chrome.tabs.sendMessage(tabId, msg).catch(() => undefined);
  } catch (err) {
    modelFailedAt = Date.now();
    console.warn("[x-post-analyzer] model refine failed", err);
  } finally {
    inflight.delete(flightKey);
  }
}

async function analyze(req: AnalyzeRequest, tabId: number | undefined): Promise<AnalyzeResponse> {
  const settings = await loadSettings();
  const key = `v${CACHE_VERSION}:${req.id}`;

  // Fast path: rules and keywords answer immediately.
  let entry = await getEntry(key);
  if (!entry) {
    entry = { verdicts: await classifyAll(req.text), refined: [] };
    await putEntry(key, entry);
  }

  // Slow path: the on-device model refines labels afterwards (opt-in via the popup).
  if (settings.useModel && tabId !== undefined) {
    if (!warmed) {
      warmed = true;
      void warmupModel().catch(() => undefined);
    }
    const done = entry.refined;
    const needed = settings.categories.filter(isModelCategory).filter((c) => !done.includes(c));
    if (needed.length > 0) void refine(key, req, needed, tabId);
  }

  return { id: req.id, verdicts: entry.verdicts };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const analyzeReq = AnalyzeRequest.safeParse(msg);
  if (analyzeReq.success) {
    analyze(analyzeReq.data, sender.tab?.id).then(sendResponse, () => sendResponse(undefined));
    return true; // keep the channel open for the async response
  }
  const status = ModelStatusMessage.safeParse(msg);
  if (status.success) {
    void chrome.storage.session.set({ [MODEL_STATUS_KEY]: status.data }).catch(() => undefined);
  }
  return false;
});

// Start loading the model as soon as the user switches it on (or the browser starts).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !(SETTINGS_KEY in changes)) return;
  const next = changes[SETTINGS_KEY]?.newValue as { useModel?: boolean } | undefined;
  if (next?.useModel) {
    warmed = true;
    void warmupModel().catch(() => undefined);
  }
});

async function warmIfEnabled(): Promise<void> {
  if ((await loadSettings()).useModel) {
    warmed = true;
    await warmupModel();
  }
}
chrome.runtime.onStartup.addListener(() => void warmIfEnabled().catch(() => undefined));
chrome.runtime.onInstalled.addListener(() => void warmIfEnabled().catch(() => undefined));

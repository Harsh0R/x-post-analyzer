import {
  OffscreenResponse,
  type OffscreenRequest,
} from "../shared/messages";
import type { CategoryId } from "../shared/categories";
import type { Verdict } from "../shared/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let creating: Promise<void> | null = null;

/** Make sure the offscreen document (where the model runs) exists. */
export async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL("offscreen.html");
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existing.length > 0) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Run an on-device text classification model (WebAssembly).",
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

/** The offscreen script may still be starting, so retry "no receiver" errors. */
async function send(req: OffscreenRequest): Promise<OffscreenResponse> {
  await ensureOffscreen();
  let lastError: unknown;
  for (let i = 0; i < 20; i++) {
    try {
      const raw = await chrome.runtime.sendMessage(req);
      const parsed = OffscreenResponse.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch (err) {
      lastError = err;
    }
    await sleep(250);
  }
  throw new Error(`offscreen document did not respond: ${String(lastError ?? "")}`);
}

/** Start loading the model without waiting for it. Safe to call repeatedly. */
export async function warmupModel(): Promise<void> {
  await send({ target: "offscreen", type: "warmup" });
}

export async function classifyWithModel(
  text: string,
  categories: readonly CategoryId[],
): Promise<Verdict[]> {
  const res = await send({ target: "offscreen", type: "classify", text, categories: [...categories] });
  if (!res.ok) throw new Error(res.error ?? "model classification failed");
  return res.verdicts ?? [];
}

/**
 * Hosts the on-device model. Offscreen documents only get the chrome.runtime API,
 * so status goes to the background by message (it stores it for the popup).
 */
import { pipeline, env } from "@huggingface/transformers";
import { OffscreenRequest } from "../shared/messages";
import type { ModelStatus } from "../shared/messages";
import { MODEL_ID, runZeroShot, type ZeroShotFn } from "../model/zeroshot";

// Everything the model needs at runtime comes from this extension or the model host.
// Manifest V3 forbids remote code, so the ONNX WebAssembly files are bundled in /wasm.
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.useWasmCache = false; // the cache path loads the wasm glue from a blob: URL, which the CSP blocks
const wasm = env.backends.onnx.wasm;
if (wasm) {
  wasm.wasmPaths = {
    mjs: chrome.runtime.getURL("wasm/ort-wasm-simd-threaded.asyncify.mjs"),
    wasm: chrome.runtime.getURL("wasm/ort-wasm-simd-threaded.asyncify.wasm"),
  };
  wasm.numThreads = 1; // multi-threading needs cross-origin isolation, which extension pages lack
}

function sendStatus(state: ModelStatus["state"], progress?: number, message?: string): void {
  chrome.runtime
    .sendMessage({ type: "modelStatus", state, progress, message })
    .catch(() => undefined);
}

type PipelineFn = (task: string, model: string, options: Record<string, unknown>) => Promise<unknown>;
type ZeroShotPipeline = (
  text: string,
  labels: string[],
  options: Record<string, unknown>,
) => Promise<{ labels: string[]; scores: number[] }>;

let loading: Promise<ZeroShotFn> | null = null;

function loadModel(): Promise<ZeroShotFn> {
  if (loading) return loading;
  sendStatus("loading", 0);

  const files = new Map<string, number>();
  let lastSent = 0;
  const onProgress = (info: { status?: string; file?: string; progress?: number }) => {
    if (info.status !== "progress" || !info.file || info.progress === undefined) return;
    files.set(info.file, info.progress / 100);
    const now = Date.now();
    if (now - lastSent < 250) return;
    lastSent = now;
    const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size;
    sendStatus("loading", avg);
  };

  loading = (async () => {
    const make = pipeline as unknown as PipelineFn;
    const pipe = (await make("zero-shot-classification", MODEL_ID, {
      dtype: "q8",
      device: "wasm",
      progress_callback: onProgress,
    })) as unknown as ZeroShotPipeline;
    sendStatus("ready", 1);
    const zs: ZeroShotFn = async (text, labels, template) => {
      const res = await pipe(text, labels, { hypothesis_template: template, multi_label: false });
      return { labels: res.labels, scores: res.scores };
    };
    return zs;
  })().catch((err: unknown) => {
    loading = null; // allow a retry on the next request
    sendStatus("error", undefined, String(err));
    throw err;
  });
  return loading;
}

// WebAssembly inference is single-threaded here, so run jobs one at a time.
let queue: Promise<unknown> = Promise.resolve();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const parsed = OffscreenRequest.safeParse(msg);
  if (!parsed.success) return false; // not for us (e.g. content -> background traffic)
  const req = parsed.data;

  if (req.type === "warmup") {
    void loadModel().catch(() => undefined);
    sendResponse({ ok: true });
    return false;
  }

  const job = queue.then(async () => {
    const zs = await loadModel();
    return runZeroShot(zs, req.text, req.categories);
  });
  queue = job.catch(() => undefined);
  job.then(
    (verdicts) => sendResponse({ ok: true, verdicts }),
    (err: unknown) => sendResponse({ ok: false, error: String(err) }),
  );
  return true;
});

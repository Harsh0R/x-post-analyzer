import { build, context } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/wasm", { recursive: true });
cpSync("manifest.json", "dist/manifest.json");
cpSync("src/popup/popup.html", "dist/popup.html");
cpSync("src/offscreen/offscreen.html", "dist/offscreen.html");

// Manifest V3 forbids remote code, so the ONNX WebAssembly runtime is copied into the
// extension and loaded from there (see src/offscreen/offscreen.ts).
const ortDir = "node_modules/onnxruntime-web/dist";
for (const f of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
  if (!existsSync(`${ortDir}/${f}`)) {
    console.error(`Missing ${ortDir}/${f}. Run "npm install" first.`);
    process.exit(1);
  }
  cpSync(`${ortDir}/${f}`, `dist/wasm/${f}`);
}

const common = { bundle: true, outdir: "dist", target: "chrome116", sourcemap: true, logLevel: "info" };

// Background, content script and popup: plain scripts.
const scripts = {
  ...common,
  format: "iife",
  entryPoints: {
    background: "src/background.ts",
    content: "src/content/content.ts",
    popup: "src/popup/popup.ts",
  },
};

// Offscreen model host: an ES module (transformers.js loads the ONNX glue by dynamic import).
const offscreen = {
  ...common,
  format: "esm",
  platform: "browser",
  entryPoints: { offscreen: "src/offscreen/offscreen.ts" },
};

if (watch) {
  const a = await context(scripts);
  const b = await context(offscreen);
  await Promise.all([a.watch(), b.watch()]);
  console.log("Watching. Reload the extension in chrome://extensions after changes.");
} else {
  await Promise.all([build(scripts), build(offscreen)]);
}

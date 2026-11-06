# X Post Analyzer (Chrome extension)

Real-time badges on x.com posts as you scroll: promo, engagement bait, rage-bait,
scam-like, checkable claim, toxicity, topic, sentiment and more (see
`src/shared/categories.ts`). Promotional posts get a red "skip" label and fade. You can
also auto-hide posts, refine labels with an on-device AI model, and label posts by hand
to measure accuracy. Free to build and run.

## Run it (Windows PowerShell or any shell)

```
npm install
npm run typecheck
npm test
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and choose
the `dist` folder. Open x.com and scroll. After code changes: `npm run build` (or
`npm run watch`), click the reload icon on the extension card, refresh the x.com tab.

`.npmrc` sets `ignore-scripts=true` on purpose: transformers.js lists `onnxruntime-node`,
whose install script downloads native binaries that the browser extension never uses.

## Three opt-in features (all off by default; use the toolbar popup)

### 1. On-device AI model
Tick **Refine labels with an AI model**. Rules and keywords answer instantly; then a small
zero-shot NLI model (`MODEL_ID` in `src/model/zeroshot.ts`) runs in a Chrome offscreen
document and replaces the weak baseline for sentiment, emotion, topic, post type and
rage-bait. Badges update a moment after they first appear. The popup shows download
progress. The model files download once from huggingface.co and are cached by the browser;
post text never leaves your computer. Inference is single-threaded WebAssembly, so expect
roughly a second per post for the model categories. Turn off categories you do not need
(emotion and type are off by default) to make it faster.

### 2. Labeling and accuracy
Tick **Labeling mode**: every post gets a pencil button. Pick the correct answer for any
categories (blank = skip) and Save. In the popup, **Export labels** writes `labels.json`.
Then:

```
npm run evaluate -- path/to/labels.json
```

prints per-category accuracy, precision, recall, F1 and the confidence threshold that scored
best on your labels. Aim for 30+ labeled posts per category before trusting the numbers.

### 3. Auto-hide
Under **Auto-hide** choose flags (promo, scam-like, engagement bait, rage-bait, toxicity,
checkable claim), topics, and keywords. Matching posts collapse into a one-line bar:
`Hidden: <reason> [Show]`. Flags and topics only fire at or above the confidence slider.
Keywords match whole words, case-insensitively, and apply instantly.

## How it works

- `src/content/` observes the timeline (MutationObserver finds posts, IntersectionObserver
  analyzes only visible ones). All x.com selectors live in `src/content/dom.ts`.
  `badge.ts` draws chips/promo label in a Shadow DOM, `hider.ts` the hide bar,
  `labeler.ts` the pencil panel.
- `src/background.ts` classifies with the fast rules, caches verdicts per post, asks the
  offscreen model for refinements and pushes them back to the tab.
- `src/offscreen/` + `src/model/` run transformers.js. The ONNX WebAssembly runtime is
  copied into `dist/wasm` by `build.mjs` because Manifest V3 forbids remote code.
- `src/classifiers/` holds the rule and keyword baselines behind one `Classifier` interface.
- `src/shared/hide.ts`, `labels.ts`, `src/eval/metrics.ts` hold the pure logic for hiding,
  label storage and evaluation (all unit-tested).

## Caveats

- Selectors in `dom.ts` follow X's `data-testid` attributes and can break without notice.
- X's own "Ad" label detection is English-UI only and best effort.
- The model path (download, WebAssembly inference in the offscreen document) was built and
  type-checked here but could not be run end to end without internet access to
  huggingface.co. If the popup shows "Model error", check the message and the offscreen
  page console (`chrome://extensions` -> "Inspect views: offscreen.html").
- Zero-shot scores are not calibrated probabilities. Use the labeling + evaluate loop to
  pick thresholds instead of trusting the defaults.
- Check X's current terms before publishing anything that automates its pages.



# X Post Analyzer

A Chrome extension that reads the posts you scroll past on **x.com**, labels each one in
real time (promotional, engagement bait, rage-bait, scam-like, toxic, topic, sentiment and
more), flags ads with a translucent red "skip" label, and can automatically collapse the
kinds of posts you don't want to see.

It runs almost entirely **on your own computer**. There is no server, no API key and no
per-use cost. An optional on-device AI model makes the labels more accurate.

> Built with TypeScript for Chrome Manifest V3. The code was designed and written in a
> conversation with Claude (an AI assistant made by Anthropic), with a human directing the
> requirements, testing it in Chrome and giving feedback from screenshots.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [The categories](#2-the-categories)
3. [What AI and technology it uses](#3-what-ai-and-technology-it-uses)
4. [How it works: the workflow](#4-how-it-works-the-workflow)
5. [Project structure, file by file](#5-project-structure-file-by-file)
6. [How it was built, step by step](#6-how-it-was-built-step-by-step)
7. [Build it yourself from scratch](#7-build-it-yourself-from-scratch)
8. [Install and run](#8-install-and-run)
9. [Using the popup](#9-using-the-popup)
10. [Measuring accuracy: the labeling workflow](#10-measuring-accuracy-the-labeling-workflow)
11. [Customizing it](#11-customizing-it)
12. [Testing](#12-testing)
13. [Privacy, permissions and security](#13-privacy-permissions-and-security)
14. [Limitations and honest caveats](#14-limitations-and-honest-caveats)
15. [Troubleshooting](#15-troubleshooting)
16. [Ideas for next steps](#16-ideas-for-next-steps)
17. [Glossary](#17-glossary)

---

## 1. What it does

While you scroll x.com, the extension looks at each post that is actually on screen and
decides what kind of post it is. It then:

| Feature | What you see |
|---|---|
| **Category badges** | Small gray pills under the post text, such as `Topic: sports` or `Scam-like`. At most 2 per post by default, and only when the extension is confident enough. |
| **Promotional flag** | A translucent red banner reading "Promotional — skip" under the post. Optionally the post's text, images, video and link card fade to 30% until you hover over the post. |
| **Auto-hide** | Posts matching your rules (flags, topics, keywords) collapse into a one-line bar: `Hidden: Scam-like  [Show]`. |
| **On-device AI refinement** | An optional small language model re-checks sentiment, emotion, topic, post type and rage-bait, and the badges update a moment after they first appear. |
| **Labeling mode** | A pencil button on every post lets you record the correct answer, so you can measure how accurate the extension really is. |

Everything is configured from the toolbar popup. All of the AI, hiding and labeling features
are **off by default**.

### Typical flow for a user

1. Load the extension and open x.com. Promo and scam-like posts get red labels or chips.
2. Turn on the AI model once. Badges become more accurate over a few seconds.
3. Turn on auto-hide for the things you don't want (scams, a topic, a spoiler keyword).
4. Optionally label ~30+ posts, export them, run the evaluation script and tune thresholds.

---

## 2. The categories

The full list lives in one place: `src/shared/categories.ts`. Every other part of the
extension (the popup, the badges, the hide rules, the labeling form, the evaluation) is
derived from that registry.

There are three kinds of decision:

- **choice**: pick exactly one option from a fixed set (for example topic).
- **yes/no**: an independent flag (for example promotional or not).
- **score**: a number from 0 to 1 (toxicity).

| Category | Kind | Options / meaning | Decided by |
|---|---|---|---|
| Sentiment | choice | positive, negative, neutral | keywords, refined by AI model |
| Emotion | choice | anger, fear, joy, sadness, disgust, surprise, none | keywords, refined by AI model |
| Type | choice | news, opinion, personal, question, joke, announcement | keywords, refined by AI model |
| Topic | choice | politics, sports, tech, finance, health, entertainment, science, other | keywords, refined by AI model |
| Promo | yes/no | looks like an ad or marketing | rules, plus X's own "Ad" label |
| Engagement bait | yes/no | "retweet if you agree", "follow for more" | rules |
| Rage-bait | yes/no | written mainly to provoke outrage | weak rule baseline, refined by AI model |
| Scam-like | yes/no | giveaway, airdrop, crypto shill patterns | rules |
| Checkable claim | yes/no | contains numbers, studies or statistics | rules |
| Toxicity | score | insults and shouting | rules (word list + capitals) |

Emotion and Type are switched off by default because the keyword versions are the weakest.

---

## 3. What AI and technology it uses

### 3.1 The AI inside the extension

There are three layers, from fastest and simplest to slowest and smartest. They run
together: the fast layers answer instantly, then the model improves the answer.

1. **Rules (regular expressions and word lists)**: `src/classifiers/rules.ts`.
   Instant and free. Good for promo wording, engagement bait, scam patterns, claims with
   numbers, toxicity words and shouting in capitals.
2. **Keyword baseline**: `src/classifiers/keywords.ts`. Counts words from small lexicons to
   guess sentiment, emotion, topic and post type. Crude on purpose, so the interface has
   something to show before the model has answered.
3. **On-device zero-shot language model (optional)**: `src/model/zeroshot.ts`,
   run by `src/offscreen/offscreen.ts`.
   - Library: **Transformers.js** (`@huggingface/transformers`, version 4), which runs
     machine-learning models inside the browser.
   - Runtime: **ONNX Runtime Web** compiled to **WebAssembly**, bundled inside the extension.
   - Model: **`Xenova/nli-deberta-v3-xsmall`**, a small DeBERTa-v3 model fine-tuned for
     natural language inference (NLI), used in 8-bit quantized form (`dtype: "q8"`).
   - Technique: **zero-shot classification**. The model was never trained on your
     categories. Instead, for each candidate label the extension builds a sentence such as
     *"This post is about technology."* and asks the model how strongly the post
     *entails* it. The label with the highest score wins, and that score becomes the
     confidence. Because it needs one model pass per candidate label, topic alone costs
     8 passes. That is why it is opt-in and why unused categories can be switched off.
   - Where it runs: your browser, locally. Only the one-time download of the model files
     touches the network (from huggingface.co). Post text is never sent anywhere.

### 3.2 Jev (TypeSafe AI): considered, not used

The project began as an exploration of **Jev**, a fast "System One" decision model from
TypeSafe AI. Jev is in early access with no confirmed free tier, so it is **not part of
this extension**. The design keeps it possible: every classifier sits behind one
`Classifier` interface (`src/classifiers/types.ts`), so a Jev-backed classifier could be
added later (through a small proxy server so no API key ships inside the extension). A
separate TypeScript Snake-bot project was built earlier to practice the decision-model
pattern (choice, yes/no and score decisions with a confidence threshold and fallback).

### 3.3 The AI used to build it

The code was written with **Claude** (Anthropic's AI assistant) in an iterative chat:
ideas and architecture, then generated code, then the developer loaded it in Chrome,
reported problems with screenshots, and the code was fixed. Claude also wrote the unit
tests and ran the typecheck, tests and build in a sandbox before each hand-off.

### 3.4 Full technology list

| Area | Technology | Why |
|---|---|---|
| Language | **TypeScript** (strict mode) | Type-safe messages and a single category registry |
| Platform | **Chrome Extension, Manifest V3** | Content script + service worker + popup + offscreen document |
| Bundler | **esbuild** | Very fast, simple build script (`build.mjs`) |
| Validation | **Zod** | Validates every message passed between extension parts |
| In-browser AI | **Transformers.js** + **ONNX Runtime Web (WASM)** | Free, private, no server |
| Model | **Xenova/nli-deberta-v3-xsmall** (zero-shot NLI) | Small enough to run in the browser |
| Page watching | **MutationObserver**, **IntersectionObserver** | Find new posts, analyze only visible ones |
| UI isolation | **Shadow DOM** | X's CSS cannot restyle our badges |
| Storage | `chrome.storage.local` / `.session` | Settings, labels, short-lived verdict cache |
| Model host | Chrome **Offscreen Documents API** | Service workers cannot run long WebAssembly jobs comfortably |
| Tests | **node:test** via **tsx**, **jsdom** | 40 tests, including simulated page elements |
| Package manager | **npm** | `.npmrc` disables install scripts (see 14) |

---

## 4. How it works: the workflow

### 4.1 The parts and how they talk

```
                    x.com page
   ┌────────────────────────────────────────────┐
   │  CONTENT SCRIPT  (src/content/*)           │
   │  finds posts, draws badges / hide bar /    │
   │  label panel in Shadow DOM                 │
   └───────┬───────────────────────▲────────────┘
           │ "analyze" {id, text}  │ "refine" {id, verdicts}
           ▼                       │ (pushed later)
   ┌────────────────────────────────┴───────────┐
   │  BACKGROUND SERVICE WORKER (src/background)│
   │  rules + keywords → instant answer         │
   │  cache per post id                         │
   │  asks model for refinements                │
   └───────┬───────────────────────▲────────────┘
           │ "classify" / "warmup" │ verdicts + status
           ▼                       │
   ┌────────────────────────────────┴───────────┐
   │  OFFSCREEN DOCUMENT (src/offscreen/*)      │
   │  Transformers.js + ONNX WASM + NLI model   │
   └────────────────────────────────────────────┘

   POPUP (src/popup/*) ⇄ chrome.storage ⇄ content script (settings, labels, model status)
```

### 4.2 What happens to one post, step by step

1. **Discovery.** A `MutationObserver` watches the page for newly added elements. Any
   `article[data-testid="tweet"]` is registered. (All X-specific selectors are isolated in
   `src/content/dom.ts`.)
2. **Visibility.** An `IntersectionObserver` waits until at least half of the post is on
   screen. Posts you scroll past quickly are never analyzed, which saves work.
3. **Extraction.** The post id comes from the status link (`/status/<digits>`), and the
   text from the post's `tweetText` element.
4. **Instant keyword hide.** If your hide-keywords match, the post collapses immediately
   without waiting for any classification.
5. **Message to the background.** The content script sends `{type:"analyze", id, text}`.
   The message is validated with Zod.
6. **Cache check.** The background looks for this post id in memory, then in
   `chrome.storage.session`. Cached posts answer immediately.
7. **Fast classification.** Otherwise the rules and the keyword baseline run and produce a
   verdict for every category. The result is cached and returned.
8. **Rendering.** The content script draws the result:
   - If X itself marks the post as an ad (an "Ad" or "Promoted" label), that overrides our
     guess with 100% confidence.
   - Promo gets the red label and optional fading.
   - Otherwise up to N chips above the confidence threshold are shown.
   - The hide rules are evaluated and, if they match, the post collapses behind the bar.
9. **Model refinement (only if enabled).** The background asks the offscreen document to
   classify the same text for the enabled model categories. The offscreen document loads
   the model on first use (progress is shown in the popup), runs the zero-shot passes one
   post at a time, and returns verdicts.
10. **Push back.** The background merges the model's verdicts over the baseline ones,
    updates the cache and sends a `refine` message to the tab. The content script swaps in
    the better verdicts and re-renders, so badges and hide decisions can change a moment
    after the post first appeared.
11. **Settings changes.** When you change anything in the popup, every tracked post is
    re-rendered without re-analysis.

### 4.3 Why it is built this way

- **Two-phase answers (fast, then refined)** so the page never waits for the model.
- **Only visible posts** keep the number of model runs low.
- **One registry** (`categories.ts`) means adding a category is a one-file change.
- **A `Classifier` interface** means any backend can be swapped in or layered.
- **Validated messages** (Zod) mean a malformed message cannot crash another component.
- **Offscreen document** because a service worker sleeps after about 30 seconds idle and
  is a poor home for a loaded model.
- **Shadow DOM and `stopPropagation`** so our controls look right and clicking them does
  not open the post underneath.

---

## 5. Project structure, file by file

```
x-post-analyzer/
├── manifest.json            Extension manifest (permissions, CSP, entry points)
├── build.mjs                esbuild build + copies WASM and static files into dist/
├── package.json / package-lock.json
├── tsconfig.json            Strict TypeScript settings
├── .npmrc                   ignore-scripts=true (see section 14)
├── scripts/
│   └── evaluate.ts          CLI that scores exported labels (accuracy, F1, thresholds)
├── src/
│   ├── background.ts        Service worker: cache, fast classify, model orchestration
│   ├── shared/
│   │   ├── categories.ts    THE taxonomy registry (choice / yes-no / score)
│   │   ├── types.ts         The Verdict type every classifier returns
│   │   ├── messages.ts      Zod schemas for every message between parts
│   │   ├── settings.ts      Settings shape, defaults, load/save
│   │   ├── hide.ts          Pure auto-hide decision logic and keyword matching
│   │   └── labels.ts        Label records, storage helpers, JSON export
│   ├── classifiers/
│   │   ├── types.ts         The Classifier interface
│   │   ├── rules.ts         Regex and word-list rules
│   │   ├── keywords.ts      Keyword lexicons for choice categories
│   │   └── index.ts         classifyAll() and mergeVerdicts()
│   ├── model/
│   │   ├── zeroshot.ts      Model id, label phrases, runZeroShot() (pure, testable)
│   │   └── client.ts        Background-side helpers to reach the offscreen document
│   ├── offscreen/
│   │   ├── offscreen.html   Page that hosts the model
│   │   └── offscreen.ts     Loads Transformers.js, runs jobs one at a time
│   ├── content/
│   │   ├── content.ts       Observers, state per post, rendering orchestration
│   │   ├── dom.ts           ALL x.com selectors, ad detection, theme detection
│   │   ├── badge.ts         Chips, promo label, fading, Shadow DOM host
│   │   ├── hider.ts         Collapse bar and styles for hidden posts
│   │   └── labeler.ts       Pencil button and the label panel
│   ├── eval/
│   │   └── metrics.ts       Precision, recall, F1, best-threshold search
│   └── popup/
│       ├── popup.html       Settings UI
│       └── popup.ts         Settings logic, model status, label export
└── tests/                   40 tests (classifiers, hide, model, metrics, UI)
```

Build output goes to `dist/`, and that folder is what Chrome loads.

---

## 6. How it was built, step by step

This is the actual order the project was developed in, and why each step came when it did.

**Step 1: Research and idea.** The goal began as "learn Jev, a fast decision model, by
building something small". Looking up Jev showed it was early-access with no confirmed
free tier. A Snake-bot project (TypeScript) was built to practice the decision-model
pattern: serialize a state to text, ask for a decision, apply a confidence threshold, fall
back to a rule when unsure, and log every decision.

**Step 2: New idea, constraints.** The idea moved to a real-time post-analysis Chrome
extension for x.com. A key requirement was added: **free, no API charges**. That ruled out
a paid API as the core and pointed to rules plus an on-device model.

**Step 3: Choose the architecture.** Manifest V3 with a content script (reads the page),
a service worker (classifies and caches), a popup (settings), and a registry-driven
taxonomy so categories are data, not scattered code.

**Step 4: Scaffold and first working build.** TypeScript project, esbuild script, manifest,
content script with observers, rules classifier, keyword baseline, Shadow DOM badges, popup
toggles, caching, and unit tests. At this point everything was free and instant.

**Step 5: Test in the real page.** The developer loaded the extension and sent screenshots.
They showed that some posts got badges and others did not (because only confident verdicts
are shown), and that an obvious ad (a PlayStation post) was missed.

**Step 6: Promotional flag.** Broadened the promo rules (phrases like "available now",
"pre-order", "watch now", availability words plus a link), added detection of X's own
"Ad" label, added the red "Promotional — skip" banner, and optional fading of the post's
content with hover-to-reveal. Added simulated-page tests.

**Step 7: Accuracy features.** Three things were added together:
- the **on-device model** (offscreen document, Transformers.js, zero-shot NLI), with a
  two-phase fast-then-refined flow and a download progress status in the popup;
- the **labeling mode** and **evaluation script**, so accuracy is measured instead of guessed;
- **auto-hide** rules (flags, topics, keywords) with a collapse bar and a Show button.

**Step 8: Fix problems found in use.** A screenshot showed the badges stretched into tall
pills (a layout bug: chips shared a flex row with the label panel) and an unreadable
dropdown (transparent select boxes on X's dark theme). The fix restructured the layout,
detected X's theme and gave the form controls solid theme-matched colors.

**Step 9: Verification before each hand-off.** Every iteration was typechecked
(`tsc --noEmit`), unit-tested (40 tests) and built. One thing could not be verified
end to end in the build environment: downloading and running the model, because it had no
access to huggingface.co. That path is built and type-checked but needs a real run in
Chrome (see section 14).

**Design decisions worth knowing:**

| Decision | Reason |
|---|---|
| Registry-driven categories | Adding a category changes one file, not six |
| Verdicts carry confidence | Lets the UI threshold, hide and evaluate consistently |
| "Fast first, refine later" | The page never waits on a model |
| All selectors in `dom.ts` | X changes its markup; one place to repair |
| Zod on every message | Contract between parts is checked at runtime |
| Pure logic split from UI | `hide.ts`, `zeroshot.ts`, `metrics.ts` are unit-testable without a browser |
| Everything risky opt-in | Model download, labeling and hiding are off until you choose |
| Label the post, not the account | Calling an account a "bot" from one post would be unreliable and unfair |

---

## 7. Build it yourself from scratch

A condensed recipe if you want to recreate it rather than use the provided code.

1. **Create the project**
   ```
   mkdir x-post-analyzer && cd x-post-analyzer
   npm init -y
   npm install zod @huggingface/transformers
   npm install -D typescript esbuild tsx jsdom @types/chrome @types/node @types/jsdom
   ```
   Add a `.npmrc` containing `ignore-scripts=true`. Set `"type": "module"` in `package.json`.
2. **`tsconfig.json`**: strict mode, `moduleResolution: "Bundler"`, libs `ES2022` and
   `DOM`, `types: ["chrome", "node"]`, `noEmit: true`.
3. **`manifest.json`** (Manifest V3): permissions `storage` and `offscreen`, host
   permissions for `huggingface.co`, a content script matching `https://x.com/*`, a
   background service worker, an action popup, and a CSP of
   `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`.
4. **`build.mjs`**: use esbuild to bundle `background`, `content` and `popup` as plain
   scripts and `offscreen` as an ES module; copy the manifest and HTML files to `dist/`;
   copy `ort-wasm-simd-threaded.asyncify.mjs` and `.wasm` from
   `node_modules/onnxruntime-web/dist` into `dist/wasm/`.
5. **Write the taxonomy registry** (`categories.ts`) and the `Verdict` type.
6. **Write the classifiers**: rules first, then keywords. Test them with `node:test`.
7. **Write the content script**: `dom.ts` with the selectors, the observers, and a
   message to the background. Return verdicts and draw chips in a Shadow DOM host.
8. **Write the background**: validate messages with Zod, cache verdicts, return results.
9. **Write the popup** and a settings module backed by `chrome.storage.local`.
10. **Add the promo flag**: the red banner, the fading CSS, detection of X's "Ad" label.
11. **Add the model**: `zeroshot.ts` (label phrases and `runZeroShot`), the offscreen
    page that creates a `zero-shot-classification` pipeline, the message protocol, and
    the background orchestration (fast answer, then pushed refinement).
12. **Add labeling, evaluation and auto-hide**, each with its own pure module and tests.
13. **Build and load**: `npm run build`, open `chrome://extensions`, Developer mode,
    Load unpacked, choose `dist`.
14. **Iterate with real pages**: screenshots of what looks wrong are the fastest way to
    find layout and detection bugs.

---

## 8. Install and run

Requirements: Node.js 18 or newer and Google Chrome (version 116 or newer, needed for
the offscreen API). Commands work in Windows PowerShell or any shell.

```
npm install
npm run typecheck      # TypeScript check
npm test               # 40 unit tests
npm run build          # creates dist/
```

Load into Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist` folder.
4. Open x.com and scroll.

After changing code: run `npm run build` (or `npm run watch`), click the reload icon on
the extension card, then refresh the x.com tab.

Other scripts: `npm run evaluate -- path/to/labels.json` scores your hand-labeled posts.

---

## 9. Using the popup

| Setting | What it does | Default |
|---|---|---|
| Enabled | Master switch | on |
| Dim promotional posts | Fade a promo post's text and media until you hover | on |
| Badge confidence threshold | Minimum confidence before a badge is shown | 0.60 |
| Max badges per post | Keeps the timeline from filling with chips | 2 |
| Categories | Which categories may produce badges | all except Emotion and Type |
| Refine labels with an AI model | Turns on the on-device model (one-time download) | off |
| Auto-hide: confidence | Minimum confidence for flags and topics to hide a post | 0.75 |
| Auto-hide: flags | Hide posts flagged promo, scam-like, engagement bait, rage-bait, toxicity, claim | none |
| Auto-hide: topics | Hide posts whose topic matches | none |
| Auto-hide: keywords | Whole-word, case-insensitive match; one per line or comma separated | none |
| Labeling mode | Adds a pencil button to every post | off |
| Export / Clear labels | Save your labels to `labels.json`, or delete them | n/a |

The model status line shows "Downloading model… NN%", "Model ready." or an error message.

---

## 10. Measuring accuracy: the labeling workflow

The rules and the model are guesses. This workflow replaces guessing with measurement.

1. Turn on **Labeling mode** in the popup.
2. On each post, click the pencil. For any category, pick the correct answer. Leave
   blank to skip. Click **Save**. (Each label records what the extension predicted at that
   moment, so the evaluation reflects what you actually saw.)
3. In the popup, click **Export labels** to download `labels.json`.
4. Run:
   ```
   npm run evaluate -- path/to/labels.json
   ```
5. Read the table:

   | Column | Meaning |
   |---|---|
   | `n` | How many labeled posts for this category |
   | `accuracy` | Fraction correct (choice) or correct yes/no at 0.5 |
   | `precision` | Of the posts flagged "yes", how many were really yes |
   | `recall` | Of the posts that were really yes, how many were flagged |
   | `f1` | Balance of precision and recall |
   | `bestThreshold` | Confidence cut-off that scored the highest F1 on your labels |

6. Use `bestThreshold` as a guide for the popup threshold. Aim for **30 or more labels per
   category** before trusting the numbers, since small samples are noisy.

---

## 11. Customizing it

**Add a new category.** Edit only `src/shared/categories.ts` to add the entry (choice,
yes/no or score). Then give it a decider: add a rule in `rules.ts` (yes/no or score),
keywords in `keywords.ts` (choice), or phrases in `zeroshot.ts` (model). The popup,
badges, hide options and labeling form pick it up automatically.

**Tune the promo detection.** Edit the `PROMO`, `LINK` and `PROMO_WEAK` patterns in
`src/classifiers/rules.ts`. Run `npm test` and add a test for the post you fixed.

**Change the AI model.** Change `MODEL_ID` in `src/model/zeroshot.ts` to another
zero-shot compatible ONNX model from Hugging Face. Larger models are more accurate but
slower and a bigger download.

**Add another backend** (a different local model, a local Ollama server, or Jev through
a proxy). Implement the `Classifier` interface in `src/classifiers/types.ts`, then add it
to the list in `src/classifiers/index.ts`. Earlier entries win when two cover the same
category.

**Fix detection when X changes its markup.** Everything X-specific is in
`src/content/dom.ts` (`SEL`, `isNativeAd`, `DIM_SELECTORS`).

**Change the look.** Chip, promo banner and label panel styles are in `badge.ts` and
`labeler.ts`; the hide bar is in `hider.ts`.

---

## 12. Testing

```
npm test
```

40 tests, run with Node's built-in test runner through `tsx`, with `jsdom` simulating page
elements. They cover:

| File | What it checks |
|---|---|
| `tests/classifiers.test.ts` | Each rule and keyword category, including the PlayStation-style ad and non-ads |
| `tests/hide.test.ts` | Confidence floor, toxicity score, topics, whole-word keyword matching |
| `tests/model.test.ts` | Zero-shot label mapping with a fake model, truncation, verdict merging |
| `tests/metrics.test.ts` | Precision, recall, F1, best-threshold search, ignoring unlabeled posts |
| `tests/badge.test.ts` | Promo banner, fading attributes, native "Ad" detection |
| `tests/ui.test.ts` | Label panel save flow, hide bar collapse/reveal, theme detection, click isolation |

`npm run typecheck` runs the strict TypeScript check, including all source and tests.

What the tests do **not** cover: a real run against live x.com, and downloading and
running the real model.

---

## 13. Privacy, permissions and security

**Where your data goes.** Post text is processed inside your browser. Rules run in the
extension. The optional model also runs in the browser. The only network traffic the
extension itself creates is the **one-time download of model files from huggingface.co**
(then cached by the browser). Labels you save stay in `chrome.storage.local` on your
computer until you export or clear them.

**Permissions requested and why:**

| Permission | Why |
|---|---|
| `storage` | Save settings and labels; short-lived verdict cache |
| `offscreen` | Create the hidden page that runs the model |
| Host access to `huggingface.co`, `*.huggingface.co`, `*.hf.co` | Download model files |
| Content script on `x.com` and `twitter.com` | Read posts and draw badges |
| CSP `wasm-unsafe-eval` | Required to run WebAssembly; no remote scripts are allowed |

**Security design.** Manifest V3 forbids remote code, so the WebAssembly runtime ships
inside the extension (`dist/wasm`). There are no API keys anywhere. If a paid API such as
Jev is ever added, route it through your own proxy so no key is embedded in the extension.
Messages between components are validated with Zod. Clicks on injected controls are
stopped from bubbling into the post.

**Be careful about:** the content of other people's posts is being analyzed locally, which
is a different thing from collecting or republishing it. Do not log or share post text
without thinking about consent and X's terms.

---

## 14. Limitations and honest caveats

- **X can break it.** Selectors rely on X's `data-testid` attributes, which change without
  notice. If posts stop being found, fix `src/content/dom.ts`.
- **"Ad" detection is English-only and best effort.** Native ad labels are matched by the
  words "Ad" or "Promoted". Other languages rely on the text rules.
- **The rules are heuristics.** Promo detection by wording will miss some brand marketing
  and sometimes flag a normal post. Rage-bait and keyword categories are crude without
  the model.
- **Zero-shot scores are not calibrated probabilities.** A "0.8" is not an 80% chance.
  Use the labeling and evaluation workflow to choose thresholds.
- **The model path was not run end to end where this was built.** It is built, bundled
  and type-checked, and the label-mapping logic is unit-tested with a fake model, but
  downloading and running the real model needs a real Chrome with internet access. If the
  popup shows a model error, open `chrome://extensions`, find "Inspect views:
  offscreen.html" on the extension card and read its console.
- **Speed.** Inference is single-threaded WebAssembly, so expect roughly a second per
  post for the model categories. Turn off categories you do not need.
- **The model file size was not measured.** The popup shows live download progress.
- **Language.** The keyword lists and rules are English. The model is also English-focused.
- **`.npmrc` disables install scripts on purpose.** `onnxruntime-node` (a dependency of
  transformers.js that the browser build never uses) tries to download native binaries
  during install, which can fail on restricted networks.
- **Terms of service.** Check X's current terms before publishing or distributing anything
  that automates or modifies its pages. This project is intended as a personal tool.

---

## 15. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| No badges anywhere | Threshold too high, categories off, or selectors changed. Lower the threshold; check DevTools for `article[data-testid="tweet"]`. |
| Some posts show badges, some do not | Normal: only verdicts above the threshold are shown. |
| Extension changed after editing code but nothing happens | Run `npm run build`, click reload on the extension card, refresh x.com. |
| Popup says "Model error" | Open the offscreen page console (see section 14). Check internet access to huggingface.co. |
| Model stuck at 0% | Network blocked, or offscreen document failed to start. Reload the extension and try again. |
| `npm install` fails on `onnxruntime-node` | Make sure `.npmrc` with `ignore-scripts=true` is present. |
| Build says "Missing ort-wasm-simd-threaded..." | Run `npm install` first so the WASM files exist in `node_modules`. |
| An ad slipped through | Add its wording to `PROMO` in `rules.ts`, or raise sensitivity by lowering the threshold. |
| A normal post was marked promo | Narrow the `PROMO` / `PROMO_WEAK` patterns, or raise the threshold. |
| Posts hidden unexpectedly | Check auto-hide flags, topics and keywords; keywords match whole words. |

---

## 16. Ideas for next steps

- Calibrate thresholds per category using your own labeled posts.
- Add account-level signals (account age, posting rate) for a spam-like score, without
  labeling accounts as bots.
- Detect repeated copy-paste posts across the timeline.
- Add a side panel summarizing the topic and sentiment mix of the posts you scrolled past.
- Add per-category colors and icons instead of identical gray pills.
- Add a selector health check that warns when no posts are found.
- Try Chrome's built-in on-device AI, a local Ollama model, or Jev behind a proxy, as
  additional classifier backends.
- Multi-language support.

---

## 17. Glossary

| Term | Meaning |
|---|---|
| **Manifest V3 (MV3)** | Chrome's current extension format. It forbids remotely hosted code. |
| **Content script** | Extension code injected into a web page; it can read and change that page. |
| **Service worker (background)** | Extension code that runs without a page and sleeps when idle. |
| **Offscreen document** | A hidden extension page used to run work a service worker cannot. |
| **Popup** | The small settings window opened from the toolbar icon. |
| **Shadow DOM** | An isolated bit of page markup; page CSS cannot restyle what is inside. |
| **MutationObserver** | Browser API that reports when elements are added to the page. |
| **IntersectionObserver** | Browser API that reports when an element becomes visible. |
| **Zero-shot classification** | Classifying text into labels the model was not specifically trained on. |
| **NLI (natural language inference)** | Judging whether one sentence entails, contradicts or is neutral to another. |
| **ONNX** | A portable format for machine-learning models. |
| **WebAssembly (WASM)** | Fast compiled code that runs inside the browser. |
| **Quantized (q8)** | A model stored in 8-bit numbers, smaller and faster at slight cost in accuracy. |
| **Verdict** | One classifier result: category, label, confidence (and a value for scores). |
| **Confidence / threshold** | How sure a classifier is; the cut-off needed to show or act on a result. |
| **Precision / recall / F1** | Measures of correctness for a yes/no flag: how clean, how complete, and the balance. |
| **Cache** | Saved results so the same post is not analyzed twice. |

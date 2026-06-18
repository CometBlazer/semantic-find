# Build Chrome Extension for Semantic Find

## Goal

Turn the existing Semantic Find Next.js project into a personal Chrome extension that works as a local, semantic, fuzzy, substring-powered find-in-page tool.

The extension should:

* Run entirely locally in the browser
* Use no backend
* Use no API keys
* Search the current webpage
* Open with a keyboard shortcut
* Inject a search overlay into the current page
* Extract real page text from the DOM
* Chunk the text
* Run substring, lexical/fuzzy, and semantic search
* Fuse results with weighted RRF
* Gate results with substring/keyword/cosine eligibility
* Scroll to and highlight matching page content
* Cache embeddings per page
* Keep the existing Next.js demo intact

The existing Next.js app is the development playground and proof of concept. The Chrome extension should be added as a separate target inside the same repo, not as a totally separate repo unless absolutely necessary.

## Branch Workflow

Before making changes, create a new branch:

```bash
git status
git checkout -b feature/chrome-extension
```

If the branch already exists:

```bash
git checkout feature/chrome-extension
```

Do all extension work on this branch.

Do not merge into `main`.

At the end, leave clear testing instructions for the human. The human will manually test the unpacked extension and merge later.

## Important Git Rules

* Do not delete the existing Next.js app.
* Do not rewrite unrelated files.
* Do not rename the project unless necessary.
* Keep the current `/app`, `/components`, and `/lib` structure working.
* Add extension-specific code under `/extension`.
* Shared search logic should remain in `/lib` whenever possible.
* Extension-only wrappers, DOM extraction, overlay injection, and Chrome APIs should live in `/extension`.
* Commit-ready changes are preferred, but do not auto-commit unless explicitly asked.

## Existing Architecture to Preserve

The current project already has the important search core. Reuse these pieces instead of rebuilding them:

```text
lib/chunk.ts
lib/vector.ts
lib/minisearch-lexical.ts
lib/substring.ts
lib/provenance.ts
lib/cache.ts
lib/embedding.ts
lib/embedding.worker.ts
lib/embedding-client.ts
lib/spellcheck.ts
```

The extension should reuse:

```text
chunking
substring scan
MiniSearch lexical/fuzzy search
cosine ranking
weighted RRF fusion
provenance tags
IndexedDB cache
embedding pipeline
highlighting behavior, adapted to real DOM nodes
```

The extension should replace:

```text
sampleDocument
Next.js page rendering
demo-only React wrapper
static document anchors
Ctrl/Cmd+K shortcut
```

with:

```text
real webpage DOM extraction
content script overlay
Shadow DOM UI mount
Chrome extension command
Alt+Shift+K shortcut
real element scrolling
real page highlighting
```

## Desired Final Repo Shape

Create or evolve toward this structure:

```text
semantic-find/
  app/
  components/
  lib/
    chunk.ts
    vector.ts
    minisearch-lexical.ts
    substring.ts
    provenance.ts
    cache.ts
    embedding.ts
    embedding.worker.ts
    embedding-client.ts
    spellcheck.ts

  extension/
    manifest.json
    background.ts
    content.ts
    extractor.ts
    highlighter.ts
    overlay.tsx
    overlay.css
    extension-search.ts
    extension-cache.ts
    offscreen.html
    offscreen.ts
    model-runtime.ts
    README.md

  public/
  package.json
  next.config.ts
  tsconfig.json
```

If the current build tooling makes this exact structure awkward, choose a clean equivalent, but keep extension code isolated under `/extension`.

## Build Tooling Requirement

The existing Next.js build is not automatically suitable for building a Chrome extension.

Add a simple extension build target using one of these approaches:

Preferred:

```text
Vite library/multi-entry build for extension files
```

Acceptable:

```text
tsup/esbuild build script for background/content/offscreen files
```

Avoid making the Chrome extension depend on the Next.js runtime.

The extension build should output to:

```text
dist-extension/
```

The final unpacked extension folder should contain:

```text
dist-extension/
  manifest.json
  background.js
  content.js
  overlay.css
  offscreen.html
  offscreen.js
  assets/
    model files if bundled
    wasm files if bundled
```

Add package scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "build:extension": "...",
    "watch:extension": "..."
  }
}
```

Use the simplest reliable build setup. Prefer clarity over cleverness.

## Chrome Extension Manifest

Use Manifest V3.

Create `extension/manifest.json` and ensure the built version lands in `dist-extension/manifest.json`.

Start with this shape:

```json
{
  "manifest_version": 3,
  "name": "Semantic Find",
  "version": "0.1.0",
  "description": "Local semantic Ctrl+F for webpages.",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "offscreen"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "commands": {
    "toggle-semantic-find": {
      "suggested_key": {
        "default": "Alt+Shift+K",
        "mac": "Alt+Shift+K",
        "windows": "Alt+Shift+K",
        "linux": "Alt+Shift+K"
      },
      "description": "Open Semantic Find"
    }
  },
  "content_scripts": [
    {
      "matches": [
        "<all_urls>"
      ],
      "js": [
        "content.js"
      ],
      "css": [
        "overlay.css"
      ],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": [
        "assets/*",
        "offscreen.html"
      ],
      "matches": [
        "<all_urls>"
      ]
    }
  ]
}
```

Notes:

* Use `Alt+Shift+K` as the default shortcut.
* The user can change this later at `chrome://extensions/shortcuts`.
* If `offscreen` is not implemented in the first milestone, keep the architecture ready for it, but do not block the whole extension on it.
* Use minimal permissions where possible. If a permission proves unnecessary, remove it.

## Keyboard Shortcut Behavior

The extension should open with:

```text
Alt+Shift+K
```

Inside the overlay:

```text
Esc closes the overlay
ArrowDown moves to next result
ArrowUp moves to previous result
Enter jumps to selected result
Cmd/Ctrl+K may focus the overlay input only when the overlay is already open
```

Do not rely on `Ctrl+K` as the global trigger because many websites intercept it.

## Development Milestones

Build this incrementally. Do not attempt all features in one giant step.

### Milestone 1: Minimal Loadable Extension

Goal:

* `npm run build:extension` creates `dist-extension`
* Chrome can load `dist-extension` as an unpacked extension
* No runtime errors on a normal webpage
* Pressing `Alt+Shift+K` sends a message to the content script
* The content script toggles a simple overlay that says "Semantic Find"

Implementation:

* Create `manifest.json`
* Create `background.ts`
* Create `content.ts`
* Create `overlay.css`
* Create build script
* Verify output filenames match manifest

Background command handler:

```ts
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-semantic-find") return;

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) return;

  await chrome.tabs.sendMessage(tab.id, {
    type: "TOGGLE_SEMANTIC_FIND",
  });
});
```

Content script message handler:

```ts
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "TOGGLE_SEMANTIC_FIND") {
    toggleSemanticFindOverlay();
  }
});
```

Acceptance checks:

* `npm run build:extension` succeeds
* `dist-extension/manifest.json` exists
* Chrome loads the extension unpacked
* Shortcut opens/closes a visible overlay
* Esc closes the overlay
* Existing Next.js app still runs

### Milestone 2: Shadow DOM Overlay

Goal:

* Overlay is injected into the page using Shadow DOM
* Host page CSS should not break the overlay
* Overlay should be visually usable on arbitrary pages
* Overlay has input, results area, status area, and close button

Implementation details:

* In `content.ts`, create a host element:

```ts
const host = document.createElement("div");
host.id = "semantic-find-extension-root";
const shadow = host.attachShadow({ mode: "open" });
document.documentElement.appendChild(host);
```

* Inject overlay CSS into the shadow root.
* Either render plain DOM or mount a lightweight React component.
* If React is used, make sure it is bundled into `content.js`.
* Keep overlay UI independent from Next.js.

Overlay should include:

```text
search input
result count
literal match count
result list
selected result state
provenance tag per result
debug cosine score optionally hidden behind a debug flag
```

Acceptance checks:

* Overlay appears above page content
* Overlay does not inherit broken fonts/colors from host site
* Overlay can be opened and closed repeatedly
* No duplicate roots are created

### Milestone 3: DOM Extraction

Goal:

* Replace `sampleDocument` with real page extraction.
* Extract readable text from current webpage.
* Preserve mapping from chunks back to DOM elements.

Create `extension/extractor.ts`.

Extract from these selectors:

```ts
const SELECTOR = [
  "article",
  "main",
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "td",
  "th"
].join(",");
```

Initial simple approach:

```ts
const nodes = Array.from(document.querySelectorAll(SELECTOR))
  .filter((el) => {
    const text = (el.textContent ?? "").trim();
    if (!text) return false;
    if (text.split(/\s+/).length < 4) return false;
    if (isHidden(el)) return false;
    return true;
  });
```

Implement `isHidden(el)`:

```ts
function isHidden(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0 ||
    rect.width === 0 ||
    rect.height === 0
  );
}
```

Assign stable IDs:

```ts
const id = `sf-${index}`;
el.setAttribute("data-sf-id", id);
```

Return blocks:

```ts
type PageBlock = {
  id: string;
  text: string;
  element: Element;
};
```

Then adapt to the existing chunker. If existing `lib/chunk.ts` expects `{ id, text }`, pass those fields directly and maintain a side map:

```ts
const elementByBlockId = new Map<string, Element>();
```

Important:

* Avoid duplicate extraction from nested containers if possible.
* If extracting `article` or `main` causes duplication with child paragraphs, prefer paragraph/list/heading level extraction first.
* Keep the first implementation simple and reliable.
* Later, add Readability support only if necessary.

Acceptance checks:

* Overlay shows number of extracted blocks/chunks
* Normal article pages produce useful chunks
* Search result can identify source element
* No massive duplicate text on simple pages

### Milestone 4: Substring Search Only

Goal:

* Implement literal Ctrl+F-style search before semantic search.
* Very short queries like `f` should work.
* Fragments like `grea` should match inside words.
* Results should scroll to real page elements.

Use existing:

```text
lib/substring.ts
```

Behavior:

```text
Query "f":
- raw substring scan
- case-insensitive
- matches mid-word
- shows literal match count
- does not require cosine

Query "grea":
- matches great, greater, greatest, aggregate if substring exists
```

Ranking for substring-only milestone:

Sort by:

```text
1. occurrence count descending
2. earliest occurrence position ascending
3. chunk order ascending
```

Do not use semantic yet.

Acceptance checks:

* `f` returns matches
* `grea` returns matches if present
* clicking or pressing Enter scrolls to result
* matching text is highlighted on page
* no semantic model is required for this milestone

### Milestone 5: Page Highlighting

Goal:

* Highlight selected result on the actual page.
* Highlight literal substring occurrences.
* Clean up old highlights when query changes or overlay closes.

Create `extension/highlighter.ts`.

Simplest robust strategy:

* Do not permanently rewrite page structure too aggressively.
* For selected element, add a CSS outline/background class:

```css
.semantic-find-active-result {
  outline: 2px solid #f59e0b !important;
  background: rgba(245, 158, 11, 0.15) !important;
}
```

For literal text highlighting, either:

Option A, safer first version:

```text
highlight the whole source element
show snippets in overlay with mark tags
```

Option B, more advanced:

```text
walk text nodes inside the selected element
wrap matching ranges in <mark data-sf-mark>
restore original text on cleanup
```

Start with Option A if necessary. Add Option B after core extension works.

Acceptance checks:

* Result scrolls into view
* Active source element is visibly highlighted
* Highlight is removed when another result is selected
* Highlight is removed when overlay closes

### Milestone 6: MiniSearch Lexical/Fuzzy Search

Goal:

* Add exact, prefix, and fuzzy token search over chunks.
* Reuse `lib/minisearch-lexical.ts`.
* Keep substring as separate literal layer.

Behavior:

```text
substring:
- character-level
- matches "f" inside "offline"
- matches "grea" inside "great"

MiniSearch lexical:
- token-level
- exact
- prefix
- fuzzy for terms length >= 4
- catches "refnd" as "refund"
```

Important:

* Do not let fuzzy matches outrank exact literal matches.
* Keep provenance flags:

  * exact/prefix keyword hit
  * fuzzy-only hit
  * substring hit

Acceptance checks:

* `refund` finds exact token matches
* `refun` finds prefix matches
* `refnd` finds fuzzy matches if similar token exists
* `f` still works through substring even if MiniSearch ignores it

### Milestone 7: RRF Fusion for Substring + Lexical

Goal:

* Fuse substring and MiniSearch results using weighted RRF.
* Keep substring as an eligibility signal with low ordering weight.

Use existing:

```text
lib/vector.ts
```

Suggested weights:

```ts
const RRF_WEIGHTS = {
  substring: 0.3,
  keyword: 0.9
};

const RRF_K = 60;
```

Important behavior:

```text
Gate:
- substring hit OR keyword hit makes result eligible

Ordering:
- RRF decides order among eligible results
- substring has low weight so one-character queries do not flood weirdly
```

Acceptance checks:

* literal results always show if text exists
* exact token matches rank well
* fuzzy-only results are tagged as Close
* no semantic dependency yet

### Milestone 8: Semantic Search with Embeddings

Goal:

* Add semantic search using existing embedding pipeline.
* Embed page chunks.
* Embed query.
* Compare query vector to chunk vectors with cosine.
* Fuse semantic with substring and lexical using weighted RRF.
* Use cosine for semantic confidence, not as the only gate.

Use existing:

```text
lib/embedding-client.ts
lib/embedding.worker.ts
lib/vector.ts
lib/cache.ts
```

If these cannot be reused directly in the extension because of bundling constraints, create extension-specific wrappers but keep the same public API.

Semantic search behavior:

```text
1. Embed all chunks once per page hash
2. Cache embeddings in IndexedDB
3. Embed query at search time
4. Compute cosine against all chunk embeddings
5. Produce semantic ranked list
```

Suggested weights:

```ts
const RRF_WEIGHTS = {
  semantic: 1.0,
  keyword: 0.9,
  substring: 0.3
};

const RRF_K = 60;
```

Thresholds:

```ts
const LOOSE_FLOOR = 0.15;
const RELATED_FLOOR = 0.4;
```

Eligibility gate:

```ts
const eligible =
  hasSubstringHit ||
  hasKeywordHit ||
  cosine >= LOOSE_FLOOR;
```

Provenance:

```text
Exact:
- substring hit
- exact/prefix keyword hit

Close:
- fuzzy-only keyword hit

Related:
- no lexical/literal hit
- cosine >= RELATED_FLOOR

Loosely related:
- no lexical/literal hit
- LOOSE_FLOOR <= cosine < RELATED_FLOOR
```

Acceptance checks:

* natural-language query finds related paragraph with no shared words
* literal query still shows literal results even with low cosine
* typo query can show Close result
* unrelated nonsense query does not flood with bad results
* provenance tags appear correctly

### Milestone 9: Model Runtime in Extension

Goal:

* Make Transformers.js work reliably inside the extension.
* Avoid remote runtime code loading.
* Prefer local bundled assets.

Known issue:

Chrome extensions using Manifest V3 generally cannot rely on remotely hosted runtime code. Transformers.js and ONNX Runtime may try to load WASM/helper files dynamically. Bundle needed assets locally and point Transformers.js to extension-local URLs.

Implement one of these approaches.

#### Option A: Simpler First Version

Run the embedding worker from the content script bundle if possible.

Pros:

```text
simpler
faster to build
good enough for personal use
```

Cons:

```text
may be affected by page/CSP issues
model instance per tab
harder to share model across tabs
```

#### Option B: Better Version

Use an offscreen document for model runtime.

Files:

```text
extension/offscreen.html
extension/offscreen.ts
extension/model-runtime.ts
```

Flow:

```text
content script
  sends embedding requests to background
background
  ensures offscreen document exists
  forwards request to offscreen document
offscreen document
  owns Transformers.js pipeline
  returns embeddings
```

Pros:

```text
one cleaner extension-controlled environment
less page interference
can keep model runtime separate from content UI
better long-term architecture
```

Cons:

```text
more code
more message passing
more debugging
```

For the first successful version, Option A is acceptable. If Option A runs into CSP/model loading issues, switch to Option B.

### Milestone 10: Local Model and WASM Assets

Goal:

* Avoid fetching model/runtime assets from external CDNs at runtime.
* Make extension work locally after installation.
* Keep the only network request optional, or eliminate it entirely if practical.

Tasks:

* Identify what `@huggingface/transformers` tries to load.
* Copy required WASM/ONNX runtime files into `dist-extension/assets`.
* If bundling model weights locally, place them under:

```text
dist-extension/assets/models/Xenova/all-MiniLM-L6-v2/
```

* Add appropriate `web_accessible_resources`.
* Configure Transformers.js env values to point to `chrome.runtime.getURL(...)`.

Pseudo-shape:

```ts
import { env } from "@huggingface/transformers";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL("assets/models/");
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("assets/wasm/");
```

Exact configuration may vary by installed Transformers.js version. Inspect installed package docs/types and adapt.

Acceptance checks:

* Extension does not try to load remote JS/WASM from CDN
* Model loads in unpacked extension
* Embeddings work after reload
* Useful error message appears if model assets are missing

### Milestone 11: IndexedDB Cache Per Page

Goal:

* Cache computed chunk embeddings per page.
* Avoid re-indexing unchanged pages.
* Invalidate cleanly when page text changes.

Cache key:

```text
modelId + location.href + hash(pageText)
```

Tasks:

* Reuse `lib/cache.ts` if possible.
* If the existing cache assumes app context, create `extension/extension-cache.ts`.
* Store:

  * chunk IDs
  * chunk text hash
  * Float32Array embeddings
  * model ID
  * page URL
  * page text hash
  * timestamp

Behavior:

```text
When page opens:
- extract page text
- hash page text
- check IndexedDB
- if embeddings exist, use them
- if not, compute and store
```

Acceptance checks:

* first search may index
* second search on same page is faster
* reload same page reuses cache
* changed page content invalidates cache

### Milestone 12: Polish and UX

Add:

```text
loading state while indexing
"indexing page..." status
"model loading..." status
"no results" state
literal count, e.g. "12 literal matches across 4 chunks"
provenance filters: Exact, Close, Related, Loosely related
keyboard navigation
result snippets
click result to jump
selected result highlight
debug toggle for cosine/RRF scores
```

Do not over-polish before core behavior works.

## Search Behavior Specification

The final extension search behavior should match this:

```text
Input query
  ↓
extract page chunks if needed
  ↓
run substring search
  ↓
run MiniSearch lexical/fuzzy search
  ↓
run semantic cosine search if query is semantically useful
  ↓
fuse substring + keyword + semantic rankings with weighted RRF
  ↓
gate:
  keep if substring hit OR keyword hit OR cosine >= LOOSE_FLOOR
  ↓
classify:
  Exact, Close, Related, Loosely related
  ↓
sort by fused RRF score
  ↓
display results
  ↓
jump/highlight selected result
```

Important rules:

```text
1. Literal substring matches must never be blanked out by low cosine.
2. Very short queries like "f" must work through substring search.
3. Fragments like "grea" must match mid-word through substring search.
4. MiniSearch handles token exact/prefix/fuzzy.
5. Semantic search handles meaning and paraphrase.
6. RRF decides order.
7. Gate decides eligibility.
8. Cosine should be used for semantic confidence, not as the only filter.
9. Fuzzy matches should not overpower exact matches.
10. Substring should have low RRF weight but hard eligibility power.
```

## Suggested Constants

```ts
const RRF_K = 60;

const RRF_WEIGHTS = {
  semantic: 1.0,
  keyword: 0.9,
  substring: 0.3,
};

const LOOSE_FLOOR = 0.15;
const RELATED_FLOOR = 0.4;

const FUZZY_MIN_TERM_LENGTH = 4;
const LITERAL_FRAGMENT_MAX_LENGTH = 3;
```

## Shortcut

Default extension shortcut:

```text
Alt+Shift+K
```

Why:

```text
Ctrl+K is often hijacked by websites.
Ctrl+Shift+K may conflict with other tools.
Alt+Shift+K preserves the command/search muscle memory with fewer website conflicts.
```

## Loading the Extension Locally

After building:

```bash
npm run build:extension
```

Manual test steps for human:

```text
1. Open Chrome.
2. Go to chrome://extensions.
3. Enable Developer Mode.
4. Click Load unpacked.
5. Select dist-extension.
6. Open a normal webpage.
7. Press Alt+Shift+K.
8. Confirm overlay opens.
9. Test literal query: f
10. Test fragment query: grea
11. Test exact query: refund
12. Test typo query: refnd
13. Test semantic query: the part about cancelling
```

If shortcut does not work:

```text
1. Go to chrome://extensions/shortcuts.
2. Find Semantic Find.
3. Set toggle-semantic-find to Alt+Shift+K manually.
```

## Testing Checklist

Before considering the branch ready, verify:

```text
Next.js app:
- npm run dev works
- document demo still works
- inbox demo still works if unchanged

Extension build:
- npm run build:extension works
- dist-extension exists
- manifest exists
- content.js exists
- background.js exists
- overlay.css exists

Chrome:
- unpacked extension loads
- no manifest errors
- no background service worker errors
- no content script errors on normal pages

Overlay:
- Alt+Shift+K opens
- Esc closes
- repeated open/close works
- no duplicate overlays
- Shadow DOM styling works

Extraction:
- page text extracted
- chunks created
- source elements mapped

Search:
- "f" returns literal matches
- "grea" returns substring matches
- exact terms return Exact
- typos return Close
- semantic paraphrases return Related
- nonsense query does not flood bad results

Navigation:
- click result scrolls to page element
- Enter jumps to selected result
- Arrow keys move selection
- selected result highlights visibly

Cache:
- repeated searches avoid unnecessary re-indexing
- reload same page is faster after cache
```

## Error Handling Requirements

Add user-visible status messages for:

```text
No readable text found on this page.
Indexing page...
Loading semantic model...
Semantic model failed to load.
Showing literal/keyword results only.
No results.
This page cannot be searched.
```

If semantic model fails, the extension should still work with:

```text
substring search
MiniSearch lexical/fuzzy search
```

Do not make the whole extension unusable just because embeddings fail.

## Performance Requirements

Avoid freezing the page.

Rules:

```text
1. Debounce search input.
2. Run embedding/model work off the main UI path where possible.
3. Cache page embeddings.
4. Limit displayed results initially, e.g. top 20 or top 50.
5. Limit semantic RRF input list, e.g. top 100 to 200.
6. Avoid re-extracting DOM on every keystroke.
7. Avoid rebuilding MiniSearch index on every keystroke.
8. Build page index once per page content hash.
```

Suggested debounce:

```ts
const SEARCH_DEBOUNCE_MS = 120;
```

For semantic query embedding, consider slightly longer debounce:

```ts
const SEMANTIC_DEBOUNCE_MS = 200;
```

## Security and Privacy Requirements

This is a personal local extension.

Do:

```text
- Keep all search local.
- Do not send page text to any server.
- Do not add analytics.
- Do not add external API calls.
- Do not log full page text unnecessarily.
- Do not persist sensitive page text unless needed for cache.
```

Prefer caching embeddings and hashes over raw page text where possible.

If raw text must be stored for debugging, make it opt-in and disabled by default.

## Implementation Notes for Claude Code

When making changes:

```text
1. Inspect the existing files before editing.
2. Reuse existing core modules.
3. Avoid duplicating search logic.
4. Create extension-specific adapters instead of changing core logic unnecessarily.
5. Keep changes incremental.
6. Run typecheck/build after meaningful milestones.
7. If a module cannot be reused directly, explain why in comments or a short note.
8. Prefer small, named functions.
9. Keep extension code readable.
10. Do not over-optimize before the extension works.
```

## Expected Final Output From Claude Code

At the end of the implementation, provide:

```text
1. Summary of files created/changed.
2. How to build the extension.
3. How to load it in Chrome.
4. What features currently work.
5. What limitations remain.
6. Any manual setup required for model/WASM assets.
7. Whether the Next.js app still works.
8. Suggested next improvements.
```

## Do Not Do These Things

Do not:

```text
- Delete the Next.js demo.
- Replace the whole project with a Chrome extension.
- Move all shared logic into /extension.
- Require a backend.
- Require API keys.
- Depend on remote model runtime code if avoidable.
- Use Ctrl+K as the default global shortcut.
- Let semantic search hide literal matches.
- Make cosine the only result gate.
- Store huge raw page snapshots without reason.
- Auto-merge the branch.
```

## Final Desired Architecture

```text
Chrome page
  ↓
content script
  ↓
Shadow DOM overlay
  ↓
DOM extractor
  ↓
page blocks
  ↓
existing chunker
  ↓
substring indexOf scan
  ↓
MiniSearch exact/prefix/fuzzy search
  ↓
semantic embedding + cosine search
  ↓
weighted RRF fusion
  ↓
eligibility gate
  ↓
provenance classification
  ↓
result list
  ↓
scrollIntoView + highlight
```

## Final Branch Goal

The branch `feature/chrome-extension` is ready when:

```text
The user can run npm run build:extension,
load dist-extension as an unpacked Chrome extension,
press Alt+Shift+K on a normal webpage,
search literal fragments, exact words, typos, and semantic phrases,
jump to matching page content,
and still run the original Next.js demo app unchanged.
```

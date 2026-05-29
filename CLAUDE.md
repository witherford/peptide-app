# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A **single-file, vanilla-JavaScript Progressive Web App** for peptide protocol
reference — managing stacks, tracking prices, and exploring a peptide library.
There is **no build step and no framework** (no React/Vue/bundler). The entire
app — HTML, CSS (via `:root` custom properties + inline styles), and JS (one big
`<script>`) — lives in **`peptide_app_unencrypted.html`** (~9.5k lines). This is
the only file you edit for app changes.

Supporting files:
- `service-worker.js` — PWA caching. `CACHE_NAME` must be bumped every release.
- `manifest.json` — PWA manifest (`start_url` → `peptide_app_unencrypted.html`).
- `version.json` — single version string.
- `icons/` — PWA icons.

Deployment is GitHub Pages serving `main`; **merging to `main` IS the deploy.**
There is no CI/CD pipeline.

## REQUIRED on every update

Treat the following as a mandatory checklist for **every** change, however small,
before opening/merging a PR:

1. **Bug sweep** — review the code you touched (and code it interacts with) for
   correctness bugs: null/undefined access, `parseFloat`/`parseInt` without NaN
   guards, division by zero, inverted conditions, `==` truthiness pitfalls, stale
   closures, unescaped user input in `innerHTML` (use the existing `escHtml()`
   helper), double-bound listeners, missing `await`.
2. **Dead code removal** — remove functions/consts/variables your change leaves
   unreferenced, unreachable code, and commented-out blocks. Verify a symbol is
   truly unused (grep the whole file, including event-handler strings and template
   literals) before deleting.
3. **Cleanup** — keep new code consistent with surrounding style: existing helpers
   (`escHtml`, `getColorById`, `PILL_COLORS`, the `_doseMcg`/`_vialMgFor` family,
   `showToast`), CSS custom properties for theming (`--bg`, `--text`, `--accent`,
   …), `'JetBrains Mono'` for numeric/monospace text and `'DM Sans'` for body.
   Reuse before adding; don't duplicate logic.

## Release / versioning

When a change is meant to ship (merge to `main`), bump the version in **all three**
places so the service-worker cache invalidates and users get the update:

- `version.json` → `"version"`
- `service-worker.js` → `CACHE_NAME = 'peptide-app-vX.Y.Z'`
- `peptide_app_unencrypted.html` → `const APP_VERSION = 'X.Y.Z'`

Use semver: new feature → minor bump, fix-only → patch bump. Match the existing
commit-message convention: `vX.Y.Z: short summary`.

## Conventions

- Only `peptide_app_unencrypted.html` is maintained; there is no separate encrypted
  build (an old `peptide_app_encrypted.html` was removed). Don't reintroduce one.
- Rendering is done by building HTML strings and assigning `innerHTML` — always run
  user-controlled values through `escHtml()`.
- The PNG "reference card" export renders an off-screen div via `html2canvas`;
  prefer plain divs + inline styles over inline SVG `<text>`/transforms, which
  `html2canvas` rasterises unreliably. (See "Reference card export" below.)

## Data model & key helpers

Top-level helpers worth reusing (all defined in the one `<script>`, near each other
after `PILL_COLORS`/`getColorById`):

- **Colours:** `PILL_COLORS` (7 entries: green/purple/amber/blue/pink/red/grey),
  `getColorById(id)` → `{bg,text,id}`, `nextColor(usedIds)`. In the protocol
  builder each peptide must have a **unique** colour — the swatch picker disables
  colours already used by another peptide.
- **Base peptide name:** `catPeptideName(p)` accepts a string **or** an object and
  returns the clean base name (e.g. `"BPC-157 10mg | premium"` → `"BPC-157"`),
  preferring the longest matching `PEPTIDE_LIBRARY` entry, else stripping a size
  suffix. Used for display **everywhere except the catalogue/shop** (the editable
  name input and user-given protocol/stack titles keep the full/raw text).
- **Needle grouping:** `groupByStack(peptides)` — transitive (union-find) grouping
  over `p.stackWith`, so a chain A↔B↔C is ONE needle. Every needle-count surface
  (home badge, reconstitution panel, modal estimate, export) must route through
  this. Needle **totals are the true cross-week sum** (count injection-days, a
  shared day counts once) — NOT peak×weeks.
- **Bacteriostatic water (per-peptide since v1.17):** each peptide carries
  `p.waterPerVial` (default 2). `pepWater(p)` reads it (legacy stacks migrated via
  `migratePeptideWater(stack)` from the old stack-level `stack.waterPerVial`, kept
  only as a vestigial hidden `#sf-water-per-vial` fallback). `stackTotalWaterMl(stack)`
  = Σ vials × ml/vial. Units-to-draw = `(doseMcg × pepWater(p)) / (vialMg × 10)`.
- **Bac-water products (combinable list since v1.18):** `stack.bacWater.items` is an
  array of `{name,price,source,url,stock,capacity_mg,qty}`; legacy single-product
  fields (`product`,`qty`,`retailerA`) stay synced to the first item for old read
  paths. Helpers: `bacWaterItems(stack)` (normalises either shape), `mergeBacItems()`
  (merges duplicate name+source by summing qty), `bacWaterTotalCost(stack,rate)`.
  In the modal the working selection lives on `window._sfBacItems`. Available-water
  / spare math must sum ALL items (qty × ml parsed from each name), not just the first.
- **Catalogue filters:** `catApplyFilters()`, `catIsBlend(name)` (detects
  `+`/blend/combo), `catPeptideName` doubles as the per-category peptide sub-filter.
- **Duration label:** `durationLabel(stack, weeks)` → e.g. `"8 weeks (40 days)"`
  (appends injection-days; left as-is when length is already in days);
  `weeksFromLength()`, `countInjectionDays()`.
- **Pricing match:** `_pbBestPriceForRowName(prods, name)` is the fuzzy matcher
  (stem + size) — prefer it over exact `catBestForPeptide` so rows whose name
  embeds a size (e.g. "BPC-157 5mg") still resolve price AND size.
- `capacity_mg` parsing must keep decimals — use `/(\d+(?:\.\d+)?)\s*mg\b/i` +
  `parseFloat` (an integer-only regex once mis-read "2.5mg" as 5).

## Reference card export

The protocol "reference card" is built in the `[data-save-card]` handler
(`buildStackCard`). It assembles an off-screen 720px div and renders it with
`html2canvas` (scale 3). Two buttons share the handler, branching on
`data-export-mode`: `"image"` downloads the PNG; `"clipboard"` copies it via
`navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` (needs a
secure context; falls back to download). The card has COMPOUNDS split into
**Peptides** + **Bacteriostatic water** sub-sections, a Draw-Per-Dose syringe
graphic (div-based, not SVG), a Precautions & Storage block, and a footer GitHub URL.

## Gotchas learned

- **Stack-edit modal does NOT close on backdrop click** (deliberate — edits are
  easy to lose; user must use Save/Cancel/✕).
- **Big edit batches can get cut off** mid-sequence (model/tool blips). After a
  large multi-edit pass, re-grep the file to confirm every edit actually landed,
  and re-run `node --check` on the inline scripts before committing.
- When a value is read in many places (e.g. the old stack-level water), grep ALL
  call sites before changing the model — there were ~24 for water.
- Text consistency: section headings ≈ 10px/700/uppercase/0.08em on `--text2`;
  body/descriptive lines 11px on `--text2` in `'JetBrains Mono'`; prices bold
  white; product/peptide names un-bolded.
- The Category `<select>` in the builder has a `"＋ New category…"` sentinel option
  for inline category creation (`populateCategorySelect`).

## Verifying changes

There are no automated tests. Verify by opening `peptide_app_unencrypted.html` in a
browser and exercising the affected flow (e.g. build a protocol and use the
**reference card** export/copy buttons). For pure logic (unit/water math, grouping,
duration), a quick `node -e` snippet replicating the function is a good sanity check.
Always run all inline `<script>` blocks through `node --check` before committing
(extract them with a small regex script) — it catches the syntax slips that a
no-build single-file app won't otherwise surface.

## Git workflow

Develop on a feature branch, open a **draft** PR against `main`. Don't push directly
to `main`; merge via the PR. Merging to `main` deploys.

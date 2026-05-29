# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A **single-file, vanilla-JavaScript Progressive Web App** for peptide protocol
reference — managing stacks, tracking prices, and exploring a peptide library.
There is **no build step and no framework** (no React/Vue/bundler). The entire
app — HTML, CSS (via `:root` custom properties + inline styles), and JS (one big
`<script>`) — lives in **`peptide_app_unencrypted.html`** (~9.7k lines). This is
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
- The PNG export (`Export Protocol Schedule`) renders an off-screen div via
  `html2canvas`; prefer plain divs + inline styles over inline SVG `<text>`/
  transforms, which `html2canvas` rasterises unreliably.

## Verifying changes

There are no automated tests. Verify by opening `peptide_app_unencrypted.html` in a
browser and exercising the affected flow (e.g. build a protocol and use
**Export Protocol Schedule**). For pure logic (unit math, grouping), a quick
`node -e` snippet replicating the function is a good sanity check.

## Git workflow

Develop on a feature branch, open a **draft** PR against `main`. Don't push directly
to `main`; merge via the PR. Merging to `main` deploys.

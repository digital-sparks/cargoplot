# Cargoplot — Webflow frontend data layer

Multi-entry esbuild repo. Every `src/*.js` is a standalone IIFE bundle loaded by a
Webflow page via a single `<script>` tag. There is no framework and no router.

## Route Insights — hard rules

These are not style preferences. Breaking one silently breaks the live Routes
template, and the failure is invisible until a page renders wrong in production.

### 1. ATTRIBUTES.md is the source of truth

[ATTRIBUTES.md](ATTRIBUTES.md) documents both the Webflow ↔ JS contract *and* the
as-built state of the Webflow page. Read it before touching
[src/route-insights.js](src/route-insights.js). Do not invent selectors that
aren't listed there — if an element isn't in ATTRIBUTES.md, it doesn't exist on
the page.

### 2. The `data-route-*` attributes are a frozen contract

`data-route-field`, `data-route-format`, `data-route-trend`, `data-route-chart`,
`data-route-empty`, `data-route-window`, `data-route-show`, `data-route-json` —
plus the class names
`.is-active`, `.is-disabled`, `.is-up`, `.is-down` and the `data-empty` /
`data-low-sample` output attributes.

**Never rename, remove, or change the format of any of these.** They are typed by
hand into the Webflow Designer on a published production site; the JS cannot
migrate them. A rename here is a silent breakage that only shows up on the live
page.

If a change genuinely requires touching the contract: **stop and flag it** — say
what needs to change and why, and let a human make the corresponding Designer
edit first. Do not make the change and note it afterwards.

### 3. Boot through Webflow's ready queue

```js
window.Webflow ||= [];
window.Webflow.push(boot);
```

House pattern, shared with `global.js`, `animation.js`, `exit-intent.js`,
`service.js`, `solution.js` and `rate-module.js`. It makes `webflow.js` a hard
dependency — if it never loads, the queue never flushes and the script never
runs. That is true of every script in `src/` and acceptable on this site. Don't
switch back to `DOMContentLoaded` for one file.

### 4. The JSON URL has no fallback

The URL comes exclusively from the `[data-route-json]` attribute rendered by the
CMS-bound embed. If it's missing or not `http(s)`, the script **exits silently**
so non-route pages are unaffected. Never add a hardcoded/derived URL fallback,
and never resolve route identity (port names, locodes) in JS — that is CMS-only.

### 5. `chartjs-plugin-datalabels` is registered per-chart, never globally

```js
new Chart(ctx, { /* ... */ plugins: [ChartDataLabels] });  // correct
Chart.register(ChartDataLabels);                           // NEVER
```

Only the two bar charts (`weekly-delay`, `carrier-prices`) opt in. Registering
globally puts value labels on the `price-history` and `transit-trend` line charts
too.

The file *does* call `Chart.register(...)` at the top — that is the **core
component registry** (controllers, elements, scales, `Filler`, `Tooltip`) and is
unrelated to this rule. Chart.js components are registered globally; the
datalabels plugin is not. If you add a chart type, add its controller/element to
that list — never add `ChartDataLabels` to it. Importing `chart.js/auto` instead
would work but pulls in every unused controller for ~27kb.

### 6. `dist/` is committed and must be rebuilt in the same commit as `src/`

jsDelivr serves the bundle **straight out of this repo** — there is no CI build
step. A `src/` change without its rebuilt `dist/` artifact in the *same commit*
ships stale code to production.

`dist/` is deliberately **not** gitignored (note the commented-out `#dist` at the
bottom of [.gitignore](.gitignore)). Never re-enable that line.

## Checking a live page

```
https://<route-url>?route-debug
```

Runs `RouteInsights.check()` on load and prints a console summary: script status,
JSON timing, and every missing/typo'd/empty `data-route-*` tag. Same thing from
the console on any route page:

```js
RouteInsights.check()          // report object, plus a readable summary
RouteInsights.status           // 'no-url' | 'loading' | 'ready' | 'error'
```

`EXPECTED_FIELDS` / `PENDING_FIELDS` in `src/route-insights.js` mirror the ✅/⏳
column of ATTRIBUTES.md's field table. Keep them in sync — a key that gets tagged
in the Designer must move from `PENDING_FIELDS` to `EXPECTED_FIELDS` or the
checker will keep excusing its absence.

## Build

```bash
pnpm build   # production: all entry points, minified
pnpm dev     # watch + serve on :3000, unminified, live-reload injected
```

- `bin/build.js` auto-detects every `src/*.js` not prefixed with `_` and writes a
  minified IIFE to `dist/<name>.js`. It serves ~14 Webflow scripts (rate-module,
  toc, animation, route-insights, …) — **do not repurpose the `build` script for
  a single entry point**, and do not add a per-file build script: this one
  already covers Route Insights.
- Route Insights therefore ships from **`dist/route-insights.js`**. ATTRIBUTES.md
  originally specified a dedicated `--outfile=dist/route-insights.min.js`
  script; that assumed a fresh repo and was dropped as redundant, since the
  standard build already produces an identical minified IIFE.
- ⚠️ `pnpm dev` writes to the same `dist/` with live-reload pointing at
  `localhost:3000`. Always run `pnpm build` before committing `dist/`.

## Webflow tag

```html
<script src="https://cdn.jsdelivr.net/gh/digital-sparks/cargoplot@main/dist/route-insights.js" defer></script>
```

Pin `@main` to a version tag before launch and purge the jsDelivr cache on
release. jsDelivr caches aggressively — an unpinned `@main` URL can serve a stale
bundle for up to 7 days after a push.

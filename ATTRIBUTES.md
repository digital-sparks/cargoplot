# Route Insights — Webflow ↔ JS contract  (v1.1 · 2026-08-09)

Contract between the Cargoplot **Routes template** (Webflow, prod site
`68de886fb9f4a258e9a59716`, page `6a740223c4d4a591815089ae`) and
`src/route-insights.js`. Feed this file to Claude Code — it describes both the
contract AND the as-built state of the Webflow page, so don't invent selectors
that aren't listed here.

## Decisions locked in (v1.1 changes)

- **Route identity (port names/locodes) is CMS-only.** No `originName` /
  `destinationName` / locode attributes exist on the page and the JS has no
  identity resolvers and **no URL fallback**. The JSON URL comes exclusively
  from the CMS-bound embed (below). Consequence: the CMS **JSON** field must be
  filled on every route item.
- **Option B:** Webflow renders CMS baseline values server-side (crawlable);
  the script overwrites them from the JSON on load. `sampleSize: 0` → `—`.
- **Packages, not CDNs:** `pnpm add chart.js chartjs-plugin-datalabels`,
  bundle with esbuild to one IIFE file. Webflow loads a single script tag.

## Build & load

```bash
pnpm add chart.js chartjs-plugin-datalabels
pnpm add -D esbuild
```

```json
"scripts": {
  "build": "cross-env NODE_ENV=production node ./bin/build.js"
}
```

> **As built (v1.1):** this repo is a pre-existing multi-entry esbuild project.
> `bin/build.js` auto-detects every `src/*.js` and emits a minified IIFE to
> `dist/<name>.js`, so `src/route-insights.js` is bundled by the standard
> `pnpm build` — no dedicated script, and the output is
> `dist/route-insights.js` (**not** `.min.js`, matching the other 13 bundles).

The source imports `chart.js/auto` and `chartjs-plugin-datalabels`. The
datalabels plugin is registered **per chart** (`plugins: [ChartDataLabels]`) —
never globally, or the line charts get labels. Commit `dist/` so jsDelivr can
serve it. Webflow custom code (Routes template, before `</body>`):

```html
<script src="https://cdn.jsdelivr.net/gh/digital-sparks/cargoplot@main/dist/route-insights.js" defer></script>
```

Pin `@main` to a version tag before launch; purge jsDelivr cache on releases.

## Data source (as built)

An HTML embed at the top of `main-wrapper` renders:

```html
<div id="route-data" data-route-json="{{ CMS field: JSON }}" style="display:none"></div>
```

The script reads the first `[data-route-json]`; if it's not an http(s) URL,
it exits silently (non-route pages unaffected).

## Attribute reference

**How attributes are written in Webflow:** Name = the `data-route-*` key,
Value = the entry from the tables below. Example: the FCL share element has
Name `data-route-field`, Value `fclSharePct`.

### `data-route-field` — text values (script replaces textContent)

Optional `data-route-format` overrides the default
(money | days | pct | signed-days | frequency | count | text).
Units live in **separate sibling elements** (already the pattern on the page).

Because of that, the two **unit-less** formats are what you reach for when
overriding a field whose default would emit one — which is why the hero tags a
percentage as `days`. `number` / `integer` are aliases that say so plainly; the
original names remain valid, so nothing already in the Designer needs changing.

| Format | Emits (4500 / 57.14 / 1.72) | Unit? |
|---|---|---|
| money | `$4,500` | adds `$` |
| pct | `57.1%` | adds `%` |
| signed-days | `+1.7d` | adds sign + `d` |
| **count** = **integer** | `4,500` | none |
| **days** = **number** | `57.1` | none |

| Value | JSON source | Format | On page? |
|---|---|---|---|
| activeCarriers | activeCarriers | count | ✅ hero stat + KPI-row sub-line |
| avgWeeklySailings | avgWeeklySailings | count | ✅ hero stat |
| dataAgeHours / dataAgeDays | computed from publish timestamp | count | ✅ hero "Updated" |
| transitTime | transitTime.current | days | ✅ hero card + KPI row |
| onTimeRate | onTimeRate.current | pct | ✅ hero card |
| marketPrice | marketPrice.current | money | ✅ hero card |
| departureDelay | departureDelay (signed, − = early) | signed-days | ✅ KPI row |
| arrivalDelay | arrivalDelay (signed) | signed-days | ✅ KPI row |
| fastestCarrierName | fastestCarrier.name | text | ✅ hero + carrier card |
| fastestCarrierDays | fastestCarrier.avgTransitDays (90d avg) | days | ✅ |
| sailingsFrequency | avgWeeklySailings → "~1 per week" style | frequency | ✅ carrier card |
| fastestCarrierFrequency | fastestCarrier.avgWeeklySailings | frequency | ⚪ unused |
| mostReliableCarrierName | mostReliableCarrier.name | text | ✅ |
| reliableOnTimeRate | mostReliableCarrier.onTimeRate | pct | ✅ |
| reliableEtdVariance | mostReliableCarrier.etdVarianceDays | days | ✅ |
| reliableEtaVariance | mostReliableCarrier.etaVarianceDays | days | ✅ |
| fclSharePct | loadTypeBreakdown.fcl.sharePct | pct | ⏳ pending (FCL small card empty) |
| fclPriceFrom | loadTypeBreakdown.fcl.bestPrice | money | ⏳ pending |
| lclSharePct | loadTypeBreakdown.lcl.sharePct | pct | ⏳ pending (LCL small card empty) |
| lclPriceCbm | loadTypeBreakdown.lcl.bestPrice | money | ⏳ pending |

Behaviour: `sampleSize: 0` → `—`. On-time elements get a `data-low-sample`
attribute when `sampleSize < 5` (style a caveat off it).

**Deliberately NOT tagged / not in the API:** distance (manual CMS number),
service codes (AE-7/FE4), vessel class, per-load-type transit days. The
"Service code" and "Vessel class" stats still exist in the Designer untagged —
recommend deleting them.

### `data-route-trend` — trend badges

Values: `transitTime` | `onTimeRate` | `marketPrice`. All three are on the
hero KPI cards. Script writes an inline **SVG chevron** (up/down, geometry from
the design export, `stroke="currentColor"` so `.is-up` / `.is-down` recolour it
along with the number) followed by the delta (marketPrice as %, others d/pp),
adds `.is-up` / `.is-down`, and hides the badge when
`previous.sampleSize == 0`. Note: "up" is bad for transitTime/marketPrice,
good for onTimeRate — colour via the classes per badge.

⚠️ The script **rebuilds the badge's contents** on load (chevron + value). An
icon placed inside the badge in the Designer will be discarded — style the
injected chevron via the badge's `color` instead.

### `data-route-chart` — chart containers (script injects the canvas)

All four exist on the page as **empty divs**; they still need a fixed height +
`position: relative` in the Designer, and each card still contains a static
mockup image that must be deleted.

| Value | Series | Behaviour |
|---|---|---|
| price-history | historicalPrice (24 mo) | client-side window slicing; gaps for sampleSize 0 (spanGaps:false); accent dot on last datapoint |
| weekly-delay | weeklyDelayCongestion | green < 2.5d threshold (`thresholdDays`, default 2.5), grey ≥; ISO week-number labels computed from each point's `at`; last 8 points only; inProgress week filled with a 45° grey hatch + dashed border (only visible once that week has `sampleSize > 0`); gaps for empty weeks; negative (early) values supported; no hover (`events: []`); bars animate on scroll-in |
| transit-trend | monthlyTransitTrend | 12 months ending 2 months back — never label as "today" |
| carrier-prices | priceByCarrier | horizontal track bars, JSON pre-sorted ascending, cheapest gets dark accent |

Container gets `data-empty="true"` when a series has no data.

### `data-route-empty` — "No data available" placeholders

One per chart, value **identical to the `data-route-chart` value it belongs to**:

```html
<div data-route-chart="weekly-delay"  class="chart-js_..."></div>
<div data-route-empty="weekly-delay"  class="chart-js_empty">No data available</div>
```

The script owns visibility of both — leave them visible in the Designer, they
are hidden on load. Exactly one of the pair is ever shown:

| Situation | Result |
|---|---|
| Series has data | chart shown, placeholder hidden |
| Series present but every point `sampleSize: 0` | placeholder shown, chart hidden, `data-empty="true"` |
| Series absent from the payload | placeholder shown, chart hidden, `data-empty="true"` |
| Fetch failed, or CMS **JSON** field blank | all four placeholders shown |

Copy lives in the Designer, so Webflow Localization translates it for `/nl/`.
Looked up globally rather than as a sibling, so the markup can be restructured
freely. A chart with no matching placeholder simply hides itself as before.

### `data-route-card` — related route cards (Block 15)

Each related card describes a **different** route, so it carries its own JSON
URL — bind it from the referenced item's CMS **JSON** field:

```html
<div class="routes_card" data-route-card="{{ related item: JSON }}">
  <div data-route-field="transitTime">27</div><div>d</div>
  <div>$</div><div data-route-field="marketPrice" data-route-format="count">3185</div>
  <div data-route-field="onTimeRate" data-route-format="days">91.4</div><div>%</div>
</div>
```

⚠️ **Carry the same `data-route-format` overrides the hero uses.** Units live in
sibling elements on this page, so the default formats would double them —
`money` emits `$4,500` next to a `$` sibling, `pct` emits `57.1%` next to a `%`
sibling. The overrides strip the unit and leave the bare number:

| Field | Default | Emits | Page override | Emits |
|---|---|---|---|---|
| marketPrice | money | `$4,500` | **count** | `4,500` |
| onTimeRate | pct | `57.1%` | **days** | `57.1` |
| departureDelay / arrivalDelay | signed-days | `+1.7d` | **days** | `1.7` |
| transitTime | days | `44.8` | *(none needed)* | `44.8` |

(`days` is doing duty as "plain number, one decimal" — it is what the hero
already uses on `onTimeRate` and `reliableOnTimeRate`.)

Inside a card, `data-route-field` and `data-route-format` behave exactly as on
the main page — same keys, same resolvers, same formats. The page's own payload
**never** writes into a card, and a card never writes outside itself.

- **Lazy.** Each card fetches only once it scrolls into view. The block is at
  the foot of the page, so for most readers these requests never happen.
- **Independent.** A card loads even when the page's own JSON failed or its CMS
  field is blank, and one card failing does not affect the others.
- **Degrades to the baseline.** On a failed or missing URL the CMS-rendered
  value is left untouched (Option B) — a stale number reads better than a dash.
- ⚠️ Do **not** put `data-element="counter"` on a field inside a card. The
  count-up resolves values against the page's own route; the script returns
  null for carded fields to stop it animating to the wrong number, which means
  such a field simply would not animate.

Script sets `data-route-card-state="loading|ready|error|no-url"` on the card;
`check()` reports the tally.

### `data-route-window` — price chart toggles (as built)

Four unstyled text divs inside the price card: `3M 6M 12M 24M` with
`data-route-window="3|6|12|24"`. Script wires clicks, sets `.is-active`
(default 12M or first available) and `.is-disabled` on empty ranges.
Designer TODO: style base + `.is-active` + `.is-disabled` combo classes.

### `data-route-show` — conditional blocks (as built)

The FCL vs LCL **card wrapper** has `data-route-show="loadTypeBreakdown"`;
the whole card hides when the JSON's `loadTypeBreakdown` is null (API rule:
never render $0 / 0%).

## Coexisting attributes — do not touch

Several tagged elements also carry `data-element="counter"` (Webflow count-up
animation) and the FAQ uses `fs-accordion-*` (Finsweet). The script only sets
textContent; if the counter animation fights the injected values, decide in
Claude Code whether to strip `data-element="counter"` from JSON-driven
elements or hook the animation to `route-insights:ready`.

## Runtime API / debugging

- `window.RouteInsights = { status, url, data, meta, error, httpStatus, ms, check }`
- `route-insights:ready` CustomEvent on `document` (fires only on `status: 'ready'`)
- `<html data-route-insights="loading|ready|error">` — set on route pages only;
  a page with no `[data-route-json]` is never tagged. `error` still means the
  fetch failed and the CMS baselines remain on screen.

⚠️ The namespace is now published **before** the fetch and also on pages with no
URL, so `if (window.RouteInsights)` is no longer a "did it load?" test — check
`window.RouteInsights.status === 'ready'` instead.

### Troubleshooting ladder

Paste `RouteInsights.status` into the console; the answer names the layer:

| Symptom | Layer that's broken |
|---|---|
| `Uncaught ReferenceError: RouteInsights is not defined` | The bundle never loaded. The `<script>` tag is missing from the Routes template, or its URL 404s. Open the URL directly — jsDelivr returns a plain-text "Couldn't find the requested file" when the ref or path is wrong. |
| `'idle'` | Bundle loaded, but `window.Webflow` never flushed, so `boot()` never ran. Check webflow.js is on the page. |
| `'no-url'` | Booted, but the CMS **JSON** field is empty on this route item. |
| `'error'` | Fetch failed — see `.error` / `.httpStatus`. A missing `Access-Control-Allow-Origin` on the S3 object shows up here. |
| `'ready'` but wrong numbers | The JSON loaded from the wrong URL — a URL pasted onto the wrong CMS item. `check()` prints the payload's own locodes (`CNSHG → NLRTM`) in its summary line; compare them to the page you're on. The script **cannot** fail automatically on a mismatch: the payload knows its identity but the page carries none to check it against. |

> **Possible hardening (contract change — needs sign-off).** The JSON does carry
> `origin.locode` / `destination.locode`. Adding one attribute to the template,
> e.g. `data-route-expect="CNTAO-GBFXT"` bound to a CMS field, would let the
> script refuse to render on a mismatch instead of showing another route's
> numbers. That adds a `data-route-*` name, so it is not being done unilaterally.

### `RouteInsights.check()`

Verifies in one call that the script ran, the JSON arrived, and the page carries
the attributes this document specifies. Returns a report object and prints a
collapsed console summary. Add **`?route-debug`** to any route URL to run it
automatically on load.

```js
RouteInsights.check().ok        // true when there are no problems
RouteInsights.check().problems  // ['untagged fields: marketPrice', …]
```

| Reported | Meaning |
|---|---|
| `problems` | Everything wrong, in plain English. Empty ⇒ healthy. |
| `fields.missing` | Fields this doc marks ✅ that carry no element on the page |
| `fields.unknown` | `data-route-field` values with no resolver — typo in the Designer |
| `fields.pendingUntagged` | The ⏳ FCL/LCL fields, still expected to be absent |
| `fields.showingDash` | Tagged, resolved, but `—` because `sampleSize: 0` |
| `charts.missing` / `charts.empty` | Container absent vs present-but-no-data |
| `windows.active` / `windows.disabled` | Which price window won, which have no data |

`fields.missing` asserts against a list hardcoded in `src/route-insights.js`
(`EXPECTED_FIELDS` / `PENDING_FIELDS`) that mirrors the ✅/⏳ column above — when
open item 1 lands, move those four keys across so the checker stops excusing them.

## Open items

1. FCL/LCL small-card interiors → then tag the 4 pending fields
2. Chip styling (`.is-active` / `.is-disabled`)
3. Chart container heights + delete 3 mockup images
4. Rates Calculator pre-fill (component definition, not yet wired)
5. Verify the CMS field chip inside the `#route-data` embed renders a real URL

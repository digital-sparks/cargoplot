# Route Insights — Webflow ↔ JS contract  (v1.3 · 2026-08-11)

> ## ⚠️ v1.3 — CMS-driven. Read this first.
>
> Every KPI, trend and related card on a Routes page is now rendered
> **server-side by Webflow** from CMS fields synced from the Cargoplot API.
> The script no longer fetches a payload and writes no KPI text. The one
> client-side value is the relative **updated age** (`date-age`, below), which
> can only be computed in the browser.
>
> Its only job is the **four charts**. Each chart container carries its own
> series inline, bound from one CMS field per chart:
>
> ```html
> <div data-route-chart="price-history"  data-route-json='{"points":[…]}'></div>
> <div data-route-chart="weekly-delay"   data-route-json='{"points":[…]}'></div>
> <div data-route-chart="transit-trend"  data-route-json='{"points":[…]}'></div>
> <div data-route-chart="carrier-prices" data-route-json='{"items":[…]}'></div>
> ```
>
> The value is the same sub-object the API serves for that series
> (`historicalPrice`, `weeklyDelayCongestion`, `monthlyTransitTrend`,
> `priceByCarrier`). **`data-route-json` now means inline JSON, not a URL.**
>
> Still read: `data-route-chart`, `data-route-json` (on charts),
> `data-route-window`, `data-route-empty`, `date-age`. The script also builds
> the related-routes Swiper (`.swiper-card-link_wrapper`) — only when the
> wrapper and at least one `.swiper-card-link_slide` exist, since Webflow
> renders neither for an empty multi-reference.
> **No longer read:** `data-route-field`, `data-route-format`,
> `data-route-trend`, `data-route-show`, `data-route-card` — inert; delete
> them from the Designer when convenient. The sections below that describe them
> are kept for history and marked as such.
>
> **Open:** `[data-route-trend]` badges. The CMS currently renders the raw
> value into them ("44.75%" under "vs last month"). They need either a synced
> delta field or a previous-period value the script can diff — decision pending.

Contract between the Cargoplot **Routes template** (Webflow, prod site
`68de886fb9f4a258e9a59716`, page `6a740223c4d4a591815089ae`) and
`src/route-insights.js`. Feed this file to Claude Code — it describes both the
contract AND the as-built state of the Webflow page, so don't invent selectors
that aren't listed here.

## Decisions locked in (v1.1 — superseded by v1.3 where they conflict)

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

## Data source (as built, v1.3)

No page-level payload. Each `[data-route-chart]` carries its series in its own
`data-route-json` attribute (see the banner above). The old
`<div id="route-data" data-route-json="…">` embed is **obsolete** — the script
ignores it, and `check()` flags it if it is still on the page. Delete it.

A container whose attribute is missing, blank (empty CMS field) or unparseable
shows its `[data-route-empty]` placeholder; the other three charts are
unaffected. A page with no `[data-route-chart]` at all is left untouched.

## Attribute reference

**How attributes are written in Webflow:** Name = the `data-route-*` key,
Value = the entry from the tables below. Example: the FCL share element has
Name `data-route-field`, Value `fclSharePct`.

### `data-route-field` — ⚠️ not read since v1.3 (the CMS renders these)

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

### `data-route-trend` — ⚠️ not read since v1.3 (decision pending — see banner)

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

### `date-age` — "Updated … ago"

```html
<div date-age="2026-09-03 8:53">2026</div><div>ago</div>
```

The attribute holds the sync timestamp; the script replaces the element's text
with how long ago that was, floored to the largest whole unit and abbreviated
with no space, matching the `27d` style used elsewhere: `23h`, `1d`, `4d`,
`2w`, `1mo`, `1y` — on the NL page `23u`, `4d`, `2w`, `1mnd`, `1jr`. Keep the trailing copy ("ago" /
"geleden") in a **sibling** element, as with every other unit on the page.
`data-date-age` and `data-age` are accepted as well.

- **Timestamp format:** `YYYY-MM-DD HH:MM` is read as **UTC** (matching the
  API's `generatedAt`). Prefer full ISO with a zone — `2026-09-03T08:53:00Z` —
  which is honoured as given. Unparseable → text left as rendered, `check()`
  flags it.
- ⚠️ **Do not put `data-element="counter"` on this element.** animation.js
  captures the number at init and tweens it on scroll-in, overwriting the
  age. `check()` flags this too.

### `data-route-chart` — chart containers (script injects the canvas)

All four exist on the page as **empty divs**; they still need a fixed height +
`position: relative` in the Designer, and each card still contains a static
mockup image that must be deleted.

| Value | Series | Behaviour |
|---|---|---|
| price-history | historicalPrice (24 mo) | client-side window slicing; **line drawn straight through empty months** (`spanGaps: true`) so a quiet spell like Chinese New Year reads as a continuous market; accent dot on last datapoint |
| weekly-delay | weeklyDelayCongestion | green < 2.5d threshold (`thresholdDays`, default 2.5), grey ≥; ISO week-number labels computed from each point's `at`; last 8 points only; inProgress week filled with a 45° grey hatch + dashed border (only visible once that week has `sampleSize > 0`); gaps for empty weeks; negative (early) values supported; no hover (`events: []`); bars animate on scroll-in |
| transit-trend | monthlyTransitTrend | 12 months ending 2 months back — never label as "today"; line drawn straight through empty months (`spanGaps: true`), same as price-history |
| carrier-prices | priceByCarrier | horizontal track bars, JSON pre-sorted ascending, cheapest gets dark accent |

Container gets `data-empty="true"` when a series has no data.

Each chart is built when its container comes within a quarter of the viewport
height **below** the fold (`REVEAL_MARGIN` in the script), so the draw
animation is already under way as it scrolls in.

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
| `data-route-json` missing, blank or unparseable on that chart | placeholder shown, chart hidden, `data-empty="true"` — other charts unaffected |

Copy lives in the Designer, so Webflow Localization translates it for `/nl/`.
Looked up globally rather than as a sibling, so the markup can be restructured
freely. A chart with no matching placeholder simply hides itself as before.

### `data-route-card` — ⚠️ not read since v1.3 (CMS multi-reference renders the cards)

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
(default 12M or first available) and hides (`display:none` + `.is-disabled`)
any window with no data in range. When the whole chart is empty — series
missing, blank or unparseable — all four chips are hidden.
Designer TODO: style base + `.is-active` + `.is-disabled` combo classes.

### `data-route-show` — ⚠️ not read since v1.3 (use Webflow conditional visibility)

The FCL vs LCL **card wrapper** has `data-route-show="loadTypeBreakdown"`;
the whole card hides when the JSON's `loadTypeBreakdown` is null (API rule:
never render $0 / 0%).

It also accepts **any `data-route-field` key**. Put it on a KPI card and the
card hides when that field has no figure for this route — `sampleSize: 0`, or
the branch missing from the payload entirely:

```html
<div class="routes_card" data-route-show="fastestCarrierName"> … </div>
<div class="routes_card" data-route-show="departureDelay">     … </div>
```

- Only ever **hides**. A card with data keeps whatever display the Designer
  gave it, so grid and flex layouts are unaffected.
- One key per element. Tag the card with the figure it would look broken
  without — usually the big number.
- An unrecognised key logs a warning and leaves the card **visible**: a typo
  should never silently delete a card from the page.

## Coexisting attributes — do not touch

Several tagged elements also carry `data-element="counter"` (the count-up in
animation.js) and the FAQ uses `fs-accordion-*` (Finsweet). Since v1.3 the
script writes no KPI text, so the two no longer race — only the `date-age`
element must not carry the counter. The count-up mirrors the printed figure
exactly: decimals as the CMS number field renders them (`91.4` → one,
`44.75` → two), any thousands separator, prefix and suffix text — and steps in
the last printed digit (`0.0 → 91.4`). It plays on load for anything already
in view and on scroll-in below the fold.

## Runtime API / debugging

- `window.RouteInsights = { status, charts, check }`
  - `status` — `'idle'` (bundle loaded, never booted) · `'no-charts'` (not a
    route page) · `'ready'`
  - `charts` — per chart, the state of its `data-route-json`:
    `'ok' | 'missing' | 'blank' | 'invalid' | 'unknown'`
- `route-insights:ready` CustomEvent on `document`
- `<html data-route-insights="ready">` on route pages only

### `RouteInsights.check()`

One call answering: is every chart tagged, does its series parse, did it draw?
Prints a collapsed console summary; add **`?route-debug`** to any route URL to
run it on load. Reports per chart: series state, point count, sampled count,
placeholder present, rendered, `data-empty`, container height/position. Also
flags any `[data-route-json]` outside a chart container (the old `#route-data`
embed) and any legacy attributes still on the page.

### Troubleshooting ladder

| Symptom | Layer that's broken |
|---|---|
| `ReferenceError: RouteInsights is not defined` | Bundle never loaded — script tag missing, or its URL 404s. |
| `'idle'` | Loaded, but `window.Webflow` never flushed. Is webflow.js on the page? |
| `'no-charts'` | No `[data-route-chart]` on the page — wrong template, or tags missing. |
| `'ready'` but one placeholder shows | That chart's `data-route-json` is missing, blank or invalid — `check()` names which. Blank = the CMS field is empty for this route. |
| **All four** placeholders show | You are on a **1.2.x** build: the leftover empty `#route-data` embed hijacked URL resolution. Upgrade to 1.3, and delete the embed. |

## Open items

1. FCL/LCL small-card interiors → then tag the 4 pending fields
2. Chip styling (`.is-active` / `.is-disabled`)
3. Chart container heights + delete 3 mockup images
4. Rates Calculator pre-fill (component definition, not yet wired)
5. Verify the CMS field chip inside the `#route-data` embed renders a real URL

# v1.2.0 — Route Insights

Adds the data layer behind the Routes pages: four live charts, the hero KPIs
and trend badges, related-route cards, and empty states — all driven by the
weekly per-route JSON. Also fixes a bug that was silently overwriting those
figures, and pre-fills the quote form on route pages.

Three bundles change. `route-insights.js` is new. `animation.js` and
`rate-module.js` load site-wide — see **Upgrade notes**.

---

## New — `route-insights.js`

Loads the per-route JSON named by the CMS-bound `[data-route-json]` embed and
fills the page from it. On any page without that attribute it exits silently.

**Charts** (Chart.js, bundled — do **not** add a separate Chart.js script tag)

- **Historical sea freight prices** — 3M/6M/12M/24M windows sliced client-side,
  12M default. Windows with no data hide themselves.
- **Weekly delay & congestion** — 8 ISO weeks, coloured against the
  `thresholdDays` threshold, week numbers computed from each point's timestamp,
  the in-progress week drawn as a diagonal hatch.
- **Monthly transit time trend** — 12 months, y-axis bounds snapped to round
  ticks.
- **Average price by carrier** — horizontal track bars, sorted ascending with
  the cheapest picked out in dark, height driven by the carrier count.

Both line charts draw straight through months with no data, so a quiet spell
such as Chinese New Year reads as a continuous market rather than a broken
line. Hovering any month gives a readout carrying the month, year and value.

All four build when they scroll into view, so they animate as the reader
reaches them rather than before.

**Text, trends and conditionals**

- `[data-route-field]` values with per-field formats; units stay in their own
  sibling elements.
- `[data-route-trend]` badges with the design's chevron drawn as inline SVG,
  inheriting the badge colour so `.is-up` / `.is-down` restyle it.
- `[data-route-show]` hides a card whose figure is missing for this route.
- `[data-route-empty]` swaps in a "No data available" placeholder per chart.
- `[data-route-card]` gives each related-route card its own JSON, fetched only
  when the block scrolls into view.

**Diagnostics** — `RouteInsights.check()` reports load status, JSON timing, the
payload's own route locodes, and every missing or misspelt tag. Add
`?route-debug` to any route URL to run it on load.

## Fixed — hero KPIs were showing stale numbers

`animation.js` captured each counter's server-rendered value before the JSON
arrived, then animated over whatever was injected. Hero stats settled on the
CMS baseline — or, if the tween was interrupted, on neither figure. Counters on
JSON-driven elements now wait for the data, animate the raw number, and format
through `route-insights` so decimals and thousands separators survive.

## Added — quote form pre-fill

The rate module accepts origin and destination from data attributes, so a route
page opens with its lane already filled in. A pre-filled field validates without
a lookup, and its dropdown is warmed in the background so clicking it offers
alternatives exactly as a typed field does.

---

## Upgrade notes

**Nothing breaks without Designer changes.** Every new attribute is inert until
added, and both site-wide bundles are guarded: `animation.js` only takes its new
path on pages carrying `[data-route-json]`, and the rate module's pre-fill is
skipped when its attributes are absent.

**Worth testing before release**, since both are loaded site-wide:

- the quote form, on a route page and a non-route page
- counters still animating on a non-route page

**Do not add a Chart.js `<script>` tag.** It is bundled; a second copy would be
~200 KB wasted.

### To finish wiring in Webflow

| Attribute | Where |
|---|---|
| `data-route-empty="<chart>"` | beside each chart container |
| `data-route-card="<json url>"` | each related-route card, bound to the referenced item's JSON field |
| `data-cargo-prefill-origin-city` / `-country` | rate module container |
| `data-cargo-prefill-destination-city` / `-country` | rate module container |

Units live in sibling elements, so tag values with the unit-less formats —
`data-route-format="integer"` for prices, `"number"` for percentages — or the
`$` and `%` will double up.

### Known limitations

- Transit days are not segmented by load type in the API, and distance is not
  in it at all. Both remain manual CMS values.
- The CMS baselines are still placeholder figures, identical on every route.
  They are what search engines index and what a related card falls back to.

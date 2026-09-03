# v1.3.0 — Route Insights, CMS-driven

The Routes pages now render every KPI, trend and related card **server-side
from the CMS**. `route-insights.js` shrinks to a chart renderer that reads each
chart's series inline from the page, plus two small client-side jobs that
cannot be done anywhere else: the relative "updated" age, and the
related-routes carousel.

**⚠️ Upgrade urgency:** a 1.2.x build on the new template shows four
"No data available" boxes. It takes the first `[data-route-json]` on the page
as its payload URL — the leftover `#route-data` embed, now empty — and
concludes there is no data. 1.3.0 reads per chart and ignores that embed.

Four bundles change: `route-insights.js`, `animation.js`, `resource-hub.js`,
`platform.js`. See **Upgrade notes** for the two that load site-wide.

---

## Changed — `route-insights.js`

**Charts read their series inline.** Each container carries the same
sub-object the API serves for that series, bound from one CMS field per chart:

```html
<div data-route-chart="price-history"  data-route-json='{"points":[…]}'></div>
<div data-route-chart="weekly-delay"   data-route-json='{"points":[…]}'></div>
<div data-route-chart="transit-trend"  data-route-json='{"points":[…]}'></div>
<div data-route-chart="carrier-prices" data-route-json='{"items":[…]}'></div>
```

`data-route-json` now means **inline JSON, not a URL**. A container whose
attribute is missing, blank (empty CMS field) or unparseable shows its
`[data-route-empty]` placeholder; the other three charts are unaffected.
Chart rendering itself is unchanged — every chart config is byte-identical
to the 1.2.0 build for the same series.

**Removed** — the single-payload fetch and everything that hung off it: text
fields, trend badges, conditional cards, related-card hydration. The
attributes `data-route-field`, `data-route-format`, `data-route-trend`,
`data-route-show` and `data-route-card` are now inert.

**Added**

- **"Updated … ago"** — `[date-age="2026-09-03 8:53"]` is replaced with the
  age of that timestamp, floored to the largest whole unit and abbreviated:
  `23h`, `4d`, `2w`, `1mo`, `1y` — `23u`, `1mnd`, `1jr` on NL pages. A zone-less value is
  read as UTC. The trailing "ago" copy stays a sibling in the Designer.
- **Related-routes carousel** — the Swiper init moves into this bundle, built
  only when `.swiper-card-link_wrapper` and at least one slide exist. Webflow
  renders neither for an empty multi-reference, which is what crashed the
  standalone script.
- **Price-window chips hide when the chart is empty**, not just per window.
- `RouteInsights.check()` rebuilt for the new model: per-chart series state,
  sampled points, rendered/empty, container geometry, the `date-age` element,
  the carousel — and it flags the old `#route-data` embed and any legacy
  attributes still on the page. `?route-debug` runs it on load.

## Fixed — `animation.js`

**Hero counters now count up on load.** They sat at 0 until the first scroll:
ScrollTrigger measures each element when the tween is created, before the
page's intro animations have settled the layout, so elements plainly on
screen were never evaluated as "already in view". Anything inside the
viewport at init now plays immediately; ScrollTrigger is only attached to
elements still below the fold.

The 1.2.0 counter deferral (waiting for `route-insights:ready`) is removed.
It only existed because the script overwrote counter targets after animation
captured them; with values CMS-rendered and no script writes, its premise is
gone. Only the tween block differs from 1.1.0.

## Fixed — `resource-hub.js`, `platform.js`

Both called `new Swiper('.swiper-card-link_wrapper')` unguarded. On a page
whose collection list is empty they built a Swiper on a wrapper with no
slides. Both now build only when the wrapper and a slide exist, and stand
down if another bundle has already initialised it — so whichever runs first
wins, and loading `resource-hub.js` on the Routes template is safe.

---

## Upgrade notes

**Site-wide bundles:** `animation.js`, `resource-hub.js` and `platform.js`
load on many pages. Each change is guarded and small (`animation.js`: 16
lines in, 4 out), but worth a look on a non-route page before tagging —
counters still animate, and the card-link carousel still builds where it has
slides.

**Bundle size:** `route-insights.js` is 205 → 309 KB — that is Swiper's core
and modules, moved in from the standalone script. Net bytes for the page are
unchanged if that script tag is removed.

**Do not add a separate Chart.js `<script>` tag.** It is bundled.

### In Webflow

| Do | Why |
|---|---|
| Delete the `#route-data` embed | Cause of the four empty boxes on 1.2.x; ignored by 1.3 but flagged by `check()` |
| On the `date-age` element, remove `data-element="counter"` | The count-up would tween over the age |
| Change its sibling `h ago` → `ago` | The unit now comes from the script and varies |
| Remove the 7 orphaned `data-route-format` attributes | Inert since the fields went |
| Sync: write ISO timestamps with a zone (`2026-09-03T08:53:00Z`) | Zone-less is assumed UTC; explicit is exact |

### Open

- **Trend badges** — the CMS currently renders the raw current value into
  `[data-route-trend]` ("44.75%" under "vs last month"). They need either a
  synced delta field or a previous-period value the script can diff.
- **NL number formatting** — the script no longer localises KPI values; a
  CMS number renders as Webflow prints it.

---

## Publishing

```
git tag -a 1.3.0 -m "Route Insights v1.3.0"
git push origin 1.3.0
```

`@1` resolves to the newest `1.x` tag, so this goes live everywhere at once.
jsDelivr caches version tags permanently; purge the four bundles:

```
https://purge.jsdelivr.net/gh/digital-sparks/cargoplot@1/dist/route-insights.js
https://purge.jsdelivr.net/gh/digital-sparks/cargoplot@1/dist/animation.js
https://purge.jsdelivr.net/gh/digital-sparks/cargoplot@1/dist/resource-hub.js
https://purge.jsdelivr.net/gh/digital-sparks/cargoplot@1/dist/platform.js
```

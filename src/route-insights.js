/**
 * Cargoplot Route Insights — chart layer for the Routes pages
 * -------------------------------------------------------------
 * Since v1.3 every KPI on a Routes page is rendered server-side by Webflow
 * from CMS fields that are synced from the Cargoplot API. This script no
 * longer fetches a payload or writes any text. Its whole job is the four
 * charts, each of which carries its own series inline:
 *
 *   <div data-route-chart="price-history"  data-route-json='{"points":[…]}'></div>
 *   <div data-route-chart="weekly-delay"   data-route-json='{"points":[…]}'></div>
 *   <div data-route-chart="transit-trend"  data-route-json='{"points":[…]}'></div>
 *   <div data-route-chart="carrier-prices" data-route-json='{"items":[…]}'></div>
 *
 * The JSON is the same sub-object the API serves for that series, bound from
 * one CMS field per chart. A container with a missing or unparseable series
 * shows its [data-route-empty] placeholder instead of a chart.
 *
 * Still honoured: [data-route-window] price toggles, [data-route-empty]
 * placeholders. No longer read: data-route-field / -trend / -show / -card —
 * the CMS renders those. See ATTRIBUTES.md.
 *
 * Datalabels is registered PER CHART (plugins: [ChartDataLabels]) on purpose —
 * do not register it globally or the line charts get labels too.
 */
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import Swiper from 'swiper';
import {
  Autoplay,
  Navigation,
  Pagination,
  Scrollbar,
  Keyboard,
  Mousewheel,
  A11y,
} from 'swiper/modules';

/* Register only what these four charts actually use. Importing 'chart.js/auto'
   instead would pull in every controller (doughnut, radar, polar, bubble, …)
   for ~27kb more in the bundle. ChartDataLabels is deliberately absent from
   this list — it stays per-chart (plugins: [ChartDataLabels]), see below. */
Chart.register(
  LineController,
  BarController,
  LineElement,
  PointElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip
);

(function () {
  'use strict';

  var COLORS = {
    dark: '#002D28',
    accent: '#39F2AF',
    accentFill: 'rgba(57, 242, 175, 0.2)',
    grey: '#AEBAB8',
    track: '#E3E8E7',
    grid: '#E3E8E7',
    tick: '#4B6661',
    inProgress: 'rgba(174, 186, 184, 0.15)', // wash behind the in-progress hatch
  };

  // Matches the family declared in the Webflow stylesheet — Chart.js draws to
  // canvas, so it needs the family by name and silently falls back if it's off.
  var FONT = "'Instrument Sans', sans-serif";

  /* Every rule any chart draws is neutral-100. Chart.js otherwise defaults axis
     borders to a translucent black (rgba(0,0,0,0.1)) which reads darker than
     the gridlines sitting right next to it. Setting the default covers the
     axis borders we never configure explicitly, on all four charts. */
  Chart.defaults.borderColor = COLORS.grid;

  // Spec §8 breakpoints: mobile is < 768px.
  function isMobile() {
    return (window.innerWidth || document.documentElement.clientWidth || 0) < 768;
  }

  var LOCALE = (document.documentElement.lang || 'en').slice(0, 2);

  /* ---------------------------------------------------------------- utils */

  function monthLabel(iso) {
    return new Date(iso).toLocaleDateString(LOCALE, { month: 'short' });
  }

  /* Axis labels are month-only, which repeats across a 24-month window — the
     tooltip carries the year so two "Aug" points can be told apart. */
  function monthYearLabel(iso) {
    return new Date(iso).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' });
  }

  function fmt(value, kind) {
    if (value === null || value === undefined) return '\u2014';
    switch (kind) {
      case 'money':
        return '$' + Math.round(value).toLocaleString(LOCALE);
      /* 'days' and 'count' emit no unit — the unit lives in a sibling element.
         That makes them the formats to reach for when overriding a field whose
         default would add one, which is how a percentage ends up asking for
         "days". 'number' / 'integer' are aliases that say so out loud; the
         originals stay valid, so nothing in the Designer has to change. */
      case 'days':
      case 'number':
        return (Math.round(value * 10) / 10).toLocaleString(LOCALE);
      case 'pct':
        return (Math.round(value * 10) / 10).toLocaleString(LOCALE) + '%';
      case 'signed-days': {
        var v = Math.round(value * 10) / 10;
        if (v > 0) return '+' + v.toLocaleString(LOCALE) + 'd';
        if (v < 0) return '\u2212' + Math.abs(v).toLocaleString(LOCALE) + 'd';
        return '0d';
      }
      case 'frequency': {
        // avgWeeklySailings float -> human string (per API display guide)
        if (value >= 3.5) return '~' + Math.round(value) + ' per week';
        if (value >= 0.75) return '~1 per week';
        if (value >= 0.4) return 'every 2 weeks';
        return '~' + Math.round(value * 4.3) + ' per month';
      }
      case 'count':
      case 'integer':
        return Math.round(value).toLocaleString(LOCALE);
      default:
        return String(value);
    }
  }

  /* ------------------------------------------------------------ charts */

  var chartInstances = {};

  function mountCanvas(host) {
    host.innerHTML = '';
    var c = document.createElement('canvas');
    host.appendChild(c);
    return c.getContext('2d');
  }

  /* ------------------------------------------------------ empty states */
  /* The placeholders default to display:none in the Designer, so revealing one
     has to name a display value — clearing the inline style would just fall
     back to that none and leave it hidden. */
  var EMPTY_DISPLAY = 'flex';
  /* Single place that decides "this chart has nothing to draw". Sets the
     documented data-empty flag on the container and swaps in the matching
     [data-route-empty="<chart name>"] placeholder, so the two can never
     disagree. The placeholder is looked up globally rather than as a sibling,
     so it keeps working if the Designer markup is restructured. */
  function setChartEmpty(name, host, isEmpty) {
    if (host) {
      if (isEmpty) {
        host.setAttribute('data-empty', 'true');
        host.innerHTML = '';
      } else {
        host.removeAttribute('data-empty');
      }
      host.style.display = isEmpty ? 'none' : '';
    }
    var placeholder = document.querySelector('[data-route-empty="' + name + '"]');
    if (placeholder) placeholder.style.display = isEmpty ? EMPTY_DISPLAY : 'none';

    /* The price chart's window chips have no purpose without a chart — hide
       them when it empties (series missing, blank, unparseable, or no window
       with data). wirePriceWindows() manages them per window otherwise. */
    if (name === 'price-history' && isEmpty) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-route-window]'), function (t) {
        t.style.display = 'none';
      });
    }
  }

  function eachEmptyState(fn) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-route-empty]'), fn);
  }

  /* Assume data until proven otherwise: hidden at boot so a placeholder never
     flashes before the JSON lands. If the script never runs at all, they stay
     in whatever state the Designer left them. */
  function hideEmptyStates() {
    eachEmptyState(function (el) {
      el.style.display = 'none';
    });
  }

  /* Chart.js animates on construction, so building a chart the moment the
     page lands means it has already animated by the time the reader scrolls
     to it. Hold construction until the container is about to enter the
     viewport instead — REVEAL_MARGIN below the fold — so the draw is under
     way as it scrolls in rather than starting once it is already in view.
     Used by all four charts. Fires immediately for anything already in view,
     and degrades to rendering straight away where IntersectionObserver is
     unavailable. */
  var REVEAL_MARGIN = '0px 0px 25% 0px'; // start a quarter-viewport before the container shows
  function whenVisible(el, render) {
    if (typeof window.IntersectionObserver !== 'function') {
      render();
      return;
    }
    var io = new window.IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            io.disconnect();
            render();
            return;
          }
        }
      },
      /* threshold 0 rather than a ratio: a ratio can never be met by a
         zero-area container (one collapsed by CSS, or inside a hidden panel),
         which would leave that chart permanently unrendered. The bottom
         margin grows the root, so "intersecting" means within that distance
         below the fold. */
      { threshold: 0, rootMargin: REVEAL_MARGIN }
    );
    io.observe(el);
  }

  function destroyChart(name) {
    if (chartInstances[name]) {
      chartInstances[name].destroy();
      delete chartInstances[name];
    }
  }

  /* Round a raw range out to bounds that sit ON a round step, and report that
     step so the axis can be told to use it. Without this an explicit min like
     37 gets its own label directly beneath the first generated tick (38), and
     the two collide. Returns { min, max, step }. */
  function niceScale(min, max, targetTicks) {
    if (!(max > min)) {
      // Flat series: open out a symmetric window so the axis stays sane.
      var pad = Math.abs(max) * 0.1 || 1;
      min = max - pad;
      max = max + pad;
    }
    var rough = (max - min) / (targetTicks || 6);
    var mag = Math.pow(10, Math.floor(Math.log10(rough)));
    var norm = rough / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    var lo = Math.max(0, Math.floor(min / step) * step);
    var hi = Math.ceil(max / step) * step;
    if (hi <= lo) hi = lo + step;
    return { min: lo, max: hi, step: step };
  }

  /* Shared renderer for the two line charts. They differ only in y-scale
     bounds, tick/tooltip formatting, point size and layout padding; the dark
     line, accent fill, gaps at sampleSize 0 and the accent dot on the last real
     datapoint are identical. */
  function renderLineChart(name, host, pts, opts) {
    destroyChart(name);
    var values = pts.map(function (p) {
      return p.sampleSize > 0 ? p.value : null;
    });
    var present = values.filter(function (v) {
      return v !== null;
    });
    if (!present.length) {
      setChartEmpty(name, host, true);
      return;
    }
    setChartEmpty(name, host, false);

    // Last real datapoint: resolved once here, not re-scanned per point per frame.
    var last = values.length - 1;
    while (last >= 0 && values[last] === null) last--;

    var b = opts.bounds(Math.min.apply(null, present), Math.max.apply(null, present));

    /* Left-align the y-axis labels. Chart.js defaults to crossAlign 'near',
       which right-aligns them against the axis; 'far' pushes them to the outer
       edge of the label area so $3,906 and $2,631 start at the same x. */
    var yTicks = opts.ticks(b);
    yTicks.crossAlign = 'far';
    /* Axis label styling is shared by both line charts, so it lives here rather
       than in each opts.ticks() — those only supply what genuinely differs
       (step size, padding, value formatting). */
    /* yFontSize may be a number or a function, so a chart can size its labels
       off the viewport. Re-resolved in onResize below, which is how the mobile
       size survives a rotation or a window drag without a full re-render. */
    function resolveYSize() {
      var s = opts.yFontSize || 12;
      return typeof s === 'function' ? s() : s;
    }
    yTicks.font = { family: FONT, size: resolveYSize(), weight: '600' };
    yTicks.color = COLORS.dark;

    var options = {
      responsive: true,
      maintainAspectRatio: false,
      onResize: function (chart) {
        chart.options.scales.y.ticks.font.size = resolveYSize();
      },
      /* Every point except the last has pointRadius 0, and Chart.js's default
         interaction requires the pointer to intersect an element — which is
         why only the final dot produced a tooltip. Matching on the x index
         instead gives every month a readout, hovered anywhere in its column. */
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          displayColors: false, // no dataset colour swatch
          backgroundColor: COLORS.dark,
          titleColor: '#FFFFFF',
          bodyColor: '#FFFFFF',
          titleFont: { family: FONT, size: 13, weight: '700' },
          bodyFont: { family: FONT, size: 14, weight: '600' },
          padding: { top: 10, bottom: 10, left: 12, right: 12 },
          cornerRadius: 0,
          caretSize: 6,
          callbacks: {
            title: function (items) {
              var p = items.length ? pts[items[0].dataIndex] : null;
              return p && p.at ? monthYearLabel(p.at) : '';
            },
            label: function (c) {
              return opts.tooltip(c.parsed.y);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: FONT, size: 14, weight: '600' }, color: COLORS.tick },
        },
        y: {
          border: { display: false },
          grid: { color: COLORS.grid, drawTicks: false },
          ticks: yTicks,
          min: b.min,
          max: b.max,
        },
      },
    };
    // Only price-history pads its layout; leave the key absent otherwise.
    if (opts.layout) options.layout = opts.layout;

    chartInstances[name] = new Chart(mountCanvas(host), {
      type: 'line',
      data: {
        labels: pts.map(function (p) {
          return monthLabel(p.at);
        }),
        datasets: [
          {
            data: values,
            borderColor: COLORS.dark,
            borderWidth: 2,
            backgroundColor: COLORS.accentFill,
            fill: true,
            tension: 0,
            /* Per-chart: price-history bridges gaps so a quiet spell like
               Chinese New Year reads as a continuous market rather than a
               severed line. Off elsewhere, where a gap means "we have no
               figure" and joining it would invent a trend. */
            spanGaps: !!opts.spanGaps,
            pointBackgroundColor: function (c) {
              return c.dataIndex === last ? COLORS.accent : 'transparent';
            },
            pointBorderColor: 'transparent',
            pointRadius: function (c) {
              return c.dataIndex === last ? opts.pointRadius : 0;
            },
            /* Show the accent dot on whichever month is being read, so the
               tooltip is anchored to something visible rather than hovering
               over a bare stretch of line. */
            pointHoverRadius: opts.pointRadius,
            pointHoverBackgroundColor: COLORS.accent,
            pointHoverBorderColor: 'transparent',
          },
        ],
      },
      options: options,
    });
  }

  /* Price history: 24 monthly points, windows sliced client-side.
     sampleSize:0 => null value, but the line is drawn straight through it. */
  function renderPriceHistory(host, series, windowMonths) {
    renderLineChart('price-history', host, series.points.slice(-windowMonths), {
      pointRadius: 6,
      spanGaps: true,
      yFontSize: function () {
        return isMobile() ? 14 : 18;
      },
      /* No left padding: with crossAlign 'far' the price labels then start at
         the container's own left edge, so they line up with the card title
         above them rather than sitting 20px inboard of it. */
      layout: { padding: { left: 0, right: 20 } },
      bounds: function (min, max) {
        var lo = Math.floor((min * 0.85) / 100) * 100;
        var hi = Math.ceil((max * 1.1) / 100) * 100;
        if (lo === hi) {
          lo -= 200;
          hi += 200;
        }
        return { min: lo, max: hi };
      },
      ticks: function (b) {
        return {
          stepSize: Math.max(1, Math.round((b.max - b.min) / 4)),
          padding: 10, // gap between the price labels and the plot area

          callback: function (v) {
            return fmt(v, 'money');
          },
        };
      },
      tooltip: function (v) {
        return fmt(v, 'money');
      },
    });
  }

  /* ISO-8601 week number taken from the point's own timestamp. Spec Block 05
     asks for week labels computed from the `at` values; the positional W1..W8
     labels looked right but told the reader nothing about which weeks these
     were. Falls back to the position when a timestamp is missing or unparseable. */
  function isoWeekLabel(at, index) {
    var d = at ? new Date(at) : null;
    if (!d || isNaN(d.getTime())) return 'W' + (index + 1);
    var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // Step to the Thursday of this ISO week — that day fixes which year owns it,
    // so weeks spanning New Year number correctly (…W52, W53, W1).
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    var yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
    return 'W' + Math.ceil(((t - yearStart) / 864e5 + 1) / 7);
  }

  /* Diagonal hatch for the in-progress week, so a partial week reads as
     provisional rather than as a finished measurement (spec Block 05: "render
     distinctly"). Chart.js accepts a CanvasPattern anywhere a colour goes.
     Falls back to the flat wash where there is no real 2D context. */
  function stripeFill(stripe, base) {
    var c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    var g = typeof c.getContext === 'function' ? c.getContext('2d') : null;
    if (!g || typeof g.createPattern !== 'function') return base;
    g.fillStyle = base;
    g.fillRect(0, 0, 8, 8);
    g.strokeStyle = stripe;
    g.lineWidth = 2;
    g.beginPath();
    // Three segments so the 45° hatch tiles across the 8px cell without seams.
    g.moveTo(-2, 10);
    g.lineTo(10, -2);
    g.moveTo(-2, 2);
    g.lineTo(2, -2);
    g.moveTo(6, 10);
    g.lineTo(10, 6);
    g.stroke();
    return g.createPattern(c, 'repeat');
  }

  /* Weekly delay: 8 ISO weeks. Colour by threshold (green/grey),
     inProgress bar rendered distinctly, sampleSize:0 => gap bar. */
  function renderWeeklyDelay(host, series) {
    destroyChart('weekly-delay');
    /* The card is headed "last 8 weeks" (spec Block 05), so trim rather than
       silently widening the chart if the API ever sends a longer series. */
    var pts = series.points || [];
    if (pts.length > 8) {
      console.warn(
        '[route-insights] weeklyDelayCongestion returned ' +
          pts.length +
          ' points; showing the last 8'
      );
      pts = pts.slice(-8);
    }
    var threshold = typeof series.thresholdDays === 'number' ? series.thresholdDays : 2.5;
    var values = pts.map(function (p) {
      return p.sampleSize > 0 ? p.value : null;
    });
    var present = values.filter(function (v) {
      return v !== null;
    });
    /* This chart never had the data-empty branch the other three did, so a week
       series with no samples anywhere drew an empty grid instead of reporting
       itself empty. ATTRIBUTES.md always specified it. */
    if (!present.length) {
      setChartEmpty('weekly-delay', host, true);
      return;
    }
    setChartEmpty('weekly-delay', host, false);
    var maxAbs = present.length ? Math.max.apply(null, present.map(Math.abs)) : 0;
    var minVal = present.length ? Math.min.apply(null, present) : 0;
    var yMax = Math.max(4, Math.ceil(Math.max(maxAbs, threshold) * 1.3));
    var yMin = minVal < 0 ? Math.floor(minVal * 1.3) : 0; // signed delays: early = negative

    /* Per-bar styling resolved once into arrays. Chart.js accepts arrays here,
       so this drops three scriptable callbacks that otherwise re-run for every
       bar on every frame of the draw/hover/resize cycle. */
    var inProgressFill = stripeFill(COLORS.grey, COLORS.inProgress);
    var barColors = pts.map(function (p, i) {
      if (!p || p.inProgress) return inProgressFill;
      return values[i] >= threshold ? COLORS.grey : COLORS.accent;
    });
    var barBorders = pts.map(function (p) {
      return p && p.inProgress ? COLORS.grey : 'transparent';
    });
    var barBorderWidths = pts.map(function (p) {
      return p && p.inProgress ? 1 : 0;
    });

    chartInstances['weekly-delay'] = new Chart(mountCanvas(host), {
      type: 'bar',
      data: {
        labels: pts.map(function (p, i) {
          return isoWeekLabel(p && p.at, i);
        }),
        datasets: [
          {
            data: values,
            backgroundColor: barColors,
            borderColor: barBorders,
            borderWidth: barBorderWidths,
            borderDash: [4, 3],
            barThickness: 28,
          },
        ],
      },
      plugins: [ChartDataLabels],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        /* No tooltip and nothing clickable here, so there is nothing for a
           pointer to do — an empty event list switches off Chart.js's default
           hover restyling of the bar as well. */
        events: [],
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          datalabels: {
            anchor: 'end',
            align: 'end',
            offset: 2, // sits 2px closer to the bar than the Chart.js default
            color: COLORS.dark,
            font: { family: FONT, weight: '700', size: 14 },
            // Raw API values carry full precision (4.3333) — one decimal only.
            formatter: function (v) {
              return v === null ? '' : fmt(v, 'days');
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: FONT, weight: '600', size: 14 }, color: COLORS.tick },
            border: { display: false },
          },
          y: {
            min: yMin,
            max: yMax,
            grid: { color: COLORS.grid, drawTicks: false },
            ticks: { display: false },
            border: { display: false },
          },
        },
      },
    });
  }

  /* Monthly transit trend: 12 months ending 2 months back. Gaps preserved. */
  function renderTransitTrend(host, series) {
    renderLineChart('transit-trend', host, series.points, {
      pointRadius: 5,
      spanGaps: true,
      bounds: function (min, max) {
        return niceScale(min * 0.9, max * 1.08, 8);
      },
      ticks: function (b) {
        return {
          stepSize: b.step,
          callback: function (v) {
            return v + 'd';
          },
        };
      },
      tooltip: function (v) {
        return fmt(v, 'days') + 'd';
      },
    });
  }

  /* Carrier prices: horizontal track bars, sorted ascending in JSON,
     cheapest (index 0) gets the dark accent. */
  function renderCarrierPrices(host, priceByCarrier) {
    destroyChart('carrier-prices');
    /* ATTRIBUTES.md documents this series as pre-sorted ascending, and index 0
       gets the dark "cheapest" accent. Live payloads are not actually sorted
       (observed: 530, 4000, 4600, 5200, 2350, …), which would hand the accent
       to whichever carrier happens to be first. Sort defensively. */
    var items = ((priceByCarrier && priceByCarrier.items) || []).slice().sort(function (a, b) {
      return a.medianPrice - b.medianPrice;
    });
    if (!items.length) {
      setChartEmpty('carrier-prices', host, true);
      return;
    }
    setChartEmpty('carrier-prices', host, false);

    var names = items.map(function (c) {
      return c.name;
    });
    var prices = items.map(function (c) {
      return c.medianPrice;
    });
    var trackMax = Math.ceil((Math.max.apply(null, prices) * 1.2) / 500) * 500;

    /* One size for desktop, one for mobile (spec §8: < 768px). `row` is the
       height each carrier gets; the bar is centred in it, so the gap between
       bars is row - bar and the space above the first / below the last is half
       that. Raising `row` is the single lever for vertical rhythm. */
    function carrierScale() {
      return isMobile()
        ? { font: 14, gap: 10, namePad: 8, bar: 10, row: 42 }
        : { font: 18, gap: 16, namePad: 16, bar: 12, row: 52 };
    }

    var ctx = mountCanvas(host);

    /* Right-aligning the price column needs its true pixel width, so measure
       the widest formatted price in the real font rather than guessing. Falls
       back to a rough estimate where there is no measurable 2D context. */
    function priceColumnWidth(size) {
      var widest = 0;
      var canMeasure = ctx && typeof ctx.measureText === 'function';
      if (canMeasure) ctx.font = '700 ' + size + 'px ' + FONT;
      prices.forEach(function (p) {
        var label = fmt(p, 'money');
        var w = canMeasure ? ctx.measureText(label).width : label.length * size * 0.62;
        if (w > widest) widest = w;
      });
      return Math.ceil(widest);
    }

    /* The right gutter holds the price column: label width + gap off the track
       + a small margin at the canvas edge. Labels are then drawn LEFT from the
       track's end (align 'left', negative offset pushes them back across the
       gutter), which lands every price on the same right edge. */
    var EDGE = 4;
    function carrierGeometry() {
      var s = carrierScale();
      var col = priceColumnWidth(s.font);
      return { s: s, col: col, pad: col + s.gap + EDGE, labelOffset: -(col + s.gap + EDGE - EDGE) };
    }

    function applyCarrierScale(chart) {
      var g = carrierGeometry();
      chart.options.layout.padding.right = g.pad;
      chart.options.scales.y.ticks.font.size = g.s.font;
      chart.options.scales.y.ticks.padding = g.s.namePad;
      chart.data.datasets[0].barThickness = g.s.bar;
      chart.data.datasets[1].barThickness = g.s.bar;
      chart.data.datasets[0].datalabels.font.size = g.s.font;
      chart.data.datasets[0].datalabels.offset = g.labelOffset;
      host.style.height = items.length * g.s.row + 'px';
    }

    var geo = carrierGeometry();
    var init = geo.s;

    /* Height is data-dependent — seven carriers need more room than three — so
       it is owned here rather than in the Designer. Sizing it to the rows also
       removes the dead space above the first bar and below the last that a
       taller container would spread across the categories. */
    host.style.height = items.length * init.row + 'px';

    chartInstances['carrier-prices'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          {
            data: prices.map(function () {
              return trackMax;
            }),
            backgroundColor: COLORS.track,
            barThickness: init.bar,
            grouped: false,
            order: 2,
            borderSkipped: false,
            /* The track is a static backdrop, not data — it should be there
               from the first frame while only the value bars sweep in.
               Chart.js resolves `animations` with the dataset as the first
               scope (DatasetController._configure), and the bar controller
               groups x/y/base/width/height under `numbers`. */
            animations: { numbers: { duration: 0 } },
            datalabels: {
              anchor: 'end',
              align: 'left', // drawn back across the gutter -> shared right edge
              offset: geo.labelOffset,
              color: COLORS.dark,
              font: { family: FONT, size: init.font, weight: 'bold' },
              formatter: function (v, c) {
                return fmt(prices[c.dataIndex], 'money');
              },
            },
          },
          {
            data: prices,
            backgroundColor: function (c) {
              return c.dataIndex === 0 ? COLORS.dark : COLORS.accent;
            },
            barThickness: init.bar,
            grouped: false,
            order: 1,
            borderSkipped: false,
            datalabels: { display: false },
          },
        ],
      },
      plugins: [ChartDataLabels],
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: geo.pad } },
        // Chart.js calls this after it resizes but before the next draw, so
        // mutating options here lands without forcing an extra update pass.
        onResize: function (chart) {
          applyCarrierScale(chart);
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false, min: 0, max: trackMax },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              // 'far' pushes the names to the outer edge of the label area, so
              // they share a left edge instead of ragging against the track.
              crossAlign: 'far',
              font: { family: FONT, size: init.font, weight: '500' },
              color: COLORS.tick,
              padding: init.namePad,
            },
          },
        },
      },
    });
  }

  /* -------------------------------------------------- window toggles */

  function wirePriceWindows(host, series) {
    var toggles = Array.prototype.slice.call(document.querySelectorAll('[data-route-window]'));

    function hasData(months) {
      return series.points.slice(-months).some(function (p) {
        return p.sampleSize > 0;
      });
    }
    /* The chips are wired and styled immediately — only the FIRST draw waits
       for the chart to scroll into view. A click always draws straight away,
       since by then the reader is looking at it. */
    var drawn = false;
    function select(toggle, months, deferFirstDraw) {
      toggles.forEach(function (t) {
        t.classList.remove('is-active');
      });
      if (toggle) toggle.classList.add('is-active');
      var draw = function () {
        drawn = true;
        renderPriceHistory(host, series, months);
      };
      if (!deferFirstDraw) {
        draw();
        return;
      }
      whenVisible(host, function () {
        // A chip clicked before the chart scrolled in wins — don't clobber it.
        if (!drawn) draw();
      });
    }

    if (!toggles.length) {
      select(null, 12, true);
      return;
    }

    var defaultToggle = null;
    var defaultMonths = 0;
    toggles.forEach(function (t) {
      var months = parseInt(t.getAttribute('data-route-window'), 10);
      var ok = hasData(months);
      /* A window with no data is hidden outright. `.is-disabled` is still set:
         it is part of the frozen Designer contract, so it stays for any styling
         already hung off it — hiding is additive, not a replacement. */
      t.classList.toggle('is-disabled', !ok);
      t.style.display = ok ? '' : 'none';
      if (!ok) return;
      t.addEventListener('click', function () {
        select(t, months);
      });
      // Prefer the 12M window; otherwise the first window that has data.
      if (!defaultToggle || (months === 12 && defaultMonths !== 12)) {
        defaultToggle = t;
        defaultMonths = months;
      }
    });
    if (defaultToggle) select(defaultToggle, defaultMonths, true);
    else setChartEmpty('price-history', host, true);
  }

  /* ------------------------------------------------------ updated age */
  /* [date-age="2026-09-03 8:53"] (also accepted: data-date-age, data-age) is
     the sync timestamp. The script writes how long ago that was — "23 hours",
     "4 days", "2 weeks" — localised through Intl, so the NL page reads
     "4 dagen". The trailing copy ("ago" / "geleden") stays a sibling element in
     the Designer, same as every other unit on the page.

     A value with no timezone is read as UTC, matching the API's generatedAt;
     an ISO value carrying Z or an offset is honoured as given. Floor, never
     round: 23h59m is still "23 hours". */
  var AGE_ATTRS = ['date-age', 'data-date-age', 'data-age'];

  function parseStamp(raw) {
    if (!raw) return null;
    var str = String(raw).trim();
    var m =
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(
        str
      );
    if (!m) {
      var fallback = new Date(str);
      return isNaN(fallback.getTime()) ? null : fallback;
    }
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if (m[7] && m[7].toUpperCase() !== 'Z') {
      var sign = m[7].charAt(0) === '-' ? -1 : 1;
      var off = +m[7].slice(1, 3) * 60 + +m[7].slice(-2);
      ms -= sign * off * 60000;
    }
    return new Date(ms);
  }

  function ageParts(then, now) {
    var min = Math.max(0, Math.floor((now - then) / 60000));
    var hr = Math.floor(min / 60);
    var day = Math.floor(hr / 24);
    if (hr < 1) return { value: Math.max(1, min), unit: 'minute' };
    if (day < 1) return { value: hr, unit: 'hour' };
    if (day < 7) return { value: day, unit: 'day' };
    if (day < 35) return { value: Math.floor(day / 7), unit: 'week' };
    if (day < 365) return { value: Math.max(1, Math.floor(day / 30.44)), unit: 'month' };
    return { value: Math.floor(day / 365.25), unit: 'year' };
  }

  /* Abbreviated, no space — "4d", "23h" — matching the "27d" style used for
     every other duration on the page. Intl's narrow unit style is not used
     because it renders both month and minute as "m". */
  var AGE_UNITS = {
    en: { minute: 'min', hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y' },
    nl: { minute: 'min', hour: 'u', day: 'd', week: 'w', month: 'mnd', year: 'jr' },
  };

  function formatAge(parts) {
    var units = AGE_UNITS[LOCALE] || AGE_UNITS.en;
    return parts.value + units[parts.unit];
  }

  function updatedAge() {
    var entries = [];
    AGE_ATTRS.forEach(function (attr) {
      Array.prototype.forEach.call(document.querySelectorAll('[' + attr + ']'), function (el) {
        var raw = el.getAttribute(attr);
        var stamp = parseStamp(raw);
        var entry = {
          attr: attr,
          raw: raw,
          iso: stamp ? stamp.toISOString() : null,
          text: null,
          counter: el.getAttribute('data-element') === 'counter',
        };
        if (stamp) {
          entry.text = formatAge(ageParts(stamp, Date.now()));
          el.textContent = entry.text;
        }
        entries.push(entry);
      });
    });
    return entries;
  }

  /* ------------------------------------------------ related routes swiper */
  /* Block 15's carousel. When the multi-reference is empty Webflow renders
     neither the wrapper nor any slides, and Swiper does not cope with that —
     so it is built only when both exist, and only once. Config as supplied
     by the Designer. */
  function initRelatedRoutesSwiper() {
    var wrapper = document.querySelector('.swiper-card-link_wrapper');
    if (!wrapper || wrapper.swiper) return null;
    var slides = wrapper.querySelectorAll('.swiper-card-link_slide');
    if (!slides.length) return null;

    return new Swiper(wrapper, {
      modules: [Autoplay, Navigation, Pagination, Scrollbar, Keyboard, Mousewheel, A11y],
      wrapperClass: 'swiper-card-link_list',
      slideClass: 'swiper-card-link_slide',
      slidesPerView: 'auto',
      speed: 400,
      spaceBetween: 24,
      a11y: true,
      grabCursor: true,
      autoplay: false,
      keyboard: { onlyInViewport: true },
      mousewheel: { forceToAxis: true },
      navigation: { prevEl: '.swiper_button.is-prev', nextEl: '.swiper_button.is-next' },
      scrollbar: { el: '.swiper_scrollbar', dragClass: 'swiper_scrollbar-drag', draggable: true },
      breakpoints: {},
      on: {
        beforeInit: function () {
          this.wrapperEl.style.columnGap = 'unset';
        },
      },
    });
  }

  /* ------------------------------------------------------ diagnostics */
  /* window.RouteInsights.check() — is every chart tagged, does its inline
     series parse, did it draw? Prints a summary; auto-runs on ?route-debug. */

  var EXPECTED_CHARTS = ['price-history', 'weekly-delay', 'transit-trend', 'carrier-prices'];

  /* Attributes the CMS-driven build no longer reads. Left over in the
     Designer they do nothing, but they mislead the next person, so name them. */
  var LEGACY_ATTRS = ['data-route-field', 'data-route-show', 'data-route-card'];

  function readSeries(host) {
    var raw = host.getAttribute('data-route-json');
    if (raw === null) return { state: 'missing', series: null };
    if (!raw.trim()) return { state: 'blank', series: null };
    try {
      return { state: 'ok', series: JSON.parse(raw) };
    } catch (e) {
      return { state: 'invalid', series: null, error: e.message };
    }
  }

  function sampledCount(series) {
    if (!series) return 0;
    var list = series.points || series.items || [];
    return list.filter(function (p) {
      return p && p.sampleSize > 0;
    }).length;
  }

  function check() {
    var problems = [];
    var charts = {};
    var canMeasure = typeof window.getComputedStyle === 'function';

    EXPECTED_CHARTS.forEach(function (name) {
      var host = document.querySelector('[data-route-chart="' + name + '"]');
      var placeholder = document.querySelector('[data-route-empty="' + name + '"]');
      if (!host) {
        problems.push('missing chart container: ' + name);
        charts[name] = { container: false };
        return;
      }
      var read = readSeries(host);
      var entry = {
        container: true,
        series: read.state,
        points: read.series ? (read.series.points || read.series.items || []).length : 0,
        sampled: sampledCount(read.series),
        placeholder: !!placeholder,
        rendered: !!host.querySelector('canvas'),
        empty: host.getAttribute('data-empty') === 'true',
      };
      if (canMeasure && typeof host.getBoundingClientRect === 'function') {
        var r = host.getBoundingClientRect();
        entry.height = Math.round(r.height);
        entry.position = window.getComputedStyle(host).position;
      }
      charts[name] = entry;

      if (read.state === 'missing')
        problems.push(name + ': no data-route-json attribute on the container');
      else if (read.state === 'blank')
        problems.push(name + ': data-route-json is blank — the CMS field is empty for this route');
      else if (read.state === 'invalid')
        problems.push(name + ': data-route-json does not parse (' + read.error + ')');
      else if (!entry.sampled)
        problems.push(name + ': series has no sampled points — placeholder shown');
      if (!placeholder) problems.push(name + ': no [data-route-empty] placeholder');
      if (entry.height !== undefined && !entry.empty && entry.height <= 150)
        problems.push(
          name + ': container collapsed to the 150px canvas default — give it a fixed height'
        );
      if (entry.position === 'static' && !entry.empty)
        problems.push(name + ': container is position:static — Chart.js needs position:relative');
    });

    /* [data-route-json] anywhere but a chart container is a leftover of the
       fetched-payload build (the old #route-data embed). Ignored, but it
       confuses anyone reading the Designer, so call it out. */
    var stray = Array.prototype.filter.call(
      document.querySelectorAll('[data-route-json]'),
      function (el) {
        return !el.hasAttribute('data-route-chart');
      }
    );
    if (stray.length)
      problems.push(
        stray.length +
          ' [data-route-json] element(s) outside a chart container (old #route-data embed?) — safe to delete'
      );

    var legacy = {};
    LEGACY_ATTRS.forEach(function (a) {
      var n = document.querySelectorAll('[' + a + ']').length;
      if (n) legacy[a] = n;
    });
    if (Object.keys(legacy).length)
      problems.push(
        'legacy attributes present but no longer read by this script: ' +
          Object.keys(legacy)
            .map(function (k) {
              return k + ' ×' + legacy[k];
            })
            .join(', ')
      );

    var updated = window.RouteInsights.updated || [];
    updated.forEach(function (u) {
      if (!u.iso)
        problems.push(
          '[' +
            u.attr +
            '="' +
            u.raw +
            '"] does not parse as a date — expected YYYY-MM-DD HH:MM (ISO with Z preferred)'
        );
      if (u.counter)
        problems.push(
          'the [' +
            u.attr +
            '] element also carries data-element="counter" — animation.js will overwrite it; remove that attribute'
        );
    });

    var trends = document.querySelectorAll('[data-route-trend]').length;

    var report = {
      ok: problems.length === 0,
      problems: problems,
      status: window.RouteInsights.status,
      charts: charts,
      windows: document.querySelectorAll('[data-route-window]').length,
      updated: updated,
      relatedSwiper: {
        wrapper: !!document.querySelector('.swiper-card-link_wrapper'),
        slides: document.querySelectorAll('.swiper-card-link_slide').length,
        initialised: window.RouteInsights.relatedSwiper,
      },
      trendBadges: trends,
      legacy: legacy,
    };

    var head = report.ok
      ? '✅ route-insights OK — ' + EXPECTED_CHARTS.length + ' charts from inline JSON'
      : '⚠️ route-insights: ' + problems.length + ' issue(s)';
    if (console.groupCollapsed) {
      console.groupCollapsed(head);
      problems.forEach(function (p) {
        console.warn('• ' + p);
      });
      console.log('report', report);
      console.groupEnd();
    } else {
      console.log(head, report);
    }
    return report;
  }

  /* ------------------------------------------------------------- boot */

  /* Published at script-evaluation time so `RouteInsights.status` can tell
     "never loaded" (ReferenceError) from "loaded but never booted" ('idle'). */
  window.RouteInsights = {
    status: 'idle',
    charts: {},
    updated: [],
    relatedSwiper: false,
    check: check,
  };

  /* price-history schedules its own first draw (wirePriceWindows defers it
     until the container is on screen, but wires the toggles immediately). The
     other three are deferred here. */
  var RENDERERS = {
    'price-history': function (host, series) {
      wirePriceWindows(host, series);
    },
    'weekly-delay': function (host, series) {
      whenVisible(host, function () {
        renderWeeklyDelay(host, series);
      });
    },
    'transit-trend': function (host, series) {
      whenVisible(host, function () {
        renderTransitTrend(host, series);
      });
    },
    'carrier-prices': function (host, series) {
      whenVisible(host, function () {
        renderCarrierPrices(host, series);
      });
    },
  };

  function boot() {
    var hosts = document.querySelectorAll('[data-route-chart]');
    var debug = /[?&]route-debug\b/.test(window.location.search);
    window.RouteInsights.updated = updatedAge();
    window.RouteInsights.relatedSwiper = !!initRelatedRoutesSwiper();
    if (!hosts.length) {
      window.RouteInsights.status = 'no-charts'; // not a route page
      if (debug) check();
      return;
    }

    hideEmptyStates();

    Array.prototype.forEach.call(hosts, function (host) {
      var name = host.getAttribute('data-route-chart');
      var render = RENDERERS[name];
      if (!render) {
        console.warn('[route-insights] unknown chart:', name);
        window.RouteInsights.charts[name] = 'unknown';
        return;
      }
      var read = readSeries(host);
      window.RouteInsights.charts[name] = read.state;
      if (read.state !== 'ok') {
        if (read.state === 'invalid')
          console.warn(
            '[route-insights] ' + name + ': data-route-json does not parse —',
            read.error
          );
        setChartEmpty(name, host, true);
        return;
      }
      render(host, read.series);
    });

    window.RouteInsights.status = 'ready';
    document.documentElement.setAttribute('data-route-insights', 'ready');
    document.dispatchEvent(
      new CustomEvent('route-insights:ready', { detail: window.RouteInsights })
    );
    if (debug) check();
  }

  /* Boot on Webflow's ready queue — the house pattern shared by the other
     scripts in src/. It fires after webflow.js has initialised, and makes
     webflow.js a hard dependency, which holds for every page on this site. */
  window.Webflow ||= [];
  window.Webflow.push(boot);
})();

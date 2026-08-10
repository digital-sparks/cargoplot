/**
 * Cargoplot Route Insights — dynamic data loader for Routes pages
 * ----------------------------------------------------------------
 * Reads the weekly per-route JSON from S3 and populates the page:
 *   - text KPIs via   [data-route-field]  (+ optional [data-route-format])
 *   - trend badges via [data-route-trend]
 *   - charts via      [data-route-chart="price-history|weekly-delay|transit-trend|carrier-prices"]
 *   - window toggles  [data-route-window="3|6|12|24"] (price chart)
 *   - conditionals    [data-route-show="loadTypeBreakdown"]
 *
 * JSON URL source: the [data-route-json] attribute rendered by the CMS-bound
 * HTML embed on the Routes template. No URL fallback — the CMS "JSON" field
 * must be filled on every route item.
 *
 * Build: bundled with esbuild (see package.json "build"); Chart.js and the
 * datalabels plugin come from pnpm packages. Datalabels is registered
 * PER-CHART (plugins: [ChartDataLabels]) on purpose — do not register it
 * globally or it will label the line charts too.
 *
 * Option B contract: Webflow renders CMS baseline values server-side;
 * this script refreshes them from the JSON on load. sampleSize:0 => "—".
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

  function sampled(sv) {
    return sv && typeof sv.value === 'number' && sv.sampleSize > 0 ? sv.value : null;
  }

  function fmt(value, kind) {
    if (value === null || value === undefined) return '\u2014';
    switch (kind) {
      case 'money':
        return '$' + Math.round(value).toLocaleString(LOCALE);
      case 'days':
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
        return Math.round(value).toLocaleString(LOCALE);
      default:
        return String(value);
    }
  }

  /* ------------------------------------------------- field resolver map */
  /* Each entry: fn(route, meta) -> { value, format } (value null => "—") */

  var FIELDS = {
    /* Route identity (names, locodes) is CMS-rendered — intentionally NOT here. */
    activeCarriers: function (r) {
      return { value: sampled(r.activeCarriers), format: 'count' };
    },
    avgWeeklySailings: function (r) {
      return { value: sampled(r.avgWeeklySailings), format: 'count' };
    },
    sailingsFrequency: function (r) {
      return { value: sampled(r.avgWeeklySailings), format: 'frequency' };
    },

    transitTime: function (r) {
      return { value: sampled(r.transitTime && r.transitTime.current), format: 'days' };
    },
    onTimeRate: function (r) {
      return { value: sampled(r.onTimeRate && r.onTimeRate.current), format: 'pct' };
    },
    marketPrice: function (r) {
      return { value: sampled(r.marketPrice && r.marketPrice.current), format: 'money' };
    },

    departureDelay: function (r) {
      return { value: sampled(r.departureDelay), format: 'signed-days' };
    },
    arrivalDelay: function (r) {
      return { value: sampled(r.arrivalDelay), format: 'signed-days' };
    },

    fastestCarrierName: function (r) {
      return { value: r.fastestCarrier && r.fastestCarrier.name, format: 'text' };
    },
    fastestCarrierDays: function (r) {
      return {
        value: sampled(r.fastestCarrier && r.fastestCarrier.avgTransitDays),
        format: 'days',
      };
    },
    fastestCarrierFrequency: function (r) {
      return {
        value: sampled(r.fastestCarrier && r.fastestCarrier.avgWeeklySailings),
        format: 'frequency',
      };
    },

    mostReliableCarrierName: function (r) {
      return { value: r.mostReliableCarrier && r.mostReliableCarrier.name, format: 'text' };
    },
    reliableOnTimeRate: function (r) {
      return {
        value: sampled(r.mostReliableCarrier && r.mostReliableCarrier.onTimeRate),
        format: 'pct',
      };
    },
    reliableEtdVariance: function (r) {
      return {
        value: sampled(r.mostReliableCarrier && r.mostReliableCarrier.etdVarianceDays),
        format: 'days',
      };
    },
    reliableEtaVariance: function (r) {
      return {
        value: sampled(r.mostReliableCarrier && r.mostReliableCarrier.etaVarianceDays),
        format: 'days',
      };
    },

    fclSharePct: function (r) {
      var b = r.loadTypeBreakdown;
      return { value: b && sampled(b.fcl && b.fcl.sharePct), format: 'pct' };
    },
    fclPriceFrom: function (r) {
      var b = r.loadTypeBreakdown;
      return { value: b && sampled(b.fcl && b.fcl.bestPrice), format: 'money' };
    },
    lclSharePct: function (r) {
      var b = r.loadTypeBreakdown;
      return { value: b && sampled(b.lcl && b.lcl.sharePct), format: 'pct' };
    },
    lclPriceCbm: function (r) {
      var b = r.loadTypeBreakdown;
      return { value: b && sampled(b.lcl && b.lcl.bestPrice), format: 'money' };
    },

    dataAgeHours: function (r, meta) {
      var ts = meta.publishedAt;
      if (!ts) return { value: null, format: 'count' };
      return {
        value: Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 36e5)),
        format: 'count',
      };
    },
    dataAgeDays: function (r, meta) {
      var ts = meta.publishedAt;
      if (!ts) return { value: null, format: 'count' };
      return {
        value: Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 864e5)),
        format: 'count',
      };
    },
  };

  /* ------------------------------------------------------- text fields */

  function populateFields(route, meta) {
    document.querySelectorAll('[data-route-field]').forEach(function (el) {
      var key = el.getAttribute('data-route-field');
      var resolver = FIELDS[key];
      if (!resolver) {
        console.warn('[route-insights] unknown field:', key);
        return;
      }
      var res = resolver(route, meta);
      var format = el.getAttribute('data-route-format') || res.format;
      var text =
        res.format === 'text' || format === 'text' ? res.value || '\u2014' : fmt(res.value, format);
      el.textContent = text;

      // small-sample confidence caveat for on-time rates (API rule)
      if (key === 'onTimeRate' || key === 'reliableOnTimeRate') {
        var sv =
          key === 'onTimeRate'
            ? route.onTimeRate && route.onTimeRate.current
            : route.mostReliableCarrier && route.mostReliableCarrier.onTimeRate;
        el.toggleAttribute('data-low-sample', !!(sv && sv.sampleSize > 0 && sv.sampleSize < 5));
      }
    });
  }

  /* ------------------------------------------------------ trend badges */
  /* [data-route-trend="transitTime|onTimeRate|marketPrice"]
     Hidden when previous.sampleSize == 0. Adds .is-up / .is-down. */

  var TRENDS = {
    transitTime: { format: 'days', suffix: 'd' },
    onTimeRate: { format: 'pct', suffix: 'pp' },
    marketPrice: { format: 'pct', suffix: '%' },
  };

  function populateTrends(route) {
    document.querySelectorAll('[data-route-trend]').forEach(function (el) {
      var key = el.getAttribute('data-route-trend');
      var kpi = route[key];
      var cfg = TRENDS[key];
      if (!cfg || !kpi) {
        el.style.display = 'none';
        return;
      }
      var cur = sampled(kpi.current),
        prev = sampled(kpi.previous);
      if (cur === null || prev === null) {
        el.style.display = 'none';
        return;
      }

      var delta, text;
      if (key === 'marketPrice') {
        delta = prev === 0 ? 0 : ((cur - prev) / prev) * 100;
        text = (delta >= 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(Math.round(delta * 10) / 10) + '%';
      } else {
        delta = cur - prev;
        text =
          (delta >= 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(Math.round(delta * 10) / 10) + cfg.suffix;
      }
      el.style.display = '';
      el.textContent = text;
      el.classList.toggle('is-up', delta > 0);
      el.classList.toggle('is-down', delta < 0);
    });
  }

  /* ------------------------------------------------------ conditionals */

  function applyConditionals(route) {
    document.querySelectorAll('[data-route-show]').forEach(function (el) {
      var key = el.getAttribute('data-route-show');
      var show = true;
      if (key === 'loadTypeBreakdown') show = !!route.loadTypeBreakdown;
      el.style.display = show ? '' : 'none';
    });
  }

  /* ------------------------------------------------------------ charts */

  var chartInstances = {};

  function mountCanvas(host) {
    host.innerHTML = '';
    var c = document.createElement('canvas');
    host.appendChild(c);
    return c.getContext('2d');
  }

  /* Chart.js animates on construction, so building a chart the moment the JSON
     lands means it has already animated by the time the reader scrolls to it.
     Hold construction until the container is actually on screen. Used by all
     four charts. Fires immediately for anything already in view, and degrades
     to rendering straight away where IntersectionObserver is unavailable. */
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
      { threshold: 0.25 }
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
      host.setAttribute('data-empty', 'true');
      host.innerHTML = '';
      return;
    }
    host.removeAttribute('data-empty');

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
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
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
            spanGaps: false,
            pointBackgroundColor: function (c) {
              return c.dataIndex === last ? COLORS.accent : 'transparent';
            },
            pointBorderColor: 'transparent',
            pointRadius: function (c) {
              return c.dataIndex === last ? opts.pointRadius : 0;
            },
          },
        ],
      },
      options: options,
    });
  }

  /* Price history: 24 monthly points, windows sliced client-side.
     sampleSize:0 => null value => gap (spanGaps:false). */
  function renderPriceHistory(host, series, windowMonths) {
    renderLineChart('price-history', host, series.points.slice(-windowMonths), {
      pointRadius: 6,
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
        '[route-insights] weeklyDelayCongestion returned ' + pts.length + ' points; showing the last 8'
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
      host.setAttribute('data-empty', 'true');
      host.innerHTML = '';
      return;
    }
    host.removeAttribute('data-empty');

    var names = items.map(function (c) {
      return c.name;
    });
    var prices = items.map(function (c) {
      return c.medianPrice;
    });
    var trackMax = Math.ceil((Math.max.apply(null, prices) * 1.2) / 500) * 500;

    /* Mobile: the desktop sizing (80px right gutter, 18px price labels, 16px
       carrier names) does not fit a ~340px viewport — the price labels collide
       with the track and the names truncate. Scale the chrome down with the
       chart, and re-apply on resize so rotating the phone re-flows it. */
    function carrierScale(width) {
      if (width < 420) return { pad: 40, price: 12, offset: 6, name: 11, namePad: 6, bar: 10 };
      if (width < 640) return { pad: 56, price: 14, offset: 10, name: 13, namePad: 10, bar: 12 };
      return { pad: 80, price: 18, offset: 16, name: 16, namePad: 16, bar: 14 };
    }

    function applyCarrierScale(chart, width) {
      var s = carrierScale(width);
      chart.options.layout.padding.right = s.pad;
      chart.options.scales.y.ticks.font.size = s.name;
      chart.options.scales.y.ticks.padding = s.namePad;
      chart.data.datasets[0].barThickness = s.bar;
      chart.data.datasets[1].barThickness = s.bar;
      chart.data.datasets[0].datalabels.font.size = s.price;
      chart.data.datasets[0].datalabels.offset = s.offset;
    }

    var init = carrierScale(host.clientWidth || 600);

    chartInstances['carrier-prices'] = new Chart(mountCanvas(host), {
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
            datalabels: {
              anchor: 'end',
              align: 'end',
              offset: init.offset,
              color: COLORS.tick,
              font: { family: FONT, size: init.price, weight: 'bold' },
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
        layout: { padding: { right: init.pad } },
        // Chart.js calls this after it resizes but before the next draw, so
        // mutating options here lands without forcing an extra update pass.
        onResize: function (chart, size) {
          applyCarrierScale(chart, size.width);
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false, min: 0, max: trackMax },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              font: { family: FONT, size: init.name, weight: '500' },
              color: COLORS.tick,
              padding: init.namePad,
            },
          },
        },
      },
    });
  }

  /* -------------------------------------------------- window toggles */

  function wirePriceWindows(route) {
    var host = document.querySelector('[data-route-chart="price-history"]');
    if (!host) return;
    var series = route.historicalPrice;
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
    else {
      host.setAttribute('data-empty', 'true');
      host.innerHTML = '';
    }
  }

  /* ------------------------------------------------------ diagnostics */
  /* window.RouteInsights.check() — answers "did it load, is everything
     tagged, did the JSON arrive?" in one call. Returns a report object and
     prints a readable summary. Auto-runs when the URL carries ?route-debug,
     so this can be checked on a live Webflow page without the console. */

  /* What ATTRIBUTES.md says the template should carry. That file is the source
     of truth — this is only what the checker asserts against, so move a key
     from PENDING_FIELDS to EXPECTED_FIELDS as the Designer work lands. */
  var EXPECTED_FIELDS = [
    'activeCarriers',
    'avgWeeklySailings',
    'sailingsFrequency',
    'transitTime',
    'onTimeRate',
    'marketPrice',
    'departureDelay',
    'arrivalDelay',
    'fastestCarrierName',
    'fastestCarrierDays',
    'mostReliableCarrierName',
    'reliableOnTimeRate',
    'reliableEtdVariance',
    'reliableEtaVariance',
  ];
  var PENDING_FIELDS = ['fclSharePct', 'fclPriceFrom', 'lclSharePct', 'lclPriceCbm'];
  var EXPECTED_TRENDS = ['transitTime', 'onTimeRate', 'marketPrice'];
  var EXPECTED_CHARTS = ['price-history', 'weekly-delay', 'transit-trend', 'carrier-prices'];

  function tagValues(attr) {
    return Array.prototype.map.call(document.querySelectorAll('[' + attr + ']'), function (el) {
      return el.getAttribute(attr);
    });
  }

  function absent(expected, found) {
    return expected.filter(function (k) {
      return found.indexOf(k) === -1;
    });
  }

  function check() {
    var state = window.RouteInsights || {};
    var fields = tagValues('data-route-field');
    var trends = tagValues('data-route-trend');
    var charts = tagValues('data-route-chart');
    var windows = tagValues('data-route-window');
    var problems = [];

    // The hero carries one of dataAgeHours / dataAgeDays, not both.
    var hasDataAge = fields.indexOf('dataAgeHours') !== -1 || fields.indexOf('dataAgeDays') !== -1;
    var missingFields = absent(EXPECTED_FIELDS, fields);
    var unknownFields = fields.filter(function (k) {
      return !FIELDS[k];
    });
    var pendingFound = PENDING_FIELDS.filter(function (k) {
      return fields.indexOf(k) !== -1;
    });

    // Tagged but showing the em-dash => resolver ran and the JSON had no sample.
    var blankFields = Array.prototype.filter
      .call(document.querySelectorAll('[data-route-field]'), function (el) {
        return el.textContent === '—';
      })
      .map(function (el) {
        return el.getAttribute('data-route-field');
      });

    var emptyCharts = EXPECTED_CHARTS.filter(function (n) {
      var el = document.querySelector('[data-route-chart="' + n + '"]');
      return !!el && el.getAttribute('data-empty') === 'true';
    });

    if (state.status === 'idle') {
      problems.push(
        'script loaded but never booted — window.Webflow never flushed its queue (is webflow.js on the page?)'
      );
    } else if (state.status === 'no-url') {
      problems.push(
        'no [data-route-json] URL on the page — the CMS "JSON" field is empty for this route'
      );
    } else if (state.status === 'error') {
      problems.push('JSON failed to load from ' + state.url + ' — ' + state.error);
    } else if (state.status !== 'ready') {
      problems.push('script has not finished loading (status: ' + state.status + ')');
    }
    if (!fields.length && !charts.length)
      problems.push(
        'no data-route-* attributes found at all — wrong page, or the Designer tags are missing'
      );
    if (missingFields.length) problems.push('untagged fields: ' + missingFields.join(', '));
    if (!hasDataAge) problems.push('untagged field: dataAgeHours or dataAgeDays');
    if (unknownFields.length)
      problems.push('unknown data-route-field values (typo?): ' + unknownFields.join(', '));
    if (absent(EXPECTED_TRENDS, trends).length)
      problems.push('untagged trends: ' + absent(EXPECTED_TRENDS, trends).join(', '));
    if (absent(EXPECTED_CHARTS, charts).length)
      problems.push('missing chart containers: ' + absent(EXPECTED_CHARTS, charts).join(', '));
    if (!windows.length)
      problems.push('no [data-route-window] toggles — price chart defaults to 12M');
    if (emptyCharts.length)
      problems.push('charts with no data in this JSON: ' + emptyCharts.join(', '));

    /* Geometry. With maintainAspectRatio:false, Chart.js needs the container to
       own its height and to be position:relative; otherwise the canvas falls
       back to its 300x150 default and the chart renders collapsed inside a
       full-size card. The tag checks above cannot see that — they were all
       green while every chart on the page was squashed to 150px. Browser-only:
       skipped where there is no layout engine. */
    var geometry = [];
    if (typeof window.getComputedStyle === 'function') {
      EXPECTED_CHARTS.forEach(function (n) {
        var el = document.querySelector('[data-route-chart="' + n + '"]');
        if (!el || typeof el.getBoundingClientRect !== 'function') return;
        var r = el.getBoundingClientRect();
        geometry.push({
          name: n,
          height: Math.round(r.height),
          width: Math.round(r.width),
          position: window.getComputedStyle(el).position,
          // Charts build on scroll-in, so one that hasn't been reached yet has
          // no canvas. Not a fault — surfaced so QA doesn't read it as one.
          rendered: !!el.querySelector('canvas'),
        });
      });
      var collapsed = geometry
        .filter(function (g) {
          return g.height <= 150;
        })
        .map(function (g) {
          return g.name;
        });
      var isStatic = geometry
        .filter(function (g) {
          return g.position === 'static';
        })
        .map(function (g) {
          return g.name;
        });
      if (collapsed.length)
        problems.push(
          'chart containers collapsed to the 150px canvas default — give them a fixed height in the Designer: ' +
            collapsed.join(', ')
        );
      if (isStatic.length)
        problems.push(
          'chart containers are position:static — Chart.js needs position:relative to size and resize correctly: ' +
            isStatic.join(', ')
        );
    }

    /* The payload names the route it describes (origin/destination locodes).
       The script cannot verify that against the page automatically — route
       identity is CMS-only and no locode attributes exist here — so surface it
       for a human to eyeball. A JSON URL pasted onto the wrong CMS item is
       otherwise invisible: the page renders confidently wrong numbers. */
    var payload = state.data;
    var routeId =
      payload && payload.origin && payload.destination
        ? (payload.origin.locode || '?') + ' → ' + (payload.destination.locode || '?')
        : null;

    var report = {
      ok: problems.length === 0,
      problems: problems,
      status: state.status,
      json: {
        url: state.url || null,
        route: routeId,
        httpStatus: state.httpStatus,
        ms: state.ms,
        publishedAt: state.meta && state.meta.publishedAt,
      },
      fields: {
        tagged: fields.length,
        expected: EXPECTED_FIELDS.length + 1, // + dataAge
        missing: missingFields.concat(hasDataAge ? [] : ['dataAgeHours|dataAgeDays']),
        unknown: unknownFields,
        pendingTagged: pendingFound,
        pendingUntagged: absent(PENDING_FIELDS, fields),
        showingDash: blankFields,
      },
      trends: { tagged: trends, missing: absent(EXPECTED_TRENDS, trends) },
      charts: {
        tagged: charts,
        missing: absent(EXPECTED_CHARTS, charts),
        empty: emptyCharts,
        geometry: geometry,
      },
      windows: {
        tagged: windows,
        active: (
          document.querySelector('[data-route-window].is-active') || {
            getAttribute: function () {
              return null;
            },
          }
        ).getAttribute('data-route-window'),
        disabled: Array.prototype.map.call(
          document.querySelectorAll('[data-route-window].is-disabled'),
          function (el) {
            return el.getAttribute('data-route-window');
          }
        ),
      },
    };

    var head = report.ok
      ? '✅ route-insights OK — ' +
        (routeId ? routeId + ', ' : '') +
        report.fields.tagged +
        ' fields, ' +
        report.charts.tagged.length +
        ' charts, JSON ' +
        (state.ms != null ? state.ms + 'ms' : 'n/a')
      : '⚠️ route-insights: ' +
        problems.length +
        ' issue(s)' +
        (routeId ? ' — JSON is ' + routeId : '');

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

  function resolveUrl() {
    var el = document.querySelector('[data-route-json]');
    var url = el && el.getAttribute('data-route-json');
    console.log(url);
    return url && url.indexOf('http') === 0 ? url : null;
  }

  function setState(status, extra) {
    var ri = window.RouteInsights;
    ri.status = status;
    if (extra) for (var k in extra) ri[k] = extra[k];
    // Mirror onto <html> so state is visible in the element inspector. Only on
    // route pages — never tag a page that has no [data-route-json].
    if (ri.url) document.documentElement.setAttribute('data-route-insights', status);
  }

  /* Resolve a tagged element to its RAW number plus format. Exposed so the
     count-up in animation.js can animate the number and hand formatting back
     here — that file's own formatValue() rounds to integers and emits no
     thousands separator, so letting it format these values would render 44.8
     as "45" and $4,500 as "$4500" (and parseFloat("4,500") is 4). */
  function fieldValue(el) {
    var st = window.RouteInsights;
    var key = el && el.getAttribute && el.getAttribute('data-route-field');
    if (!key || !st || !st.data || !FIELDS[key]) return null;
    var res = FIELDS[key](st.data, st.meta || {});
    return { value: res.value, format: el.getAttribute('data-route-format') || res.format };
  }

  /* Published at script-evaluation time — NOT inside boot() — so the console can
     tell apart three failures that otherwise look identical:
       ReferenceError                the bundle never loaded (bad CDN URL, or no
                                     <script> tag on the page)
       status 'idle'                 bundle loaded, but Webflow's queue never
                                     flushed, so boot() never ran
       status 'no-url'               booted fine, but the CMS "JSON" field is empty
     NOTE: `window.RouteInsights` existing therefore does not imply the data
     loaded; test `RouteInsights.status === 'ready'` instead. */
  window.RouteInsights = {
    status: 'idle',
    url: null,
    data: null,
    meta: null,
    error: null,
    format: fmt,
    fieldValue: fieldValue,
    httpStatus: null,
    ms: null,
    check: check,
  };

  function boot() {
    console.log('boot');
    var url = resolveUrl();
    var debug = /[?&]route-debug\b/.test(window.location.search);
    window.RouteInsights.url = url;

    if (!url) {
      setState('no-url');
      if (debug) check();
      return; // not a route page / CMS "JSON" field empty
    }

    var t0 = Date.now();
    setState('loading');

    fetch(url)
      .then(function (res) {
        window.RouteInsights.httpStatus = res.status;
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        // Support both envelopes: per-route file ({route:{...}} or bare RouteInsight)
        var route = data.route || data;
        var meta = { publishedAt: data.generatedAt || data.createTime || data.publishedAt || null };

        populateFields(route, meta);
        populateTrends(route);
        applyConditionals(route);

        wirePriceWindows(route);
        var delayHost = document.querySelector('[data-route-chart="weekly-delay"]');
        if (delayHost && route.weeklyDelayCongestion) {
          // Bars grow on scroll-in, not on load — see whenVisible().
          whenVisible(delayHost, function () {
            renderWeeklyDelay(delayHost, route.weeklyDelayCongestion);
          });
        }
        var trendHost = document.querySelector('[data-route-chart="transit-trend"]');
        if (trendHost && route.monthlyTransitTrend) {
          whenVisible(trendHost, function () {
            renderTransitTrend(trendHost, route.monthlyTransitTrend);
          });
        }
        var carrierHost = document.querySelector('[data-route-chart="carrier-prices"]');
        if (carrierHost) {
          whenVisible(carrierHost, function () {
            renderCarrierPrices(carrierHost, route.priceByCarrier);
          });
        }

        setState('ready', { data: route, meta: meta, ms: Date.now() - t0 });
        document.dispatchEvent(
          new CustomEvent('route-insights:ready', { detail: window.RouteInsights })
        );
        if (debug) check();
      })
      .catch(function (err) {
        setState('error', { error: err.message, ms: Date.now() - t0 });
        console.error('[route-insights] failed:', err);
        if (debug) check();
      });
  }

  /* Boot on Webflow's ready queue — the house pattern used by global.js,
     animation.js, exit-intent.js, service.js, solution.js and rate-module.js.
     It fires after webflow.js has initialised IX2 and the count-up widgets, so
     the page is fully settled before we touch it. Note this makes webflow.js a
     hard dependency: if it never loads, the queue never flushes and boot never
     runs. That holds for every script in src/ and for every page on this site. */
  window.Webflow ||= [];
  window.Webflow.push(boot);
})();

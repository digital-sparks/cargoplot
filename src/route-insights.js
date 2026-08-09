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
    amber: '#F5C640',
    inProgress: 'rgba(174, 186, 184, 0.45)'
  };

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
      case 'money': return '$' + Math.round(value).toLocaleString(LOCALE);
      case 'days': return (Math.round(value * 10) / 10).toLocaleString(LOCALE);
      case 'pct': return (Math.round(value * 10) / 10).toLocaleString(LOCALE) + '%';
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
      case 'count': return Math.round(value).toLocaleString(LOCALE);
      default: return String(value);
    }
  }

  /* ------------------------------------------------- field resolver map */
  /* Each entry: fn(route, meta) -> { value, format } (value null => "—") */

  var FIELDS = {
    /* Route identity (names, locodes) is CMS-rendered — intentionally NOT here. */
    activeCarriers:    function (r) { return { value: sampled(r.activeCarriers), format: 'count' }; },
    avgWeeklySailings: function (r) { return { value: sampled(r.avgWeeklySailings), format: 'count' }; },
    sailingsFrequency: function (r) { return { value: sampled(r.avgWeeklySailings), format: 'frequency' }; },

    transitTime:       function (r) { return { value: sampled(r.transitTime && r.transitTime.current), format: 'days' }; },
    onTimeRate:        function (r) { return { value: sampled(r.onTimeRate && r.onTimeRate.current), format: 'pct' }; },
    marketPrice:       function (r) { return { value: sampled(r.marketPrice && r.marketPrice.current), format: 'money' }; },

    departureDelay:    function (r) { return { value: sampled(r.departureDelay), format: 'signed-days' }; },
    arrivalDelay:      function (r) { return { value: sampled(r.arrivalDelay), format: 'signed-days' }; },

    fastestCarrierName:      function (r) { return { value: r.fastestCarrier && r.fastestCarrier.name, format: 'text' }; },
    fastestCarrierDays:      function (r) { return { value: sampled(r.fastestCarrier && r.fastestCarrier.avgTransitDays), format: 'days' }; },
    fastestCarrierFrequency: function (r) { return { value: sampled(r.fastestCarrier && r.fastestCarrier.avgWeeklySailings), format: 'frequency' }; },

    mostReliableCarrierName: function (r) { return { value: r.mostReliableCarrier && r.mostReliableCarrier.name, format: 'text' }; },
    reliableOnTimeRate:      function (r) { return { value: sampled(r.mostReliableCarrier && r.mostReliableCarrier.onTimeRate), format: 'pct' }; },
    reliableEtdVariance:     function (r) { return { value: sampled(r.mostReliableCarrier && r.mostReliableCarrier.etdVarianceDays), format: 'days' }; },
    reliableEtaVariance:     function (r) { return { value: sampled(r.mostReliableCarrier && r.mostReliableCarrier.etaVarianceDays), format: 'days' }; },

    fclSharePct:  function (r) { var b = r.loadTypeBreakdown; return { value: b && sampled(b.fcl && b.fcl.sharePct), format: 'pct' }; },
    fclPriceFrom: function (r) { var b = r.loadTypeBreakdown; return { value: b && sampled(b.fcl && b.fcl.bestPrice), format: 'money' }; },
    lclSharePct:  function (r) { var b = r.loadTypeBreakdown; return { value: b && sampled(b.lcl && b.lcl.sharePct), format: 'pct' }; },
    lclPriceCbm:  function (r) { var b = r.loadTypeBreakdown; return { value: b && sampled(b.lcl && b.lcl.bestPrice), format: 'money' }; },

    dataAgeHours: function (r, meta) {
      var ts = meta.publishedAt;
      if (!ts) return { value: null, format: 'count' };
      return { value: Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 36e5)), format: 'count' };
    },
    dataAgeDays: function (r, meta) {
      var ts = meta.publishedAt;
      if (!ts) return { value: null, format: 'count' };
      return { value: Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 864e5)), format: 'count' };
    }
  };

  /* ------------------------------------------------------- text fields */

  function populateFields(route, meta) {
    document.querySelectorAll('[data-route-field]').forEach(function (el) {
      var key = el.getAttribute('data-route-field');
      var resolver = FIELDS[key];
      if (!resolver) { console.warn('[route-insights] unknown field:', key); return; }
      var res = resolver(route, meta);
      var format = el.getAttribute('data-route-format') || res.format;
      var text = (res.format === 'text' || format === 'text')
        ? (res.value || '\u2014')
        : fmt(res.value, format);
      el.textContent = text;

      // small-sample confidence caveat for on-time rates (API rule)
      if ((key === 'onTimeRate' || key === 'reliableOnTimeRate')) {
        var sv = key === 'onTimeRate'
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
    marketPrice: { format: 'pct', suffix: '%' }
  };

  function populateTrends(route) {
    document.querySelectorAll('[data-route-trend]').forEach(function (el) {
      var key = el.getAttribute('data-route-trend');
      var kpi = route[key];
      var cfg = TRENDS[key];
      if (!cfg || !kpi) { el.style.display = 'none'; return; }
      var cur = sampled(kpi.current), prev = sampled(kpi.previous);
      if (cur === null || prev === null) { el.style.display = 'none'; return; }

      var delta, text;
      if (key === 'marketPrice') {
        delta = prev === 0 ? 0 : ((cur - prev) / prev) * 100;
        text = (delta >= 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(Math.round(delta * 10) / 10) + '%';
      } else {
        delta = cur - prev;
        text = (delta >= 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(Math.round(delta * 10) / 10) + cfg.suffix;
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

  function destroyChart(name) {
    if (chartInstances[name]) { chartInstances[name].destroy(); delete chartInstances[name]; }
  }

  /* Shared renderer for the two line charts. They differ only in y-scale
     bounds, tick/tooltip formatting, point size and layout padding; the dark
     line, accent fill, gaps at sampleSize 0 and the accent dot on the last real
     datapoint are identical. */
  function renderLineChart(name, host, pts, opts) {
    destroyChart(name);
    var values = pts.map(function (p) { return p.sampleSize > 0 ? p.value : null; });
    var present = values.filter(function (v) { return v !== null; });
    if (!present.length) { host.setAttribute('data-empty', 'true'); host.innerHTML = ''; return; }
    host.removeAttribute('data-empty');

    // Last real datapoint: resolved once here, not re-scanned per point per frame.
    var last = values.length - 1;
    while (last >= 0 && values[last] === null) last--;

    var b = opts.bounds(Math.min.apply(null, present), Math.max.apply(null, present));

    var options = {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: { callbacks: { label: function (c) { return opts.tooltip(c.parsed.y); } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 16, weight: '600' }, color: COLORS.tick } },
        y: {
          border: { display: false },
          grid: { color: COLORS.grid, drawTicks: false },
          ticks: opts.ticks(b),
          min: b.min, max: b.max
        }
      }
    };
    // Only price-history pads its layout; leave the key absent otherwise.
    if (opts.layout) options.layout = opts.layout;

    chartInstances[name] = new Chart(mountCanvas(host), {
      type: 'line',
      data: {
        labels: pts.map(function (p) { return monthLabel(p.at); }),
        datasets: [{
          data: values,
          borderColor: COLORS.dark,
          borderWidth: 2,
          backgroundColor: COLORS.accentFill,
          fill: true,
          tension: 0,
          spanGaps: false,
          pointBackgroundColor: function (c) { return c.dataIndex === last ? COLORS.accent : 'transparent'; },
          pointBorderColor: 'transparent',
          pointRadius: function (c) { return c.dataIndex === last ? opts.pointRadius : 0; }
        }]
      },
      options: options
    });
  }

  /* Price history: 24 monthly points, windows sliced client-side.
     sampleSize:0 => null value => gap (spanGaps:false). */
  function renderPriceHistory(host, series, windowMonths) {
    renderLineChart('price-history', host, series.points.slice(-windowMonths), {
      pointRadius: 6,
      layout: { padding: { left: 20, right: 20 } },
      bounds: function (min, max) {
        var lo = Math.floor(min * 0.85 / 100) * 100;
        var hi = Math.ceil(max * 1.1 / 100) * 100;
        if (lo === hi) { lo -= 200; hi += 200; }
        return { min: lo, max: hi };
      },
      ticks: function (b) {
        return {
          stepSize: Math.max(1, Math.round((b.max - b.min) / 4)),
          font: { size: 16, weight: '600' }, color: COLORS.tick, padding: 20,
          callback: function (v) { return fmt(v, 'money'); }
        };
      },
      tooltip: function (v) { return fmt(v, 'money'); }
    });
  }

  /* Weekly delay: 8 ISO weeks. Colour by threshold (green/amber),
     inProgress bar rendered distinctly, sampleSize:0 => gap bar. */
  function renderWeeklyDelay(host, series) {
    destroyChart('weekly-delay');
    var pts = series.points;
    var threshold = typeof series.thresholdDays === 'number' ? series.thresholdDays : 2.5;
    var values = pts.map(function (p) { return p.sampleSize > 0 ? p.value : null; });
    var present = values.filter(function (v) { return v !== null; });
    var maxAbs = present.length ? Math.max.apply(null, present.map(Math.abs)) : 0;
    var minVal = present.length ? Math.min.apply(null, present) : 0;
    var yMax = Math.max(4, Math.ceil(Math.max(maxAbs, threshold) * 1.3));
    var yMin = minVal < 0 ? Math.floor(minVal * 1.3) : 0; // signed delays: early = negative

    /* Per-bar styling resolved once into arrays. Chart.js accepts arrays here,
       so this drops three scriptable callbacks that otherwise re-run for every
       bar on every frame of the draw/hover/resize cycle. */
    var barColors = pts.map(function (p, i) {
      if (!p || p.inProgress) return COLORS.inProgress;
      return values[i] >= threshold ? COLORS.amber : COLORS.accent;
    });
    var barBorders = pts.map(function (p) { return p && p.inProgress ? COLORS.grey : 'transparent'; });
    var barBorderWidths = pts.map(function (p) { return p && p.inProgress ? 1 : 0; });

    chartInstances['weekly-delay'] = new Chart(mountCanvas(host), {
      type: 'bar',
      data: {
        labels: pts.map(function (p, i) { return 'W' + (i + 1); }),
        datasets: [{
          data: values,
          backgroundColor: barColors,
          borderColor: barBorders,
          borderWidth: barBorderWidths,
          borderDash: [4, 3],
          barThickness: 28
        }]
      },
      plugins: [ChartDataLabels],
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: false }, tooltip: { enabled: false },
          datalabels: {
            anchor: 'end', align: 'end', color: COLORS.dark,
            font: { weight: '600', size: 16 },
            formatter: function (v) { return v === null ? '' : v; }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { weight: '600', size: 16 }, color: COLORS.tick }, border: { display: false } },
          y: { min: yMin, max: yMax, grid: { color: COLORS.grid, drawTicks: false }, ticks: { display: false }, border: { display: false } }
        }
      }
    });
  }

  /* Monthly transit trend: 12 months ending 2 months back. Gaps preserved. */
  function renderTransitTrend(host, series) {
    renderLineChart('transit-trend', host, series.points, {
      pointRadius: 5,
      bounds: function (min, max) {
        return { min: Math.max(0, Math.floor(min * 0.9)), max: Math.ceil(max * 1.08) };
      },
      ticks: function () {
        return {
          font: { size: 16, weight: '600' }, color: COLORS.tick,
          callback: function (v) { return v + 'd'; }
        };
      },
      tooltip: function (v) { return fmt(v, 'days') + 'd'; }
    });
  }

  /* Carrier prices: horizontal track bars, sorted ascending in JSON,
     cheapest (index 0) gets the dark accent. */
  function renderCarrierPrices(host, priceByCarrier) {
    destroyChart('carrier-prices');
    var items = (priceByCarrier && priceByCarrier.items) || [];
    if (!items.length) { host.setAttribute('data-empty', 'true'); host.innerHTML = ''; return; }
    host.removeAttribute('data-empty');

    var names = items.map(function (c) { return c.name; });
    var prices = items.map(function (c) { return c.medianPrice; });
    var trackMax = Math.ceil(Math.max.apply(null, prices) * 1.2 / 500) * 500;

    chartInstances['carrier-prices'] = new Chart(mountCanvas(host), {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          {
            data: prices.map(function () { return trackMax; }),
            backgroundColor: COLORS.track, barThickness: 14, grouped: false, order: 2, borderSkipped: false,
            datalabels: {
              anchor: 'end', align: 'end', offset: 16, color: COLORS.tick,
              font: { size: 18, weight: 'bold' },
              formatter: function (v, c) { return fmt(prices[c.dataIndex], 'money'); }
            }
          },
          {
            data: prices,
            backgroundColor: function (c) { return c.dataIndex === 0 ? COLORS.dark : COLORS.accent; },
            barThickness: 14, grouped: false, order: 1, borderSkipped: false,
            datalabels: { display: false }
          }
        ]
      },
      plugins: [ChartDataLabels],
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 80 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false, min: 0, max: trackMax },
          y: {
            grid: { display: false }, border: { display: false },
            ticks: { font: { size: 16, weight: '500' }, color: COLORS.tick, padding: 16 }
          }
        }
      }
    });
  }

  /* -------------------------------------------------- window toggles */

  function wirePriceWindows(route) {
    var host = document.querySelector('[data-route-chart="price-history"]');
    if (!host) return;
    var series = route.historicalPrice;
    var toggles = Array.prototype.slice.call(document.querySelectorAll('[data-route-window]'));

    function hasData(months) {
      return series.points.slice(-months).some(function (p) { return p.sampleSize > 0; });
    }
    function select(toggle, months) {
      toggles.forEach(function (t) { t.classList.remove('is-active'); });
      if (toggle) toggle.classList.add('is-active');
      renderPriceHistory(host, series, months);
    }

    if (!toggles.length) { renderPriceHistory(host, series, 12); return; }

    var defaultToggle = null;
    var defaultMonths = 0;
    toggles.forEach(function (t) {
      var months = parseInt(t.getAttribute('data-route-window'), 10);
      var ok = hasData(months);
      t.classList.toggle('is-disabled', !ok);
      if (!ok) return;
      t.addEventListener('click', function () { select(t, months); });
      // Prefer the 12M window; otherwise the first window that has data.
      if (!defaultToggle || (months === 12 && defaultMonths !== 12)) {
        defaultToggle = t;
        defaultMonths = months;
      }
    });
    if (defaultToggle) select(defaultToggle, defaultMonths);
    else { host.setAttribute('data-empty', 'true'); host.innerHTML = ''; }
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
    'activeCarriers', 'avgWeeklySailings', 'sailingsFrequency',
    'transitTime', 'onTimeRate', 'marketPrice',
    'departureDelay', 'arrivalDelay',
    'fastestCarrierName', 'fastestCarrierDays',
    'mostReliableCarrierName', 'reliableOnTimeRate', 'reliableEtdVariance', 'reliableEtaVariance'
  ];
  var PENDING_FIELDS = ['fclSharePct', 'fclPriceFrom', 'lclSharePct', 'lclPriceCbm'];
  var EXPECTED_TRENDS = ['transitTime', 'onTimeRate', 'marketPrice'];
  var EXPECTED_CHARTS = ['price-history', 'weekly-delay', 'transit-trend', 'carrier-prices'];

  function tagValues(attr) {
    return Array.prototype.map.call(
      document.querySelectorAll('[' + attr + ']'),
      function (el) { return el.getAttribute(attr); }
    );
  }

  function absent(expected, found) {
    return expected.filter(function (k) { return found.indexOf(k) === -1; });
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
    var unknownFields = fields.filter(function (k) { return !FIELDS[k]; });
    var pendingFound = PENDING_FIELDS.filter(function (k) { return fields.indexOf(k) !== -1; });

    // Tagged but showing the em-dash => resolver ran and the JSON had no sample.
    var blankFields = Array.prototype.filter
      .call(document.querySelectorAll('[data-route-field]'), function (el) {
        return el.textContent === '—';
      })
      .map(function (el) { return el.getAttribute('data-route-field'); });

    var emptyCharts = EXPECTED_CHARTS.filter(function (n) {
      var el = document.querySelector('[data-route-chart="' + n + '"]');
      return !!el && el.getAttribute('data-empty') === 'true';
    });

    if (state.status === 'idle') {
      problems.push('script loaded but never booted — window.Webflow never flushed its queue (is webflow.js on the page?)');
    } else if (state.status === 'no-url') {
      problems.push('no [data-route-json] URL on the page — the CMS "JSON" field is empty for this route');
    } else if (state.status === 'error') {
      problems.push('JSON failed to load from ' + state.url + ' — ' + state.error);
    } else if (state.status !== 'ready') {
      problems.push('script has not finished loading (status: ' + state.status + ')');
    }
    if (!fields.length && !charts.length) problems.push('no data-route-* attributes found at all — wrong page, or the Designer tags are missing');
    if (missingFields.length) problems.push('untagged fields: ' + missingFields.join(', '));
    if (!hasDataAge) problems.push('untagged field: dataAgeHours or dataAgeDays');
    if (unknownFields.length) problems.push('unknown data-route-field values (typo?): ' + unknownFields.join(', '));
    if (absent(EXPECTED_TRENDS, trends).length) problems.push('untagged trends: ' + absent(EXPECTED_TRENDS, trends).join(', '));
    if (absent(EXPECTED_CHARTS, charts).length) problems.push('missing chart containers: ' + absent(EXPECTED_CHARTS, charts).join(', '));
    if (!windows.length) problems.push('no [data-route-window] toggles — price chart defaults to 12M');
    if (emptyCharts.length) problems.push('charts with no data in this JSON: ' + emptyCharts.join(', '));

    /* The payload names the route it describes (origin/destination locodes).
       The script cannot verify that against the page automatically — route
       identity is CMS-only and no locode attributes exist here — so surface it
       for a human to eyeball. A JSON URL pasted onto the wrong CMS item is
       otherwise invisible: the page renders confidently wrong numbers. */
    var payload = state.data;
    var routeId = payload && payload.origin && payload.destination
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
        publishedAt: state.meta && state.meta.publishedAt
      },
      fields: {
        tagged: fields.length,
        expected: EXPECTED_FIELDS.length + 1, // + dataAge
        missing: missingFields.concat(hasDataAge ? [] : ['dataAgeHours|dataAgeDays']),
        unknown: unknownFields,
        pendingTagged: pendingFound,
        pendingUntagged: absent(PENDING_FIELDS, fields),
        showingDash: blankFields
      },
      trends: { tagged: trends, missing: absent(EXPECTED_TRENDS, trends) },
      charts: { tagged: charts, missing: absent(EXPECTED_CHARTS, charts), empty: emptyCharts },
      windows: {
        tagged: windows,
        active: (document.querySelector('[data-route-window].is-active') || {
          getAttribute: function () { return null; }
        }).getAttribute('data-route-window'),
        disabled: Array.prototype.map.call(
          document.querySelectorAll('[data-route-window].is-disabled'),
          function (el) { return el.getAttribute('data-route-window'); }
        )
      }
    };

    var head = report.ok
      ? '✅ route-insights OK — ' + (routeId ? routeId + ', ' : '') + report.fields.tagged +
        ' fields, ' + report.charts.tagged.length + ' charts, JSON ' +
        (state.ms != null ? state.ms + 'ms' : 'n/a')
      : '⚠️ route-insights: ' + problems.length + ' issue(s)' + (routeId ? ' — JSON is ' + routeId : '');

    if (console.groupCollapsed) {
      console.groupCollapsed(head);
      problems.forEach(function (p) { console.warn('• ' + p); });
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
    status: 'idle', url: null, data: null, meta: null,
    error: null, httpStatus: null, ms: null, check: check
  };

  function boot() {
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
        if (delayHost && route.weeklyDelayCongestion) renderWeeklyDelay(delayHost, route.weeklyDelayCongestion);
        var trendHost = document.querySelector('[data-route-chart="transit-trend"]');
        if (trendHost && route.monthlyTransitTrend) renderTransitTrend(trendHost, route.monthlyTransitTrend);
        var carrierHost = document.querySelector('[data-route-chart="carrier-prices"]');
        if (carrierHost) renderCarrierPrices(carrierHost, route.priceByCarrier);

        setState('ready', { data: route, meta: meta, ms: Date.now() - t0 });
        document.dispatchEvent(new CustomEvent('route-insights:ready', { detail: window.RouteInsights }));
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

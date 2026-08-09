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
import { Chart } from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';

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

  /* Price history: 24 monthly points, windows sliced client-side.
     sampleSize:0 => null value => gap (spanGaps:false). */
  function renderPriceHistory(host, series, windowMonths) {
    destroyChart('price-history');
    var pts = series.points.slice(-windowMonths);
    var values = pts.map(function (p) { return p.sampleSize > 0 ? p.value : null; });
    var present = values.filter(function (v) { return v !== null; });
    if (!present.length) { host.setAttribute('data-empty', 'true'); host.innerHTML = ''; return; }
    host.removeAttribute('data-empty');

    var yMin = Math.floor(Math.min.apply(null, present) * 0.85 / 100) * 100;
    var yMax = Math.ceil(Math.max.apply(null, present) * 1.1 / 100) * 100;
    if (yMin === yMax) { yMin -= 200; yMax += 200; }

    chartInstances['price-history'] = new Chart(mountCanvas(host), {
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
          pointBackgroundColor: function (c) {
            var d = c.dataset.data, i = c.dataIndex;
            for (var last = d.length - 1; last >= 0 && d[last] === null; last--);
            return i === last ? COLORS.accent : 'transparent';
          },
          pointBorderColor: 'transparent',
          pointRadius: function (c) {
            var d = c.dataset.data, i = c.dataIndex;
            for (var last = d.length - 1; last >= 0 && d[last] === null; last--);
            return i === last ? 6 : 0;
          }
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: { callbacks: { label: function (c) { return fmt(c.parsed.y, 'money'); } } }
        },
        layout: { padding: { left: 20, right: 20 } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 16, weight: '600' }, color: COLORS.tick } },
          y: {
            border: { display: false },
            grid: { color: COLORS.grid, drawTicks: false },
            ticks: {
              stepSize: Math.max(1, Math.round((yMax - yMin) / 4)),
              font: { size: 16, weight: '600' }, color: COLORS.tick, padding: 20,
              callback: function (v) { return fmt(v, 'money'); }
            },
            min: yMin, max: yMax
          }
        }
      }
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

    chartInstances['weekly-delay'] = new Chart(mountCanvas(host), {
      type: 'bar',
      data: {
        labels: pts.map(function (p, i) { return 'W' + (i + 1); }),
        datasets: [{
          data: values,
          backgroundColor: function (c) {
            var p = pts[c.dataIndex];
            if (!p || p.inProgress) return COLORS.inProgress;
            return (c.parsed.y >= threshold) ? COLORS.amber : COLORS.accent;
          },
          borderColor: function (c) {
            var p = pts[c.dataIndex];
            return p && p.inProgress ? COLORS.grey : 'transparent';
          },
          borderWidth: function (c) { var p = pts[c.dataIndex]; return p && p.inProgress ? 1 : 0; },
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
    destroyChart('transit-trend');
    var pts = series.points;
    var values = pts.map(function (p) { return p.sampleSize > 0 ? p.value : null; });
    var present = values.filter(function (v) { return v !== null; });
    if (!present.length) { host.setAttribute('data-empty', 'true'); host.innerHTML = ''; return; }
    host.removeAttribute('data-empty');

    var yMin = Math.max(0, Math.floor(Math.min.apply(null, present) * 0.9));
    var yMax = Math.ceil(Math.max.apply(null, present) * 1.08);

    chartInstances['transit-trend'] = new Chart(mountCanvas(host), {
      type: 'line',
      data: {
        labels: pts.map(function (p) { return monthLabel(p.at); }),
        datasets: [{
          data: values,
          borderColor: COLORS.dark, borderWidth: 2,
          backgroundColor: COLORS.accentFill, fill: true, tension: 0, spanGaps: false,
          pointBackgroundColor: function (c) {
            var d = c.dataset.data, i = c.dataIndex;
            for (var last = d.length - 1; last >= 0 && d[last] === null; last--);
            return i === last ? COLORS.accent : 'transparent';
          },
          pointBorderColor: 'transparent',
          pointRadius: function (c) {
            var d = c.dataset.data, i = c.dataIndex;
            for (var last = d.length - 1; last >= 0 && d[last] === null; last--);
            return i === last ? 5 : 0;
          }
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: { callbacks: { label: function (c) { return fmt(c.parsed.y, 'days') + 'd'; } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 16, weight: '600' }, color: COLORS.tick } },
          y: {
            border: { display: false }, grid: { color: COLORS.grid, drawTicks: false },
            ticks: { font: { size: 16, weight: '600' }, color: COLORS.tick, callback: function (v) { return v + 'd'; } },
            min: yMin, max: yMax
          }
        }
      }
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
    toggles.forEach(function (t) {
      var months = parseInt(t.getAttribute('data-route-window'), 10);
      var ok = hasData(months);
      t.classList.toggle('is-disabled', !ok);
      if (ok) {
        t.addEventListener('click', function () { select(t, months); });
        if (months === 12 || (!defaultToggle && ok)) defaultToggle = defaultToggle && parseInt(defaultToggle.getAttribute('data-route-window'), 10) === 12 ? defaultToggle : (months === 12 ? t : (defaultToggle || t));
      }
    });
    if (defaultToggle) select(defaultToggle, parseInt(defaultToggle.getAttribute('data-route-window'), 10));
    else { host.setAttribute('data-empty', 'true'); host.innerHTML = ''; }
  }

  /* ------------------------------------------------------------- boot */

  function resolveUrl() {
    var el = document.querySelector('[data-route-json]');
    var url = el && el.getAttribute('data-route-json');
    return url && url.indexOf('http') === 0 ? url : null;
  }

  function boot() {
    var url = resolveUrl();
    if (!url) return; // not a route page / not configured

    fetch(url)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
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

        window.RouteInsights = { url: url, data: route, meta: meta };
        document.dispatchEvent(new CustomEvent('route-insights:ready', { detail: window.RouteInsights }));
      })
      .catch(function (err) {
        console.error('[route-insights] failed:', err);
        document.documentElement.setAttribute('data-route-insights', 'error');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

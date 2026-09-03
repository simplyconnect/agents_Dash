/**
 * charts.js — thin wrappers around Chart.js so every chart in the
 * dashboard shares the same brand look (amber/black), the same fonts,
 * and the same entrance animation. dashboard.js calls these; nothing
 * here knows about tabs or filters.
 */

const CHARTS = (function () {
  const registry = {}; // canvasId -> Chart instance, so we can destroy + rebuild on filter changes

  const PALETTE = ['#FDAC00', '#0B0B0B', '#FF8A00', '#2B6CB0', '#1C9A5B', '#8A6BFF', '#E5484D', '#C77D00'];

  // If the Chart.js CDN is ever slow/blocked (corporate proxy, ad-blocker,
  // offline preview, etc.) we don't want that to cascade into breaking
  // every other widget on the page — KPI cards, ranked lists and the
  // funnel are plain HTML and should still work fine on their own.
  const hasChart = typeof Chart !== 'undefined';
  if (hasChart) {
    Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
    Chart.defaults.color = '#4A4A4A';
    Chart.defaults.animation.duration = 900;
    Chart.defaults.animation.easing = 'easeOutQuart';
  } else if (window.console) {
    console.warn('Chart.js did not load — charts will be skipped, everything else keeps working.');
  }

  function guard(canvasId, fn) {
    if (!hasChart) return null;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    try { return fn(); } catch (err) { console.warn('Chart render failed for #' + canvasId, err); return null; }
  }

  function destroy(id) {
    if (registry[id]) { registry[id].destroy(); delete registry[id]; }
  }

  function amberGradient(ctx, area) {
    const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, 'rgba(253,172,0,0.35)');
    g.addColorStop(1, 'rgba(253,172,0,0.02)');
    return g;
  }

  function baseGrid() {
    return { color: '#F0EEE9', drawTicks: false };
  }

  // ---- Line chart (trend) ----------------------------------------------
  function lineChart(canvasId, labels, datasets, opts) {
    return guard(canvasId, function () {
    opts = opts || {};
    destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    registry[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets.map(function (ds, i) {
          return Object.assign({
            borderColor: PALETTE[i % PALETTE.length],
            backgroundColor: i === 0 ? function (c) {
              return c.chart.chartArea ? amberGradient(c.chart.ctx, c.chart.chartArea) : 'rgba(253,172,0,.2)';
            } : 'transparent',
            fill: i === 0,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: PALETTE[i % PALETTE.length],
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2
          }, ds);
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: datasets.length > 1, position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 11, weight: '600' } } },
          tooltip: tooltipStyle()
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
          y: { grid: baseGrid(), ticks: { font: { size: 10.5 } }, beginAtZero: true }
        }
      }
    });
    return registry[canvasId];
    });
  }

  // ---- Bar chart ----------------------------------------------------
  function barChart(canvasId, labels, datasets, opts) {
    return guard(canvasId, function () {
    opts = opts || {};
    destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    registry[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: datasets.map(function (ds, i) {
          return Object.assign({
            backgroundColor: ds.backgroundColor || PALETTE[i % PALETTE.length],
            borderRadius: 6, borderSkipped: false,
            maxBarThickness: opts.horizontal ? 16 : 34
          }, ds);
        })
      },
      options: {
        indexAxis: opts.horizontal ? 'y' : 'x',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: datasets.length > 1, position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 11, weight: '600' } } },
          tooltip: tooltipStyle()
        },
        scales: {
          x: { grid: opts.horizontal ? baseGrid() : { display: false }, ticks: { font: { size: 10.5 } } },
          y: { grid: opts.horizontal ? { display: false } : baseGrid(), ticks: { font: { size: 10.5 } }, beginAtZero: true }
        }
      }
    });
    return registry[canvasId];
    });
  }

  // ---- Doughnut ----------------------------------------------------
  function doughnutChart(canvasId, labels, values, opts) {
    return guard(canvasId, function () {
    opts = opts || {};
    destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    registry[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values, backgroundColor: opts.colors || PALETTE, borderWidth: 3, borderColor: '#fff',
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 11, weight: '600' }, padding: 14 } },
          tooltip: tooltipStyle()
        }
      }
    });
    return registry[canvasId];
    });
  }

  // ---- Radar (team comparison) ----------------------------------------------------
  function radarChart(canvasId, labels, datasets) {
    return guard(canvasId, function () {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    registry[canvasId] = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: datasets.map(function (ds, i) {
          return Object.assign({
            borderColor: PALETTE[i % PALETTE.length],
            backgroundColor: PALETTE[i % PALETTE.length] + '26',
            borderWidth: 2, pointRadius: 2
          }, ds);
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 11, weight: '600' } } }, tooltip: tooltipStyle() },
        scales: { r: { grid: { color: '#F0EEE9' }, angleLines: { color: '#F0EEE9' }, ticks: { display: false }, pointLabels: { font: { size: 10.5, weight: '600' } } } }
      }
    });
    return registry[canvasId];
    });
  }

  function tooltipStyle() {
    return {
      backgroundColor: '#0B0B0B', titleColor: '#FDAC00', bodyColor: '#fff',
      padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4,
      titleFont: { size: 11.5, weight: '700' }, bodyFont: { size: 11.5 }
    };
  }

  return { lineChart: lineChart, barChart: barChart, doughnutChart: doughnutChart, radarChart: radarChart, destroy: destroy, PALETTE: PALETTE };
})();

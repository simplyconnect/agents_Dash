/**
 * dashboard.js — the app itself: tabs, filters, and turning DASH's numbers
 * into the actual page markup + charts for each of the 7 sections.
 */

(function () {
  const STATE = {
    tab: 'overview',
    period: 'daily',
    filters: { start: '', end: '', team: '', campaign: '', state: '', agent: '', callresult: '', search: '' },
    sort: {} // per-table sort state: { tableId: { key, dir } }
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls();
    wireChrome();
    wireFilters();
    wireModal();

    const start = new Date(); start.setDate(start.getDate() - 29);
    STATE.filters.start = els.dateStart.value = fmtInput(start);
    STATE.filters.end = els.dateEnd.value = fmtInput(new Date());

    await loadData(true);
    populateFilterOptions();
    renderTab(STATE.tab);

    // Auto-refresh every 5 minutes if we're on a live connection.
    setInterval(function () { if (DASH.isConnected()) loadData(false).then(function () { renderTab(STATE.tab); }); }, 5 * 60 * 1000);
  }

  function cacheEls() {
    ['sidebar', 'sidebarToggle', 'pageTitle', 'contentArea', 'dataStatus', 'refreshBtn', 'dataRange', 'dataRangeText',
      'dateStart', 'dateEnd', 'filterTeam', 'filterCampaign', 'filterState', 'filterAgent', 'filterCallResult',
      'globalSearch', 'clearFilters', 'exportCsvBtn', 'toast', 'gasModal', 'gasModalClose', 'gasCodeBlock']
      .forEach(function (id) { els[id] = document.getElementById(id); });
    els.navItems = document.querySelectorAll('.nav-item');
    els.periodTabs = document.querySelectorAll('.period-tab');
  }

  // =========================================================================
  // CHROME: sidebar, nav, refresh, status pill
  // =========================================================================

  function wireChrome() {
    els.sidebarToggle.addEventListener('click', function () {
      document.querySelector('.layout').classList.toggle('sidebar-collapsed');
    });

    els.navItems.forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        els.navItems.forEach(function (n) { n.classList.remove('active'); });
        item.classList.add('active');
        STATE.tab = item.dataset.tab;
        renderTab(STATE.tab);
        if (window.innerWidth <= 980) document.querySelector('.layout').classList.remove('sidebar-collapsed');
      });
    });

    els.refreshBtn.addEventListener('click', async function () {
      els.refreshBtn.classList.add('spinning');
      await loadData(false);
      renderTab(STATE.tab);
      populateFilterOptions();
      els.refreshBtn.classList.remove('spinning');
      showToast(DASH.isConnected() ? 'Data refreshed' : 'Showing demo data — add your API URL in API Setup', DASH.isConnected() ? 'success' : 'error');
    });
  }

  async function loadData(isInitial) {
    try {
      await DASH.fetchData();
      setStatus('live', 'Live data');
    } catch (err) {
      DASH.loadDemoData();
      setStatus('stale', err.message === 'NO_API_URL' ? 'Demo data' : 'Connection failed');
      if (!isInitial) showToast('Could not reach your Apps Script API — ' + err.message, 'error');
    }
    updateDataRangeUI();
  }

  function updateDataRangeUI() {
    const range = DASH.getDataDateRange();
    const generatedAt = DASH.getGeneratedAt();
    if (!range.min || !range.max) {
      els.dataRangeText.textContent = 'No data yet';
      els.dataRange.title = 'Connect your Google Sheet in API Setup to load data.';
      return;
    }
    els.dataRangeText.textContent = fmtLongDate(range.min) + '  →  ' + fmtLongDate(range.max);
    const syncedText = generatedAt ? new Date(generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'just now';
    els.dataRange.title = 'Every row currently loaded spans this range. Last synced from your Sheet: ' + syncedText + (DASH.isDemo() ? ' (demo data — connect your Sheet in API Setup).' : '.');
  }

  function fmtLongDate(dateStr) {
    const dt = new Date(dateStr + 'T00:00:00');
    if (isNaN(dt.getTime())) return dateStr;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function setStatus(cls, text) {
    const dot = els.dataStatus.querySelector('.status-dot');
    dot.className = 'status-dot ' + cls;
    els.dataStatus.querySelector('.status-text').textContent = text;
  }

  function showToast(msg, type) {
    els.toast.textContent = msg;
    els.toast.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { els.toast.className = 'toast'; }, 3200);
  }

  // =========================================================================
  // FILTERS
  // =========================================================================

  function wireFilters() {
    els.periodTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        els.periodTabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        STATE.period = tab.dataset.period;
        if (STATE.tab === 'overview') renderTab('overview');
      });
    });

    ['dateStart', 'dateEnd'].forEach(function (id) {
      els[id].addEventListener('change', function () {
        STATE.filters.start = els.dateStart.value;
        STATE.filters.end = els.dateEnd.value;
        renderTab(STATE.tab);
      });
    });
    ['filterTeam', 'filterCampaign', 'filterState', 'filterAgent', 'filterCallResult'].forEach(function (id) {
      const key = id.replace('filter', '').toLowerCase();
      els[id].addEventListener('change', function () {
        STATE.filters[key] = els[id].value;
        renderTab(STATE.tab);
      });
    });
    let searchDebounce;
    els.globalSearch.addEventListener('input', function () {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(function () {
        STATE.filters.search = els.globalSearch.value;
        renderTab(STATE.tab);
      }, 250);
    });

    els.clearFilters.addEventListener('click', function () {
      STATE.filters = { start: STATE.filters.start, end: STATE.filters.end, team: '', campaign: '', state: '', agent: '', callresult: '', search: '' };
      els.filterTeam.value = els.filterCampaign.value = els.filterState.value = els.filterAgent.value = els.filterCallResult.value = '';
      els.globalSearch.value = '';
      renderTab(STATE.tab);
    });

    els.exportCsvBtn.addEventListener('click', exportCurrentView);
  }

  function populateFilterOptions() {
    const opts = DASH.getFilterOptions();
    fillSelect(els.filterTeam, opts.teams, 'All teams');
    fillSelect(els.filterCampaign, opts.campaigns, 'All campaigns');
    fillSelect(els.filterState, opts.states, 'All states');
    fillSelect(els.filterAgent, opts.agents, 'All agents');
    fillSelect(els.filterCallResult, opts.callResults, 'All results');
  }
  function fillSelect(select, values, placeholder) {
    const current = select.value;
    select.innerHTML = '<option value="">' + placeholder + '</option>' +
      values.map(function (v) { return '<option' + (v === current ? ' selected' : '') + '>' + v + '</option>'; }).join('');
  }

  function getFilteredData() { return DASH.applyFilters(STATE.filters); }

  function fmtInput(d) { return d.toISOString().slice(0, 10); }

  // =========================================================================
  // TAB ROUTER
  // =========================================================================

  const TAB_META = {
    overview: { title: 'Overview', sub: 'Sales performance summary' },
    agents: { title: 'Agent Rankings', sub: 'Leaderboard across calls, sales, RGUs and points' },
    teams: { title: 'Teams', sub: 'Side-by-side team comparison' },
    states: { title: 'State Analytics', sub: 'Where sales are coming from' },
    campaigns: { title: 'Campaigns', sub: 'Performance by call center / campaign group' },
    insights: { title: 'Insights', sub: 'Auto-generated highlights from your data' },
    api: { title: 'API Setup', sub: 'Connect your Google Sheet to this dashboard' }
  };

  function renderTab(tab) {
    const meta = TAB_META[tab];
    document.getElementById('pageTitle').textContent = meta.title;
    document.querySelector('.page-sub').textContent = meta.sub + (DASH.isDemo() ? ' · showing demo data' : '');
    document.querySelector('.slicer-bar').style.display = tab === 'api' ? 'none' : 'flex';

    const { calls, sales } = tab === 'api' ? { calls: [], sales: [] } : getFilteredData();
    let html = '';
    switch (tab) {
      case 'overview': html = renderOverview(calls, sales); break;
      case 'agents': html = renderAgents(calls, sales); break;
      case 'teams': html = renderTeams(calls, sales); break;
      case 'states': html = renderStates(sales); break;
      case 'campaigns': html = renderCampaigns(calls, sales); break;
      case 'insights': html = renderInsights(calls, sales); break;
      case 'api': html = renderApiSetup(); break;
    }
    els.contentArea.innerHTML = html;

    // Charts + interactive bits need DOM to exist first, so build them after injection.
    switch (tab) {
      case 'overview': afterOverview(calls, sales); break;
      case 'agents': afterAgents(calls, sales); break;
      case 'teams': afterTeams(calls, sales); break;
      case 'states': afterStates(sales); break;
      case 'campaigns': afterCampaigns(calls, sales); break;
      case 'insights': afterInsights(calls, sales); break;
      case 'api': afterApiSetup(); break;
    }
  }

  // =========================================================================
  // KPI CARD HELPER
  // =========================================================================

  function kpiCard(opts) {
    return '<div class="kpi-card">' +
      '<div class="kpi-top"><div class="kpi-icon">' + opts.icon + '</div>' +
      (opts.trend != null ? '<span class="kpi-trend ' + (opts.trend > 0 ? 'up' : opts.trend < 0 ? 'down' : 'flat') + '">' + (opts.trend > 0 ? '▲' : opts.trend < 0 ? '▼' : '–') + ' ' + Math.abs(Math.round(opts.trend * 10) / 10) + '%</span>' : '') +
      '</div>' +
      '<div class="kpi-value" data-countup="' + opts.raw + '" data-format="' + opts.format + '">' + opts.value + '</div>' +
      '<div class="kpi-label">' + opts.label + '</div>' +
      '<div class="kpi-help">' + opts.help + '</div></div>';
  }

  function animateCountUps(root) {
    root.querySelectorAll('[data-countup]').forEach(function (el) {
      const to = parseFloat(el.dataset.countup);
      const fmt = el.dataset.format;
      const start = performance.now();
      const dur = 700;
      function tick(now) {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = to * eased;
        el.textContent = formatKpi(val, fmt);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = formatKpi(to, fmt);
      }
      requestAnimationFrame(tick);
    });
  }
  function formatKpi(val, fmt) {
    if (fmt === 'pct') return DASH.fmtPct(val);
    if (fmt === 'sec') return DASH.fmtSeconds(val);
    return DASH.fmtNum(val);
  }

  const ICONS = {
    calls: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    sales: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    rgu: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/></svg>',
    points: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2"/></svg>',
    clock: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    users: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    target: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    alert: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    trophy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3a2 2 0 0 1-2 4h-1M7 5H4a2 2 0 0 0 2 4h1"/></svg>',
    mapPin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    flame: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7.5 7.5 0 1 1-15 0c0-1.153.433-2.294 1-3 1.36-1.7 2.5-2.5 2.5-4.5z"/></svg>',
    zap: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    arrowDown: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>'
  };

  const CALL_RESULT_COLORS = {
    'Answered': '#1C9A5B', 'Overflow - Time': '#FDAC00', 'Stranded - Unavailable': '#E5484D',
    'Abandoned': '#C0392B', 'Stranded': '#FF8A00', 'Transferred': '#2B6CB0', 'Escaped': '#8A6BFF'
  };

  // ---- Reusable "outstanding" visual components -------------------------

  function statBarList(entries) {
    // entries: [{ label, value, color }], sorted desc, rendered as colored ranked bars
    const total = entries.reduce(function (s, e) { return s + e.value; }, 0) || 1;
    return '<div class="stat-bar-list">' + entries.map(function (e) {
      const pct = Math.round((e.value / total) * 1000) / 10;
      return '<div class="stat-bar-item">' +
        '<span class="stat-bar-dot" style="background:' + e.color + '"></span>' +
        '<span class="stat-bar-label">' + e.label + '</span>' +
        '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:' + pct + '%;background:' + e.color + '"></div></div>' +
        '<span class="stat-bar-value">' + DASH.fmtNum(e.value) + ' · ' + pct + '%</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function colorForIndex(i) { return CHARTS.PALETTE[i % CHARTS.PALETTE.length]; }

  function breakdownToEntries(map, colorFn) {
    return Object.entries(map).sort(function (a, b) { return b[1] - a[1]; })
      .map(function (pair, i) { return { label: pair[0], value: pair[1], color: colorFn ? colorFn(pair[0], i) : colorForIndex(i) }; });
  }

  function funnelHtml(stages) {
    // stages: [{ label, value }] in descending order of the funnel
    const max = stages[0] ? stages[0].value : 1;
    let html = '<div class="funnel">';
    stages.forEach(function (s, i) {
      const widthPct = Math.max(18, Math.round((s.value / max) * 100));
      html += '<div class="funnel-stage"><div class="funnel-bar stage-' + (i + 1) + '" style="width:' + widthPct + '%;animation-delay:' + (i * 0.12) + 's">' +
        '<span class="funnel-label">' + s.label + '</span><span class="funnel-value">' + DASH.fmtNum(s.value) + '</span></div></div>';
      if (i < stages.length - 1) {
        const next = stages[i + 1];
        const dropPct = s.value ? Math.round((next.value / s.value) * 1000) / 10 : 0;
        html += '<div class="funnel-drop">' + ICONS.arrowDown + ' ' + dropPct + '% carried through</div>';
      }
    });
    return html + '</div>';
  }

  function heroCard(icon, value, label, accent) {
    return '<div class="hero-card' + (accent ? ' accent' : '') + '"><div class="hero-icon">' + icon + '</div>' +
      '<div class="hero-value">' + value + '</div><div class="hero-label">' + label + '</div></div>';
  }

  // =========================================================================
  // OVERVIEW
  // =========================================================================

  function renderOverview(calls, sales) {
    const k = DASH.computeKpis(calls, sales);
    return '' +
      '<div class="kpi-grid">' +
        kpiCard({ icon: ICONS.calls, raw: k.totalCalls, format: 'num', value: '0', label: 'Total Calls', help: 'Every inbound call logged in the selected date range, across all campaigns.' }) +
        kpiCard({ icon: ICONS.target, raw: k.answerRate, format: 'pct', value: '0%', label: 'Answer Rate', help: 'Share of calls where Call Result = Answered. ' + DASH.fmtNum(k.answeredCalls) + ' of ' + DASH.fmtNum(k.totalCalls) + ' calls.' }) +
        kpiCard({ icon: ICONS.sales, raw: k.totalSales, format: 'num', value: '0', label: 'Total Sales', help: 'Rows logged in the sales sheet for this range — one row per processed order.' }) +
        kpiCard({ icon: ICONS.target, raw: k.conversionRate, format: 'pct', value: '0%', label: 'Conversion Rate', help: 'Sales ÷ Answered calls. How often an answered call turns into a sale.' }) +
        kpiCard({ icon: ICONS.rgu, raw: k.totalRgus, format: 'num', value: '0', label: 'Total RGUs', help: 'Revenue Generating Units sold — the industry count of billable services per order.' }) +
        kpiCard({ icon: ICONS.points, raw: k.totalPoints, format: 'num', value: '0', label: 'Total Points', help: 'Sum of the incentive points column — your team\'s commission/scoreboard metric.' }) +
        kpiCard({ icon: ICONS.clock, raw: k.avgTalkTime, format: 'sec', value: '0', label: 'Avg. Talk Time', help: 'Average talk duration on answered calls — a proxy for call depth/quality.' }) +
        kpiCard({ icon: ICONS.users, raw: k.activeAgents, format: 'num', value: '0', label: 'Active Agents', help: 'Distinct agents who closed at least one sale in this range.' }) +
      '</div>' +

      '<div class="section-heading"><div><h2>Calls &amp; sales trend</h2><p>How volume moved day by day over the selected range</p></div></div>' +
      '<div class="chart-grid cols-2">' +
        chartCard('trendChart', 'chart-canvas-wrap h-280', 'Daily calls vs. sales', 'Line chart — left axis shows total call volume, and sales are plotted on the same timeline so you can see conversion visually track alongside volume.', 'Trend') +
        chartCard('answerRateChart', 'chart-canvas-wrap h-280', 'Answer rate over time', 'The % of calls answered each day. A falling line usually means the phone lines are understaffed for the volume coming in.', 'Trend') +
      '</div>' +

      '<div class="section-heading"><div><h2>From ring to revenue</h2><p>How every call ultimately turns (or doesn\'t turn) into a sale</p></div></div>' +
      '<div class="chart-grid cols-2">' +
        '<div class="chart-card"><div class="chart-card-hdr"><h3>Call → Sale funnel</h3><span class="chart-badge">Funnel</span></div>' +
          '<p class="chart-explain">Total calls received, how many were actually answered, and how many of those answered calls closed as a sale.</p>' +
          funnelHtml(funnelStages(calls, sales)) +
        '</div>' +
        '<div class="chart-card"><div class="chart-card-hdr"><h3>Call result breakdown</h3><span class="chart-badge">Live</span></div>' +
          '<p class="chart-explain">Every call bucketed by its final result. A large Abandoned/Stranded share signals lost revenue sitting in the queue.</p>' +
          '<div class="chart-canvas-wrap h-220"><canvas id="dispositionChart"></canvas></div>' +
        '</div>' +
      '</div>' +

      '<div class="section-heading"><div><h2>Staffing load</h2><p>When calls actually arrive during the day</p></div></div>' +
      '<div class="chart-grid cols-2">' +
        chartCard('hourlyChart', 'chart-canvas-wrap h-220', 'Call volume by hour', 'Total calls received in each hour of the day, summed across the whole range — use it to plan agent shifts and breaks.', '') +
        '<div class="chart-card"><div class="chart-card-hdr"><h3>Top result types</h3><span class="chart-badge">Ranked</span></div>' +
          '<p class="chart-explain">The same call-result data as the chart on the left, ranked with exact counts and share of total.</p>' +
          '<div id="dispositionRanked"></div>' +
        '</div>' +
      '</div>';
  }

  function funnelStages(calls, sales) {
    const answered = calls.filter(function (c) { return c['Call Result'] === 'Answered'; }).length;
    return [
      { label: 'Total Calls', value: calls.length },
      { label: 'Answered', value: answered },
      { label: 'Closed as Sale', value: sales.length }
    ];
  }

  function chartCard(canvasId, wrapClass, title, explain, badge) {
    return '<div class="chart-card"><div class="chart-card-hdr"><h3>' + title + '</h3>' + (badge ? '<span class="chart-badge">' + badge + '</span>' : '') + '</div>' +
      '<p class="chart-explain">' + explain + '</p>' +
      '<div class="' + wrapClass + '"><canvas id="' + canvasId + '"></canvas></div></div>';
  }

  function afterOverview(calls, sales) {
    animateCountUps(els.contentArea);
    const trend = groupTrendByPeriod(DASH.dailyTrend(calls, sales), STATE.period);
    CHARTS.lineChart('trendChart', trend.map(function (d) { return DASH.fmtDate(d.date); }),
      [{ label: 'Calls', data: trend.map(function (d) { return d.calls; }) },
       { label: 'Sales', data: trend.map(function (d) { return d.sales; }), borderColor: CHARTS.PALETTE[1], yAxisID: 'y' }]);

    CHARTS.lineChart('answerRateChart', trend.map(function (d) { return DASH.fmtDate(d.date); }),
      [{ label: 'Answer rate %', data: trend.map(function (d) { return d.calls ? Math.round((d.answered / d.calls) * 1000) / 10 : 0; }) }]);

    const disp = DASH.dispositionBreakdown(calls);
    const dispEntries = breakdownToEntries(disp, function (label) { return CALL_RESULT_COLORS[label] || colorForIndex(0); });
    CHARTS.doughnutChart('dispositionChart', dispEntries.map(function (e) { return e.label; }), dispEntries.map(function (e) { return e.value; }),
      { colors: dispEntries.map(function (e) { return e.color; }) });
    document.getElementById('dispositionRanked').innerHTML = statBarList(dispEntries);

    const hours = DASH.hourlyVolume(calls);
    const hourLabels = Object.keys(hours).map(function (h) { return (h % 12 || 12) + (h < 12 ? 'am' : 'pm'); });
    CHARTS.barChart('hourlyChart', hourLabels, [{ label: 'Calls', data: Object.values(hours), backgroundColor: 'rgba(253,172,0,.85)' }]);
  }

  function groupTrendByPeriod(rows, period) {
    if (period === 'daily') return rows;
    const map = {};
    rows.forEach(function (r) {
      const d = new Date(r.date + 'T00:00:00');
      let key;
      if (period === 'weekly') {
        const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        key = monday.toISOString().slice(0, 10);
      } else {
        key = r.date.slice(0, 7) + '-01';
      }
      map[key] = map[key] || { date: key, calls: 0, answered: 0, sales: 0 };
      map[key].calls += r.calls; map[key].answered += r.answered; map[key].sales += r.sales;
    });
    return Object.values(map).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  // =========================================================================
  // AGENT RANKINGS
  // =========================================================================

  function renderAgents(calls, sales) {
    const rows = sortRows(DASH.agentLeaderboard(calls, sales), 'agents', { key: 'points', dir: 'desc' });
    const maxPoints = Math.max(1, rows[0] ? rows[0].points : 1);
    return '' +
      '<div class="section-heading"><div><h2>Agent leaderboard</h2><p>Ranked by incentive points earned in the selected range · click a column to sort</p></div></div>' +
      '<div class="table-card"><table class="data-table" id="agentsTable"><thead><tr>' +
        th('#', null) + th('Agent', 'agent') + th('Team', 'team') + th('Calls Handled', 'callsHandled') +
        th('Answered', 'callsAnswered') + th('Sales', 'sales') + th('RGUs', 'rgus') + th('Conversion', 'conversion') +
        th('Avg Talk', 'avgTalk') + th('Points', 'points') +
      '</tr></thead><tbody>' +
      (rows.length ? rows.map(function (r, i) { return agentRow(r, i, maxPoints); }).join('') : emptyRow(10)) +
      '</tbody></table></div>' +

      '<div class="section-heading"><div><h2>Top 10 by points</h2><p>Your highest earners this range, side by side</p></div></div>' +
      chartCard('agentBarChart', 'chart-canvas-wrap h-320', 'Points by agent', 'The Total Points column summed per agent — your incentive/commission scoreboard.', 'Top 10');
  }

  function agentRow(r, i, maxPoints) {
    const rank = i + 1;
    return '<tr>' +
      '<td><span class="rank-badge' + (rank <= 3 ? ' rank-' + rank : '') + '">' + rank + '</span></td>' +
      '<td><div class="agent-cell"><span class="agent-avatar">' + DASH.initials(r.agent) + '</span>' + r.agent + '</div></td>' +
      '<td>' + (r.team || '—') + '</td>' +
      '<td>' + DASH.fmtNum(r.callsHandled) + '</td>' +
      '<td>' + DASH.fmtNum(r.callsAnswered) + '</td>' +
      '<td><strong>' + DASH.fmtNum(r.sales) + '</strong></td>' +
      '<td>' + DASH.fmtNum(r.rgus) + '</td>' +
      '<td>' + DASH.fmtPct(r.conversion) + '</td>' +
      '<td>' + DASH.fmtSeconds(r.avgTalk) + '</td>' +
      '<td><div class="progress-track"><div class="progress-fill" style="width:' + (r.points / maxPoints * 100) + '%"></div></div> ' + DASH.fmtNum(r.points) + '</td>' +
    '</tr>';
  }

  function afterAgents(calls, sales) {
    const rows = DASH.agentLeaderboard(calls, sales).slice(0, 10);
    CHARTS.barChart('agentBarChart', rows.map(function (r) { return r.agent; }), [{ label: 'Points', data: rows.map(function (r) { return r.points; }) }], { horizontal: true });
    wireSort('agentsTable', 'agents', function () { renderTab('agents'); });
  }

  // =========================================================================
  // TEAMS
  // =========================================================================

  function renderTeams(calls, sales) {
    const rows = sortRows(DASH.teamSummary(sales, calls), 'teams', { key: 'points', dir: 'desc' });
    return '' +
      '<div class="section-heading"><div><h2>Team comparison</h2><p>Every team\'s totals for the selected range</p></div></div>' +
      '<div class="table-card"><table class="data-table" id="teamsTable"><thead><tr>' +
        th('Team', 'team') + th('Agents', 'agents') + th('Calls Answered', 'callsAnswered') + th('Sales', 'sales') +
        th('RGUs', 'rgus') + th('Conversion', 'conversion') + th('Points', 'points') +
      '</tr></thead><tbody>' +
      (rows.length ? rows.map(teamRow).join('') : emptyRow(7)) +
      '</tbody></table></div>' +
      '<div class="section-heading"><div><h2>Team shape</h2><p>Sales volume vs. incentive points vs. RGUs — normalized so you can spot each team\'s strength</p></div></div>' +
      chartCard('teamRadarChart', 'chart-canvas-wrap h-320', 'Team profile', 'Each axis is scaled to that metric\'s max across all teams, so a team filling out the whole shape is strong across the board rather than a specialist.', '');
  }
  function teamRow(r) {
    return '<tr><td><strong>' + r.team + '</strong></td><td>' + r.agents + '</td><td>' + DASH.fmtNum(r.callsAnswered) + '</td>' +
      '<td>' + DASH.fmtNum(r.sales) + '</td><td>' + DASH.fmtNum(r.rgus) + '</td><td>' + DASH.fmtPct(r.conversion) + '</td>' +
      '<td><span class="badge good">' + DASH.fmtNum(r.points) + '</span></td></tr>';
  }
  function afterTeams(calls, sales) {
    const rows = DASH.teamSummary(sales, calls);
    const maxSales = Math.max(1, ...rows.map(function (r) { return r.sales; }));
    const maxRgu = Math.max(1, ...rows.map(function (r) { return r.rgus; }));
    const maxPts = Math.max(1, ...rows.map(function (r) { return r.points; }));
    CHARTS.radarChart('teamRadarChart', ['Sales', 'RGUs', 'Points'], rows.map(function (r) {
      return { label: r.team, data: [Math.round(r.sales / maxSales * 100), Math.round(r.rgus / maxRgu * 100), Math.round(r.points / maxPts * 100)] };
    }));
    wireSort('teamsTable', 'teams', function () { renderTab('teams'); });
  }

  // =========================================================================
  // STATES
  // =========================================================================

  function renderStates(sales) {
    const rows = sortRows(DASH.stateSummary(sales), 'states', { key: 'sales', dir: 'desc' });
    return '' +
      '<div class="section-heading"><div><h2>Sales by state</h2><p>Geographic spread of orders in the selected range</p></div></div>' +
      chartCard('stateBarChart', 'chart-canvas-wrap h-320', 'Top states by sales volume', 'States ranked by number of processed orders. Useful for spotting which markets your campaigns are actually landing in.', '') +
      '<div class="section-heading"><div><h2>State detail</h2><p>Every state with at least one sale</p></div></div>' +
      '<div class="table-card"><table class="data-table" id="statesTable"><thead><tr>' +
        th('State', 'state') + th('Sales', 'sales') + th('RGUs', 'rgus') + th('Points', 'points') +
      '</tr></thead><tbody>' + (rows.length ? rows.map(stateRow).join('') : emptyRow(4)) + '</tbody></table></div>';
  }
  function stateRow(r) {
    return '<tr><td><strong>' + r.state + '</strong></td><td>' + DASH.fmtNum(r.sales) + '</td><td>' + DASH.fmtNum(r.rgus) + '</td><td>' + DASH.fmtNum(r.points) + '</td></tr>';
  }
  function afterStates(sales) {
    const rows = DASH.stateSummary(sales).slice(0, 12);
    CHARTS.barChart('stateBarChart', rows.map(function (r) { return r.state; }), [{ label: 'Sales', data: rows.map(function (r) { return r.sales; }) }], { horizontal: true });
    wireSort('statesTable', 'states', function () { renderTab('states'); });
  }

  // =========================================================================
  // CAMPAIGNS
  // =========================================================================

  function renderCampaigns(calls, sales) {
    const rows = sortRows(DASH.campaignSummary(calls, sales), 'campaigns', { key: 'sales', dir: 'desc' });
    return '' +
      '<div class="section-heading"><div><h2>Campaign performance</h2><p>Calls in vs. sales out, per call center / campaign group</p></div></div>' +
      chartCard('campaignChart', 'chart-canvas-wrap h-320', 'Calls answered vs. sales by campaign', 'Bars show volume; the gap between "answered" and "sales" for a campaign is where conversion is leaking.', '') +
      '<div class="table-card"><table class="data-table" id="campaignsTable"><thead><tr>' +
        th('Campaign', 'campaign') + th('Calls', 'calls') + th('Answered', 'answered') + th('Sales', 'sales') + th('Conversion', 'conversion') + th('Points', 'points') +
      '</tr></thead><tbody>' + (rows.length ? rows.map(campaignRow).join('') : emptyRow(6)) + '</tbody></table></div>';
  }
  function campaignRow(r) {
    return '<tr><td><strong>' + r.campaign + '</strong></td><td>' + DASH.fmtNum(r.calls) + '</td><td>' + DASH.fmtNum(r.answered) + '</td>' +
      '<td>' + DASH.fmtNum(r.sales) + '</td><td><span class="badge info">' + DASH.fmtPct(r.conversion) + '</span></td><td>' + DASH.fmtNum(r.points) + '</td></tr>';
  }
  function afterCampaigns(calls, sales) {
    const rows = DASH.campaignSummary(calls, sales).slice(0, 10);
    CHARTS.barChart('campaignChart', rows.map(function (r) { return r.campaign; }),
      [{ label: 'Answered', data: rows.map(function (r) { return r.answered; }) },
       { label: 'Sales', data: rows.map(function (r) { return r.sales; }), backgroundColor: '#0B0B0B' }]);
    wireSort('campaignsTable', 'campaigns', function () { renderTab('campaigns'); });
  }

  // =========================================================================
  // INSIGHTS
  // =========================================================================

  function renderInsights(calls, sales) {
    const insights = buildInsights(calls, sales);
    const k = DASH.computeKpis(calls, sales);
    const states = DASH.stateSummary(sales);
    const topState = states.length ? states[0].state : '—';

    return '' +
      '<div class="hero-grid">' +
        heroCard(ICONS.sales, DASH.fmtNum(k.totalSales), 'Sales this range', true) +
        heroCard(ICONS.points, DASH.fmtNum(k.totalPoints), 'Points earned') +
        heroCard(ICONS.target, DASH.fmtPct(k.conversionRate), 'Overall conversion') +
        heroCard(ICONS.mapPin, topState, 'Top performing state') +
      '</div>' +

      '<div class="section-heading"><div><h2>Auto-generated highlights</h2><p>Plain-language takeaways from the currently filtered data</p></div></div>' +
      '<div class="insight-list">' + insights.map(function (i) {
        return '<div class="insight-card ' + i.tone + '"><span class="insight-icon-badge">' + i.icon + '</span>' +
          '<div><p class="insight-body-title">' + i.title + '</p><p>' + i.body + '</p></div></div>';
      }).join('') + '</div>' +

      '<div class="section-heading"><div><h2>Sales mix</h2><p>What was sold, and how it was installed</p></div></div>' +
      '<div class="chart-grid cols-3">' +
        chartCardWithList('providerChart', 'providerList', 'Provider mix', 'Which provider each order was placed with.') +
        chartCardWithList('serviceChart', 'serviceList', 'Service mix', 'Internet vs. TV vs. Mobility vs. bundles.') +
        chartCardWithList('installChart', 'installList', 'Install type', 'Pro Install (technician visit) vs. Mail Out (self-install kit).') +
      '</div>';
  }

  function chartCardWithList(canvasId, listId, title, explain) {
    return '<div class="chart-card"><div class="chart-card-hdr"><h3>' + title + '</h3></div>' +
      '<p class="chart-explain">' + explain + '</p>' +
      '<div class="chart-canvas-wrap h-220"><canvas id="' + canvasId + '"></canvas></div>' +
      '<div id="' + listId + '"></div></div>';
  }

  function buildInsights(calls, sales) {
    const list = [];
    const k = DASH.computeKpis(calls, sales);
    const agents = DASH.agentLeaderboard(calls, sales);
    const teams = DASH.teamSummary(sales, calls);
    const states = DASH.stateSummary(sales);
    const campaigns = DASH.campaignSummary(calls, sales);
    const hours = DASH.hourlyVolume(calls);

    if (agents.length) {
      const top = agents[0];
      list.push({ icon: ICONS.trophy, tone: 'good', title: top.agent + ' is your top earner', body: DASH.fmtNum(top.points) + ' points from ' + DASH.fmtNum(top.sales) + ' sales at a ' + DASH.fmtPct(top.conversion) + ' conversion rate.' });
    }
    if (teams.length) {
      const top = teams[0];
      list.push({ icon: ICONS.users, tone: '', title: top.team + ' is leading', body: DASH.fmtNum(top.sales) + ' sales and ' + DASH.fmtNum(top.points) + ' points across ' + top.agents + ' agents this range.' });
    }
    if (states.length) {
      const top = states[0];
      const share = sales.length ? Math.round((top.sales / sales.length) * 100) : 0;
      list.push({ icon: ICONS.mapPin, tone: 'info', title: top.state + ' is your strongest market', body: DASH.fmtNum(top.sales) + ' sales (' + share + '% of total volume) in the selected range.' });
    }
    if (campaigns.length) {
      const best = campaigns.slice().sort(function (a, b) { return b.conversion - a.conversion; })[0];
      list.push({ icon: ICONS.zap, tone: 'good', title: best.campaign + ' converts best', body: DASH.fmtPct(best.conversion) + ' of answered calls turned into a sale — the highest of any campaign in range.' });
    }
    const hourEntries = Object.entries(hours).sort(function (a, b) { return b[1] - a[1]; });
    if (hourEntries.length && hourEntries[0][1] > 0) {
      const h = parseInt(hourEntries[0][0], 10);
      list.push({ icon: ICONS.flame, tone: '', title: 'Peak call hour is ' + ((h % 12) || 12) + (h < 12 ? 'am' : 'pm'), body: DASH.fmtNum(hourEntries[0][1]) + ' calls landed in that hour — make sure staffing peaks here too.' });
    }
    if (k.abandonRate > 8) {
      list.push({ icon: ICONS.alert, tone: 'warn', title: 'Abandon rate is running high', body: DASH.fmtPct(k.abandonRate) + ' of calls were abandoned before being answered — worth a look at queue staffing.' });
    } else if (calls.length) {
      list.push({ icon: ICONS.target, tone: 'good', title: 'Abandon rate is under control', body: DASH.fmtPct(k.abandonRate) + ' of calls were abandoned — comfortably within a healthy range.' });
    }
    return list;
  }

  function afterInsights(calls, sales) {
    animateCountUps(els.contentArea);
    renderMixChart('providerChart', 'providerList', DASH.providerBreakdown(sales));
    renderMixChart('serviceChart', 'serviceList', DASH.serviceBreakdown(sales));
    renderMixChart('installChart', 'installList', DASH.installTypeBreakdown(sales));
  }

  function renderMixChart(canvasId, listId, breakdown) {
    const entries = breakdownToEntries(breakdown);
    CHARTS.doughnutChart(canvasId, entries.map(function (e) { return e.label; }), entries.map(function (e) { return e.value; }), { colors: entries.map(function (e) { return e.color; }) });
    document.getElementById(listId).innerHTML = statBarList(entries);
  }

  // =========================================================================
  // API SETUP
  // =========================================================================

  function renderApiSetup() {
    const url = DASH.getApiUrl();
    const days = DASH.getDays();
    const meta = DASH.getMeta();
    const dateRange = DASH.getDataDateRange();
    const generatedAt = DASH.getGeneratedAt();
    const syncedAt = generatedAt ? new Date(generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'just now';
    return '' +
      '<div class="api-setup-grid">' +
        '<div class="setup-card">' +
          '<h3>Connect your Google Sheet</h3>' +
          '<p>This dashboard reads from a small API you deploy inside your own Google Sheet using Apps Script. Nothing is uploaded anywhere else — the data stays in your Sheet, and this static site just asks it for the latest numbers.</p>' +
          '<div class="setup-step"><div class="setup-step-num">1</div><div class="setup-step-body"><h4>Open Apps Script</h4><p>In your Sheet: <code>Extensions → Apps Script</code>, then paste in the code from the button below.</p></div></div>' +
          '<div class="setup-step"><div class="setup-step-num">2</div><div class="setup-step-body"><h4>Deploy as a Web App</h4><p><code>Deploy → New deployment → Web app</code>. Set "Execute as" to <strong>Me</strong> and "Who has access" to <strong>Anyone</strong>.</p></div></div>' +
          '<div class="setup-step"><div class="setup-step-num">3</div><div class="setup-step-body"><h4>Copy the Web app URL</h4><p>It looks like <code>https://script.google.com/macros/s/…/exec</code>. Paste it below.</p></div></div>' +
          '<div class="setup-step"><div class="setup-step-num">4</div><div class="setup-step-body"><h4>Save &amp; connect</h4><p>Click "Save &amp; Connect" — the status dot in the top bar turns green once it can read your sheet.</p></div></div>' +
          '<button class="btn-secondary" id="viewGasCodeBtn" style="margin-top:10px">View the Apps Script code</button>' +
        '</div>' +
        '<div class="setup-card">' +
          '<h3>Connection</h3>' +
          '<div class="slicer-group"><label class="slicer-label">Apps Script Web App URL</label>' +
            '<div class="api-url-row"><input type="text" id="apiUrlInput" placeholder="https://script.google.com/macros/s/AKfycb…/exec" value="' + (url || '') + '" />' +
            '<button class="btn-primary" id="saveApiUrlBtn">Save &amp; Connect</button></div></div>' +
          '<div class="slicer-group" style="margin-top:14px"><label class="slicer-label">Days of history to load</label>' +
            '<select class="slicer-select" id="daysSelect" style="width:100%">' +
              [30, 60, 90, 180, 365].map(function (d) { return '<option value="' + d + '"' + (d === days ? ' selected' : '') + '>' + d + ' days</option>'; }).join('') +
            '</select></div>' +
          '<div class="conn-status" id="connStatusLine">' +
            (DASH.isConnected()
              ? '<span class="status-dot live"></span> Connected · ' + DASH.fmtNum(meta.callsRows || 0) + ' call rows, ' + DASH.fmtNum(meta.salesRows || 0) + ' sale rows loaded'
              : '<span class="status-dot stale"></span> Not connected — showing demo data') +
          '</div>' +
          (dateRange.min ? '<p style="margin-top:8px"><strong>Data currently loaded:</strong> ' + fmtLongDate(dateRange.min) + ' through ' + fmtLongDate(dateRange.max) + '. Last synced from your Sheet at ' + syncedAt + '.</p>' : '') +
          '<p style="margin-top:14px">Every row your team logs today, tomorrow, or next month flows through automatically — there is nothing to re-upload. The dashboard re-checks the API every 5 minutes, or click the ↻ refresh icon anytime.</p>' +
          '<p><strong>Privacy note:</strong> the Apps Script only forwards the columns this dashboard actually charts (agent, team, state, provider, dates, points…). Customer names, emails, phone numbers, addresses and account numbers are stripped out on the server before they ever leave your Sheet.</p>' +
        '</div>' +
      '</div>';
  }

  function afterApiSetup() {
    document.getElementById('saveApiUrlBtn').addEventListener('click', async function () {
      const val = document.getElementById('apiUrlInput').value.trim();
      if (!val) { showToast('Enter a Web App URL first', 'error'); return; }
      DASH.setApiUrl(val);
      showToast('Connecting…');
      await loadData(false);
      populateFilterOptions();
      renderTab('api');
      showToast(DASH.isConnected() ? 'Connected!' : 'Could not connect — check the URL and deployment access', DASH.isConnected() ? 'success' : 'error');
    });
    document.getElementById('daysSelect').addEventListener('change', async function (e) {
      DASH.setDays(parseInt(e.target.value, 10));
      await loadData(false);
      renderTab('api');
    });
    document.getElementById('viewGasCodeBtn').addEventListener('click', openGasModal);
  }

  // =========================================================================
  // GAS CODE MODAL
  // =========================================================================

  function wireModal() {
    els.gasModalClose.addEventListener('click', function () { els.gasModal.style.display = 'none'; });
    els.gasModal.addEventListener('click', function (e) { if (e.target === els.gasModal) els.gasModal.style.display = 'none'; });
  }

  async function openGasModal() {
    els.gasModal.style.display = 'flex';
    els.gasCodeBlock.textContent = 'Loading…';
    try {
      const res = await fetch('apps-script/Code.gs');
      if (!res.ok) throw new Error('not found');
      els.gasCodeBlock.textContent = await res.text();
    } catch (err) {
      els.gasCodeBlock.textContent = 'Could not load apps-script/Code.gs from this server.\nOpen that file directly in the project you downloaded/cloned — it is at:\n  /apps-script/Code.gs\n\nCopy its contents into Extensions → Apps Script in your Google Sheet.';
    }
  }

  // =========================================================================
  // TABLE SORTING
  // =========================================================================

  function th(label, key) {
    return '<th' + (key ? ' data-key="' + key + '"' : '') + '>' + label + (key ? '<span class="sort-arrow">⇅</span>' : '') + '</th>';
  }
  function emptyRow(colspan) {
    return '<tr><td colspan="' + colspan + '"><div class="empty-state"><h4>No rows match your filters</h4><p>Try widening the date range or clearing a filter.</p></div></td></tr>';
  }
  function sortRows(rows, tableId, defaultSort) {
    const s = STATE.sort[tableId] || defaultSort;
    STATE.sort[tableId] = s;
    const sorted = rows.slice().sort(function (a, b) {
      const av = a[s.key], bv = b[s.key];
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av - bv);
      return s.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }
  function wireSort(tableId, stateKey, rerender) {
    const table = document.getElementById(tableId);
    if (!table) return;
    table.querySelectorAll('th[data-key]').forEach(function (thEl) {
      thEl.addEventListener('click', function () {
        const key = thEl.dataset.key;
        const current = STATE.sort[stateKey] || {};
        const dir = current.key === key && current.dir === 'desc' ? 'asc' : 'desc';
        STATE.sort[stateKey] = { key: key, dir: dir };
        rerender();
      });
    });
  }

  // =========================================================================
  // CSV EXPORT
  // =========================================================================

  function exportCurrentView() {
    const { calls, sales } = getFilteredData();
    let rows, filename;
    switch (STATE.tab) {
      case 'agents': rows = DASH.agentLeaderboard(calls, sales); filename = 'agent-rankings.csv'; break;
      case 'teams': rows = DASH.teamSummary(sales, calls); filename = 'teams.csv'; break;
      case 'states': rows = DASH.stateSummary(sales); filename = 'states.csv'; break;
      case 'campaigns': rows = DASH.campaignSummary(calls, sales); filename = 'campaigns.csv'; break;
      default: rows = sales; filename = 'sales.csv';
    }
    if (!rows.length) { showToast('Nothing to export for the current filters', 'error'); return; }
    DASH.downloadCsv(filename, rows);
    showToast('Exported ' + filename);
  }
})();

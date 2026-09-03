/**
 * data.js — everything about GETTING and SHAPING the data.
 * No rendering happens here (that's charts.js / dashboard.js). This file:
 *   1. Knows how to find your Apps Script API URL (config.js, then localStorage).
 *   2. Fetches + caches the raw calls/sales rows in memory.
 *   3. Applies the slicer bar filters (date, team, campaign, state, agent, search).
 *   4. Computes every KPI and group-by the dashboard needs, in one place, so
 *      Overview / Agent Rankings / Teams / States / Campaigns all read from
 *      the same numbers.
 */

const DASH = (function () {
  const STORAGE_KEY = 'sc_dashboard_api_url';
  const STORAGE_DAYS_KEY = 'sc_dashboard_days';

  let raw = { calls: [], sales: [], meta: {}, generatedAt: null };
  let lastFetchOk = false;

  // ---------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------

  function getApiUrl() {
    if (window.DASH_CONFIG && window.DASH_CONFIG.API_URL) return window.DASH_CONFIG.API_URL;
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function setApiUrl(url) {
    localStorage.setItem(STORAGE_KEY, url.trim());
  }

  function getDays() {
    return parseInt(localStorage.getItem(STORAGE_DAYS_KEY), 10) || 90;
  }

  function setDays(days) {
    localStorage.setItem(STORAGE_DAYS_KEY, String(days));
  }

  // ---------------------------------------------------------------------
  // FETCH
  // ---------------------------------------------------------------------

  async function fetchData(opts) {
    opts = opts || {};
    const apiUrl = getApiUrl();
    if (!apiUrl) {
      lastFetchOk = false;
      throw new Error('NO_API_URL');
    }
    const days = opts.days || getDays();
    const sep = apiUrl.indexOf('?') === -1 ? '?' : '&';
    const url = apiUrl + sep + 'days=' + encodeURIComponent(days) + '&t=' + Date.now();

    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('HTTP_' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.error);

    raw.calls = Array.isArray(json.calls) ? json.calls : [];
    raw.sales = Array.isArray(json.sales) ? json.sales : [];
    raw.meta = json.meta || {};
    raw.generatedAt = json.generatedAt || new Date().toISOString();
    lastFetchOk = true;
    return raw;
  }

  function loadDemoData() {
    // Used only if there's no API configured yet, so the dashboard never
    // looks "broken" on first run — it shows realistic sample shapes and
    // labels everything clearly as demo data via the status pill.
    const agents = ['Ali Hunaid', 'Zuhaib Ahmed', 'Izhan Kamran', 'Zeeshan Khan', 'Hassam Farooq', 'Muhammad Malhan', 'Chandresh Dipak', 'Farhan Sheikh'];
    const teams = ['Team Hassan', 'Team Areeb', 'Team Noor', 'Team Wajahat', 'Team Yousif', 'Team Wireless'];
    const campaigns = ['Group 44', 'Group 48', 'Group 50', 'Group 55', 'Group 56'];
    const states = ['TX', 'FL', 'CA', 'GA', 'IN', 'TN', 'NC', 'IL'];
    const providers = ['At&t', 'T Mobile', 'Frontier', 'Xfinity', 'DirectTV'];
    const results = ['Answered', 'Overflow - Time', 'Stranded - Unavailable', 'Abandoned', 'Transferred'];
    const calls = [], sales = [];
    const today = new Date();
    for (let d = 0; d < 30; d++) {
      const day = new Date(today); day.setDate(day.getDate() - d);
      const dateStr = day.toISOString().slice(0, 10);
      const callsToday = 60 + Math.round(Math.random() * 60);
      for (let i = 0; i < callsToday; i++) {
        calls.push({
          Date: dateStr, Campaign: campaigns[Math.floor(Math.random() * campaigns.length)],
          'Agent Name': agents[Math.floor(Math.random() * agents.length)],
          'Call Result': results[Math.floor(Math.random() * results.length)],
          'Wait Time': Math.round(Math.random() * 60), 'Talk Time': Math.round(60 + Math.random() * 420),
          'Hold Time': Math.round(Math.random() * 40), 'Wrap Up Time': Math.round(Math.random() * 60),
          Hour: 7 + Math.floor(Math.random() * 11)
        });
      }
      const salesToday = 4 + Math.round(Math.random() * 10);
      for (let i = 0; i < salesToday; i++) {
        sales.push({
          Date: dateStr, Campaign: campaigns[Math.floor(Math.random() * campaigns.length)],
          'Agent Name': agents[Math.floor(Math.random() * agents.length)],
          Team: teams[Math.floor(Math.random() * teams.length)],
          State: states[Math.floor(Math.random() * states.length)],
          Provider: providers[Math.floor(Math.random() * providers.length)],
          Services: Math.random() > .8 ? 'TV' : 'Internet',
          "RGU's": 1 + Math.floor(Math.random() * 2),
          'Total Points': [3, 8, 10][Math.floor(Math.random() * 3)],
          'Installation Type': Math.random() > .5 ? 'Pro Install' : 'Mail Out'
        });
      }
    }
    raw = { calls, sales, meta: { callsRows: calls.length, salesRows: sales.length, demo: true }, generatedAt: new Date().toISOString() };
    lastFetchOk = false;
    return raw;
  }

  function isDemo() { return !!(raw.meta && raw.meta.demo); }
  function isConnected() { return lastFetchOk; }
  function getMeta() { return raw.meta || {}; }
  function getGeneratedAt() { return raw.generatedAt; }

  // ---------------------------------------------------------------------
  // FILTERS
  // ---------------------------------------------------------------------

  function getFilterOptions() {
    const teams = new Set(), campaigns = new Set(), states = new Set(), agents = new Set(), callResults = new Set();
    raw.sales.forEach(function (s) {
      if (s.Team) teams.add(s.Team);
      if (s.Campaign) campaigns.add(s.Campaign);
      if (s.State) states.add(s.State);
      if (s['Agent Name']) agents.add(s['Agent Name']);
    });
    raw.calls.forEach(function (c) {
      if (c.Campaign) campaigns.add(c.Campaign);
      if (c['Agent Name']) agents.add(c['Agent Name']);
      if (c['Call Result']) callResults.add(c['Call Result']);
    });
    return {
      teams: Array.from(teams).sort(),
      campaigns: Array.from(campaigns).sort(),
      states: Array.from(states).sort(),
      agents: Array.from(agents).sort(),
      callResults: Array.from(callResults).sort()
    };
  }

  // The full span of dates currently loaded in memory (unfiltered by the
  // slicer bar) — this is "how far back does the data we have go", not
  // "what date range is the user currently looking at".
  function getDataDateRange() {
    let min = null, max = null;
    raw.calls.concat(raw.sales).forEach(function (r) {
      if (!r.Date) return;
      if (!min || r.Date < min) min = r.Date;
      if (!max || r.Date > max) max = r.Date;
    });
    return { min: min, max: max };
  }

  function applyFilters(filters) {
    filters = filters || {};
    const start = filters.start || null;
    const end = filters.end || null;
    const team = filters.team || '';
    const campaign = filters.campaign || '';
    const state = filters.state || '';
    const agent = filters.agent || '';
    const callResult = filters.callresult || '';
    const search = (filters.search || '').trim().toLowerCase();

    function inRange(dateStr) { return (!start || dateStr >= start) && (!end || dateStr <= end); }
    function matchesSearch(record) {
      if (!search) return true;
      return Object.values(record).some(function (v) {
        return String(v == null ? '' : v).toLowerCase().indexOf(search) !== -1;
      });
    }

    const calls = raw.calls.filter(function (c) {
      if (!inRange(c.Date)) return false;
      if (campaign && c.Campaign !== campaign) return false;
      if (agent && c['Agent Name'] !== agent) return false;
      if (callResult && c['Call Result'] !== callResult) return false;
      if (!matchesSearch(c)) return false;
      return true;
    });

    const sales = raw.sales.filter(function (s) {
      if (!inRange(s.Date)) return false;
      if (team && s.Team !== team) return false;
      if (campaign && s.Campaign !== campaign) return false;
      if (state && s.State !== state) return false;
      if (agent && s['Agent Name'] !== agent) return false;
      if (!matchesSearch(s)) return false;
      return true;
    });

    return { calls: calls, sales: sales };
  }

  // ---------------------------------------------------------------------
  // AGGREGATIONS
  // ---------------------------------------------------------------------

  function sum(arr, fn) { return arr.reduce(function (a, x) { return a + (Number(fn(x)) || 0); }, 0); }
  function avg(arr, fn) { return arr.length ? sum(arr, fn) / arr.length : 0; }
  function groupBy(arr, fn) {
    const map = {};
    arr.forEach(function (x) {
      const k = fn(x) || 'Unassigned';
      (map[k] = map[k] || []).push(x);
    });
    return map;
  }

  function computeKpis(calls, sales) {
    const answered = calls.filter(function (c) { return c['Call Result'] === 'Answered'; });
    const abandoned = calls.filter(function (c) { return c['Call Result'] === 'Abandoned'; });
    const totalSales = sales.length;
    const totalRgus = sum(sales, function (s) { return s["RGU's"]; });
    const totalPoints = sum(sales, function (s) { return s['Total Points']; });
    const avgTalk = avg(answered, function (c) { return c['Talk Time']; });
    const avgWait = avg(calls, function (c) { return c['Wait Time']; });
    const activeAgents = new Set(sales.map(function (s) { return s['Agent Name']; }).filter(Boolean)).size;
    const conversion = answered.length ? (totalSales / answered.length) * 100 : 0;
    const answerRate = calls.length ? (answered.length / calls.length) * 100 : 0;
    const abandonRate = calls.length ? (abandoned.length / calls.length) * 100 : 0;

    return {
      totalCalls: calls.length, answeredCalls: answered.length, answerRate: answerRate,
      abandonRate: abandonRate, totalSales: totalSales, totalRgus: totalRgus,
      totalPoints: totalPoints, avgTalkTime: avgTalk, avgWaitTime: avgWait,
      activeAgents: activeAgents, conversionRate: conversion
    };
  }

  function agentLeaderboard(calls, sales) {
    const callsByAgent = groupBy(calls, function (c) { return c['Agent Name']; });
    const salesByAgent = groupBy(sales, function (s) { return s['Agent Name']; });
    const names = new Set(Object.keys(callsByAgent).concat(Object.keys(salesByAgent)));
    names.delete('Unassigned');
    const rows = [];
    names.forEach(function (name) {
      const myCalls = callsByAgent[name] || [];
      const mySales = salesByAgent[name] || [];
      const answered = myCalls.filter(function (c) { return c['Call Result'] === 'Answered'; });
      const team = mySales.length ? mySales[0].Team : '—';
      rows.push({
        agent: name, team: team, callsHandled: myCalls.length, callsAnswered: answered.length,
        sales: mySales.length, rgus: sum(mySales, function (s) { return s["RGU's"]; }),
        points: sum(mySales, function (s) { return s['Total Points']; }),
        conversion: answered.length ? (mySales.length / answered.length) * 100 : (mySales.length ? 100 : 0),
        avgTalk: avg(answered, function (c) { return c['Talk Time']; })
      });
    });
    rows.sort(function (a, b) { return b.points - a.points || b.sales - a.sales; });
    return rows;
  }

  function teamSummary(sales, calls) {
    const salesByTeam = groupBy(sales, function (s) { return s.Team; });
    const rows = Object.keys(salesByTeam).map(function (team) {
      const mySales = salesByTeam[team];
      const teamAgents = new Set(mySales.map(function (s) { return s['Agent Name']; }));
      const teamCalls = calls.filter(function (c) { return teamAgents.has(c['Agent Name']); });
      const answered = teamCalls.filter(function (c) { return c['Call Result'] === 'Answered'; });
      return {
        team: team, agents: teamAgents.size, sales: mySales.length,
        rgus: sum(mySales, function (s) { return s["RGU's"]; }),
        points: sum(mySales, function (s) { return s['Total Points']; }),
        callsAnswered: answered.length,
        conversion: answered.length ? (mySales.length / answered.length) * 100 : 0
      };
    });
    rows.sort(function (a, b) { return b.points - a.points; });
    return rows;
  }

  function stateSummary(sales) {
    const byState = groupBy(sales, function (s) { return s.State; });
    const rows = Object.keys(byState).map(function (state) {
      const mySales = byState[state];
      return {
        state: state, sales: mySales.length,
        rgus: sum(mySales, function (s) { return s["RGU's"]; }),
        points: sum(mySales, function (s) { return s['Total Points']; })
      };
    });
    rows.sort(function (a, b) { return b.sales - a.sales; });
    return rows;
  }

  function campaignSummary(calls, sales) {
    const callsByC = groupBy(calls, function (c) { return c.Campaign; });
    const salesByC = groupBy(sales, function (s) { return s.Campaign; });
    const names = new Set(Object.keys(callsByC).concat(Object.keys(salesByC)));
    const rows = [];
    names.forEach(function (name) {
      const myCalls = callsByC[name] || [];
      const mySales = salesByC[name] || [];
      const answered = myCalls.filter(function (c) { return c['Call Result'] === 'Answered'; });
      rows.push({
        campaign: name, calls: myCalls.length, answered: answered.length, sales: mySales.length,
        points: sum(mySales, function (s) { return s['Total Points']; }),
        conversion: answered.length ? (mySales.length / answered.length) * 100 : 0
      });
    });
    rows.sort(function (a, b) { return b.sales - a.sales; });
    return rows;
  }

  function dailyTrend(calls, sales) {
    const days = {};
    calls.forEach(function (c) {
      days[c.Date] = days[c.Date] || { date: c.Date, calls: 0, answered: 0, sales: 0 };
      days[c.Date].calls++;
      if (c['Call Result'] === 'Answered') days[c.Date].answered++;
    });
    sales.forEach(function (s) {
      days[s.Date] = days[s.Date] || { date: s.Date, calls: 0, answered: 0, sales: 0 };
      days[s.Date].sales++;
    });
    return Object.values(days).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function hourlyVolume(calls) {
    const hours = {};
    for (let h = 0; h < 24; h++) hours[h] = 0;
    calls.forEach(function (c) { if (c.Hour != null) hours[c.Hour] = (hours[c.Hour] || 0) + 1; });
    return hours;
  }

  function dispositionBreakdown(calls) {
    return groupByCount(calls, function (c) { return c['Call Result']; });
  }
  function providerBreakdown(sales) {
    return groupByCount(sales, function (s) { return s.Provider; });
  }
  function serviceBreakdown(sales) {
    return groupByCount(sales, function (s) { return s.Services; });
  }
  function installTypeBreakdown(sales) {
    return groupByCount(sales, function (s) { return s['Installation Type']; });
  }
  function groupByCount(arr, fn) {
    const map = {};
    arr.forEach(function (x) { const k = fn(x) || 'Unknown'; map[k] = (map[k] || 0) + 1; });
    return map;
  }

  // ---------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------

  function toCsv(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    rows.forEach(function (row) {
      lines.push(headers.map(function (h) {
        let v = row[h] == null ? '' : String(row[h]);
        if (v.indexOf(',') !== -1 || v.indexOf('"') !== -1) v = '"' + v.replace(/"/g, '""') + '"';
        return v;
      }).join(','));
    });
    return lines.join('\n');
  }

  function downloadCsv(filename, rows) {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------
  // FORMATTERS
  // ---------------------------------------------------------------------

  function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmtPct(n) { return (Math.round(n * 10) / 10) + '%'; }
  function fmtSeconds(s) {
    s = Math.round(s || 0);
    const m = Math.floor(s / 60), r = s % 60;
    return m + 'm ' + String(r).padStart(2, '0') + 's';
  }
  function fmtDate(d) {
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();
  }

  return {
    getApiUrl: getApiUrl, setApiUrl: setApiUrl, getDays: getDays, setDays: setDays,
    fetchData: fetchData, loadDemoData: loadDemoData, isDemo: isDemo, isConnected: isConnected,
    getMeta: getMeta, getGeneratedAt: getGeneratedAt,
    getFilterOptions: getFilterOptions, applyFilters: applyFilters, getDataDateRange: getDataDateRange,
    computeKpis: computeKpis, agentLeaderboard: agentLeaderboard, teamSummary: teamSummary,
    stateSummary: stateSummary, campaignSummary: campaignSummary, dailyTrend: dailyTrend,
    hourlyVolume: hourlyVolume, dispositionBreakdown: dispositionBreakdown,
    providerBreakdown: providerBreakdown, serviceBreakdown: serviceBreakdown,
    installTypeBreakdown: installTypeBreakdown,
    toCsv: toCsv, downloadCsv: downloadCsv,
    fmtNum: fmtNum, fmtPct: fmtPct, fmtSeconds: fmtSeconds, fmtDate: fmtDate, initials: initials,
    sum: sum, avg: avg, groupBy: groupBy
  };
})();

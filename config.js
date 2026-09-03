/**
 * config.js — OPTIONAL.
 *
 * If you leave API_URL blank, the dashboard falls back to whatever URL
 * is saved in the browser's localStorage (set from the "API Setup" tab),
 * and shows demo data until someone enters one.
 *
 * If you're deploying this to Vercel for a whole team to use, it's
 * usually easier to just paste your Apps Script Web App URL here once,
 * commit it, and everyone who opens the site is connected automatically
 * — no per-browser setup step.
 *
 * This file is loaded before js/data.js in index.html.
 */
window.DASH_CONFIG = {
  API_URL: '' // e.g. 'https://script.google.com/macros/s/AKfycb.../exec'
};

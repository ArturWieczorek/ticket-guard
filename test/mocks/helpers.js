'use strict';
const { createBackend } = require('./backend');
const { loadApp, tick } = require('./loader');

// Boot a signed-in app window on a fresh (or given) shared backend.
async function bootApp(opts = {}) {
  const backend = opts.backend || createBackend();
  const app = await loadApp(backend, opts);
  if (opts.signIn !== false) {
    await app.signIn(opts.email || 'librarian@library.org', opts.password || 'pw123');
    // Wait for storageTest() to settle STORAGE_MODE before any data work, so
    // createTickets/saveEvents/getEvents all use one consistent store.
    for (let i = 0; i < 100 && app.__t.STORAGE_MODE === 'checking'; i++) await tick(app.window, 2);
  }
  return { backend, app };
}

// Build N plain ticket objects the way renderGeneratePanel does.
function makeTickets(n, app) {
  const tickets = [];
  const seen = new Set();
  for (let i = 1; i <= n; i++) {
    let code = app.__t.genShortCode();
    while (seen.has(code)) code = app.__t.genShortCode();
    seen.add(code);
    tickets.push({
      id: app.__t.uid() + app.__t.uid(),
      num: i,
      shortCode: code,
      used: false,
      usedAt: null,
    });
  }
  return tickets;
}

// Create an event with N tickets directly through the app's own functions.
async function seedEvent(app, name, n) {
  const eventId = app.__t.uid() + '-ev';
  const tickets = makeTickets(n, app);
  await app.__t.createTickets(eventId, tickets);
  const events = await app.__t.getEvents();
  events.unshift({ id: eventId, name, count: n, createdAt: new Date().toISOString() });
  await app.__t.saveEvents(events);
  return { eventId, tickets };
}

// Drive the real scan-start path: render the panel, pick the event, start.
async function startScan(app, eventId) {
  await app.__t.renderScanPanel();
  const sel = app.window.document.getElementById('scan-event');
  sel.value = eventId;
  await app.__t.startScanning();
  await tick(app.window, 5);
}

module.exports = { bootApp, makeTickets, seedEvent, startScan, tick };

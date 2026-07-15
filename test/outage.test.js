'use strict';
// FLOW B and the wider outage surface: network drops, cold starts, reloads,
// and telling a dead-wifi outage apart from a broken sign-in.
//
// Several of these assert the DESIRED behavior that the hardening pass adds
// (cold-start-from-cache, reload-survives-queue). They are expected to be RED
// against the original index.html and GREEN after the fix - that is the TDD
// record for this change.

const { test } = require('node:test');
const assert = require('node:assert');
const { createBackend } = require('./mocks/backend');
const { loadApp, tick } = require('./mocks/loader');
const { bootApp, seedEvent, startScan } = require('./mocks/helpers');

function bannerText(app) {
  const el = app.window.document.getElementById('result-banner');
  return el ? el.textContent : '';
}
function syncNoteText(app) {
  const el = app.window.document.getElementById('sync-note');
  return el ? el.textContent : '';
}

test('mid-session drop: an offline check-in is accepted, queued, and shown as offline', async () => {
  const { backend, app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Jazz Evening', 4);
  await startScan(app, eventId);

  backend.setFailMode('network');
  await app.__t.processCheckIn(tickets[0].id);

  assert.match(bannerText(app), /Valid/, 'door keeps moving while offline');
  assert.strictEqual([...app.__t.pendingQueue].length, 1);
  assert.match(syncNoteText(app), /Offline/);
  app.close();
});

test('reconnect: retrySync drains the queue and the check-in reaches the backend', async () => {
  const { backend, app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Jazz Evening', 4);
  await startScan(app, eventId);

  backend.setFailMode('network');
  await app.__t.processCheckIn(tickets[0].id);
  assert.strictEqual([...app.__t.pendingQueue].length, 1);

  backend.setFailMode(null);
  await app.__t.retrySync();

  assert.strictEqual([...app.__t.pendingQueue].length, 0, 'queue drained');
  assert.strictEqual(
    backend.dump('ticketguard_tickets')[tickets[0].id].used,
    true,
    'reached shared DB',
  );
  app.close();
});

test('conflict: a ticket used elsewhere while offline is surfaced, not dropped', async () => {
  const backend = createBackend();
  const a = await loadApp(backend);
  const b = await loadApp(backend);
  await a.signIn('a@lib.org', 'pw');
  await b.signIn('b@lib.org', 'pw');
  const { eventId, tickets } = await seedEvent(a, 'Lecture', 3);
  await tick(a.window, 5);
  await startScan(a, eventId);

  // Phone B (online) checks the ticket in first.
  await b.__t.tryCheckIn(tickets[0].id);

  // Phone A was offline and also "accepted" it, then reconnects.
  backend.setFailMode('network');
  await a.__t.processCheckIn(tickets[0].id);
  backend.setFailMode(null);
  await a.__t.retrySync();

  assert.strictEqual([...a.__t.conflicts].length, 1, 'the double check-in is flagged for staff');
  assert.match(syncNoteText(a), /recheck/i);
  a.close();
  b.close();
});

test('auth failure is distinguished from a network outage (urgent, self-help message)', async () => {
  const { backend, app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Workshop', 3);
  await startScan(app, eventId);

  backend.setFailMode('auth'); // e.g. sign-in expired mid-event
  await app.__t.processCheckIn(tickets[0].id);

  assert.strictEqual(app.__t.authIssue, true);
  assert.match(syncNoteText(app), /sign-?in|permission/i);
  app.close();
});

test('COLD START offline: a scanner opened with no network still loads the last cached list', async () => {
  // Device A caches the list during a normal (online) scan session.
  const backend = createBackend();
  const a = await loadApp(backend);
  await a.signIn('a@lib.org', 'pw');
  const { eventId, tickets } = await seedEvent(a, 'Community Fair', 6);
  await tick(a.window, 5);
  await startScan(a, eventId);
  const storage = a.dumpStorage();
  a.close();

  // Device B reopens later with the network already dead, carrying that cache.
  const b = await loadApp(backend, { seedStorage: storage });
  await b.signIn('b@lib.org', 'pw');
  backend.setFailMode('network'); // dead before the session even starts
  await startScan(b, eventId);

  assert.strictEqual([...b.__t.localTickets].length, 6, 'cold-start loads the cached ticket list');
  // and can still check people in against it
  await b.__t.processCheckIn(tickets[0].id);
  assert.match(bannerText(b), /Valid/);
  b.close();
});

test('RELOAD safety: queued offline check-ins survive a tab reload and still sync', async () => {
  const backend = createBackend();
  const a = await loadApp(backend);
  await a.signIn('a@lib.org', 'pw');
  const { eventId, tickets } = await seedEvent(a, 'Story Hour', 5);
  await tick(a.window, 5);
  await startScan(a, eventId);

  backend.setFailMode('network');
  await a.__t.processCheckIn(tickets[0].id); // accepted offline, queued only in memory on the old code
  assert.strictEqual([...a.__t.pendingQueue].length, 1);
  const storage = a.dumpStorage();
  a.close(); // tab closed/reloaded before reconnect

  // Reload: fresh window, same origin storage, network still down at first.
  const b = await loadApp(backend, { seedStorage: storage });
  await b.signIn('a@lib.org', 'pw');
  backend.setFailMode('network');
  await startScan(b, eventId);
  assert.strictEqual(
    [...b.__t.pendingQueue].length,
    1,
    'the queued check-in was not lost on reload',
  );

  // Now the network returns and the check-in finally reaches the DB.
  backend.setFailMode(null);
  await b.__t.retrySync();
  assert.strictEqual(backend.dump('ticketguard_tickets')[tickets[0].id].used, true);
  b.close();
});

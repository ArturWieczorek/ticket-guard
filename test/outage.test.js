'use strict';
// Online-only verdicts. A ticket is declared valid/used ONLY by the shared
// database (the tryCheckIn transaction). With no connection the app must NOT
// guess from any cache - it says "can't verify, use the paper list" and changes
// nothing. This spec locks in that safety property.

const { test } = require('node:test');
const assert = require('node:assert');
const { bootApp, seedEvent, startScan } = require('./mocks/helpers');

function bannerText(app) {
  const el = app.window.document.getElementById('result-banner');
  return el ? el.textContent : '';
}

test('offline: the app refuses to guess - shows "can\'t verify" and does NOT touch the DB', async () => {
  const { backend, app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Jazz Evening', 4);
  await startScan(app, eventId);

  backend.setFailMode('network');
  await app.__t.processCheckIn(tickets[0].id);

  assert.match(bannerText(app), /verify|zweryfik/i, 'shows a can-not-verify message');
  assert.doesNotMatch(bannerText(app), /Valid|welcome|Ważny/i, 'never claims valid offline');
  assert.strictEqual(
    backend.dump('ticketguard_tickets')[tickets[0].id].used,
    false,
    'the ticket is left untouched in the DB',
  );
  app.close();
});

test('offline due to an auth/permissions problem shows a sign-in oriented message', async () => {
  const { backend, app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Workshop', 3);
  await startScan(app, eventId);

  backend.setFailMode('auth');
  await app.__t.processCheckIn(tickets[0].id);

  assert.match(bannerText(app), /sign-?in|permission|logowan|uprawnie/i);
  assert.strictEqual(backend.dump('ticketguard_tickets')[tickets[0].id].used, false);
  app.close();
});

test('once the network returns, the live verdict works again', async () => {
  const { backend, app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Recital', 3);
  await startScan(app, eventId);

  backend.setFailMode('network');
  await app.__t.processCheckIn(tickets[0].id); // can't verify, no change
  assert.strictEqual(backend.dump('ticketguard_tickets')[tickets[0].id].used, false);

  backend.setFailMode(null);
  await app.__t.processCheckIn(tickets[0].id); // now the DB decides
  assert.match(bannerText(app), /Valid|welcome/i);
  assert.strictEqual(backend.dump('ticketguard_tickets')[tickets[0].id].used, true);
  app.close();
});

test('a leftover local scan cache is ignored entirely (no cache-based verdicts)', async () => {
  const { backend, app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Spotkanie autorskie', 3);
  // Plant an old-style cache that (wrongly) marks ticket[0] used. The app must
  // never read it; ticket[0] is unused in the DB.
  app.window.localStorage.setItem(
    'tg_scan_' + eventId,
    JSON.stringify({ tickets: tickets.map((t, i) => ({ ...t, used: i === 0 })), pending: [] }),
  );
  await startScan(app, eventId);

  // Online: the DB says free -> a scan checks it in (valid), not "already used".
  await app.__t.processCheckIn(tickets[0].id);
  assert.match(bannerText(app), /Valid|welcome/i, 'DB is authoritative, stale cache ignored');

  // And offline it would say can't-verify, never "already used" from the cache.
  backend.setFailMode('network');
  await app.__t.processCheckIn(tickets[1].id);
  assert.match(bannerText(app), /verify|zweryfik/i);
  app.close();
});

'use strict';
// Repeat-attempt log (per device, per event): a glance-able history of tickets
// that were scanned again AFTER already being checked in. It does not affect
// entry (the "already used" banner already blocks that) - it is a local record.

const { test } = require('node:test');
const assert = require('node:assert');
const { createBackend } = require('./mocks/backend');
const { loadApp, tick } = require('./mocks/loader');
const { bootApp, seedEvent, startScan } = require('./mocks/helpers');

test('scanning an already-used ticket again logs a repeat attempt', async () => {
  const { app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Door', 3);
  await startScan(app, eventId);

  await app.__t.processCheckIn(tickets[0].id); // first scan: accepted
  await app.__t.processCheckIn(tickets[0].id); // same ticket again: already used

  const attempts = [...app.__t.reuseAttempts];
  assert.strictEqual(attempts.length, 1, 'one ticket logged');
  assert.strictEqual(attempts[0].id, tickets[0].id);
  assert.strictEqual(attempts[0].count, 1);

  const panel = app.window.document.getElementById('attempts-panel');
  assert.notStrictEqual(panel.style.display, 'none', 'panel is visible');
  assert.match(panel.textContent, /001/, 'shows the ticket number');
  app.close();
});

test('a first, valid scan does NOT log an attempt', async () => {
  const { app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Door', 3);
  await startScan(app, eventId);
  await app.__t.processCheckIn(tickets[0].id);
  assert.strictEqual([...app.__t.reuseAttempts].length, 0);
  app.close();
});

test('the same ticket held in front of the camera is not double-counted (throttle)', async () => {
  const { app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Door', 3);
  await startScan(app, eventId);
  app.__t.recordReuseAttempt(tickets[0].id, 1, 'ABCDE');
  app.__t.recordReuseAttempt(tickets[0].id, 1, 'ABCDE'); // within 5s window
  const attempts = [...app.__t.reuseAttempts];
  assert.strictEqual(attempts.length, 1);
  assert.strictEqual(attempts[0].count, 1, 'not incremented while held');
  app.close();
});

test('distinct repeat tickets each get their own entry, newest first', async () => {
  const { app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Door', 3);
  await startScan(app, eventId);
  app.__t.recordReuseAttempt(tickets[0].id, 1, 'AAAAA');
  app.__t.recordReuseAttempt(tickets[1].id, 2, 'BBBBB');
  const attempts = [...app.__t.reuseAttempts];
  assert.strictEqual(attempts.length, 2);
  assert.strictEqual(attempts[0].id, tickets[1].id, 'most recent is first');
  app.close();
});

test('the repeat log persists across a reload (same device, same event)', async () => {
  const backend = createBackend();
  const a = await loadApp(backend);
  await a.signIn('a@lib.org', 'pw');
  const { eventId, tickets } = await seedEvent(a, 'Persisted', 3);
  await tick(a.window, 5);
  await startScan(a, eventId);
  await a.__t.processCheckIn(tickets[0].id); // accept
  await a.__t.processCheckIn(tickets[0].id); // repeat -> logged
  assert.strictEqual([...a.__t.reuseAttempts].length, 1);
  const storage = a.dumpStorage();
  a.close();

  // reload: fresh window, same origin storage, same event
  const b = await loadApp(backend, { seedStorage: storage });
  await b.signIn('a@lib.org', 'pw');
  await tick(b.window, 5);
  await startScan(b, eventId);
  assert.strictEqual([...b.__t.reuseAttempts].length, 1, 'log restored after reload');
  assert.strictEqual(b.__t.reuseAttempts[0].id, tickets[0].id);
  b.close();
});

'use strict';
// FLOW A - two or more phones scanning the same door at once.
// The guarantee: the same ticket can be accepted exactly once, no matter how
// scans interleave. tryCheckIn() is the security-critical function; it runs a
// Firestore transaction, and our mock backend implements real optimistic
// concurrency (version-checked commit + retry), so this proves the guarantee
// rather than asserting it by inspection.

const { test } = require('node:test');
const assert = require('node:assert');
const { createBackend } = require('./mocks/backend');
const { loadApp, tick } = require('./mocks/loader');
const { bootApp, seedEvent } = require('./mocks/helpers');

test('two concurrent scans of the SAME ticket → exactly one ok, one used', async () => {
  const { backend, app } = await bootApp();
  const { tickets } = await seedEvent(app, 'Book Club', 3);
  const target = tickets[0].id;

  // Force the race: both transactions read before either commits.
  backend.setTxReadDelay(25);
  const results = await Promise.all([app.__t.tryCheckIn(target), app.__t.tryCheckIn(target)]);
  const statuses = results.map((r) => r.status).sort();

  assert.deepStrictEqual([...statuses], ['ok', 'used'], 'exactly one ok and one used');
  assert.ok(
    backend.state.commitConflicts >= 1,
    'the version-conflict retry path was actually exercised',
  );
  assert.strictEqual(backend.dump('ticketguard_tickets')[target].used, true);
  app.close();
});

test('two concurrent scans of DIFFERENT tickets → both ok, no interference', async () => {
  const { backend, app } = await bootApp();
  const { tickets } = await seedEvent(app, 'Poetry Night', 3);
  backend.setTxReadDelay(25);

  const results = await Promise.all([
    app.__t.tryCheckIn(tickets[0].id),
    app.__t.tryCheckIn(tickets[1].id),
  ]);
  assert.deepStrictEqual([...results.map((r) => r.status)], ['ok', 'ok']);
  app.close();
});

test('five phones hammering ONE ticket at once → still exactly one ok', async () => {
  const { backend, app } = await bootApp();
  const { tickets } = await seedEvent(app, 'Film Screening', 2);
  const target = tickets[0].id;
  backend.setTxReadDelay(15);

  const results = await Promise.all(Array.from({ length: 5 }, () => app.__t.tryCheckIn(target)));
  const oks = results.filter((r) => r.status === 'ok').length;
  const used = results.filter((r) => r.status === 'used').length;
  assert.strictEqual(oks, 1, 'exactly one acceptance under 5-way contention');
  assert.strictEqual(used, 4);
  app.close();
});

test('two SEPARATE app windows on one backend cannot both accept a ticket', async () => {
  // The most literal "two devices" test: two independent jsdom windows, each
  // with its own firebase mock, sharing a single backend.
  const backend = createBackend();
  const a = await loadApp(backend);
  const b = await loadApp(backend);
  await a.signIn('a@lib.org', 'pw');
  await b.signIn('b@lib.org', 'pw');

  const { tickets } = await seedEvent(a, 'Shared Door', 1);
  await tick(a.window, 5);
  backend.setTxReadDelay(25);

  const [ra, rb] = await Promise.all([
    a.__t.tryCheckIn(tickets[0].id),
    b.__t.tryCheckIn(tickets[0].id),
  ]);
  const statuses = [ra.status, rb.status].sort();
  assert.deepStrictEqual(statuses, ['ok', 'used']);
  a.close();
  b.close();
});

test('createTickets writes N unique, unused docs in one batch', async () => {
  const { backend, app } = await bootApp();
  const { eventId } = await seedEvent(app, 'Big Event', 50);
  const docs = backend.dump('ticketguard_tickets');
  const ids = Object.keys(docs);
  assert.strictEqual(ids.length, 50);
  assert.strictEqual(new Set(ids).size, 50, 'all doc ids unique');
  assert.ok(
    ids.every((id) => docs[id].used === false),
    'all start unused',
  );
  assert.ok(ids.every((id) => docs[id].eventId === eventId));
  app.close();
});

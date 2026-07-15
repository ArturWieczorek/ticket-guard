'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createBackend } = require('./mocks/backend');
const { loadApp, tick } = require('./mocks/loader');

test('harness loads the real app, signs in, and shows the authed view', async () => {
  const backend = createBackend();
  const app = await loadApp(backend);
  await app.signIn('lib@x.org', 'pw');
  await tick(app.window, 5);

  assert.strictEqual(app.window.document.getElementById('app-content').style.display, 'block');
  assert.strictEqual(app.__t.firebaseReady, true);
  // storageTest() should have detected the (mock) firebase backend as live
  assert.strictEqual(app.__t.STORAGE_MODE, 'firebase');
  assert.deepStrictEqual(app.captured.consoleErrors, []);
  app.close();
});

test('createTickets + getTickets round-trips through the shared backend', async () => {
  const backend = createBackend();
  const app = await loadApp(backend);
  await app.signIn('lib@x.org', 'pw');

  const tickets = [
    { id: 'AAAA1111', num: 1, shortCode: 'Q7X2P', used: false, usedAt: null },
    { id: 'BBBB2222', num: 2, shortCode: 'M4K9T', used: false, usedAt: null },
  ];
  await app.__t.createTickets('ev1', tickets);
  const got = await app.__t.getTickets('ev1');
  assert.strictEqual(got.length, 2);
  assert.deepStrictEqual(
    [...got].map((t) => t.num),
    [1, 2],
  );
  assert.strictEqual(got[0].used, false);
  app.close();
});

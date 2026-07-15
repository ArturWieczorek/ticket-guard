'use strict';
// Authentication gating at the UI layer. (The real security boundary is the
// Firestore security rules, which are enforced server-side by Firebase and are
// out of scope for a client-side test - see REVIEW-NOTES.md §7. Here we verify
// the app never surfaces staff functionality without a signed-in user, and that
// startup storage detection behaves.)

const { test } = require('node:test');
const assert = require('node:assert');
const { createBackend } = require('./mocks/backend');
const { loadApp, tick } = require('./mocks/loader');

test('signed out: staff view is hidden, no backend work happens', async () => {
  const backend = createBackend();
  const app = await loadApp(backend);
  await tick(app.window, 5); // let the initial onAuthStateChanged(null) fire

  assert.strictEqual(app.window.document.getElementById('app-content').style.display, 'none');
  assert.notStrictEqual(app.window.document.getElementById('login-screen').style.display, 'none');
  assert.strictEqual(app.__t.STORAGE_MODE, 'checking', 'no storage probe before sign-in');
  assert.strictEqual(
    app.window.document.getElementById('panel-generate').innerHTML,
    '',
    'generate panel not rendered',
  );
  app.close();
});

test('wrong password keeps the user on the login screen with an error', async () => {
  const backend = createBackend();
  const app = await loadApp(backend);
  backend.addUser('librarian@lib.org', 'correct');
  app.window.document.getElementById('login-email').value = 'librarian@lib.org';
  app.window.document.getElementById('login-password').value = 'WRONG';
  await app.window.document.getElementById('btn-login').onclick();
  await tick(app.window, 5);

  assert.strictEqual(app.window.document.getElementById('app-content').style.display, 'none');
  assert.ok(
    app.window.document.getElementById('login-status').textContent.length > 0,
    'error shown',
  );
  app.close();
});

test('sign in then sign out returns to the locked login screen', async () => {
  const backend = createBackend();
  const app = await loadApp(backend);
  await app.signIn('librarian@lib.org', 'pw');
  assert.strictEqual(app.window.document.getElementById('app-content').style.display, 'block');

  await app.window.firebase.auth().signOut();
  await tick(app.window, 5);
  assert.strictEqual(app.window.document.getElementById('app-content').style.display, 'none');
  assert.notStrictEqual(app.window.document.getElementById('login-screen').style.display, 'none');
  app.close();
});

test('startup: if Firestore rejects reads, the app falls back to memory mode and warns', async () => {
  const backend = createBackend();
  const app = await loadApp(backend);
  backend.setFailMode('auth'); // rules reject, though sign-in itself works
  await app.signIn('librarian@lib.org', 'pw');
  await tick(app.window, 5);

  assert.strictEqual(app.__t.STORAGE_MODE, 'memory');
  const banner = app.window.document.getElementById('storage-banner');
  assert.notStrictEqual(banner.style.display, 'none', 'the storage warning is visible');
  app.close();
});

'use strict';
// Language support: Polish is the default, English is available via the top-bar
// toggle, and both static labels and dynamic scan feedback are localized.
// (The rest of the suite runs in English so its text assertions stay stable -
// the harness seeds tg_lang='en' unless a test opts out with { lang: null }.)

const { test } = require('node:test');
const assert = require('node:assert');
const { createBackend } = require('./mocks/backend');
const { loadApp, tick } = require('./mocks/loader');
const { bootApp, seedEvent, startScan } = require('./mocks/helpers');

function labelOf(app, key) {
  return app.window.document.querySelector(`[data-i18n="${key}"]`).textContent;
}

test('default language (no stored preference) is Polish', async () => {
  const app = await loadApp(createBackend(), { lang: null });
  await tick(app.window, 5);
  assert.strictEqual(app.__t.LANG, 'pl');
  assert.strictEqual(labelOf(app, 'login_title'), 'Logowanie personelu');
  assert.strictEqual(app.window.document.getElementById('lang-toggle').textContent, 'EN');
  app.close();
});

test('toggling switches static labels between Polish and English', async () => {
  const app = await loadApp(createBackend(), { lang: null });
  await tick(app.window, 5);
  // simulate clicking the top-bar toggle
  app.window.document.getElementById('lang-toggle').onclick();
  assert.strictEqual(app.__t.LANG, 'en');
  assert.strictEqual(labelOf(app, 'login_title'), 'Staff sign-in');
  assert.strictEqual(app.window.document.getElementById('lang-toggle').textContent, 'PL');
  app.window.document.getElementById('lang-toggle').onclick();
  assert.strictEqual(app.__t.LANG, 'pl');
  assert.strictEqual(labelOf(app, 'login_title'), 'Logowanie personelu');
  app.close();
});

test('dynamic scan feedback is localized (Polish)', async () => {
  const { app } = await bootApp({ lang: 'pl' });
  const { eventId } = await seedEvent(app, 'Test', 2);
  await startScan(app, eventId);
  await app.__t.handleScan('not valid json');
  assert.match(
    app.window.document.getElementById('result-banner').textContent,
    /To nie jest kod TicketGuard/,
  );
  app.close();
});

test('the generate button label follows the chosen language', async () => {
  const { app } = await bootApp({ lang: 'pl' });
  await app.__t.renderGeneratePanel();
  assert.strictEqual(
    app.window.document.getElementById('btn-create-event').textContent,
    'Utwórz wydarzenie i wygeneruj bilety',
  );
  app.close();
});

test('harness default language is English (keeps the other specs stable)', async () => {
  const { app } = await bootApp();
  assert.strictEqual(app.__t.LANG, 'en');
  app.close();
});

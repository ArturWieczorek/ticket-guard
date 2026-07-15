'use strict';
// Security surface: output-encoding (XSS) on every render path, hostile QR
// payloads reaching the scan handler (including Firestore doc-id injection),
// and input validation on the generate form.
//
// The QR-hardening and name-length assertions describe the DESIRED post-fix
// behavior (RED on the original, GREEN after the fix).

const { test } = require('node:test');
const assert = require('node:assert');
const { createBackend } = require('./mocks/backend');
const { loadApp, tick } = require('./mocks/loader');
const { bootApp, seedEvent, startScan } = require('./mocks/helpers');

const XSS = '<img src=x onerror="window.__pwned=1">';

test('XSS: event name is escaped in the generate list', async () => {
  const { app } = await bootApp();
  await seedEvent(app, XSS, 1);
  await app.__t.renderGeneratePanel();
  const html = app.window.document.getElementById('events-list').innerHTML;
  assert.ok(!html.includes('<img src=x'), 'no raw markup injected');
  assert.ok(html.includes('&lt;img'), 'name is HTML-escaped');
  assert.strictEqual(app.window.__pwned, undefined);
  app.close();
});

test('XSS: event name is escaped in the scan-event dropdown', async () => {
  const { app } = await bootApp();
  await seedEvent(app, XSS, 1);
  await app.__t.renderScanPanel();
  const html = app.window.document.getElementById('scan-event').innerHTML;
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
  app.close();
});

test('XSS: event name is escaped in the printable ticket view', async () => {
  const { app } = await bootApp();
  const { tickets } = await seedEvent(app, XSS, 2);
  await app.__t.renderGeneratePanel();
  const ev = (await app.__t.getEvents())[0];
  app.window.renderTicketsForPrint(ev, tickets);
  const html = app.window.document.getElementById('tickets-output').innerHTML;
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
  app.close();
});

test('XSS: signed-in email is escaped in the top bar', async () => {
  const backend = createBackend();
  const app = await loadApp(backend);
  const evilEmail = '<b>x</b>@lib.org';
  backend.addUser(evilEmail, 'pw');
  await app.window.firebase.auth().signInWithEmailAndPassword(evilEmail, 'pw');
  await tick(app.window, 5);
  const html = app.window.document.getElementById('topbar-right').innerHTML;
  assert.ok(!html.includes('<b>x</b>@'), 'email markup not injected raw');
  assert.ok(html.includes('&lt;b&gt;'));
  app.close();
});

test('hostile QR: non-JSON payload is rejected without throwing', async () => {
  const { app } = await bootApp();
  const { eventId } = await seedEvent(app, 'Evt', 2);
  await startScan(app, eventId);
  await app.__t.handleScan('totally not json }{');
  const banner = app.window.document.getElementById('result-banner');
  assert.match(banner.textContent, /Not a TicketGuard code/);
  app.close();
});

test('hostile QR: a ticket for a different event is rejected', async () => {
  const { app } = await bootApp();
  const { eventId } = await seedEvent(app, 'Evt', 2);
  await startScan(app, eventId);
  await app.__t.handleScan(JSON.stringify({ e: 'some-other-event', t: 'ABC123ABC123' }));
  assert.match(app.window.document.getElementById('result-banner').textContent, /Wrong event/);
  app.close();
});

test('hostile QR: malformed / injection ticket ids are rejected up front', async () => {
  const { backend, app } = await bootApp();
  const { eventId } = await seedEvent(app, 'Evt', 2);
  await startScan(app, eventId);
  const bad = [
    JSON.stringify({ e: eventId }), // missing t
    JSON.stringify({ e: eventId, t: '../../etc/passwd' }), // path traversal
    JSON.stringify({ e: eventId, t: 'a/b/c' }), // slash → invalid Firestore id
    JSON.stringify({ e: eventId, t: 'X'.repeat(3000) }), // oversized
    JSON.stringify({ e: eventId, t: 12345 }), // not a string
    JSON.stringify({ e: eventId, t: { $ne: null } }), // object
  ];
  for (const payload of bad) {
    await app.__t.handleScan(payload);
    const txt = app.window.document.getElementById('result-banner').textContent;
    assert.match(txt, /Not a TicketGuard code|Invalid/, `rejected: ${payload.slice(0, 40)}`);
  }
  // nothing hostile ever got written to the backend (still just the 2 seeded)
  assert.strictEqual(Object.keys(backend.dump('ticketguard_tickets')).length, 2);
  app.close();
});

test('input validation: ticket count is clamped to 1..500', async () => {
  async function create(app, name, count) {
    await app.__t.renderGeneratePanel();
    app.window.document.getElementById('ev-name').value = name;
    app.window.document.getElementById('ev-count').value = String(count);
    await app.window.document.getElementById('btn-create-event').onclick();
    await tick(app.window, 5);
    return (await app.__t.getEvents())[0];
  }
  const { app } = await bootApp();
  assert.strictEqual((await create(app, 'Too many', 9999)).count, 500, 'clamped high');
  assert.strictEqual((await create(app, 'Negative', -5)).count, 1, 'clamped low');
  assert.strictEqual((await create(app, 'NaN', 'abc')).count, 1, 'NaN → 1');
  app.close();
});

test('input validation: an empty event name is refused', async () => {
  const { app } = await bootApp();
  await app.__t.renderGeneratePanel();
  app.window.document.getElementById('ev-name').value = '   ';
  app.window.document.getElementById('ev-count').value = '10';
  await app.window.document.getElementById('btn-create-event').onclick();
  await tick(app.window, 5);
  assert.strictEqual((await app.__t.getEvents()).length, 0, 'no event created');
  assert.match(app.window.document.getElementById('gen-status').textContent, /name/i);
  app.close();
});

test('input hardening: an absurdly long event name is capped', async () => {
  const { app } = await bootApp();
  await app.__t.renderGeneratePanel();
  app.window.document.getElementById('ev-name').value = 'A'.repeat(5000);
  app.window.document.getElementById('ev-count').value = '1';
  await app.window.document.getElementById('btn-create-event').onclick();
  await tick(app.window, 5);
  const ev = (await app.__t.getEvents())[0];
  assert.ok(ev && ev.name.length <= 200, `name length capped, got ${ev && ev.name.length}`);
  app.close();
});

test('short codes only use the unambiguous alphabet (no 0/O/1/I)', async () => {
  const { app } = await bootApp();
  const re = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
  for (let i = 0; i < 500; i++) {
    const c = app.__t.genShortCode();
    assert.match(c, re, `bad code: ${c}`);
  }
  app.close();
});

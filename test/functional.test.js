'use strict';
// Core happy-path behavior: generating tickets, the print-range math, the
// emergency backup checklist contents, and the live stats.

const { test } = require('node:test');
const assert = require('node:assert');
const { bootApp, seedEvent, startScan, tick } = require('./mocks/helpers');

test('generate: creates the requested count with unique codes and ids', async () => {
  const { app } = await bootApp();
  await app.__t.renderGeneratePanel();
  app.window.document.getElementById('ev-name').value = 'Autumn Book Club';
  app.window.document.getElementById('ev-count').value = '25';
  await app.window.document.getElementById('btn-create-event').onclick();
  await tick(app.window, 5);

  const ev = (await app.__t.getEvents())[0];
  const tickets = await app.__t.getTickets(ev.id);
  assert.strictEqual(tickets.length, 25);
  assert.deepStrictEqual(
    [...tickets].map((t) => t.num),
    Array.from({ length: 25 }, (_, i) => i + 1),
  );
  assert.strictEqual(new Set([...tickets].map((t) => t.id)).size, 25, 'ids unique');
  assert.strictEqual(
    new Set([...tickets].map((t) => t.shortCode)).size,
    25,
    'codes unique within event',
  );
  app.close();
});

test('print range: only the selected #from..#to subset is rendered, with the right QR payload', async () => {
  const { app } = await bootApp();
  const { tickets } = await seedEvent(app, 'Recital', 12);
  await app.__t.renderGeneratePanel();
  const ev = (await app.__t.getEvents())[0];
  app.window.renderTicketsForPrint(ev, tickets);

  app.window.document.getElementById('range-from').value = '3';
  app.window.document.getElementById('range-to').value = '7';
  app.window.document.getElementById('btn-print-range').onclick();

  const grid = app.window.document.getElementById('ticket-grid');
  assert.strictEqual(grid.querySelectorAll('.ticket').length, 5, 'tickets 3..7 = 5 cards');

  const firstQr = grid.querySelector('.qr').getAttribute('data-qr-text');
  const decoded = JSON.parse(firstQr);
  assert.strictEqual(decoded.e, ev.id, 'QR encodes the event id');
  assert.ok(decoded.t && typeof decoded.t === 'string', 'QR encodes a ticket id');
  app.close();
});

test('emergency backup list: plain-text checklist has both identifiers and a checkbox per ticket', async () => {
  const { app } = await bootApp();
  const { tickets } = await seedEvent(app, 'Winter Social', 4);
  await app.__t.renderGeneratePanel();
  const ev = (await app.__t.getEvents())[0];
  app.window.renderTicketsForPrint(ev, tickets);
  app.window.document.getElementById('btn-backup-list').onclick();

  const text = await app.readLastBlobText();
  assert.ok(text, 'a text blob was produced with no network call');
  assert.match(text, /Winter Social/);
  assert.match(text, /emergency/i);
  assert.strictEqual((text.match(/\[ \]/g) || []).length, 4, 'one checkbox per ticket');
  assert.match(text, /Ticket 001/, 'zero-padded number present');
  // both identifiers on the line: number AND the short code
  for (const t of tickets) {
    assert.ok(text.includes(t.shortCode), `code ${t.shortCode} present`);
  }
  app.close();
});

test("backup list generation does not mutate the caller's ticket array order", async () => {
  const { app } = await bootApp();
  const { tickets } = await seedEvent(app, 'Order Test', 5);
  // hand it an intentionally-unsorted array
  const shuffled = [tickets[3], tickets[0], tickets[4], tickets[1], tickets[2]];
  const before = shuffled.map((t) => t.num).join(',');
  app.window.downloadBackupList({ name: 'Order Test' }, shuffled);
  const after = shuffled.map((t) => t.num).join(',');
  assert.strictEqual(after, before, 'input array order preserved (no in-place sort)');
  app.close();
});

test('live stats reflect check-ins', async () => {
  const { app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Stats Event', 5);
  await startScan(app, eventId);
  await app.__t.tryCheckIn(tickets[0].id);
  await app.__t.tryCheckIn(tickets[1].id);
  await app.__t.updateStats();
  const stats = app.window.document.getElementById('scan-stats').textContent;
  assert.match(stats, /2\s*checked in/i);
  assert.match(stats, /3\s*remaining/i);
  app.close();
});

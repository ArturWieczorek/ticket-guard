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

test('deleteEvent removes the event and all its tickets, leaving others intact', async () => {
  const { backend, app } = await bootApp();
  const { eventId } = await seedEvent(app, 'Temp Test Event', 4);
  const keep = await seedEvent(app, 'Real Event', 2);

  await app.__t.deleteEvent(eventId);

  const events = await app.__t.getEvents();
  assert.ok(!events.some((e) => e.id === eventId), 'deleted event is gone from the index');
  assert.ok(
    events.some((e) => e.id === keep.eventId),
    'other event is untouched',
  );
  assert.strictEqual((await app.__t.getTickets(eventId)).length, 0, 'its tickets are deleted');
  assert.strictEqual((await app.__t.getTickets(keep.eventId)).length, 2, 'other tickets remain');
  // and nothing for the deleted event lingers in the backend
  const remaining = Object.values(backend.dump('ticketguard_tickets')).filter(
    (t) => t.eventId === eventId,
  );
  assert.strictEqual(remaining.length, 0);
  app.close();
});

test('the Delete button in the event list removes that event', async () => {
  const { app } = await bootApp();
  const { eventId } = await seedEvent(app, 'Click To Delete', 3);
  await app.__t.renderGeneratePanel();

  const btn = app.window.document.querySelector(`.btn-delete-event[data-id="${eventId}"]`);
  assert.ok(btn, 'a delete button is rendered for the event');
  // real click (handler is on addEventListener); window.confirm is stubbed true
  btn.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true }));
  // the handler is async; wait until the event is gone
  let gone = false;
  for (let i = 0; i < 50 && !gone; i++) {
    await tick(app.window, 5);
    gone = !(await app.__t.getEvents()).some((e) => e.id === eventId);
  }
  assert.ok(gone, 'event removed via the button');
  app.close();
});

test('ticket cards render a used state for already-used tickets', async () => {
  const { app } = await bootApp();
  const { tickets } = await seedEvent(app, 'Marks', 3);
  await app.__t.renderGeneratePanel();
  const ev = (await app.__t.getEvents())[0];
  // snapshot where the first ticket is already used
  const snap = tickets.map((tk, i) => ({ ...tk, used: i === 0 }));
  app.window.renderTicketsForPrint(ev, snap);
  app.__t._stopTimers(); // stop the auto-poll; we're asserting the static render

  const grid = app.window.document.getElementById('ticket-grid');
  const used = grid.querySelectorAll('.ticket.used');
  assert.strictEqual(used.length, 1, 'exactly one card marked used');
  assert.strictEqual(used[0].dataset.id, tickets[0].id);
  assert.ok(used[0].querySelector('.used-stamp'), 'a USED stamp is shown on it');
  app.close();
});

test('refreshing the tickets view reflects check-ins made elsewhere', async () => {
  const { app } = await bootApp();
  const { tickets } = await seedEvent(app, 'Refreshable', 3);
  await app.__t.renderGeneratePanel();
  const ev = (await app.__t.getEvents())[0];
  app.window.renderTicketsForPrint(ev, tickets);
  app.__t._stopTimers(); // control timing manually

  const grid = app.window.document.getElementById('ticket-grid');
  assert.strictEqual(grid.querySelectorAll('.ticket.used').length, 0, 'nothing used yet');

  // a phone at the door checks one in
  await app.__t.tryCheckIn(tickets[0].id);
  // the monitor view refreshes (button or auto-poll)
  await app.window.refreshTicketStates(ev, tickets);

  const used = grid.querySelectorAll('.ticket.used');
  assert.strictEqual(used.length, 1, 'the scanned ticket is now marked used');
  assert.strictEqual(used[0].dataset.id, tickets[0].id);
  assert.strictEqual(app.window.document.getElementById('stat-used').textContent, '1');
  assert.strictEqual(app.window.document.getElementById('stat-remaining').textContent, '2');
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

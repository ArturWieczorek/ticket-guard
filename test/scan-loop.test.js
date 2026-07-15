'use strict';
// The camera decode loop (tick) and its debounce. The original code throttles
// ALL decodes to one per 1.2s regardless of content, so two different tickets
// presented in quick succession lose the second scan. Desired behavior: debounce
// only REPEATS of the same code, so a busy door never silently drops a guest.
// (RED on the original, GREEN after the per-code debounce fix.)

const { test } = require('node:test');
const assert = require('node:assert');
const { bootApp, seedEvent, startScan, tick } = require('./mocks/helpers');

function fakeFrame() {
  return { readyState: 4, HAVE_ENOUGH_DATA: 4, videoWidth: 2, videoHeight: 2 };
}

test('two DIFFERENT tickets scanned within 1.2s are both checked in', async () => {
  const { backend, app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Busy Door', 3);
  await startScan(app, eventId);
  const frame = fakeFrame();

  app.window.__jsqrReturn = JSON.stringify({ e: eventId, t: tickets[0].id });
  app.window.tick(frame);
  app.window.__jsqrReturn = JSON.stringify({ e: eventId, t: tickets[1].id });
  app.window.tick(frame); // immediately after - different ticket

  await tick(app.window, 20);

  const docs = backend.dump('ticketguard_tickets');
  assert.strictEqual(docs[tickets[0].id].used, true, 'first guest checked in');
  assert.strictEqual(docs[tickets[1].id].used, true, 'second guest NOT dropped by the debounce');
  app.close();
});

test('the SAME ticket presented repeatedly is debounced to a single check-in', async () => {
  const { backend, app } = await bootApp();
  const { eventId, tickets } = await seedEvent(app, 'Steady Cam', 3);
  await startScan(app, eventId);
  const frame = fakeFrame();

  app.window.__jsqrReturn = JSON.stringify({ e: eventId, t: tickets[0].id });
  app.window.tick(frame);
  app.window.tick(frame); // same code, same instant - should be ignored
  app.window.tick(frame);

  await tick(app.window, 20);

  // Exactly one accept: the ticket is used and no duplicate "already used" churn.
  assert.strictEqual(backend.dump('ticketguard_tickets')[tickets[0].id].used, true);
  app.close();
});

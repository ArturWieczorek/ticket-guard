'use strict';
// The app loads its libraries (QR generate/scan, Firebase) from CDNs via
// <script src> tags. The rest of the suite MOCKS those libraries, so a dead CDN
// URL would never be caught there - yet a dead URL means the real app throws
// "X is not defined" in the browser. This test fetches each script URL for real
// and fails if any is not reachable.
//
// It is network-dependent by nature: if the network is unavailable it SKIPS
// (rather than failing spuriously), but a URL that resolves to a 404/5xx is a
// hard failure.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const urls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);

test('every CDN <script> URL in index.html is reachable (HTTP 200)', async (t) => {
  assert.ok(urls.length >= 1, 'expected at least one CDN script URL');

  const dead = [];
  for (const url of urls) {
    let res;
    try {
      res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
    } catch (e) {
      t.skip(`network unavailable (${e.message}) - skipping CDN reachability check`);
      return;
    }
    if (!res.ok) dead.push(`${res.status} ${url}`);
  }
  assert.deepStrictEqual(dead, [], `dead CDN links found:\n${dead.join('\n')}`);
});

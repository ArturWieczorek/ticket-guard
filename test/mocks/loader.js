'use strict';
// Loads the REAL index.html app script into a jsdom window with mocks wired in.
//
// How faithfulness is preserved:
//  - We build the DOM from index.html WITHOUT its inline app script, so no app
//    code runs until mocks are in place.
//  - We then execute the app's inline script BYTE-FOR-BYTE (only the firebase
//    PASTE_ placeholders are swapped for test values, which is exactly what a
//    real deployer does) via indirect eval in global scope, with a small export
//    shim APPENDED after it. Because it's one compilation unit in global scope,
//    the shim closes over the app's top-level const/let bindings and exposes them
//    as window.__t for assertions. The app's own bytes are unchanged.

const fs = require('fs');
const path = require('path');
const nodeCrypto = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeFirebase } = require('./firebase-mock');
const { makeQRCode, makeJsQR } = require('./qr-mock');

const INDEX = path.join(__dirname, '..', '..', 'index.html');

// Names the shim re-exports. Functions are already globals (function decls);
// getters/setters reach the const/let bindings that are NOT window properties.
const SHIM = `
;window.__t = {
  get STORAGE_MODE(){ return STORAGE_MODE }, set STORAGE_MODE(v){ STORAGE_MODE = v },
  get firebaseReady(){ return firebaseReady },
  get pendingQueue(){ return pendingQueue },
  get conflicts(){ return conflicts },
  get localTickets(){ return localTickets }, set localTickets(v){ localTickets = v },
  get currentEventId(){ return currentEventId }, set currentEventId(v){ currentEventId = v },
  get authIssue(){ return authIssue },
  get pendingSync(){ return pendingSync },
  get lastDecodeTime(){ return (typeof lastDecodeTime!=='undefined')?lastDecodeTime:null },
  get CODE_ALPHABET(){ return CODE_ALPHABET },
  tryCheckIn, processCheckIn, handleScan, retrySync,
  getTickets, createTickets, deleteEvent, getEvents, saveEvents,
  genShortCode, escapeHtml, uid, downloadBackupList,
  renderScanPanel, renderGeneratePanel, startScanning, stopScanning,
  storageTest, updateStats, initFirebase,
  // test-only teardown: kill the RAF/sync timers WITHOUT the async re-render
  // that stopScanning() triggers (which would touch a closed window).
  _stopTimers(){
    try{ if(scanRAF) cancelAnimationFrame(scanRAF); }catch(e){}
    try{ if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); } }catch(e){}
    scanStream = null;
    try{ if(syncTimer){ clearInterval(syncTimer); syncTimer = null; } }catch(e){}
  }
};
`;

function readAppScript() {
  const html = fs.readFileSync(INDEX, 'utf8');
  // The inline app script is the only <script> with no src attribute.
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('could not find inline app script in index.html');
  const appScript = m[1].replace(/PASTE_[A-Z_]+/g, (s) => 'test-' + s.toLowerCase());
  // DOM without the app script (external CDN <script src> tags are left in place;
  // jsdom does not fetch them, so they are inert).
  const domHtml = html.replace(m[0], '');
  return { appScript, domHtml };
}

// Load a fresh app window bound to the given shared backend.
async function loadApp(backend, opts = {}) {
  const { appScript, domHtml } = readAppScript();

  const captured = { blobs: [], consoleErrors: [] };

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => {
    // jsdom emits "Not implemented" errors for navigation/media we intentionally
    // stub; keep real errors, drop the known-inert noise.
    const msg = String(err && err.message);
    if (/Not implemented/.test(msg)) return;
    captured.consoleErrors.push(msg);
  });

  const dom = new JSDOM(domHtml, {
    runScripts: 'dangerously',
    url: 'https://ticketguard.test/',
    virtualConsole,
    beforeParse(window) {
      // --- crypto (uid / genShortCode) ---
      Object.defineProperty(window, 'crypto', { value: nodeCrypto.webcrypto, configurable: true });
      // --- firebase + QR libs the app expects as globals ---
      window.firebase = makeFirebase(backend);
      window.QRCode = makeQRCode(window);
      window.jsQR = makeJsQR(window);
      // jsdom has no canvas 2d context; the decode loop grabs one at load time.
      window.HTMLCanvasElement.prototype.getContext = () => ({
        drawImage() {},
        getImageData: (x, y, w, h) => ({
          data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
          width: w,
          height: h,
        }),
      });
      // --- camera stubs so startScanning() can run without hardware ---
      const fakeStream = { getTracks: () => [{ stop() {} }] };
      Object.defineProperty(window.navigator, 'mediaDevices', {
        value: { getUserMedia: async () => fakeStream },
        configurable: true,
      });
      window.HTMLMediaElement.prototype.play = function () {
        return Promise.resolve();
      };
      // jsdom ships no requestAnimationFrame; the scan decode loop needs one.
      window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 16);
      window.cancelAnimationFrame = (id) => window.clearTimeout(id);
      // --- Blob with a working .text() (jsdom's lacks one) so we can read the
      //     generated backup-list file contents ---
      window.Blob = class Blob {
        constructor(parts, opts) {
          this._text = (parts || []).join('');
          this.type = (opts && opts.type) || '';
        }
        get size() {
          return this._text.length;
        }
        async text() {
          return this._text;
        }
      };
      // --- capture blob downloads (backup list) ---
      window.URL.createObjectURL = (blob) => {
        captured.blobs.push(blob);
        return 'blob:mock/' + captured.blobs.length;
      };
      window.URL.revokeObjectURL = () => {};
      // --- keep window.print() from throwing ---
      window.print = () => {};
      // --- confirm() defaults to true in tests (delete flows use it) ---
      window.confirm = () => true;
      // --- seed localStorage to simulate a page reload carrying prior state ---
      if (opts.seedStorage) {
        for (const [k, v] of Object.entries(opts.seedStorage)) {
          window.localStorage.setItem(k, v);
        }
      }
    },
  });

  const { window } = dom;
  // Run the real app script + shim as one global-scope program.
  window.eval(appScript + SHIM);

  return {
    dom,
    window,
    document: window.document,
    __t: window.__t,
    captured,
    // Sign in a staff user and wait for the app to switch to the authed view.
    async signIn(email, password) {
      backend.addUser(email, password);
      await window.firebase.auth().signInWithEmailAndPassword(email, password);
      await tick(window);
    },
    async readLastBlobText() {
      const b = captured.blobs[captured.blobs.length - 1];
      return b ? await b.text() : null;
    },
    // Snapshot everything in localStorage (to seed a simulated reload elsewhere).
    dumpStorage() {
      const out = {};
      const ls = window.localStorage;
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        out[k] = ls.getItem(k);
      }
      return out;
    },
    close() {
      try {
        window.__t && window.__t._stopTimers();
      } catch {
        /* ignore */
      }
      try {
        window.close();
      } catch {
        /* ignore */
      }
    },
  };
}

// Let queued microtasks/timers settle (auth callbacks, storageTest round-trip).
function tick(window, ms = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

module.exports = { loadApp, tick };

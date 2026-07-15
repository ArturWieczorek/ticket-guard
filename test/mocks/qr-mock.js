'use strict';
// Minimal stand-ins for the two CDN QR libraries.
//  - QRCode: the app does `new QRCode(el, {text, ...})`. We just record the
//    encoded text on the element so tests can assert what got embedded, and
//    drop in a child node so downstream DOM code sees a rendered QR.
//  - jsQR: the camera decode path. Tests drive check-ins by calling
//    handleScan(payload) directly, so jsQR can safely always return null.

function makeQRCode(window) {
  return function QRCode(el, opts) {
    this.text = opts && opts.text;
    if (el) {
      el.setAttribute('data-qr-text', this.text || '');
      const c = window.document.createElement('canvas');
      el.appendChild(c);
    }
  };
}

// jsQR normally decodes a camera frame. Tests drive most check-ins by calling
// handleScan() directly, but to exercise the tick() decode/debounce loop we let
// a test stage the next decode via window.__jsqrReturn (a payload string) - and
// window.__jsqrCalls records how many frames were decoded.
function makeJsQR(window) {
  return function jsQR() {
    window.__jsqrCalls = (window.__jsqrCalls || 0) + 1;
    return window.__jsqrReturn ? { data: window.__jsqrReturn } : null;
  };
}

module.exports = { makeQRCode, makeJsQR };

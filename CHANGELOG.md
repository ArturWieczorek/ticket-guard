# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Repeat-attempt log** on the Scan tab (per device, per event): a glance-able
  list of tickets scanned again after already being used (number, code, count,
  last time), newest first, persisted across reloads. It does not affect entry -
  the real-time "already used" banner still blocks duplicates on every device -
  it is purely a local record.

- **Used-ticket marking in the event view**: checked-in tickets are dimmed with a
  red border and a "Used" stamp. The view auto-refreshes every few seconds (and
  has a Refresh button), updating the marks and counts in place without redrawing
  the QR codes - so a monitor showing the tickets stays current as people are
  scanned in.
- **Polish / English language support**: the interface defaults to Polish, with
  a language toggle in the top bar; the choice is remembered per browser. Covers
  all visible labels and messages (Firebase's own error strings are passed
  through). Code identifiers and stored data are unaffected.
- **Delete event**: a Delete button on each event in the Generate tab (with a
  confirmation) removes the event and all of its ticket documents, and clears its
  offline cache.
- A test (`test/cdn-links.test.js`) that fetches every `<script src>` CDN URL in
  `index.html` and fails if any is unreachable, so a dead link can't regress
  again. (The other tests mock these libraries and can't catch a bad URL.)

### Fixed

- Corrected the jsQR library URL - the previous cdnjs path returned 404, which
  broke the door scanner ("jsQR is not defined"). Now loaded from jsDelivr.

## [1.0.0] - 2026-07-15

First professional, tested release.

### Added

- **Automated test suite** (`test/`): ~35 tests run with Node's built-in test
  runner against a faithful Firebase mock (real optimistic-concurrency
  transactions, injectable network/auth failures). Covers concurrency, outage /
  offline, security, functional flows, and auth gating.
- **Offline persistence**: the ticket list, the events index, and any
  not-yet-synced check-ins are cached in `localStorage`, so a scanner can
  cold-start with no network and survive a tab reload without losing queued
  check-ins.
- **Reconnect re-probe**: a scanner that started offline now re-probes storage
  when the network returns, so its queued check-ins actually reach the shared
  database.
- Tooling: ESLint (flat config, incl. `@html-eslint`), Prettier, markdownlint,
  EditorConfig.
- CI (GitHub Actions) that lints, checks formatting, and runs tests, then deploys
  to GitHub Pages only when they pass.
- Documentation: `README`, `docs/SETUP.md` (Firebase + GitHub Pages for
  first-timers), `SECURITY.md` (threat model + audit), `docs/DESIGN.md`,
  `CONTRIBUTING.md`, `AGENTS.md`, and an MIT `LICENSE`.

### Changed

- **Scan debounce** now debounces only *repeats* of the same code, so two
  different tickets scanned within ~1.2 s are both accepted (previously the second
  was silently dropped).
- Firestore rules guidance hardened to a **staff email allowlist**, with public
  sign-up disabled (see `SECURITY.md`).

### Security

- **QR / ticket-id validation** in the scan handler: malformed, missing,
  oversized, non-string, or path-like ids are rejected before reaching Firestore.
- **Cryptographic RNG** for the printed short codes (was `Math.random()`).

### Fixed

- `downloadBackupList` no longer sorts its input array in place.
- Event-name input is length-capped.

[Unreleased]: https://github.com/ArturWieczorek/ticket-guard/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ArturWieczorek/ticket-guard/releases/tag/v1.0.0

# AGENTS.md

Guidance for AI coding agents working in this repository. (Humans: see
[CONTRIBUTING.md](./CONTRIBUTING.md).)

## What this project is

TicketGuard: a single-file web app (`index.html`) that generates and validates QR
tickets for library events, backed by Firebase, with an offline paper fallback.

## Repository map

- `index.html` - the entire application (HTML + inline CSS + inline JS). No build.
- `test/` - Node test suite (`*.test.js`) and `test/mocks/` (the harness).
- `docs/SETUP.md` - Firebase + GitHub Pages setup. `docs/DESIGN.md` - rationale.
- `SECURITY.md` - threat model + audit. `.github/workflows/ci.yml` - CI + deploy.

## Commands

```bash
npm install
npm test            # node --test --test-force-exit "test/**/*.test.js"
npm run lint        # eslint . + markdownlint
npm run format      # prettier --write .
npm run ci          # lint + format:check + test  (run this before finishing)
```

## Hard constraints - do not violate

- **Keep `index.html` a single, self-contained static file.** No build tooling,
  no framework, no npm imports into the app. Third-party libs stay CDN `<script>`
  tags. Dev tooling (eslint/prettier/tests) is fine - it never ships.
- **Never commit real secrets.** The Firebase web config is public by design;
  everything else stays out (`.gitignore` covers `.env`).
- **TDD.** Change behavior only alongside a test in `test/` that covers it. The
  suite loads the real `index.html`, so it truly gates behavior.
- **Preserve the offline/emergency path.** It's the reason this app exists.

## How the test harness works (and its gotchas)

The harness runs the app's _real_ inline script in jsdom against a shared,
in-memory Firebase mock. Key files: `test/mocks/loader.js` (loads app + injects
mocks + exposes internals as `window.__t`), `backend.js` (Firestore mock with
genuine optimistic-concurrency transactions + `setFailMode`/`setTxReadDelay`),
`firebase-mock.js`, `helpers.js` (`bootApp`, `seedEvent`, `startScan`).

Gotchas that will bite you:

- **Cross-realm values.** Objects/arrays returned by app functions live in the
  jsdom realm; their prototype differs from Node's, so `assert.deepStrictEqual`
  fails on structurally-equal arrays. Spread into a Node array first:
  `assert.deepStrictEqual([...result].map(...), [...])`.
- **Timers keep Node alive.** The app uses `setInterval`/RAF; the suite runs with
  `--test-force-exit`, and tests call `app.close()` (which calls the harness
  `_stopTimers`) instead of `stopScanning()` for teardown (the latter kicks off
  an async re-render that touches a closed window).
- **Forcing the concurrency race.** `backend.setTxReadDelay(ms)` widens the window
  between a transaction's read and its commit so concurrent check-ins truly
  contend. Assert `backend.state.commitConflicts >= 1` to prove the retry path
  ran.
- **Offline/auth injection.** `backend.setFailMode('network' | 'auth' | null)`
  simulates outages vs. rules/sign-in failures. Auth sessions are per-window; the
  user directory is shared across windows (mirrors real devices).
- Deterministic setup: `bootApp` waits for `STORAGE_MODE` to leave `'checking'`
  before returning, so storage-mode races don't cause flakiness.

## Conventions

- Match the existing style in `index.html` (terse, commented where non-obvious).
- Prettier owns formatting; ESLint enforces correctness only (HTML stylistic
  rules are intentionally off to avoid fighting Prettier).
- Update `CHANGELOG.md` (Unreleased) for user-visible changes; update
  `SECURITY.md` for anything security-relevant.

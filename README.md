# TicketGuard

[![CI](https://github.com/ArturWieczorek/ticket-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/ArturWieczorek/ticket-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)

Print and validate anti-counterfeiting **QR tickets for library events** - with a
fully-offline paper fallback for when the app, the network, or the whole venue's
power is down.

TicketGuard is a **single static HTML file** backed by Firebase. Librarians open a
link, sign in once, then generate printable tickets or scan people in at the door
with a phone camera. Two staff can scan the same door at once without ever letting
a copied ticket through twice.

> Built for a communal library that used to print plain paper tickets - until
> someone photocopied them and more people showed up than there were seats.

---

## Features

- 🎟️ **Generate** numbered tickets with a QR code and a short human-readable code,
  printable in small batches as people register.
- 📷 **Scan** tickets at the door with a phone camera; a ticket can be accepted
  **exactly once**, enforced by a database transaction (safe with multiple
  scanners at the same door).
- 📴 **Emergency mode** - the printed tickets and a downloadable checklist work
  with **no app and no internet at all**. Verdicts are **online-only**: a ticket
  is declared valid/used only by the shared database, so duplicates are caught in
  real time on every device. With no connection the app never guesses - it says
  "can't verify, use the paper list," and the printed checklist is the outage
  procedure.
- 🔒 **Server-enforced security** - every read/write requires a signed-in staff
  account, enforced by Firestore rules, not just the UI.
- 🧰 **No build step** - one `index.html`, hosted free on GitHub Pages.

## Is GitHub Pages a good idea for this?

**Yes.** It's static, free, permanent, and serves real HTTPS - which the camera
API _requires_. The site being public is fine because **there are no secrets in
the page**: the Firebase config is meant to be public, and the real security
boundary is server-side (Firebase Authentication + Firestore rules). The two
things you must do to keep it safe are covered in [setup](docs/SETUP.md) and
[SECURITY.md](./SECURITY.md): **disable public sign-up** and restrict Firestore
rules to a **staff email allowlist**. See [SECURITY.md](./SECURITY.md) for the
full threat model.

## For librarians (day-to-day)

1. Open the bookmarked link and **sign in** with your staff email/password.
2. **Generate** tab → name the event, choose how many tickets → print a batch and
   hand them out. Also click **Download emergency backup list** and keep a printed
   copy at the door.
3. **Scan door** tab → pick the event → **Start camera** → point at each ticket's
   QR. Green = welcome; red = already used / not valid.
4. If everything is down: use the printed backup list and cross off the ticket
   number **and** code by hand.

## Setup (one-time, technical)

Full click-by-click instructions for someone who has never used Firebase or
GitHub are in **[docs/SETUP.md](docs/SETUP.md)**. In short:

1. Create a free Firebase project → enable Firestore + Email/Password auth.
2. **Disable public sign-up** and paste the **allowlist** Firestore rules.
3. Add your staff users; paste the Firebase web config into `index.html`.
4. Push this repo to GitHub and enable Pages (GitHub Actions). Deploys run only
   after tests pass.

## Development

```bash
npm install        # install dev tooling + test deps
npm test           # run the test suite (node --test, ~35 tests)
npm run lint       # eslint + markdownlint
npm run format     # prettier --write
npm run ci         # lint + format:check + test (what CI runs)
```

The test suite loads the **real** `index.html` in jsdom and drives it against a
faithful Firebase mock (genuine optimistic-concurrency transactions, injectable
network/auth failures). It covers concurrency, outage/offline, security, and the
happy paths. See [CONTRIBUTING.md](./CONTRIBUTING.md) and, for AI agents,
[AGENTS.md](./AGENTS.md).

## Tech

- Plain HTML/CSS/JS, no framework, no bundler (`index.html`).
- [Firebase](https://firebase.google.com/) - Firestore (data) + Authentication.
- `qrcodejs` (generate) and `jsQR` (scan), loaded from a CDN.
- Tests: Node's built-in test runner + [jsdom](https://github.com/jsdom/jsdom).

## Documentation

- [docs/SETUP.md](docs/SETUP.md) - Firebase + GitHub Pages, step by step.
- [SECURITY.md](./SECURITY.md) - threat model, hardening, how to report issues.
- [docs/DESIGN.md](docs/DESIGN.md) - architecture and the reasoning behind it.
- [CHANGELOG.md](./CHANGELOG.md) - notable changes.

## License

[MIT](./LICENSE). Update the copyright holder in `LICENSE` to your name or your
library's if you like.

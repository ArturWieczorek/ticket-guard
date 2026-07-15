# Design notes

Why TicketGuard is built the way it is. For setup see [SETUP.md](./SETUP.md); for
the threat model see [SECURITY.md](../SECURITY.md).

## The problem

A communal library runs occasional social events and used to hand out plain paper
tickets. With no anti-counterfeiting measure, someone photocopied them and more
people arrived with "valid" tickets than there were seats. TicketGuard replaces
those with QR-coded tickets that can be validated once each - while staying usable
when technology fails.

## Requirements that shaped it

1. Stop ticket duplication.
2. Reusable indefinitely (several events a year), on free permanent hosting, no
   expiring trials or credit card.
3. Trivial day-to-day use for non-technical librarians; one-time technical setup
   is acceptable.
4. Multiple librarians scanning the same door at once must never accept one ticket
   twice.
5. A fully offline emergency path: if the scanner, app, internet, or power is
   down, staff can still check people in with paper.
6. Tickets handed out in person on request, no name tracking, printable in small
   batches.
7. Security enforced by the database, not just the UI.

## Architecture at a glance

- **One static file** (`index.html`): plain HTML/CSS/JS, no build step, no
  framework. Hosted free on GitHub Pages (real HTTPS, which the camera requires).
- **Firebase** backend: Firestore (data) + Authentication (staff sign-in).
- **CDN libraries**: `qrcodejs` (draw QR codes to print), `jsQR` (decode camera
  frames), Firebase compat SDK (works with plain `<script>` tags, no bundler).

The single-file choice is deliberate: it's the cheapest thing to host, the easiest
to hand to a non-technical maintainer, and it has no supply chain beyond a few
pinned CDN scripts.

## Data model (Firestore)

- **`ticketguard`** - small singleton docs. `events-index` holds a JSON array of
  event metadata; also mirrored to `localStorage` so the event list survives a
  fully-offline start.
- **`ticketguard_tickets`** - **one document per ticket** (`eventId`, `num`,
  `shortCode`, `used`, `usedAt`). One-doc-per-ticket is essential: an earlier
  design stored a whole array per event, and two phones checking in different
  tickets would read-modify-write the whole array and clobber each other. Splitting
  into per-ticket documents plus a transaction fixes that.

Each ticket's document id is a random string, embedded in the QR as
`{"e": eventId, "t": ticketId}`. That id is the only thing the live scan path
trusts; `num` and `shortCode` are human-facing, for print and the paper fallback.

## The two printed identifiers

Every ticket shows both a **sequential number** (e.g. `007`, for humans sorting a
stack and matching the backup list) and a **5-character random code** (e.g.
`Q7X2P`, from an unambiguous alphabet, generated with a crypto RNG). The number
alone is guessable - anyone could write `014` on blank paper. The random code
means forging a ticket requires having _seen_ a real one. (It can't stop someone
hand-copying a ticket they've seen; only the live QR/database check closes that -
see [SECURITY.md](../SECURITY.md).)

## Concurrency: exactly-once check-in

`tryCheckIn()` runs a Firestore **transaction**: read the ticket, and if it isn't
already used, atomically mark it used. Because the transaction is resolved by the
database (optimistic concurrency: commit only if what was read hasn't changed,
retry otherwise), two phones scanning the same ticket at the same instant always
produce exactly one acceptance and one "already used" - never two acceptances.
Two phones scanning _different_ tickets never interfere.

## Offline / emergency model

Verdicts are **online-only** by design. This is a deliberate correctness choice
for a door where a wrong call is unacceptable: a ticket is declared valid or
already-used **only** by the shared database (the `tryCheckIn` transaction), so
the exactly-once guarantee is absolute and two devices can never disagree.

Two layers, escalating as more fails:

1. **Network drops at the door.** The app does not guess from any cache. A scan
   shows "can't verify - use the paper list" and changes nothing. (An earlier
   design cached tickets and let the scanner check people in offline; it was
   removed because offline devices cannot coordinate, so it could not guarantee
   exactly-once and caused the scanner and the event view to disagree.)
2. **Everything down (no app, no power).** Each printed ticket carries its number,
   code, and QR; a downloadable plain-text **backup checklist** (generated fully
   client-side) lets staff cross off arrivals by hand, matching both the number
   and the code. This is the true emergency path - the only caveat is that the app
   itself can't _first_ load without internet, since its libraries come from a
   CDN, so print the tickets and the checklist ahead of time.

## Testing

The app's real code is exercised by an automated suite (`test/`) that loads
`index.html` in jsdom and drives it against a faithful Firestore mock with genuine
optimistic-concurrency transactions and injectable network/auth failures. It
covers the concurrency guarantee (including forced races and two independent
windows on one backend), the full outage/offline surface, security (output
escaping, hostile QR payloads, input validation), the generate/print/backup flows,
and auth gating. See [CONTRIBUTING.md](../CONTRIBUTING.md) and
[AGENTS.md](../AGENTS.md) for how the harness works.

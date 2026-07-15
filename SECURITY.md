# Security

This document is both the **security policy** (how to report issues) and a
**threat model + audit** for TicketGuard. It's deliberately plain-language: this
is a tool run by librarians, not security engineers.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Instead, use
GitHub's **Report a vulnerability** button (repository → **Security → Advisories**),
or contact the maintainer privately. We'll acknowledge within a few days.

## What we're protecting against

The real-world threat is modest and specific: **people getting in with copied or
fake tickets** at a free community event. We are _not_ defending high-value assets
or facing determined attackers. The design reflects that.

## The security boundary

TicketGuard is a public web page. **It contains no secrets.** The Firebase
`apiKey` in `index.html` is _designed_ to be public - it only identifies the
project, it does not grant access. All real enforcement happens on Google's
servers via:

1. **Firebase Authentication** - every action requires a signed-in staff user.
2. **Firestore security rules** - the database itself rejects reads/writes from
   anyone who isn't allowlisted staff.

The UI checks are conveniences; the rules are the wall.

## Audit finding: public sign-up must be disabled (important)

Because the API key is public and enables Firebase's client REST API, a plain
`allow if request.auth != null` rule is **not** safe on a public site: anyone
could call Firebase's sign-up endpoint, create their own account, and then pass
that rule - gaining full read/write to every ticket.

**Two required mitigations (both applied in [setup](docs/SETUP.md)):**

1. **Disable public sign-up** - Firebase Console → Authentication → Settings →
   User actions → turn **off** "Enable create (sign-up)". Staff are added
   manually.
2. **Allowlist staff emails in the rules** - so even if an account is somehow
   created, it can't touch the data unless its email is on the list:

   ```txt
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function isStaff() {
         return request.auth != null && request.auth.token.email in [
           'librarian1@example.org',
           'librarian2@example.org'
         ];
       }
       match /{document=**} {
         allow read, write: if isStaff();
       }
     }
   }
   ```

Defense in depth: disabling sign-up closes the door; the allowlist means that
even if the door is reopened by mistake, the room is still locked.

## Is public hosting on GitHub Pages safe?

Yes, given the above. The site is static and public, but that's fine because:

- No secrets live in the page.
- The camera API **requires** HTTPS, which Pages provides.
- Deploys are **gated by CI** - a commit that breaks the tests won't go live.

## How specific protections work

- **No double-entry, even with multiple scanners.** Check-in runs inside a
  Firestore transaction, so the same ticket resolves to exactly one acceptance no
  matter how many phones scan it at the same instant. (Proven by the concurrency
  tests.)
- **QR payloads are validated** before use - malformed, oversized, non-string, or
  path-like ticket ids (`/`, `..`) are rejected up front, not sent to the
  database.
- **Output is HTML-escaped** on every render path (event names, emails), so a
  crafted event name can't inject script.
- **Short codes** use a cryptographic RNG over an unambiguous alphabet.

## Accepted / residual risks (by design)

- **Hand-copied paper tickets.** Someone who _sees_ a real ticket can copy its
  printed number + code onto blank paper. No purely visual identifier can prevent
  this; only the live QR/database check fully closes it. The random code raises
  the bar so a fake can't be fabricated _without_ seeing a real one.
- **Shared staff role.** Any signed-in staff account can generate and scan; there
  are no per-role restrictions. Appropriate for a small trusted team.
- **No offline verdicts (by design).** Verdicts are online-only: the app only
  declares a ticket valid/used when it can reach the database, guaranteeing the
  exactly-once property with no chance of two devices disagreeing. With no
  connection it does not guess - it shows "can't verify, use the paper list," and
  the printed backup checklist is the outage procedure.
- **No extra rate-limiting** beyond Firebase's own defaults.

## Keeping it secure over time

- When staff change, update **both** the Users list and the rules allowlist.
- Never commit a real `.env` or private keys (the `.gitignore` blocks common
  ones). The Firebase web config is the only Firebase value in the repo, and it
  is public by design.

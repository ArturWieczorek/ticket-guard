# Contributing

Thanks for helping improve TicketGuard. It's a small, deliberately simple
project; these notes keep it that way.

## Ground rules

- **`index.html` stays a single, self-contained static file.** No build step, no
  framework, no bundler. Libraries load from a CDN via `<script>` tags. This is a
  hard constraint - it's what makes the app free to host and trivial to deploy.
- **Test-first (TDD).** Add or update a test in `test/` that fails, then make it
  pass. The suite loads the _real_ `index.html`, so it genuinely guards behavior.
- **Keep it accessible to non-technical users.** UI copy should be plain; the
  emergency/offline path must never regress.

## Local development

```bash
npm install       # dev tooling + test deps
npm test          # ~35 tests via node --test
npm run lint      # eslint + markdownlint
npm run format    # prettier --write .
npm run ci        # exactly what CI runs: lint + format:check + test
```

Run `npm run ci` before opening a pull request - CI runs the same thing and gates
deployment on it.

## How the tests work

The harness (`test/mocks/`) runs the app's real inline script in
[jsdom](https://github.com/jsdom/jsdom) against an in-memory Firebase mock with
**genuine optimistic-concurrency transactions** and injectable network/auth
failures. See [AGENTS.md](./AGENTS.md) for the harness gotchas (the most common
one: values returned from the app live in the jsdom realm, so spread them into a
Node array before `assert.deepStrictEqual`).

Test files live in `test/*.test.js`, one per concern: `concurrency`, `outage`,
`security`, `functional`, `scan-loop`, `auth`, plus `smoke`.

## Commit / PR conventions

- Small, focused commits with clear messages.
- Update [CHANGELOG.md](./CHANGELOG.md) under **Unreleased** for user-visible
  changes.
- If you change anything security-relevant (auth, rules, QR handling), note it in
  [SECURITY.md](./SECURITY.md) too.

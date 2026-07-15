# Firebase plan: free vs. upgrade (and how not to overpay or get abused)

Firebase's database has usage limits. This page explains the free plan, when (and
whether) to upgrade, and - if you do upgrade - exactly what to switch on so you
never get a surprise bill or get abused through the public API key.

## TL;DR

- For a small library, the **free (Spark) plan is enough** after this app's
  read-frugality fixes. A normal event stays well within the limits.
- The catch with the free plan: if you ever exceed the daily limit, the database
  **pauses until the next day**, so a scan shows "can't verify" (Nie mozna
  zweryfikowac) until it resets.
- For a critical event where a mid-event cutoff is unacceptable, the **Blaze
  (pay-as-you-go) plan is safer** because it removes that hard cap - and it stays
  **effectively $0** at a library's scale, **provided you set a budget alert**.

## The free-tier (Spark) limits

Per **day**, per project:

- ~50,000 document reads
- ~20,000 document writes
- ~20,000 document deletes
- 1 GiB stored

The daily counters **reset automatically** (around midnight US-Pacific, i.e.
roughly 09:00 CEST). If you hit a limit, reads/writes fail with "Quota exceeded"
and the app shows "can't verify" until the reset. Nothing is lost; it recovers on
its own.

Check current usage any time: **Firebase console -> Firestore Database -> Usage**.

## Spark vs. Blaze

| Topic                         | Spark (free)                   | Blaze (pay-as-you-go)                          |
| ----------------------------- | ------------------------------ | ---------------------------------------------- |
| Cost at a library's scale     | $0                             | ~$0 (same free tier, then pennies)             |
| Free daily allowance          | 50k reads / 20k writes         | **Same** 50k reads / 20k writes, then billed   |
| If you exceed the daily limit | **Service pauses** until reset | Keeps working, bills a few cents               |
| Credit card required          | No                             | Yes                                            |
| Risk of a runaway bill        | None (hard cap)                | Real **unless** you set a budget alert (below) |
| Best for                      | Small/occasional use, no card  | A critical event that must not cut out midway  |

## How much this app actually uses

After the fixes, usage is small (this is why Spark is usually fine):

| Action                            | Database reads                  |
| --------------------------------- | ------------------------------- |
| Start a scan session              | ~1 (loads the ticket list once) |
| Each person checked in            | ~1 read + 1 write (transaction) |
| Click "Refresh" on the event view | ~1                              |
| Leaving any view open             | **0** (no background polling)   |

A few-hundred-attendee event is nowhere near the daily limits.

## Recommendation

- **Staying free is fine** for normal use now that background reads are gone. The
  only downside is the theoretical hard cutoff on an unusually busy day.
- **For peace of mind on event day** (a door that must not freeze mid-event),
  upgrade to **Blaze and set a budget alert**. At your volume it stays free, and
  you remove the one scenario where the free plan could stop you.

## If you upgrade to Blaze: protect yourself (do this)

Blaze has **no hard spending cap by default**, so set these up right away.

### 1. Budget + email alerts (2 minutes, essential)

1. Go to the Google Cloud console -> **Billing -> Budgets & alerts**.
2. **Create budget**, scope it to this project.
3. Set a small amount (e.g. **$5/month**) and alert thresholds (e.g. 20%, 50%,
   100%). You'll get an email if usage ever approaches them.

This does not cap spending by itself - it **warns** you early. At a library's
scale you should simply never see these emails.

### 2. Optional hard stop

If you want a true "never spend more than X" guarantee, you can wire a budget to a
Cloud Function that disables billing when the threshold is hit (Google publishes a
template: search "Cloud Billing budget disable billing"). This is advanced and
usually overkill for a library - the budget alert above is normally enough.

### 3. Lock down the public API key (anti-abuse)

The Firebase API key in `index.html` is **public by design** (see
[SECURITY.md](../SECURITY.md)); it only identifies the project. Abuse is already
limited by two things you set during [setup](SETUP.md):

- **Firestore rules restrict access to your staff email allowlist**, so a stranger
  cannot read or write your data.
- **Public sign-up is disabled**, so strangers cannot create accounts.

For extra defense on a public site, add one or both:

- **API key restriction**: Google Cloud console -> **APIs & Services ->
  Credentials** -> your browser key -> **Application restrictions -> Websites** ->
  allow only your domains (e.g. `bilety.arturwieczorek.com/*` and
  `<your-username>.github.io/*`). This stops the key being used from other sites.
- **App Check**: Firebase console -> **App Check** -> enable for Firestore with
  the reCAPTCHA provider. This ensures requests come from your real app, not a
  script. (Optional; adds a little setup.)

## Bottom line

- Small library, no card: **stay on Spark**, mind the daily limit.
- Want zero chance of a mid-event cutoff: **Blaze + a $5 budget alert**, still
  effectively free, and add the API-key website restriction so nobody else can use
  your project.

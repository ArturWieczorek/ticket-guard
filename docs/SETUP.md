# Setup guide - Firebase + GitHub Pages

This walks you through everything, assuming you have **never used Firebase or
GitHub before**. It takes about 30-45 minutes once. When you're done you'll have
a public link your librarians bookmark, and a database only your staff can touch.

There are two halves:

- **Part A - Firebase** (the free database + staff logins).
- **Part B - GitHub** (hosting the app for free at a public link).

Throughout, replace anything in `<angle brackets>` with your own values.

---

## Part A - Firebase

Firebase is Google's free backend. On the free **Spark** plan you do **not** need
a credit card. It stores which tickets exist and which have been used, and it
handles staff sign-in.

> The free plan has a daily usage limit; if you expect a large event or want no
> chance of a mid-event cutoff, see [FIREBASE-PLAN.md](FIREBASE-PLAN.md) for the
> free-vs-paid comparison, how to set a budget alert, and how to lock down the
> public API key.

### A1. Create a project

1. Go to <https://console.firebase.google.com/> and sign in with a Google account.
2. Click **Add project** (or **Create a project**).
3. Name it e.g. `library-tickets`. Click **Continue**.
4. You can **turn off Google Analytics** (not needed). Click **Create project**,
   wait, then **Continue**.

### A2. Register a Web app and copy the config

1. On the project home, click the **web icon** `</>` ("Add app" → Web).
2. Give it a nickname (e.g. `TicketGuard`). You do **not** need Firebase Hosting.
   Click **Register app**.
3. Firebase shows a `firebaseConfig` block that looks like this:

   ```js
   const firebaseConfig = {
     apiKey: 'AIzaSy...',
     authDomain: 'library-tickets.firebaseapp.com',
     projectId: 'library-tickets',
     storageBucket: 'library-tickets.appspot.com',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abc123',
   };
   ```

4. **Copy these values** - you'll paste them into `index.html` in step A7.
   (These are safe to make public; see [SECURITY.md](../SECURITY.md).)

### A3. Create the Firestore database

1. Left menu → **Build → Firestore Database** → **Create database**.
2. Choose a location near you. Start in **production mode** (we set proper rules
   next). Click **Enable**.

### A4. Paste the security rules (staff allowlist)

This is the most important security step. It ensures only _your_ librarians can
read or write, even though the app link is public.

1. In **Firestore Database**, open the **Rules** tab.
2. Replace everything there with the block below, putting your librarians'
   **sign-in emails** in the list:

   ```txt
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Only these signed-in staff may read/write. Edit the list when staff
       // change. Emails must exactly match the sign-in emails from step A6.
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

3. Click **Publish**.

> Why an allowlist and not just "any signed-in user"? Because the app's public
> API key can be used to _self-register_ an account (see A5). The allowlist means
> even someone who creates an account can't read or change your tickets.

### A5. Enable Email/Password sign-in AND disable public sign-up

1. Left menu → **Build → Authentication** → **Get started**.
2. **Sign-in method** tab → enable **Email/Password** → **Save**.
3. Still in **Authentication**, open **Settings → User actions** and
   **turn OFF "Enable create (sign-up)"**. This stops strangers from creating
   accounts through the public API. (You'll still add staff manually below.)

### A6. Add your staff users

1. **Authentication → Users → Add user**.
2. Enter each librarian's **email** and a **password**. Repeat for each person.
3. Make sure every email here is **also** listed in the rules from step A4.

### A7. Paste your config into the app

1. Open `index.html` in a text editor.
2. Near the top of the `<script>` block, find `const firebaseConfig = {` with
   `PASTE_...` placeholders.
3. Replace the placeholders with the values you copied in **A2**. Save.

That's Firebase done. Next, put the app online.

---

## Part B - GitHub (hosting on GitHub Pages)

GitHub Pages serves the single `index.html` for free over HTTPS. HTTPS is
required for the phone camera to work at all.

### B1. Create a GitHub account and repository

1. Sign up / sign in at <https://github.com/>.
2. Click **New repository**. Name it e.g. `library-tickets`. Set it **Public**.
   Do **not** add a README (this project already has one). Click
   **Create repository**.

### B2. Push this project to the repository

If the repo was already initialized locally (the setup did `git init` with an
initial commit), just connect it and push:

```bash
git remote add origin https://github.com/<your-username>/<repo>.git
git branch -M main
git push -u origin main
```

If you're starting from a plain folder instead:

```bash
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main
```

GitHub will ask you to sign in (a browser prompt or a Personal Access Token).

### B3. Turn on GitHub Pages (via Actions)

1. In your repo → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. That's it - the included workflow (`.github/workflows/ci.yml`) runs the tests
   and, only if they pass, publishes the site. Watch progress in the **Actions**
   tab. The first run takes a couple of minutes.

### B4. Get your link

After the deploy succeeds, your app is live at:

```txt
https://<your-username>.github.io/<repo>/
```

Open it, and you should see the **Staff sign-in** screen. Bookmark this link on
each librarian's phone.

> **Camera note:** camera access only works on this real `https://...github.io`
> address (or another HTTPS site). It will **not** work from a file opened
> locally or from an in-app preview pane.

---

## Final check

1. Open the link, sign in with a staff account from A6.
2. **Generate** tab → create a small test event (say 3 tickets) → print or view.
3. **Scan door** tab → pick the event → **Start camera** → scan a ticket.
   - Green banner = accepted. Scan the same one again → red "ALREADY USED".
4. Click **Download emergency backup list** and confirm you get a `.txt` file
   listing the tickets - that's your no-power, no-internet fallback.

If sign-in fails or scanning says the database is unreachable, re-check that the
email is in **both** the Users list (A6) and the rules allowlist (A4), and that
you published the rules (A4 step 3).

## Updating staff later

- **Add/remove a librarian:** add or delete them in **Authentication → Users**,
  **and** update the email list in **Firestore → Rules** (then **Publish**).
- **Change the app:** edit `index.html`, commit, and `git push`. CI re-runs the
  tests and redeploys automatically.

# Plan: move kip's user-visible domains to `kip.hafa.cc`

Users currently see the Firebase project's own domain in three places:

- the Google sign-in popup ("continue to hafaio-kip-dev.firebaseapp.com")
- sign-in-link and verification emails, sent from `noreply@hafaio-kip-dev.firebaseapp.com`
- the links inside those emails

kip's notification emails also come from a Gmail address,
`kip.hafaio.noreply@gmail.com`.

The project ID can't be renamed. After this plan:

- sign-in and email links use `kip.hafa.cc`
- all mail comes from `notif@kip.hafa.cc`

`kip.hafa.cc` can hold all of this at once, because each service's DNS records sit on
different names:

- Firebase Hosting: A records on `kip.hafa.cc`
- Firebase's email records: TXT and `…_domainkey` records
- Resend's records: `resend._domainkey` and `send.kip.hafa.cc`

## Manual steps (in order)

1. **Public-facing name.** Set it to `kip` at
   https://console.firebase.google.com/project/hafaio-kip-dev/settings/general.
   It's the app name used in the auth emails.
2. **Connect `kip.hafa.cc` to Firebase Hosting.** Go to
   https://console.firebase.google.com/project/hafaio-kip-dev/hosting/sites, open the
   `hafaio-kip-dev` site, choose "Add custom domain" and enter `kip.hafa.cc`.
   - Add the records it shows in Cloudflare DNS, set to **DNS only** (grey cloud).
   - Wait until it says Connected. The sign-in pages under `/__/auth/` are served on
     any Hosting domain without a deploy.
3. **Authorized domain.** Add `kip.hafa.cc` under Authorized domains at
   https://console.firebase.google.com/project/hafaio-kip-dev/authentication/settings.
4. **Google sign-in client.** Go to
   https://console.cloud.google.com/apis/credentials?project=hafaio-kip-dev and open
   the "Web client (auto created by Google Service)".
   - Add `https://kip.hafa.cc` to Authorized JavaScript origins.
   - Add `https://kip.hafa.cc/__/auth/handler` to Authorized redirect URIs.
5. **Google consent screen branding.** Go to
   https://console.cloud.google.com/auth/branding?project=hafaio-kip-dev.
   - App name: `kip`
   - Home page: `https://hafa.cc/kip/`
   - Privacy policy: `https://hafa.cc/kip/privacy/`
   - Terms: `https://hafa.cc/kip/terms/`
   - Authorized domain: `hafa.cc`
   - Logo (optional): `~/Downloads/hafa-avatar.png`
   - Adding a logo means submitting the branding for Google's review, which takes a
     few days.
6. **Firebase email sender.** Go to
   https://console.firebase.google.com/project/hafaio-kip-dev/authentication/emails.
   - Edit a template, then choose "customize domain" and enter `kip.hafa.cc`.
   - Add the records it shows in Cloudflare DNS and wait for it to verify.
   - Then set the sender to `notif@kip.hafa.cc` on every template.
7. **Firebase email action links.** On each template, choose "customize action URL"
   and set it to `https://kip.hafa.cc/__/auth/action`.
8. **Resend, for kip's own notification emails.**
   - Make a free account at https://resend.com.
   - Add the domain `kip.hafa.cc` at https://resend.com/domains, add the records it
     shows in Cloudflare DNS, and wait for Verified.
   - Create an API key with sending access at https://resend.com/api-keys.
   - Store it with `firebase functions:secrets:set RESEND_API_KEY --project hafaio-kip-dev`.
9. **Replies (optional).** Set up Cloudflare Email Routing for `kip.hafa.cc`, so
   replies to `notif@kip.hafa.cc` reach your Gmail:
   https://dash.cloudflare.com/?to=/:account/:zone/email/routing.

## Code changes

After step 4 works:

- `web/utils/firebase.ts`: change `authDomain` to `"kip.hafa.cc"`.
- `web/utils/auth.ts`: add `linkDomain: "kip.hafa.cc"` to both `sendSignInLinkToEmail`
  calls, so sign-in links use it too. This needs the domain connected to Hosting
  (step 2).

After step 8, but don't deploy before the secret exists:

- `functions/src/index.ts`: in the nodemailer transport, replace Gmail with Resend's
  mail server.
  - Host `smtp.resend.com`, port 465, secure; user `resend`; password = the
    `RESEND_API_KEY` secret.
  - The sender becomes `kip <notif@kip.hafa.cc>`.
  - Swap `GMAIL_APP_PASSWORD` for `RESEND_API_KEY` in `secrets`.
  - Remove `GMAIL_USER` once nothing uses it.

Once everything works:

- **Deleting the old Gmail password:** after the Resend version is deployed and working,
  delete the old secret with
  `firebase functions:secrets:destroy GMAIL_APP_PASSWORD --project hafaio-kip-dev`.
  Revoke the app password on the Gmail account too.
- **Docs:** update `CLAUDE.md` where it describes the Gmail sender, the
  `firebaseapp.com` sign-in domain or the email links.
- **Leave alone:** `projectId`, `storageBucket` and `.firebaserc`. Those are the project
  ID, which users don't see.

## Optional: send visitors of `kip.hafa.cc` to the app

Without this, opening https://kip.hafa.cc shows Firebase's "Site not found" page. To fix
it, add a `hosting` block to `firebase.json` and deploy it with
`firebase deploy --only hosting`:

- `public`: an empty folder
- `redirects`: `{ "source": "**", "destination": "https://hafa.cc/kip/", "type": 301 }`

Paths under `/__/` are reserved by Firebase and shouldn't be affected by the redirect.
Confirm that https://kip.hafa.cc/__/auth/handler still loads after deploying.

## Check

- Sign in with Google at https://hafa.cc/kip/. The popup and Google's account chooser
  should say `kip.hafa.cc`.
- Send yourself a sign-in link. It should come from `notif@kip.hafa.cc`, link to
  `kip.hafa.cc`, and still sign you in.
- Trigger a kip notification email. It should come from `notif@kip.hafa.cc` and not
  land in spam.
- Test phone sign-in once more after the `authDomain` change.
- Keep `hafaio-kip-dev.firebaseapp.com` in the authorized domains until everything
  above works.

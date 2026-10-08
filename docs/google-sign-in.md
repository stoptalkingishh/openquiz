# Google sign-in: persistence, PKCE, and deployment

How OpenQuiz authenticates, why sign-in used to expire after an hour, and what
has to be configured before it persists.

## Background: two modes

There is no account system and no sign-up form.

- **Guest** — a local profile in `localStorage` (`oquiz:guest_user`). Fully offline.
- **Google account** — data is stored as JSON in a per-user `OpenQuiz` folder in **that user's own Google Drive**.

Study data flows browser → user's Drive. There is no backend, no database, and
the operator never receives it.

## Why sessions used to expire after ~1 hour

Sign-in used the Google Identity Services `initTokenClient`, which is the
**implicit flow**. It returns an access token valid for about an hour and **no
refresh token**, so the only way to renew was a silent GIS request, which
succeeds only while Google's browser session cookie is still alive.

When that failed, `hasLiveToken()` went false and Drive sync stopped. Nothing
cleared the stored profile — `clearStoredDriveUser()` is only called from
`signInToDrive`'s counterpart, the explicit Sign Out button — so the account
still appeared signed in while sync was silently dead. To a user that looks
exactly like being logged out.

Google's session lifetime is not something the app can extend. The fix is to
stop depending on it.

## What changed

Sign-in now uses **Authorization Code + PKCE** with `access_type=offline`,
which returns a refresh token that mints access tokens with no user interaction
and no reliance on Google's session cookie.

| File | Role |
|---|---|
| `app/lib/googlePkce.ts` | Verifier/challenge/state generation, auth URL, code exchange, refresh |
| `app/lib/driveTokens.ts` | Stores the refresh token bound to an account id |
| `public/oauth-callback.html` | Popup target; forwards the code to the opener |

There is no server, so this is a public client and there is no client secret —
PKCE provides the protection a secret otherwise would.

### Security notes

- The refresh token is a long-lived credential in `localStorage`, readable by any script on the origin. That is acceptable **because** the app is fully static with no backend, and because #48 removed the Google Fonts request and made analytics opt-in, leaving very little third-party script surface. **Adding any third-party script re-opens this risk** — re-evaluate before doing so.
- The refresh token is bound to the account id that minted it, so one account cannot reuse another's credential.
- Sign-out clears the credential *first*, then attempts revocation, so a hanging network round-trip cannot leave a working token behind.
- The callback's `state` is checked against the value we issued, and the PKCE verifier is consumed on use, so a mismatched or forged callback is rejected.

## Required before this persists: publish the consent screen

**While an OAuth app is in "Testing" publishing status, Google caps refresh tokens at 7 days.** Until the consent screen is published, sessions will still drop about once a week and this fix will look ineffective.

See #89 for the Console walkthrough. Short version:

1. **APIs & Services → OAuth consent screen** → set **Publishing status → In production**.
2. **Verify your domain** to remove the "Google hasn't verified this app" warning users currently hit.
3. Confirm the web client ID has:
   - Authorized JavaScript origins: `https://stoptalkingishh.github.io`
   - Authorized redirect URIs: **`https://stoptalkingishh.github.io/openquiz/oauth-callback.html`** ← new, required by the code flow
   - Google Drive API enabled, API key restricted to it plus your site referrer

The redirect URI is the one thing that is genuinely new — the implicit flow never needed one.

## Refresh-token lifetime

Refresh tokens persist until they are revoked, unused for 6 months, or the user changes their password or revokes app access. So: **practically indefinite, not literally.** If renewal returns `invalid_grant`, the token is discarded and the app falls back to interactive sign-in.

## Verifying

1. Sign in at `https://stoptalkingishh.github.io/openquiz/auth/`.
2. Confirm `localStorage` holds `oquiz:drive_refresh_token` with an `accountId` matching `oquiz:drive_user`.
3. Wait out the access-token lifetime (~1 hour) or revoke the access token, then reload. Sync should continue without an account chooser appearing.
4. Sign out, and confirm `oquiz:drive_refresh_token` is gone.

Steps 3 and 4 need the consent screen published for the result to be meaningful.

## Related

- #89 — publish the OAuth consent screen
- #79 — the unused `generative-language.retriever` scope is still requested on every sign-in; worth removing before launch, both to reduce consent friction and to stop asking for access the app never uses
- #50, #72/#73 — guest→account data migration, still unverified across two real accounts
# OpenQuiz — authenticated UI screenshots

Captured at **1980 x 1080** against the **live production deployment**
(`https://stoptalkingishh.github.io/openquiz/`) with a real Google account
signed in, after OAuth consent was enabled.

These complement `../screenshots/`, which documents the guest experience. The
interesting differences are listed below.

## Setup

- Account: a real Google account (`msoftmd102@gmail.com`), signed in via Google Identity Services
- Drive sync active — the app created its per-account folder (`drive.file` scope), so data lives in the user's own Drive rather than localStorage
- Light theme, analytics consent **not yet decided** (the banner is visible in each shot)
- Viewport 1980x1080, CSS pixels

## Coverage

| File | What it shows |
|---|---|
| `01-home-authenticated/` | Home with a signed-in account |
| `02-profile-authenticated/` | Profile: identity card, avatar, streak, Analytics, Export/Backup, **Sign Out** |
| `03-library-authenticated/` | Library scoped to the signed-in account |
| `04-quizzes-authenticated/` | Quizzes catalog with an account present |
| `05-community-authenticated/` | Community, default view, and the auth-only **My sharing list** tab |

## What actually changes when signed in

Verified against the guest captures in `../screenshots/`:

1. **Identity.** Profile shows the real name, email, join date, and Google avatar instead of `Guest` / `Guest account`. The guest avatar is an initials placeholder; the authenticated one loads the Google profile image (confirmed `naturalWidth: 96`).
2. **Sign Out appears.** The guest profile has no sign-out affordance at all; the authenticated one has a full-width Sign Out button.
3. **Data is account-scoped in localStorage.** Keys are namespaced per account id — e.g. `oquiz:custom_quizzes:account:106155751955155811271`, `oquiz:progress:account:...`, `oquiz:folders:account:...`. Guest keys are separate, so signing out does not leak guest data into the account.
4. **Drive sync is live.** A per-account Drive folder id is persisted (`oquiz:drive_folder_<accountId>`). Nothing is stored by the app operator.
5. **"My sharing list" is auth-scoped.** Community gains a filter tab that shows quizzes the signed-in user has marked for sharing. It has a proper empty state pointing at both routes to populate it.

## Two things that are *not* bugs

Worth recording because both looked like defects at first glance:

- **The Analytics card appears late.** On first paint the profile renders without it, then it pops in once `getStudyAnalytics()` resolves, pushing Export/Backup down. That is a loading-state/layout-shift polish issue (see the issue filed alongside), not a missing feature — the card always renders once data arrives.
- **The avatar briefly shows initials.** The Google image loads asynchronously; before it resolves, the initials placeholder is shown. It is replaced by the real photo.

Both were re-checked after waiting for load rather than assuming a defect from a mid-load capture.

## Caveat

This is **one** account on **one** browser. Not covered here:

- The multi-account case — two accounts on one device, and the guest→account data migration. That migration is tracked separately (#50, #72/#73) and needs a second account to verify.
- Signed-in states on Study session, Match, Quiz detail, and the import flows. These look identical to the guest captures because the quiz content is account-independent; only the account-scoped persistence differs.
- Drive permission-denied and token-expiry states.
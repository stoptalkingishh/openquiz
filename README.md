# OpenQuiz — The Open Source Quizlet Alternative

An open-source, beautifully designed platform for mastering SAT vocabulary, language learning, and test prep. Built for high school and college students — as a fully static, offline-capable PWA that runs with zero servers.

**Live:** [https://stoptalkingishh.github.io/openquiz/](https://stoptalkingishh.github.io/openquiz/)

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?style=for-the-badge&logo=typescript)
![Static](https://img.shields.io/badge/GitHub%20Pages-ready-success?style=for-the-badge&logo=github)
![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue?style=for-the-badge)

---

## 📖 The Story

> "I originally built this project for my little brothers in high school and college who were prepping for their SATs and language exams. The market is honestly filled with paid solutions and locked features like Quizlet, Memrise, and Anki, so I decided to make a fun, 100% free open-source alternative. You can literally just paste our prompt into an LLM, get your vocab words in JSON format, drop it in here, and instantly get full-blown tests. Just a fun, open-source labor of love for anyone who needs it!"
>
> — *Yerdaulet*

---

## 🎯 The Problem

Preparing for the SAT or language exams is hard enough. Existing tools are often paid, bloated with ads, or restrict how you can import your own test prep material.

**OpenQuiz** is a completely free, open-source alternative. Just ask ChatGPT or Claude to format your vocabulary words into a JSON file, paste it in, and get a full suite of interactive study modes, spaced repetition, analytics, and even an AI generator that builds quizzes straight from your notes.

---

## ✨ What You Get

- **🧠 6 Study Modes + a Match Game** — Learn, Drill, Exam, Mistakes, Test, Write, and a timed Match speed game.
- **🔁 SM-2-lite Spaced Repetition** — self-rate every card **Again / Hard / Good / Easy**; the scheduler decides when each word comes back.
- **📊 Analytics & Streaks** — day streak, daily answer goal, session count, accuracy, weakest words, and a 90-day activity heatmap.
- **🗂 Organization** — folders for your custom quizzes, taggable quizzes, and a searchable word library.
- **🌍 Community Hub** — official sets and public quizzes with category filters and search.
- **🧩 Cloze Deletion** — Anki-style `{{c1::word}}` cards become written-answer questions.
- **📥 Import / 📤 Export** — create quizzes from **JSON or CSV**, back up quizzes + progress as JSON, export vocabulary as CSV.
- **🤖 AI Quiz Generation** — paste your notes and generate a quiz with your *own* AI API key.
- **📱 PWA + Offline** — installable app with a service worker that keeps the whole app usable offline.
- **☁️ Optional Google Drive Sync** — guest-first localStorage; sign in with Google and your data syncs to a private Drive folder.
- **🔗 Share Links** — official sets share via `?path=`, custom quizzes embed right in the URL.

---

## 🎮 Study Modes

Every quiz, official or custom, can be studied in any mode:

| Mode | What it does |
| --- | --- |
| **Learn** | Flashcards: reveal the meaning, self-rate, then work through usage and SAT-style cloze questions for the new words. |
| **Drill** | Context practice: fill-the-blank usage and SAT-style sentence-completion questions, weighted toward your weak and overdue words. |
| **Exam** | Exam-style review built from SAT sentence-completion (cloze) questions only. |
| **Mistakes** | Replays only the words (or questions) you've actually gotten wrong, until you clean them up. |
| **Test** | An auto-generated mixed test (up to 20 questions): multiple choice and typed answers, with true/false when your quiz has them. |
| **Write** | Type the word from its meaning, and type the meaning from the word. Answers are checked with forgiving, case/punctuation-insensitive matching. |
| **Match** 🎮 | A speed game: match terms to their meanings against the clock. Tracks time and attempts, and logs a session. |

Sessions also come with tools: read questions and answers aloud (browser text-to-speech), Google search the current question, and keyboard navigation.

---

## 🔁 Spaced Repetition (SM-2-lite)

Every word (and every question in generic quizzes) carries its own progress: strength, ease, repetitions, interval, and a due date.

- Four **self-ratings** — **Again**, **Hard**, **Good**, **Easy** — tune the scheduling exactly like Anki-style reviewers.
- Wrong answers reset your repetition count and interval and decay the card's strength; correct answers grow the interval (1 day → 6 days → ease-scaled).
- A word is marked **mastered** once its strength reaches **≥ 0.8** after **≥ 4** successful repetitions (statuses: `new` → `learning` → `mastered`).
- Session builders prioritize new, overdue, and weak words — and Mistakes mode draws exclusively from your wrong-streak list.

---

## 📊 Analytics

The Home screen shows a daily answer goal, answers today, and lifetime mastered count; the Profile page goes deeper:

- **Day streak** — consecutive study days (yesterday stays alive until today's opportunity ends)
- **Sessions, accuracy** — lifetime totals and percentage
- **Weak words** — your lowest-strength words with wrong streaks
- **90-day activity heatmap** — daily answer volume at a glance
- **Recent study** — per-quiz session history with scores and time

---

## 🗂 Organize & Discover

- **Folders** (Quizzes page) — group your custom quizzes into named folders.
- **Tags** — attach comma-separated tags when creating a quiz; search matches name, description, *and* tags.
- **Library** — a searchable word library over official + custom vocabulary, filterable by `new` / `learning` / `mastered`, with per-word details.
- **Community** — browse official sets and community-shared public quizzes with **category filters** and **search** (name, description, category, author). Study official sets instantly or import a community quiz to make it yours.

### Bundled official content

- **SAT Vocabulary** — Set 1, Set 2, and Archaic & Literary words.
- **CompTIA Security+ (SY0-701)** — 3 practice tests, a 100-question final exam, and topic flashcards (fundamentals, physical & deception, threats & attacks, crypto & PKI, incident response & compliance).
- **CompTIA Network+ (N10-009)** — 3 practice tests, a 100-question final exam, and topic flashcards (networking concepts, network implementation, network operations, network security, network troubleshooting).
- Question-shaped sets run through every mode, including Test (multiple choice / true / false) and Match.

---

## ✍️ Create a Custom Quiz

Three ways, all free:

1. **Paste JSON** — paste a vocabulary array (`word`, `ru`, `synonyms`, `simple_examples`, `advanced_example`, `confusions`), a question array (`multiple_choice` / `true_false` / `flashcard` / `simulation`), or a mix — the importer splits and validates each item with per-item error reporting.
2. **Question builder** — click questions together: multiple choice, true/false, flashcards, and multi-step **simulations** (choice / checkbox / config / placement steps, e.g. CompTIA-style performance questions). Optional image per question, and **LaTeX math** renders with KaTeX.
3. **AI generate (bring your own key)** — paste your notes or source text and the app calls an **OpenAI-compatible** chat endpoint to produce quiz JSON. You configure the API key, base URL, and model (default: OpenAI `gpt-4o-mini`; any compatible endpoint or a local model via `localhost` works). Your key is stored in browser `localStorage` and sent only to the endpoint you configure — never baked into the build.

> Want to prep for a specific exam? Ask any LLM for: `[{"word": "eloquent", "ru": "красноречивый", "synonyms": ["articulate", "fluent"], "simple_examples": ["She gave an eloquent speech."], "advanced_example": "The author's eloquent prose...", "confusions": ["elegant"]}]`, then paste it into **Create Quiz**.

### 🧩 Cloze deletion

Write `{{c1::word}}` in a flashcard prompt (or answer) and it becomes a written-answer card with the deletion blanked — multiple deletions in one card produce one card each, sharing the full sentence as context.

---

## 📥 Import / 📤 Export

- **Import (create a quiz):** JSON paste, **CSV** paste (`word,ru,synonyms,simple_examples,advanced_example,confusions`, lists joined with `; `), or a plain `word - definition` / tab-separated word list.
- **Export (Profile → Export/Backup):**
  - **JSON** — one portable backup file containing all custom quizzes *and* word progress (`openquiz-backup.json`)
  - **CSV** — all vocabulary from your custom quizzes (`openquiz-vocabulary.csv`)

---

## 🔗 Share Links

Sharing is fully static — no server required:

- **Official sets** share as `…/quiz/share?path=/sat/1.json` (paths are allowlisted via the sets manifest).
- **Custom quizzes** are embedded directly in the URL as `?data=` JSON (images stripped to keep links small), up to a **12,000-character cap**; larger quizzes fall back to copying locally.
- Share by copy-link or straight to **Twitter, Facebook, or Telegram**.

---

## 📱 PWA & Offline

- Web manifest with standalone display and icons — installable to home screen.
- A service worker precaches the app shell, generated assets, and official quiz data; navigations are network-first with an offline fallback, and hashed static assets are served cache-first.
- Caches are versioned per build (`NEXT_PUBLIC_BUILD_VERSION`), so every deploy updates cleanly and the app works fully offline in guest mode.

---

## ☁️ Google Drive Sync (optional)

By default the app is a **guest-first** PWA: everything — quizzes, progress, stats, folders — lives in `localStorage`, fully offline, no account needed.

When `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_API_KEY` are baked into the build, the auth screen offers **Sign in with Google**. Signed-in users get:

- Data stored as JSON files in a private, per-user **"OpenQuiz"** folder in their own Google Drive, using the narrow **`drive.file`** scope (the app can only see files it created).
- **Auto-migration** of existing guest data on first sign-in (merged, never overwritten), with a sync banner and reconnect-and-sync retry if a write fails offline.

Without the keys the same code runs in guest mode — nothing breaks, nothing is uploaded.

### Share a quiz through Google Drive

In a custom quiz's **Share** dialog, choose **Create / update shared version**. OpenQuiz writes a separate `.openquiz.json` file in your Drive. It never shares the private `OpenQuiz` sync folder or `custom_quizzes.json`. The published file contains quiz metadata and questions, excluding original AI source notes, account IDs, and images.

Use **Open Drive → Share / manage access**, then Google's **Share** button to add people (Viewer recommended) or enable **Anyone with the link** if allowed by your organization. OpenQuiz itself does not change permissions, invite recipients, or send notification emails. Send the **OpenQuiz link** from the dialog after granting access. Future **Create / update shared version** actions update the same Drive file and keep the link valid; edits to the private quiz are not automatically published.

Recipients sign in with Google and open that link. If the app lacks access under `drive.file`, they select the file in **Google Picker**. Community also offers **Open from Google Drive**. **Add linked quiz & start learning** stores only a bookmark and display metadata; each later study session reads the latest publication and checks Drive access again. Study progress is private. An already-running session keeps its loaded questions. Revoking access blocks future loads, but cannot retract downloaded copies. Deleting a bookmark or private quiz does not delete the publication; owners can revoke access or trash it directly in Drive.

Drive sharing requires an internet connection and a Google account, including for link-public files in this implementation. JSON exports and snapshot links remain independent-copy fallbacks. A shared file is not automatically discoverable by every OpenQuiz user: Drive permissions and a sent link/Picker selection control access.

**Additional Google Cloud setup for Picker:** enable **Google Picker API** in the same project as the existing OAuth client and Drive API. Allow both APIs in the public API key's restrictions, with your site's allowed referrers and `https://docs.google.com/*` as required by [Google's Picker setup instructions](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample). Set optional repository variable `NEXT_PUBLIC_GOOGLE_APP_ID` to the Google Cloud **project number** (not its project ID); otherwise the app derives the number from the OAuth client ID prefix. No new OAuth scopes are requested. Confirm setup with two separate Google accounts before relying on restricted sharing in production.

The implementation follows Google's [per-file scope guidance](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) and [resource-key requirements](https://developers.google.com/workspace/drive/api/guides/resource-keys). The Google Cloud configuration and real-account cross-user access cannot be validated by unit tests alone.

---

## ⚡ Static Build & Quickstart

This is a **fully static build** (Next.js `output: 'export'`, `trailingSlash`, unoptimized images) — it runs with zero servers.

```bash
npm install
npm run dev      # http://localhost:3000
```

Build a static export:

```bash
npm run build    # outputs to ./out
npm start        # serves ./out at http://localhost:3000
```

Deploy to GitHub Pages:

1. Push this repo to GitHub.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. The included `.github/workflows/deploy.yml` runs lint + tests, builds the static export, and deploys on every push to `main` (with `workflow_dispatch` for manual runs).

The workflow sets `NEXT_PUBLIC_BASE_PATH` to the repository name automatically, which is correct for **project sites** (`USER.github.io/REPO`, e.g. this repo at `/openquiz`). For a site hosted at the root (`USER.github.io`) use a repo named `USER.github.io` and set `NEXT_PUBLIC_BASE_PATH` to `''` in the workflow. `NEXT_PUBLIC_BUILD_VERSION` stamps every build so the service worker cache updates on deploy.

Because everything is static, the same `./out` can be hosted anywhere that serves files — GitHub Pages, Cloudflare Pages, Netlify, or a plain static server.

---

## 🔑 Sign In with Google + Drive Sync — Setup

1. **Create a Google Cloud project** at https://console.cloud.google.com → New project.
2. **Enable the Google Drive API**: **APIs & Services → Library → search "Google Drive API" → Enable**.
3. **Create OAuth credentials**:
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**.
   - Under **Authorized JavaScript origins**, add your site, e.g. `https://stoptalkingishh.github.io`.
   - Copy the **Client ID**.
4. **Create an API key**: **Credentials → Create Credentials → API key** (you may restrict it to the Drive API and your site's referrer). Copy the key.
5. **Add the keys as GitHub Actions secrets** in repo **Settings → Secrets and variables → Actions**:
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = your OAuth Client ID
   - `NEXT_PUBLIC_GOOGLE_API_KEY` = your API key
6. Push; the deploy workflow bakes the keys into the static bundle.

On first sign-in, existing guest data (quizzes + progress) is **auto-migrated** into a private per-user **"OpenQuiz"** folder in the user's Google Drive (scope is `drive.file` — the app can only see files it created). Until secrets are added, the same code runs in guest mode — nothing breaks.

---

## 🛠 Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | **Next.js 15.5.24** — App Router, `output: 'export'` (static) |
| Language | **TypeScript** |
| Styling | **Tailwind CSS** |
| Animation | **Framer Motion** |
| State | **Zustand** (with `persist` middleware) |
| Math rendering | **KaTeX** + **react-katex** |
| Icons | **Lucide Icons** |
| Tests | **Vitest** (`tests/`, `npm test`) |
| CI/CD | **GitHub Actions** — `ci.yml` (lint + test + build on PR/push) and `deploy.yml` (Pages deploy) |
| Storage | Browser **localStorage** (guest-first) + optional **Google Drive** (`drive.file` scope) |

### 🧪 Tests

`npm test` runs the Vitest suite covering the spaced-repetition scheduler (SM-2-lite progress updates, session builders, cloze cards), JSON/CSV import normalization, Drive failure semantics and account isolation, and service-worker caching behavior.

---

## 🤝 Contributing

Built for high schoolers, college students, and lifelong learners. We want to keep education free and accessible.
Feel free to fork, submit PRs, and help us add new question types, language support, or integrations!

## 📄 License

OpenQuiz is free software licensed under the [GNU Affero General Public License
v3.0 (or later)](LICENSE). It is **free for individuals, personal, educational,
and non-commercial use**. If you use OpenQuiz in a **corporate or for-profit
environment** and prefer not to comply with the AGPL's copyleft obligations, a
**paid commercial license** is available — open an issue in this repository to
purchase one.

Third-party study content (quiz sets, practice tests, flashcards) is licensed
separately by its original authors — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
for full attributions and license texts.

- [Terms of Use](https://stoptalkingishh.github.io/openquiz/terms/)
- [Privacy Policy](https://stoptalkingishh.github.io/openquiz/privacy/)

CompTIA, Network+, Security+, CySA+, PenTest+, Cloud+, Linux+, and SecurityX are
trademarks of the Computing Technology Industry Association (CompTIA). OpenQuiz
is not affiliated with or endorsed by CompTIA or any other certification body.

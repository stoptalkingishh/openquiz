# OpenQuiz repository audit — September 21, 2026

## Scope and method

Five independent reviews covered application/UI behavior, security and privacy, AI and data handling, release tooling, and documentation/content integrity. The audit reviewed `origin/main` at `bf69947` and the in-review `feat/quiz-feedback` branch at `41c28fc`, because the latter adds the GitHub feedback, catalog-review, Terms, Privacy, and README changes currently under review.

Only findings with a concrete trigger and source location are listed below. This report does not change product behavior. Items should be implemented in focused pull requests, with the highest-priority data-loss and disclosure items handled first.

## Priority 1 — fix before broadening sharing or AI use

### A-01 — Google-account Gemini is not a reliable supported generation path

**Locations:** `app/lib/drive.ts:25`, `app/lib/ai.ts:280-305`, `.github/workflows/deploy.yml:39-49`

The no-key Gemini option obtains a Google bearer token with the Semantic Retriever scope and sends it to `models:generateContent`. The deployed build does not provide the optional quota-project variable. This path can return authorization, quota, or model errors even though the UI advertises Google-account Gemini.

**Action:** Choose one supported model: require a Gemini API key, or implement the documented OAuth scopes, quota project, consent configuration, and integration coverage for `generateContent`. Do not present the no-key option as available until a real-account integration test passes.

### A-02 — Cloud sync can overwrite or hide quiz edits without a conflict signal

**Locations:** `app/lib/db.ts:331-344`, `app/lib/db.ts:795-830`, `app/lib/db.ts:1195-1210`

Quiz records have no `updated_at` revision. A failed Drive write leaves a newer local edit, while later reads can prefer an older remote record. Separate devices or tabs editing the same quiz can overwrite one another according to sync order.

**Action:** Add an update revision/timestamp, reconcile newest versions consistently across reads and sync, and preserve conflicts as a separate copy or an explicit conflict state. Use Drive revision/ETag preconditions where practical. Add regression coverage for offline edits, stale remote reads, and two-device conflicts.

### A-03 — The repository exposes contradictory license and notice terms

**Locations:** `LICENSE:666-684`, `THIRD-PARTY-NOTICES.md:1-55`, `THIRD_PARTY_NOTICES.md:1-19`, `app/profile/page.tsx:271`

The AGPL license text is followed by an appendix limiting use to non-commercial purposes and advertising a commercial license, while current Terms and README correctly describe the AGPL as allowing commercial use. Two notice files make incompatible claims about study-content licensing, and Profile links to the obsolete hyphenated file.

**Action:** Resolve the commercial-licensing appendix with rights-holder review; it cannot contradict the AGPL grant. Keep one canonical third-party/content notice, update all links, and retain only verified provenance and license statements.

### A-04 — Bundled Network+ exams are materially duplicated

**Locations:** `public/netplus/netplus-test1.json:5,135,265,395,525`; `public/netplus/netplus-test2.json`; `public/netplus/netplus-test3.json`; `public/netplus/netplus-final.json:5,135,...,1175`; `public/sat/quiz-sets.json:144-189`

The advertised 50-question practice exams repeat the same small set of prompts in blocks, and the 100-question final repeats those blocks further. Learners receive roughly ten unique prompts rather than the described breadth, and the three practice tests overlap heavily.

**Action:** Replace or deduplicate the data before presenting it as separate comprehensive exams. Add content validation that rejects duplicate normalized prompts within an exam and flags excessive overlap among exam variants.

## Priority 2 — schedule in focused implementation pull requests

### A-05 — Sensitive Google scope is requested for every Drive sign-in

**Location:** `app/lib/drive.ts:25`

`generative-language.retriever` is requested with basic identity and `drive.file` even when a user only wants Drive sync. No Retriever API operation appears in the app.

**Action:** Remove the unused scope. If a future feature requires it, request it only at the user-triggered feature boundary and update consent/privacy text.

### A-06 — Analytics and font loading need privacy controls and fuller disclosure

**Locations:** `app/layout.tsx:10,36-45`, `app/globals.css:5-6`, `app/privacy/page.tsx`

Analytics loads automatically, before an in-app consent choice, and Google Fonts are fetched from Google. The privacy page does not fully describe the font request. Some jurisdictions require consent before non-essential analytics storage.

**Action:** Implement consent-gated analytics with a visible settings control and honor applicable privacy signals. Self-host fonts or disclose the external Google Fonts request. Confirm the final approach with legal counsel for the intended regions.

### A-07 — Static production start script is broken

**Locations:** `package.json:11`, `next.config.js:7`

`npm start` runs `next start`, but Next rejects that command when `output: 'export'` is enabled. The production output must be served as static files.

**Action:** Replace the script with a pinned static server for local smoke testing or remove it and document static hosting. Add CI coverage that serves `out` and checks a base-path route.

### A-08 — Deployment omits documented Gemini quota-project configuration

**Locations:** `app/lib/ai.ts:289-293`, `.env.example:15-17`, `.github/workflows/deploy.yml:39-49`

`NEXT_PUBLIC_GOOGLE_PROJECT_ID` is documented and read by the Gemini request, but the Pages workflow never injects it into the build.

**Action:** Pass the repository variable to the deployment build and add a build/configuration test. If A-01 removes account-based Gemini, remove this configuration instead.

### A-09 — CI and Pages use end-of-life Node 20

**Locations:** `.github/workflows/ci.yml:19`, `.github/workflows/deploy.yml:25`

Node 20 reached end of life in April 2026, leaving the release workflow on an unsupported runtime.

**Action:** Move CI and deployment to a supported Node release, declare the required engine in `package.json`, and verify the lockfile and static build.

### A-10 — Feedback Issue links are not portable or reliably clickable

**Locations:** `app/quiz-detail/QuizDetailClient.tsx:229-236`, `app/lib/githubFeedback.ts:21-35`

Official-quiz feedback uses a relative `/openquiz/...` reference in a GitHub Issue body. It is not a clickable absolute link and breaks for a root-hosted fork or custom-domain deployment.

**Action:** Generate an absolute Markdown link from the active deployment origin and base path at a client event/effect, while keeping custom-quiz locations private. Add a deployed-URL regression test.

### A-11 — Catalog-review requirements can be bypassed outside the app

**Locations:** `.github/ISSUE_TEMPLATE/quiz-publication.md:11-25`, `app/components/QuizPublicationRequest.tsx:19-27`

The app form validates email, link, attribution, and rights acknowledgement, but the GitHub template is Markdown. Users can open it directly or remove its fields and submit an empty Issue.

**Action:** Use a GitHub Issue Form YAML with required validations for contact, link, attribution, and rights confirmation. Keep the public-email warning prominent.

### A-12 — Catalog review does not carry a just-created Drive publication forward

**Locations:** `app/components/DriveQuizShare.tsx:21-42`, `app/components/QuizPublicationRequest.tsx:11-42`

The Drive link remains component-local and the review form requires manual paste of an arbitrary URL. A new Drive file is restricted by default, so maintainers can receive an inaccessible or incorrect link.

**Action:** Lift publication state, prefill the confirmed OpenQuiz/Drive link, and explain or verify required access before enabling submission. Preserve the contributor&rsquo;s choice of a public review link.

### A-13 — Modal interactions are inaccessible by keyboard and screen reader

**Locations:** `app/quiz-detail/QuizDetailClient.tsx:669-700`, `app/quizzes/page.tsx:708-750,783-794`

Major modal flows do not expose dialog semantics, focus trapping, Escape handling, labelled headings, or focus restoration. Keyboard focus can leave the modal.

**Action:** Introduce a reusable accessible dialog primitive and cover Tab, Escape, backdrop close, and focus restoration in browser tests.

### A-14 — Shared/imported remote images can be tracking beacons

**Locations:** `app/components/QuestionCard.tsx:44`, `app/quiz-detail/QuizDetailClient.tsx:488,584`, `app/components/WordModal.tsx:45`, `app/components/QuizBuilder.tsx:76`

An imported quiz can supply an arbitrary remote image URL. Loading it reveals a learner&rsquo;s request metadata to that host.

**Action:** Strip remote image URLs during import/share, or render them with a restrictive referrer policy and a clear privacy disclosure. Add sanitization coverage.

### A-15 — Multi-quiz AI creation duplicates completed work after partial failure

**Location:** `app/quizzes/page.tsx:1126-1142`

Plans are created one by one. If a later plan fails, retrying creates the earlier quizzes again and can repeat model charges.

**Action:** Track per-plan completion and retry only pending work, or provide a staged batch with explicit progress. Add a failure-at-plan-N regression test.

### A-16 — Published Drive links may lose the resource key

**Locations:** `app/lib/drive.ts:704-709`, `app/components/DriveQuizShare.tsx:10-13`

An update response may omit an existing Drive resource key. The resulting OpenQuiz link then may not open for link-shared recipients.

**Action:** Retrieve/preserve file metadata after publish and test a resource-key-protected shared file.

### A-17 — Manually saved question sets are not normalized before persistence

**Locations:** `app/quizzes/page.tsx:1066-1087`, `app/components/CustomQuizEditor.tsx:71-86`

Malformed legacy or state data can persist an out-of-range multiple-choice answer, invalid true/false answer, or incomplete simulation, even though imported data is normalized.

**Action:** Run manual/editor questions through the same normalization/validation path and show item-specific errors.

### A-18 — Objective and Professor Messer mapping is absent

**Locations:** `public/sat/quiz-sets.json:192-249`, `public/netplus/netplus-test1.json:1-30`

Questions have no exam-objective identifier or objective-specific video/reference mapping. The catalog only carries broad domain descriptions.

**Action:** Add validated objective IDs and authoritative reference URLs per item or deck. Add Professor Messer links only when exact coverage is verified, render the mapping in the review UI, and test completeness.

### A-19 — Catalog and feedback documentation overstates custom-quiz page references

**Locations:** `docs/quiz-feedback-workflow.md:8`, `.github/ISSUE_TEMPLATE/quiz-feedback.md:22`, `app/quiz-detail/QuizDetailClient.tsx:229-236`

The privacy guard intentionally omits custom-quiz URLs, while documentation says the app includes both a quiz name and page link.

**Action:** State that only official quizzes include a page link, or supply a safe opaque reference.

## Priority 3 — correctness and polish

### A-20 — Social-share copy calls every quiz SAT vocabulary

**Locations:** `app/quiz-detail/QuizDetailClient.tsx:178-181`, `app/quizzes/page.tsx:165-170`

Network+, Security+, and custom quizzes are shared with misleading SAT vocabulary text.

**Action:** Use neutral, quiz-specific share text and add a small unit test.

### A-21 — Long quiz titles can crowd header actions on narrow screens

**Location:** `app/quiz-detail/QuizDetailClient.tsx:267-303`

The title, status badge, edit action, and delete action share one unbounded flex row.

**Action:** Make the title container shrinkable/wrappable and group actions separately. Add a 320px visual/browser smoke case.

## Verification gaps

- Add browser-level coverage for Drive publication, access changes, resource keys, and revocation.
- Add an end-to-end test for catalog submission prefill and required fields.
- Add keyboard modal and mobile-layout tests.
- Add a static Pages smoke test that serves the exported output at a repository base path.
- Run a dependency advisory audit once registry access is available; this audit environment could not reach the advisory endpoint.

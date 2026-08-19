# OpenQuiz — The Open Source Quizlet Alternative

An open-source, beautifully designed platform for mastering SAT vocabulary, language learning, and test prep. Built for high school and college students.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?style=for-the-badge&logo=typescript)
![Static](https://img.shields.io/badge/GitHub%20Pages-ready-success?style=for-the-badge&logo=github)

## 📖 The Story

> "I originally built this project for my little brothers in high school and college who were prepping for their SATs and language exams. The market is honestly filled with paid solutions and locked features like Quizlet, Memrise, and Anki, so I decided to make a fun, 100% free open-source alternative. You can literally just paste our prompt into an LLM, get your vocab words in JSON format, drop it in here, and instantly get full-blown tests. Just a fun, open-source labor of love for anyone who needs it!"
> 
> — *Yerdaulet*

---

## 🎯 The Problem
Preparing for the SAT or language exams is hard enough. Existing tools are often paid, bloated with ads, or restrict how you can import your own test prep material.

**OpenQuiz** is a completely free, open-source alternative. Just ask ChatGPT or Claude to format your vocabulary words into a JSON file, paste it in, and get a full suite of interactive tests, spaced repetition, and tracking.

---

## ✨ What You Get
- **🧠 4 Intelligent Learning Modes** — Learn (flashcards), Drill (context), Exam (timed SAT-style), and Mistakes (focus on weak spots).
- **🤖 LLM Integration** — Create custom quizzes for free. Just prompt your favorite AI and paste the JSON.
- **📈 Spaced Repetition (SRS)** — The app tracks your strength score for each word and schedules reviews automatically.
- **🎨 Premium Cosmic UI** — Beautiful dark mode, starfield effects, and smooth Framer Motion animations.
- **💾 Local-first persistence** — Works entirely in the browser with `localStorage`; ready for cloud sync via Google sign-in.

---

## ⚡ Static / GitHub Pages Build

This is a **fully static build** (Next.js `output: 'export'`) — no server or database required. Progress, custom quizzes and stats are stored in your browser's `localStorage` (guest profile). Google sign-in / cloud sync can be layered on later behind the same auth/storage interface.

### Local development
```bash
npm install
npm run dev
```
Visit [http://localhost:3000](http://localhost:3000)

### Build a static export
```bash
npm run build   # outputs to ./out
```

### Deploy to GitHub Pages
1. Push this repo to GitHub.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. The included `.github/workflows/deploy.yml` builds a static export and deploys it on every push to `main`.

The workflow sets `NEXT_PUBLIC_BASE_PATH` to the repository name automatically, which is correct for project sites (`USER.github.io/REPO`). For a site hosted at the root (`USER.github.io`) use a repo named `USER.github.io` and set `NEXT_PUBLIC_BASE_PATH` to `''` in the workflow.

Sharing works statically too: links to official sets reference the JSON path, and custom quizzes are embedded directly in the share URL.

---

## 📝 Create a Custom Quiz with AI

Want to prep for a specific exam? Just use this prompt with any LLM:

> "Give me 20 advanced vocabulary words for the SAT. Format the response strictly as a JSON array like this: `[{"word": "eloquent", "ru": "красноречивый", "synonyms": ["articulate", "fluent"], "simple_examples": ["She gave an eloquent speech."], "advanced_example": "The author's eloquent prose...", "confusions": ["elegant"]}]`"

Then click **"Create Quiz"** in the app, paste the JSON, and start testing yourself!

---

## 🛠 Tech Stack
- **Framework**: Next.js 14 App Router (static export)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Framer Motion
- **Storage**: Browser-local persistence (guest profile) — cloud sync backend-agnostic

---

## 🤝 Contributing
Built for high schoolers, college students, and lifelong learners. We want to keep education free and accessible.
Feel free to fork, submit PRs, and help us add new question types, language support, or integrations!

## 📄 License
MIT License

# Third-Party Notices

OpenQuiz is licensed under AGPL-3.0-or-later. This file records third-party
software and content that have separate attribution or licensing terms.

## Study Content (in this repo)

### CompTIA Security+ SY0-701 — practice tests & flashcards
- **Source:** [SatenderKumar3024/CompTIA-Security-SY0-701-Exam-Repository-with-Exam-notes-and-Test-based-real](https://github.com/SatenderKumar3024/CompTIA-Security-SY0-701-Exam-Repository-with-Exam-notes-and-Test-based-real)
- **Author:** Satender Kumar (© 2024)
- **License:** MIT
- **What we use:** `public/securityplus/*.json` — the 4 practice/final exams (400
  multiple-choice questions) and the chapter-note flashcards are derived from
  this repository. Answers/explanations were authored by the OpenQuiz team.
- The full MIT license text of that repository:

```
MIT License

Copyright (c) 2024 Satender Kumar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### CompTIA Network+ N10-009 — practice tests & flashcards
- **Source:** Original questions authored by the OpenQuiz team, written to align
  with the publicly-available CompTIA Network+ (N10-009) exam objectives.
- **Author:** OpenQuiz contributors
- **License:** AGPL-3.0-or-later, as original OpenQuiz content in this repository.
- **What we use:** `public/netplus/*.json` — 3 practice tests (50 questions
  each), a 100-question final exam, and 5 topic flashcard decks (164 cards).
  These are original study questions; they are **not** reproduced from any
  CompTIA exam or from a third-party question bank.

### SAT Vocabulary sets (`public/sat/*.json`)
- Original vocabulary content was compiled by the OpenQuiz maintainers / the
  project's original author and is licensed under AGPL-3.0-or-later.
- The logo mark (and its derivative placeholders) are original OpenQuiz art.

## Trademarks

CompTIA, Network+, Security+, CySA+, PenTest+, Cloud+, Linux+, and SecurityX are
registered trademarks of the Computing Technology Industry Association
(CompTIA). All other trademarks and registered trademarks are the property of
their respective owners. OpenQuiz is **not** affiliated with, endorsed by, or
sponsored by CompTIA or any other certification body. Exam names are used only
to identify the public exam objectives that the bundled study content is
aligned with.

## Runtime Dependencies

The OpenQuiz app is built on the following open-source projects (see
`package.json` for exact versions):

| Package | License |
|---|---|
| Next.js 15 | MIT |
| React / React DOM | MIT |
| TypeScript | Apache-2.0 |
| Tailwind CSS | MIT |
| Framer Motion | MIT |
| lucide-react | ISC |
| Zustand | MIT |
| KaTeX / react-katex / @types/katex | MIT |

Each package ships with its own license text inside `node_modules/LICENSE*`
after `npm install`. This project does not modify any dependency source.

---

**Questions about licensing?** Open an issue in this repository. See `LICENSE`
for OpenQuiz's governing AGPL terms and optional alternative-term inquiries.

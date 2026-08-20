# Third-Party Notices

OpenQuiz bundles open-source software and study content. Each is licensed under
its own terms. The MIT license for OpenQuiz itself does NOT cover these
third-party works; attribution and license headers are preserved here.

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

### SAT Vocabulary sets (`public/sat/*.json`)
- Original vocabulary content was compiled by the OpenQuiz maintainers / the
  project's original author and is licensed under the project MIT license.
- The logo mark (and its derivative placeholders) are original OpenQuiz art.

## Runtime Dependencies

The OpenQuiz app is built on the following open-source projects (see
`package.json` for exact versions):

| Package | License |
|---|---|
| Next.js 14 | MIT |
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

**Questions about licensing?** Open an issue in this repository or contact the
maintainers. See also `LICENSE` for OpenQuiz's own terms and the note about
commercial use.
# Network+ question provenance

Audit finding A-04 ("bundled Network+ exams are materially duplicated") was
resolved by replacing the exam question pool. This file records where the
questions in `netplus-test1.json`, `netplus-test2.json`, `netplus-test3.json`
and `netplus-final.json` come from, and what was deliberately excluded.

Every question carries a `source` field (`packt` or `openquiz-original`) and,
for Packt-derived questions, the `objective` string from the source workbook.

## Question counts after the fix

| File | Questions | Unique prompts | Duplication |
|---|---|---|---|
| `netplus-test1.json` | 30 | 30 | 0% |
| `netplus-test2.json` | 29 | 29 | 0% |
| `netplus-test3.json` | 29 | 29 | 0% |
| `netplus-final.json` | 88 | 88 | 0% |

The three practice tests are disjoint (0% pairwise overlap). `netplus-final.json`
is cumulative and intentionally contains all 88 questions; taking it before the
practice tests will feel repetitive, which the catalog description now says.

## Sourced content: Packt, "CompTIA Network+ Certification (N10-009): The Total Course"

- **Upstream source:** `CompTIA Network+ (N10-009) - Updated Episode Quiz Questions.xlsx`
  from the Packt course repository
  `CompTIA-Network-Certification-N10-009-The-Total-Course-main`.
- **Publisher:** Packt Publishing
- **License:** MIT (`LICENSE` in the course repository, "Copyright (c) 2025 Packt").
  The MIT text permits redistribution with the notice preserved, which is why
  these questions are usable here.
- **What was taken:** 78 unique multiple-choice questions with their four
  options, correct-answer index, and the publisher's written rationale.
- **What was changed:**
  - IDs reassigned to OpenQuiz's `ntest1-q1`-style scheme.
  - Option order permuted so the correct answer is not pinned to one index
    (final answer-index distribution is 21/22/23/22 across the four options).
  - Questions sorted by N10-009 domain.
  - Whitespace in rationales collapsed; text otherwise unmodified.
- **Attribution:** recorded in `public/sat/quiz-sets.json` as
  `OpenQuiz + Packt (MIT)` in `author_name`.

MIT notice for the Packt material:

```
MIT License

Copyright (c) 2025 Packt

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

## Retained content: original OpenQuiz questions

The 10 questions that previously made up the entire exam pool are original
OpenQuiz content (MIT, project license) and were kept. Their explanations were
expanded from bare "Answer: UDP"-style strings into actual rationales; the
prompts, options and answer keys are unchanged. Marked
`"source": "openquiz-original"`.

## Deliberately excluded content

The source workbook has 144 data rows. **64 were excluded and not shipped.**
Those rows carry the source annotation `Use Old Question from N10-009`, which
identifies them as verbatim questions taken from the real N10-009 exam. MIT
permission from Packt cannot extend to CompTIA's exam content, so redistributing
them is not licensed regardless of the course repository's license file. Shipping
real exam questions as practice material would also be misleading to learners.

A further 2 rows were excluded on data-quality grounds (one missing its answer
key, one with an empty prompt and collapsed options).

**No question in these files was written by the assistant or invented.** Every
prompt traces to either the MIT-licensed Packt workbook or pre-existing OpenQuiz
content.

## Known limitations (honest disclosure)

- The 78-question pool is smaller than the previously advertised 50/50/50/100
  exam structure. The catalog now advertises the real counts rather than
  padding files by repetition.
- Domain coverage is uneven: 42 of 88 questions are Domain 1 and only 3 are
  Domain 2, because that is the distribution the licensable source provides.
  Each practice test carries a similar mix so no single test is domain-skewed.
- These are study questions aligned to the public N10-009 objectives. They are
  not CompTIA material, are not endorsed by CompTIA, and are not a substitute
  for the real exam. See `THIRD-PARTY-NOTICES.md` for the trademark position.
- 13 of the 78 sourced questions use negative phrasing ("which is NOT...").
  This mirrors the source material and was not rewritten, since rewriting would
  mean authoring new question text.

## Regression guard

`scripts/validate-content.mjs` fails the build if a future edit reintroduces
in-file duplicate prompts or excessive overlap between exam variants. Run it
with:

```
node scripts/validate-content.mjs
```

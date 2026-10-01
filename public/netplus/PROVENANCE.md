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

## Domain tagging

Every bundled Network+ item now carries a `domain` field holding a CompTIA
N10-009 domain number (`"1"`-`"5"`). Before this change, all 164 items in the
five flashcard decks shipped with no `domain` field at all, so any per-domain
reporting over those decks would have been silent guesswork.

Coverage across all 9 Network+ files (340 items):

| File | Tagged | Coverage |
|---|---|---|
| `netplus-final.json` | 88/88 | 100% |
| `netplus-test1.json` | 30/30 | 100% |
| `netplus-test2.json` | 29/29 | 100% |
| `netplus-test3.json` | 29/29 | 100% |
| `netplus-fundamentals.json` | 58/60 | 96.7% |
| `netplus-implementation.json` | 29/30 | 96.7% |
| `netplus-operations.json` | 28/30 | 93.3% |
| `netplus-security.json` | 20/20 | 100% |
| `netplus-troubleshooting.json` | 24/24 | 100% |

All 88 exam questions were already tagged; the exam distribution is unchanged at
42/3/18/12/13 across domains 1-5. The 164 untagged flashcard items are now 159
tagged and 5 deliberately left alone.

### How the flashcard tags were chosen

No new content was authored: the tag is a classification of text that already
shipped. Three rules were applied, in order:

1. **The deck's own catalog description is the default.** Each flashcard deck is
   described in `public/sat/quiz-sets.json` as covering one domain, and its
   stated topics carry that domain.
2. **Repo evidence overrides the default.** Where the bundled Packt
   `objective` strings already place a subject in a different domain, that
   placement wins. DNS and DHCP became Domain 3 because the exam already tags
   them `3.4 - implement IPv4 and IPv6 network services`; port security and
   PAP/CHAP became Domain 4 because the exam already tags them 4; VRRP and HSRP
   became Domain 2 because the exam already tags FHRP `2.1`; VLAN, STP, VTP and
   inter-VLAN routing became Domain 2 because the exam already tags VLAN
   configuration `2.2`; the 802.11 standards cards stayed Domain 1 because the
   exam already tags them `1.5`; traceroute and the ping/nslookup tools became
   Domain 5 because the exam already tags tools `5.5`.
3. **Genuine ambiguity is left untagged.** Five items sit genuinely on a domain
   boundary and were not guessed:

| Item | Why it is ambiguous |
|---|---|
| `fund-f34` VxLAN | Overlay networking: Domain 1 (virtualization) or Domain 2 (switching) |
| `fund-f42` PoE | Transmission media (Domain 1 cabling specs) or installation (Domain 2) |
| `impl-f26` Cable Testing | Installation tooling (Domain 2) or troubleshooting cabling (Domain 5) |
| `ops-f22` Load Balancing | Implementation (Domain 2 network devices) or operations/HA (Domain 3) |
| `ops-f30` LLDP | Layer-2 discovery (Domain 2) or documentation (Domain 3.1) |

Owner ruling on these five would let `MAX_UNTAGGED_RATIO` in
`scripts/validate-content.mjs` drop to 0.

### What tagging does not fix

Tagging made the imbalance *visible*; it did not reduce it. The exam pool is
still 42 of 88 questions in Domain 1 and 3 in Domain 2, and no amount of
retagging can change that — it is a property of the licensable source pool
(78 Packt questions plus 10 original OpenQuiz ones), not of the metadata.
Rebalancing requires new questions, which is the owner's decision, see below.

## The "final exam" adds no questions of its own

`netplus-final.json` contains exactly the 88 prompts of Practice Tests 1-3 and
zero prompts unique to it. Two honest consequences:

- A learner who takes the final *after* the practice tests is re-seeing every
  question, so the pass measures recall, not new coverage.
- `scripts/validate-content.mjs` treats this as a failure condition: a cumulative
  exam that adds no original prompt is an **error**. The Network+ final is listed
  in `KNOWN_ZERO_ORIGINAL_FINALS` so CI stays green, but that entry is a debt
  register, not an exemption — it is printed in full on every validator run and
  names issue #61. Any *other* final that adds nothing new fails the check
  immediately.

This gap was deliberately **not** closed by writing questions. This is a real
exam-aligned product with third-party licensing constraints, and inventing
CompTIA-style items would both fabricate exam content and contaminate the
provenance record in this file. Closing it requires one of:

- licensing more third-party questions whose redistribution terms are clear, or
- writing new OpenQuiz-original questions under a reviewer who is accountable
  for their accuracy against the N10-009 objectives, or
- a product decision to rename the file from "Final Exam" to something that
  honestly describes it as a cumulative retake.

That judgement belongs to the content owner, not to an automated change.

## Known limitations (honest disclosure)

- The 78-question pool is smaller than the previously advertised 50/50/50/100
  exam structure. The catalog now advertises the real counts rather than
  padding files by repetition.
- Domain coverage is uneven: 42 of 88 questions are Domain 1 and only 3 are
  Domain 2, because that is the distribution the licensable source provides.
  Each practice test carries a similar mix so no single test is domain-skewed.
  Every item now carries a `domain` tag so the imbalance is measurable, but the
  imbalance itself is unfixable without new content.
- These are study questions aligned to the public N10-009 objectives. They are
  not CompTIA material, are not endorsed by CompTIA, and are not a substitute
  for the real exam. See `THIRD-PARTY-NOTICES.md` for the trademark position.
- 13 of the 78 sourced questions use negative phrasing ("which is NOT...").
  This mirrors the source material and was not rewritten, since rewriting would
  mean authoring new question text.

## Regression guard

`scripts/validate-content.mjs` fails the build if a future edit reintroduces
in-file duplicate prompts, excessive overlap between exam variants, a `domain`
tag outside the N10-009 taxonomy, a mostly-untagged file, an advertised question
count that does not match its data file, or a cumulative final that adds no
prompt of its own and is not registered in `KNOWN_ZERO_ORIGINAL_FINALS`. Run it
with:

```
node scripts/validate-content.mjs
```

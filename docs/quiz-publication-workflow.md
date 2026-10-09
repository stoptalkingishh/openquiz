# Quiz publication review workflow

OpenQuiz remains a static site, so community catalog submissions use public GitHub Issues instead of a backend. A share link remains the way to send a quiz to learners. A catalog-review request is separate and never makes a quiz public by itself.

## Contributor flow

1. Open a custom quiz and choose **Share**.
2. Create a Drive or snapshot link for learners, then select **Request catalog review on GitHub**.
3. Provide a contact email, a link reviewers can access, source or license information, and confirmation that the material can be used for free public distribution.
4. GitHub opens a public Issue. Submit it and answer any follow-up comments there.

The contact email is required for provenance questions and is published in the Issue. Contributors should use an address they are comfortable making public.

## Maintainer flow

1. Triage `quiz-submission` Issues for scope, quality, accessibility, source attribution, and rights.
2. Request corrections or additional documentation in Issue comments.
3. Add approved content to the official bundled library or a future public community catalog through a content pull request.
4. Link the merge to the request with `Fixes #<issue-number>` so the public review record is retained.

This gives contributors a durable share link, makes curation asynchronous, and keeps catalog changes reviewable without storing user content or contact information in an OpenQuiz backend.

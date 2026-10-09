# Contributing to OpenQuiz

Thank you for helping make study tools more accessible.

## Report a quiz problem

Use the in-app **Give feedback on this quiz** link or the GitHub **Quiz feedback** Issue template. Describe the problem, expected correction, and the question number or a short safe-to-publish description. Do not paste private notes, proprietary questions, API keys, or private Drive links.

## Submit content for catalog review

Keep using a normal share link for learners. To request catalog inclusion, open your quiz's **Share** dialog and choose **Request catalog review on GitHub**. The public Issue requires a reviewable link, contact email, source or license details, and a rights confirmation. Read [CONTENT_POLICY.md](CONTENT_POLICY.md) before submitting.

## Contribute code

1. Open an Issue for substantial changes so the approach can be discussed.
2. Create a focused branch and add or update meaningful tests when behavior changes.
3. Run `npm run lint`, `npm test`, `npx tsc --noEmit`, and `npm run build`.
4. Describe the user-facing behavior and validation in the pull request.

By submitting code or documentation, you confirm that you have the right to contribute it and license your contribution under the repository's AGPL-3.0-or-later license.

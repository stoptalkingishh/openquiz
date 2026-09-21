# Quiz feedback workflow

OpenQuiz uses GitHub Issues for user feedback because the site has no backend. Each report is a public, trackable discussion that users can reply to after signing in to GitHub.

## User flow

1. Open a quiz detail page and select **Give feedback on this quiz**.
2. GitHub opens the Quiz feedback Issue template with the quiz name and OpenQuiz page already included.
3. Choose the feedback type, describe the question or missing coverage, and submit the Issue.
4. Follow replies and resolution in the same Issue thread.

## Maintainer flow

1. Triage each Issue with the `quiz-feedback` label.
2. Ask follow-up questions as Issue comments.
3. Bundle related corrections in a pull request when appropriate.
4. Include `Fixes #<issue-number>` in the pull request description to link the change and automatically close the resolved feedback Issue when merged.

This avoids a backend, preserves a searchable public record, and lets one pull request resolve multiple feedback reports without asking end users to fork the repository or create code pull requests.

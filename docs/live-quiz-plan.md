# Live multiplayer quiz plan

## Goal

Let a host run a timed, Kahoot-style game from an official bundled quiz, a published quiz, or a Google Drive-shared quiz. Players join with a short code or link, answer together, and see a live leaderboard.

## Why this needs a realtime service

OpenQuiz is a static GitHub Pages application. Google Drive can store and share a quiz, but it cannot provide a reliable room, synchronized timers, presence, server-side scoring, or safe answer-key handling. The live game needs a small backend designed for realtime state.

## Recommended architecture

Use Firebase for the first release:

- Firebase Authentication: Google sign-in for hosts and anonymous sign-in for players.
- Realtime Database or Firestore: rooms, player presence, current question state, and leaderboard updates.
- Cloud Functions: validate answers, calculate scores, advance server-owned game state, and remove expired rooms.
- GitHub Pages: remains the frontend host.

The browser must never receive the answer key for questions that have not been answered. Cloud Functions own answer validation and score calculation.

## Room lifecycle

1. A host selects an eligible quiz and chooses **Host live game**.
2. OpenQuiz creates a room, a short join code, and a share link.
3. The app creates a sanitized, immutable quiz snapshot for the room. It includes quiz metadata, prompts, options, and answer keys for server scoring.
4. Players enter a nickname and join the lobby.
5. The host starts the game. The server publishes one question at a time with a deadline based on server time.
6. Players submit one answer per question. The server records the first valid submission and updates scores.
7. The server sends leaderboard updates after each question. The host can continue, pause, or end the game.
8. The room and snapshot expire automatically after a short retention window, initially 24 hours.

## Supported content in the first release

- Multiple-choice questions
- True/false questions
- Timed rounds
- Lobby and player presence
- Host controls
- Question results and leaderboard

Flashcards, written answers, matching games, and simulations should remain unavailable for live games until each gets a fair and clear multiplayer scoring design.

## Quiz access and privacy

- Official bundled quizzes are available to every room participant.
- A Drive-shared quiz can be hosted only after the host opens it successfully.
- A live room uses a snapshot, so edits to the Drive file do not alter a game already in progress.
- The snapshot excludes AI source notes, Drive account details, quiz folders, study history, and unrelated quizzes.
- Published/private sharing controls determine whether a host may start a room; room access is controlled separately by the join code or link.

## Scoring and abuse controls

- The server, not the browser, calculates correctness and speed-based points.
- Each player may submit once per question.
- Server timestamps determine whether an answer met the deadline.
- Hosts may remove a player and lock the room after the game begins.
- Room identifiers should be non-sequential and difficult to guess.
- Rate limits should protect join, answer, and room-creation endpoints.

## Delivery phases

### Phase 1: foundation

- Firebase project and environments
- Anonymous players and authenticated hosts
- Room creation, join links, lobby, and presence
- Multiple-choice game loop with server-side scoring

### Phase 2: quiz integration

- Host controls on official, published, and Drive-shared quiz details
- Immutable quiz snapshots
- Eligibility messaging for unsupported item types
- Results screen and host replay controls

### Phase 3: polish

- Reconnect handling
- Accessibility and reduced-motion support
- Moderation controls
- Analytics events that do not include quiz answers or personal study content

## Open decisions

- Firestore versus Realtime Database after a small prototype measures latency and cost.
- Whether players may join anonymously or must use Google sign-in for private rooms.
- Default time limits and the scoring curve.
- Whether hosts can show a nickname-only public leaderboard after the room expires.
- Cost limits and abuse thresholds for the Firebase project.

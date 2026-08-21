# Code review style guide

Generated extract of AGENTS.md review rules for the Gemini Code Assist bot — keep in sync manually.

## Language & process

- All code comments, commit messages, PR descriptions, and review replies must be in English.
- Reject any commit made directly to `main`, any `git add -A`-style bulk staging, and any hook bypass (`--no-verify`).

## Code conventions

- Svelte 5 runes only: `$state`, `$derived` (incl. `$derived.by`), `$effect`, `$props`. Flag legacy `export let` props and `$:` reactive statements.
- State stores are classes in `*.svelte.ts` files exported as singletons. Transport and pure-logic modules are plain `.ts` and must stay rune-free (e.g. `liveClient.ts`).
- Formatting is Prettier-enforced: tabs, single quotes, trailing commas, printWidth 100. Do not hand-format against these settings.
- Wire types mirror their servers verbatim: the analytics ingest wire (`GameIngestWire`) is snake_case; the play-api live wire (`liveTypes.ts`) is camelCase with PascalCase event discriminators — do not flag either as inconsistent. Internal TypeScript is camelCase (persisted `LocalGameRecord` fields are the snake_case exception); enum translation goes through explicit `Record` mapping tables, not string manipulation.
- New modules need a file-head block comment stating the module's contract and any cross-repo invariants.
- Preserve accessibility patterns: ARIA roles on interactive widgets, focus management on confirmation flows.

## Forbidden patterns

- No game-logic decisions in the live client (`src/lib/live/`): `/live` is server-authoritative; the client only applies versioned `ServerEvent`s and rolls back optimistic moves on `Rejected`.
- In game stores, game logic must read live fields (`liveFen`/`liveActiveColor`/`liveDice`), never presentation getters (`currentBoardFen`/`activeColor`/`currentDice`) — those switch to historical values during history scrubbing (twice-fixed bug class).
- Do not change `src/lib/ingest/types.ts` (`GameIngestWire`) or `src/lib/live/liveTypes.ts` casually — both mirror external contracts (analytics ingest, play-api Circe codecs); changes require counterpart-repo coordination.
- Do not make the outbox retry `rejected` (400/422) games — they are permanently quarantined by design; only transient errors are retried.
- Do not duplicate pacing constants — `src/lib/timings.ts` is the single source for both game surfaces.
- No direct analytics-API calls or bearer tokens in client code — recording goes through play-api's `POST /ingest/games` only.
- No code checkout/execution steps in `labeler.yaml` (`pull_request_target` has write permissions on fork PRs).

## Testing expectations

- Behavior changes come with colocated `src/**/*.test.ts` Vitest tests (jsdom, `fake-indexeddb/auto`).
- Bot-play tests must not load the real engine — inject mocks via `setDiceChessInstance`/`resetDiceChessInstance`. Live-store tests do load the real engine and mock the network via `MockWebSocket` instead — do not flag that as a violation.
- Flag sleeps/timing races in tests; prefer deterministic event driving and mocked timers.

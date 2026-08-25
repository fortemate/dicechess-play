# AGENTS.md

dicechess-play is the public Dice Chess play site: a fully client-side SvelteKit SPA where anonymous visitors play bots or each other, auto-deployed to Cloudflare Pages on every push to `main`. Anonymous-first, not account-less: signing in (Google OAuth via play-api) is optional and adds a Glicko-2 rating shared with the bots (ADR-0017), a leaderboard place, and cross-device history.

## Project context

- Static SPA: SvelteKit 2 + Svelte 5 runes, Vite, Tailwind 4, adapter-static (`ssr=false`, output `dist/`), PWA (autoUpdate service worker). No backend code lives here.
- Public repo, AGPL-3.0. External contributors must sign the CLA (`CLA.md`, enforced by the `CI: CLA` workflow; repo owner exempt).
- Two game surfaces: `/play` (client-authoritative vs bot, engine in a Web Worker) and `/lobby` + `/live/[id]` (server-authoritative human-vs-human client for the sibling `dicechess-play-api` server).
- Cross-repo contracts this repo carries:
  - `src/lib/ingest/types.ts` — `GameIngestWire`, a **verbatim copy** of the shared ingest contract (analytics `POST /api/games`). Divergence = 422 rejects, because the backend replays games with a pinned engine.
  - `src/lib/live/liveTypes.ts` — `ClientCommand`/`ServerEvent` must mirror play-api's Circe codecs exactly. Verify both sides when changing either.
  - DFEN: the 7th field encodes dice as piece letters; decoded in `src/lib/ingest/mapper.ts` and `src/lib/live/dfenUtils.ts`.
  - Ingest identity: `source='playsite'`, human = `guest:<uuidv7>`, bot = `bot:<algorithm>`, game id = UUIDv5 for idempotent re-sends.
- Game engine = `@fortemate/dicechess-engine` (Scala.js, version pinned in `package.json`), served from GitHub Packages — auth prerequisite below.

## Architecture map

- `src/routes/` — pages: `+page` (home), `play/`, `lobby/`, `live/[id]/`, `games/` + `games/[id]/` (local history & replay), `me/` (profile — guest by default, optional account sign-in for a rating; restore code). `+layout.ts` disables SSR/prerender.
- `src/lib/playWithBot/` — bot-play surface: `playWithBotStore.svelte.ts` (game store), `playWithBot.worker.ts` (engine runs here), dice/history submodules, `opening_book.json`.
- `src/lib/live/` — live surface: `liveGameStore.svelte.ts` (applies versioned `ServerEvent`s, optimistic moves rolled back on `Rejected`), `liveClient.ts` (WS + reconnect backoff, deliberately rune-free), `liveApi.ts`/`lobbyApi.ts` (REST), `liveTypes.ts`, clocks/seat/time-control helpers.
- `src/lib/ingest/` — finished-game recording: `mapper.ts` (LocalGameRecord → `GameIngestWire`), `ingestClient.ts` (posts to play-api `POST /ingest/games`; the browser never holds an analytics token), `outbox.ts`, `guestIdentity.ts`.
- `src/lib/localGamesDB.ts` — IndexedDB via `idb`; `sync_status`: `pending` | `synced` | `quarantined`.
- `src/lib/history/`, `src/lib/stats/` — replay reconstruction, local player record.
- `src/lib/stores/` — singleton rune stores: `themeStore` (7 themes), `localGamesStore`, `chromeStore`.
- `src/components/` — shared UI (`Board`, `DicePanel`, `PlayerStrip`, `GameEndModal`, …). NOT `src/lib/components/` — that holds only an empty leftover dir.
- `src/lib/timings.ts` — presentation pacing constants shared by BOTH surfaces. Single source; never fork per-surface copies.

## Commands

Prerequisites:

- `mise` provides node 26, lefthook, betterleaks (`mise.toml [tools]`).
- `export NODE_AUTH_TOKEN=<GitHub PAT with read:packages>` BEFORE installing — the engine resolves from `npm.pkg.github.com` (only the `@fortemate` scope is routed there, see `.npmrc`); chessground installs from the public registry despite the stale comment in `.env.example`. Failure signature: `npm install` dies with `401 Unauthorized` on `@fortemate/dicechess-engine`.
- Fresh clone: `svelte-kit sync` must run before svelte-check (the `prepare` npm script and `npm run check` both do it). Failure signature: svelte-check errors about a missing `.svelte-kit/tsconfig.json`.

```bash
mise run setup          # npm install (needs NODE_AUTH_TOKEN)
mise run hook:install   # register lefthook git hooks — once per clone
mise run dev            # Vite dev server → http://localhost:5173
mise run check          # eslint + prettier --check + svelte-check
mise run test           # vitest run
mise run format         # prettier --write .
mise run compile        # vite build → dist/
mise run hook:run       # run all pre-commit hook jobs manually
npx vitest run src/lib/ingest/mapper.test.ts   # single test file
npm run test:watch      # watch mode; npm run test:coverage for v8 coverage
```

- Run `npm ci` immediately after every `git pull`. Failure signature of skipping it: local prettier disagrees with CI and produces false formatting "drift" (this repo has 4 commits that exist only to undo such damage). When local lint/format disagrees with CI, compare tool versions first — never "fix" the files.
- Local live-play dev: run play-api locally and set `VITE_PLAY_API_URL=http://localhost:8080` in `.env.local`. Empty `VITE_PLAY_API_URL` = `/live` routes disabled AND recording disabled (games stay in IndexedDB) — both share the same base URL.

## Quality gates — Definition of Done

- Before a PR: `mise run check` and `mise run test` pass locally. CI (`ci.yaml`) runs the same set — eslint, prettier check, svelte-check, `vite build`, `vitest run` — on push/PR to `main`; any failure blocks.
- No coverage threshold and no SonarCloud in this repo (those live in sibling repos). Still add tests for every behavior change — colocated `*.test.ts` is the house norm.
- CLA check runs on every PR (non-owner authors must have signed).
- Per-change extras:
  - Touched `src/lib/ingest/types.ts` or `mapper.ts` → confirm the wire shape against the shared ingest contract before merging; a silent mismatch only surfaces as production 422s.
  - Touched `src/lib/live/liveTypes.ts` or `liveClient.ts` → verify against play-api codecs, ideally with both repos running locally.
  - Touched the presentation/history pipeline → run the store suites (`liveGameStore.test.ts`, `liveClocks.test.ts`, `playWithBotStore.test.ts`) and manually scrub move history in the browser.
  - UI flow changes → verify in the dev server; hard-refresh may be needed to bypass a cached PWA service worker.

## Code conventions

- Prettier: tabs, single quotes, trailing commas, printWidth 100, `prettier-plugin-svelte` (`.prettierrc`). Enforced pre-commit (staged `--write`), pre-push (`--check` all), and in CI.
- ESLint flat config (`eslint.config.js`): js/ts/svelte recommended sets; `no-explicit-any` is warn-level; unused vars allowed with `_` prefix.
- TypeScript strict, ES2023; `tsconfig.json` extends the GENERATED `.svelte-kit/tsconfig.json`. TypeScript is tilde-pinned (`~6.x`) — TS6 dropped auto-inclusion of `@types` packages, so verify `node:` imports with `npm run check` instead of assuming.
- Svelte 5 runes only (`$state`/`$derived` incl. `$derived.by`/`$effect`/`$props`). State stores are classes in `*.svelte.ts` files exported as singletons; transport/pure-logic modules are plain `.ts` and stay rune-free (`liveClient.ts` is the model).
- Each wire mirrors its server verbatim: the analytics ingest wire (`GameIngestWire`) is snake_case; the play-api live wire (`liveTypes.ts`) is camelCase with PascalCase single-key event discriminators (`{ Snapshot: … }`) — never "normalize" either. Internal TS is camelCase (persisted `LocalGameRecord` fields are the snake_case exception). Map enums via explicit `Record` tables (see `END_REASON_TO_TERMINATION` in `mapper.ts`).
- Error handling: REST helpers (`liveApi.ts`) throw on bad status; the ingest path NEVER throws on HTTP status — outcomes are classified (`created`/`exists`/`rejected`/`error`) so the outbox decides retry vs quarantine.
- New modules get a file-head block comment stating the module's contract, the decision behind it, and any cross-repo invariants (see `ingest/types.ts`, `liveGameStore.svelte.ts`).
- Accessibility is reviewed: keep ARIA roles on interactive widgets and focus management on confirmations (existing patterns in history nav and `/me`).

## Testing conventions

- Vitest + jsdom; tests are colocated `src/**/*.test.ts`; `vitest-setup.ts` loads `fake-indexeddb/auto`. No Docker needed anywhere.
- **`e2e/` is Playwright, not vitest** — one smoke test that drives the BUILT `dist/` through `vite preview` and plays a real move (#187). It needs a build first: `npm run build && npm run test:e2e`. Its assertion is the history counter, deliberately: on a rejected move the store leaves the FEN untouched, so nothing re-renders and chessground keeps the piece on the square it was dropped on — watching the piece would pass on a build that cannot move at all. Keep the suite to smoke-level (can the shipped bundle play?); feature-level UI behaviour belongs in the vitest store suites, which are far faster.
- Bot-play tests never load the real engine: inject a mock via `setDiceChessInstance`/`resetDiceChessInstance` (see `playWithBotStore.test.ts`). Live-store tests DO load the real engine (top-level import in `liveGameStore.svelte.ts`) and exercise it for legal moves and optimistic application; they mock the network via `MockWebSocket` instead. CI's `NODE_AUTH_TOKEN` covers both cases at install time.
- WebSocket behavior is tested with a hand-rolled `MockWebSocket` that drives `ServerEvent`s (pattern in `liveClocks.test.ts`).
- Non-flaky patterns to preserve: sound tests flush stale unlock listeners and guard against missing `localStorage` (they were flaky until isolated this way).

## Gotchas

- Run `git status` before touching anything — in-flight feature work is often present in the working tree.
- **A rating delta is never computed on this side.** play-api applies rating in a background batch, one game at a time and up to a minute after the game ends, so diffing a player's current rating against the rating frozen in the room at game start folds in every other game applied in between — and after a rematch it reports the PREVIOUS game's change, which is how a WIN came to display `-21.54` in production (#235). Ask `GET /games/{id}/rating` (`ratingApi.ts`) and poll its `applied` flag; `applied` with no seat numbers is a final "this game moved nobody's rating", not a not-yet. Ratings arrive as raw doubles everywhere on that wire — round at render time (`ratingDelta.ts`), never store a rounded one.
- Never add game-logic decisions to the live client. `/live` is server-authoritative: the client only applies versioned `ServerEvent`s and rolls back optimistic moves on `Rejected`. Game rules belong in the engine worker (`/play`) or in play-api.
- Live-vs-viewed separation — this codebase's signature bug, fixed twice (PRs #45, #56): game logic must read the private live fields (`liveFen`/`liveActiveColor`/`liveDice`), never the public presentation getters (`currentBoardFen`/`activeColor`/`currentDice`), because those switch to historical values while the user scrubs move history. Documented at the top of `liveGameStore.svelte.ts`.
- `liveGameStore` uses `epoch`/`pumpingEpoch` counters to invalidate in-flight async presentation loops across reset/reconnect — respect them when touching the present pipeline; racing loops caused several past fixes.
- `ingestClient.classify`: 200 = `exists` (first-writer-wins dedup), 201 = `created` (accepted into play-api's relay queue — analytics replay happens asynchronously server-side), 400/422 = permanent `rejected` → quarantined and never retried, everything else = `error` → retried. Do not "fix" the outbox to retry rejects.
- The engine is a Scala.js artifact, and a bundler/minifier can miscompile it while every gate stays green — vitest imports the package straight from `node_modules` and never bundles, and `vite build` exits 0 on a miscompile. rolldown 1.1.5 (pulled in transitively by the vite 8.1.5 bump) made `DiceChess.applyMove` return `undefined` for every move and shipped an unplayable site to production (#185; fixed upstream in rolldown 1.2.1). `npm run build` therefore ends in a `postbuild` hook, `scripts/verify-bundle.mjs`, which imports the built chunk and asserts the bundled engine can still apply a legal move. Never make that hook non-blocking — it is the only check that looks at `dist/`.
- `VITE_*` env vars are baked at BUILD time — the bundle is direct-uploaded to Cloudflare Pages, so Pages dashboard variables do nothing. Changing `VITE_PLAY_API_URL` requires rebuild + redeploy (`deploy.yaml` reads it from a repo variable).
- Every push to `main` auto-deploys to production Cloudflare Pages. The never-commit-to-main rule is absolute here. Every PR from this repo also gets a Cloudflare **preview** deployment of the same production bundle, commented on the PR (`deploy.yaml`, #187) — review there rather than on a dev server. Fork PRs are skipped (no access to the Cloudflare secrets). A preview is built against the production play-api, but production's `PLAY_CORS_ORIGINS` is pinned to `https://fortemate.com` and `Cors.policy` matches origins by exact string — Cloudflare mints a new `*.pages.dev` host per deployment, so there is nothing to allow-list and the browser blocks every play-api call from a preview. **A preview reviews `/play` only**; `/lobby`, `/live`, `/bots`, `/leaderboard`, the server half of `/games` and finished-game recording are dead on it. Deliberate, not a bug — `/play` is the surface #185 broke.
- Releases are manual (`Ops: Release` workflow_dispatch bumps a git tag); `package.json` stays `0.0.0`. Never push tags yourself.
- The engine loads via `(DiceChessEngine as any).DiceChess` (Scala.js export shape) and runs in a Web Worker for bot play; only legal-move hints and optimistic move application run on the main thread in the live store.
- `deploy.yaml`'s `pages project create ... || true` is intentional (wrangler does not auto-create the project) — do not "clean it up".
- `labeler.yaml` runs on `pull_request_target` (write perms on fork PRs) — never add code checkout/execution steps to it.
- PWA `autoUpdate` service worker can serve a stale bundle during manual browser verification — hard-refresh or check the SW state before concluding a change "didn't work".
- The stale bot closes inactive PRs after 30+10 days; label long-lived branches `pinned` if legitimately parked.

## Git & PR workflow

<!-- dc-shared:git-pr v3 — keep identical across dicechess repos -->

- Follow the branch-name and Issue-link contract in `dc-shared:issue-management v6`. Agents that
  choose a branch name follow its canonical grammar; integration-owned branch names are accepted
  only when the target repository's live PR policy allows them.
- **The branch type chooses the release-notes section** — `.github/labeler.yml` turns it into a
  PR label and `.github/release.yml` groups by that label. `task/` is issue-driven work and counts
  as a feature, so a fix belongs on `bug/` even when it closes an issue; `chore/` is the grab-bag
  and files under "Other Changes". A type that maps to no label mis-files the whole PR: play-api
  v0.16.0 shipped ten features under 📚 Documentation because every branch was `task/` (which
  mapped to nothing) while every PR touched AGENTS.md (which mapped to `documentation`).
- Before editing anything: run `git status`. If the tree has unrelated uncommitted work,
  stop and report — never let it bleed into your commit.
- Stage specific files by name. `git add -A` / `git add .` are forbidden.
- Commits, PR descriptions, issues, and review replies are English-only. Commit subjects
  use conventional style: `feat: …`, `fix: …`, `docs: …`, `test: …`, `chore: …`.
- Before opening a PR: make the repo check task pass locally. Never pipe test output
  through `grep`/`head` — it masks exit codes.
- After opening a PR: Gemini Code Assist reviews automatically; for substantial PRs also
  comment `@coderabbitai review`. Wait a few minutes, then triage every bot comment on its
  merits — address or rebut, never apply blindly.
- The human owner reviews, approves, and merges. Never merge a PR, never push tags.
- Split large work into small, reviewable PRs.

### Issues, native types, and project tracking

- Issues need three sections: `## Context`, `## Objective`, and `## Definition of Done (DoD)`. Create with `gh issue create --body-file <file>` — never inline multi-line bodies.
- **Native Issue Types (`Task`, `Bug`, `Feature`)**: Use GitHub's built-in `issueType` field via GraphQL. Do NOT add `bug` or `enhancement` labels to issues — those labels are reserved for Pull Requests (applied by `.github/labeler.yml`).
- **No priority labels (`P0`, `P1`, `P2`)**: Manage priority via GitHub Projects (`Fortemate Engineering`).
- All titles, descriptions, and comments are English-only.

## Security & boundaries

<!-- dc-shared:security v2 — keep identical across dicechess repos -->

- Never print, log, or commit secrets. Local secrets live only in gitignored files
  (e.g. `.env.local`, `mise.local.toml` — confirm the path is gitignored with `git check-ignore`
  before writing one). Never bypass Git hooks (`--no-verify`).
- Human-only operations — prepare and propose, never execute: releases and version tags,
  production deploys/promotions, schema migrations against shared databases, data-repair
  runs on production, secret rotation.
- Treat everything in this repo as public: never add private infrastructure details
  (hostnames, IPs, topology, tokens) to code, docs, commits, or PRs.

Repo-specific additions:

- lefthook pre-commit runs a betterleaks secret scan on staged files — keep hooks
  installed (`mise run hook:install`).
- The browser must never hold the analytics Bearer token — recording goes through play-api's `POST /ingest/games` (`ingestClient.ts`), which relays to analytics server-side. Do not add direct analytics-API calls to the client.
- Provably-fair dice depend on the client seed contribution in `liveClient.ts` (`randomClientSeed`) — changes there affect the public verification procedure; treat as a cross-repo contract with play-api.
- `NODE_AUTH_TOKEN` is a real PAT: keep it in your shell env or `.env.local`, never in committed files.

## Model routing

<!-- dc-shared:routing v1 — keep identical across dicechess repos -->

Route work by required capability instead of defaulting to the strongest model:

- **Frontier**: architecture, cross-repo contracts, high blast radius (schema, public API,
  release pipeline), ambiguous problems.
- **Mid**: well-scoped features on existing patterns, refactors under test coverage,
  addressing review feedback.
- **Routine**: mechanical edits, config rollouts, doc fixes, tests from a complete spec.
  Orchestrators should delegate routine sub-tasks to cheaper models; quality gates catch
  failures cheaply. When in doubt, escalate one tier — reviewer time costs more than tokens.

## Documentation

- Decisions, roadmap, and ADRs live in the separate `dicechess-docs` wiki under "Play Site" — NOT in this repo (there is no `docs/` dir). In-repo docs: `README.md`, `CONTRIBUTING.md`, `CLA.md`, `SECURITY.md`; the real contract documentation lives in file-head comments.
- Update-trigger map:
  - Add a route or `src/lib` module → update README's Layout section — it is maintained by hand and drifts silently.
  - Change `GameIngestWire` or `liveTypes.ts` → update the file-head contract comment AND coordinate the counterpart repo in the same change set.
  - Change setup or env requirements → update `README.md` and `.env.example` together.
- All documentation is English-only.

## Issue management

<!-- dc-shared:issue-management v6 — keep identical across Fortemate repositories -->

- Use the native GitHub Issue Type as the canonical work classification:
  - `Bug` for unexpected or incorrect behavior.
  - `Feature` for a request, idea, or new user-visible capability.
  - `Task` for a specific piece of engineering, research, maintenance, or documentation work.
- Never commit directly to a repository's default branch. For branches whose names the agent controls, use `<type>/<short-description>` or `<type>/<issue-id>-<short-description>` with the preferred types `task|feat|bug|refactor|chore|docs|ci|test|perf`. The legacy `feature/` and `fix/` forms are compatibility aliases, not preferred names for new agent-created branches. If a branch name contains an Issue id, the pull-request body must close that exact independently actionable Issue. Before dispatching an external tool or opening its pull request, read the target repository's live PR-policy workflow. A tool-managed branch whose name cannot be controlled, including a Jules `jules-*` branch, is acceptable only when that live policy permits non-conventional issue-linked branches and the pull-request body closes the delegated leaf Issue. Never edit a workflow merely to make a generated branch pass; if the exception is absent, stop and report the repository-policy prerequisite.
- Do not apply `bug` or `enhancement` labels to Issues merely to repeat their Type. Keep those labels for pull-request release classification. On Issues, labels describe only a technical domain or cross-cutting concern, and only existing repository labels may be used.
- Applying or reapplying the `jules` label is a live execution trigger. On an open Issue the label denotes the current Jules delegation; on a closed Issue it may remain as historical execution metadata. By default, agents must never apply or reapply it. Exception: a top-level Codex or Claude Code orchestrator directly handling the current human request may apply or reapply `jules` only when that human is authorized to direct work in the target repository and explicitly authorizes Jules delegation for the current parent task. Jules, Antigravity, CI, delegated subagents, and agents without that task-scoped authorization must never apply or reapply `jules`, start Jules through the label, CLI, API, or another mechanism, or recursively delegate work.
- Removing `jules` is cleanup, not dispatch. During takeover of an open Issue, only the top-level primary orchestrator acting under the original task-scoped delegation authorization or an explicit recovery request from a current user authorized to direct work in the target repository may remove it. Separately, a top-level Codex or Claude Code agent directly triaging an already reopened Issue may remove a stale historical `jules` label without Jules-delegation authorization only when the latest application of `jules` predates the latest reopen event; if that ordering cannot be verified, do not remove it. A request to triage an already reopened Issue authorizes only this verified historical-label cleanup. This narrow cleanup exception grants no authority to apply or reapply `jules`, take over active Jules work, or delegate work. Jules, Antigravity, CI, delegated subagents, and all other agents must never remove `jules`.
- Before an authorized orchestrator applies `jules`, it must read the Issue back and verify that it is an open, independently mergeable leaf Issue with no blocker, competing owner or pull request, overlapping active work, or dependency on unmerged changes; belongs to Fortemate Engineering; has Status `Ready`, Execution tier `Routine`, and `spec:ready`; and contains self-contained Context, Objective, testable Definition of Done, Guards, Verification gates, Non-goals, and a bounded file-level blast radius. Apply `jules` last, read it back, monitor the Issue/session/pull request through completion, review the result, and take over stalled work. Never dispatch the same task through both the label and Jules CLI. Follow the `jules-delegation` skill when it is available.
- Actionable Jules feedback must be a submitted pull-request conversation or inline comment from the GitHub user who triggered the task, explicitly mention `@jules`, and be followed by acknowledgement and re-review of the resulting commit. A review body is not a Jules feedback channel. A delegated pull request and its commits may close only its leaf Issue, never its parent or sibling.
- Removing `jules` or using Jules CLI pull/teleport does not prove that the remote session stopped. Never write concurrently to a possibly active Jules branch. Continue the existing pull request only after terminal state is confirmed; otherwise recover verified work in an isolated branch and replacement pull request.
- After successful Jules work closes an Issue, retain `jules` as an audit marker. If that Issue is reopened, remove the historical label before triage under the reopened-Issue cleanup rule above; applying it again requires fresh task-scoped authorization and all dispatch checks, because a new label event starts a new session. During an authorized takeover of an open Issue, the permitted primary orchestrator must remove `jules` and record `outcome:escalated`.
- Before creating or updating an Issue, search relevant Fortemate repositories across open and closed Issues for semantic duplicates. Read the live Types, field options, labels, assignees, and relationships before mutation; never rely on cached IDs or invent metadata.
- GitHub-facing work items are English-only. Use the appropriate Issue Form when available, or `gh issue create --body-file <file>` for CLI creation; never pass a multiline body inline. Every Issue must contain `Context`, `Objective`, and a testable `Definition of Done`.
- Add every actionable Issue (never pull requests) to the organization Project [Fortemate Engineering](https://github.com/orgs/fortemate/projects/1).
- Use Project `Status` only for workflow state:
  - `Backlog` means triaged but not committed for active work.
  - `Ready` means sufficiently defined and available to start.
  - `In progress` means someone is actively working on it.
  - `In review` means implementation is waiting for review or validation.
  - `Done` means the Issue is closed.
- Set the Project `Execution tier` during triage:
  - `Routine` for a bounded, reversible task suitable for Jules or another low-cost agent.
  - `Mid` for a well-scoped task that needs a stronger coding agent with iterative supervision.
  - `Frontier` for architecture, public contracts, complex diagnosis, or other high-blast-radius work; human-led.
  - `Human-only` for releases, production operations, secrets, or legal decisions that must never be delegated.
  - `Decompose` for work too large to route as-is: split it into sub-issues, tier each, then re-tier or close the parent.
  - A blank value means the Issue has not been routed yet.
- Leave the organization `Priority` Issue field blank for normal work. Set it only to deliberately jump the queue: `Urgent` for an immediate incident, security problem, or release blocker; `High` for important or blocking planned work. Never replace organization fields with labels or duplicate Project fields.
- Triage establishes Type, Execution tier, applicable labels, Project membership, Status, and relationships (plus Priority only for queue-jumpers). Assign an Issue only when a person owns its next action, and assign the active owner before moving it to `In progress`; unassigned means agent pool or no current owner, not low priority.
- Use parent/sub-issue relationships for independently actionable decomposition, `Blocking`/`Blocked by` for hard ordering dependencies, and `Relates to` for non-blocking associations. If the live UI or API cannot create a relation, add an explicit typed cross-reference that preserves its semantics: `Parent:`, `Sub-issue:`, `Blocking:`, `Blocked by:`, or `Related:` followed by `owner/repository#<id>`. Do not simulate relationships with title prefixes, labels, or duplicate task lists.
- When a pull request targets the repository's default branch and fully completes an Issue, link it with `Closes #<id>` or `Closes owner/repository#<id>`. Use a non-closing reference for partial work or for a pull request targeting any other branch.
- After every Issue, pull-request, or Project mutation, read the item back. For an Issue, verify Type, Issue fields, labels, assignee, relationships, Project membership, and Status. For a pull request, verify base/head branches, draft and merge state, labels, assignees/reviewers, and linked Issues; pull requests are never Project items, and Issue Type and Issue fields do not apply. Report any metadata that the available API or UI could not set.
- The human owner reviews, approves, and merges pull requests. Agents never merge pull requests or execute releases.

<!-- /dc-shared:issue-management -->

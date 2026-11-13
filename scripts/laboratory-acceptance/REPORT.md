# Laboratory acceptance report

**PASS — 30 real-service scenarios, 13 retained public transcript exports.** Qualified locally on 2026-11-13 for [#225](https://github.com/fortemate/dicechess-play/issues/225), within epic [#221](https://github.com/fortemate/dicechess-play/issues/221). This qualifies the implemented laboratory workflow; players still determine whether the variant is enjoyable.

## Inputs and environment

| Component                   | Exact input                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------- |
| Client source               | `98dbd14e61d4dd60c4ae7420ce262d1f7ccbc9fa` (merged #227)                           |
| API source                  | `e3254bbc022b02a1635075f62c57d8ab6d410f54` (unchanged by this PR)                  |
| Rules engine                | `@fortemate/dicechess-engine` / API rules `0.18.2`                                 |
| Node / npm                  | `26.8.1` / `11.19.0`                                                               |
| Java / SBT                  | Temurin `25.0.4.1+1` / `2.0.12`                                                    |
| Browser                     | Playwright `1.64.1`, Chromium `156.0.8078.4`                                       |
| Database / Docker           | PostgreSQL `18.6`, Docker `29.9.2`                                                 |
| PostgreSQL image            | `postgres@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5` |
| Staged API main JAR SHA-256 | `18fdb0a4a2abb8629f81e5e40251ac489f53fefd058b0ff6e3db964b58f3c1fc`                 |
| Built lab JS SHA-256        | `d2104fcb27b6ebacb146e17c3eb28c248df500bfc6c343792479b362d66b7b4c`                 |
| Final run                   | `run-1794582247874`                                                                |

The runner served `dist-laboratory/` from the production build. It created its own local PostgreSQL container, separate laboratory/classic databases and restricted roles, API processes and loopback proxies. Windows execution used WSL NAT; remote Docker overrides and mirrored WSL networking are refused. The runner removed its container, API processes and listeners after completion. No existing service was reused or stopped.

WSL is invoked with `--exec` so arguments bypass the default Linux shell. A setup regression probe verifies that spaces, quotes, a semicolon and literal command-substitution text arrive unchanged. This addresses the CodeQL launcher warning from the first PR analysis; the full matrix was rerun after the change.

Fixture positions were installed only in newly created, version-zero waiting rooms in the disposable lab database, with the APIs stopped and guarded SQL predicates. Server seeds, commitments, credentials and offer generation were preserved. Normal join/seed messages provided client contributions. No debug routes or product changes were needed.

## Acceptance results

The complete machine-readable matrix is [acceptance-results.json](./evidence/acceptance-results.json). Every scenario reports PASS.

| Requirement                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two participants and whole-pair choice | Independent browser contexts created a White 10+10 room, joined its Black invitation, rolled twice, explicitly selected/confirmed one pair and submitted a complete legal turn.                                                                                                                                                                                                                                                                                      |
| Special rules                          | Equal offers (choose index 1), unplayable chosen over playable, both unplayable, maximum consumption, castling, knight promotion and immediate king capture all passed explicit position/move expectations. Four micro-moves, an incomplete path and moves from the unselected pair were rejected. The playable DFEN contained exactly the selected pair.                                                                                                            |
| Recovery                               | Waiting room and all four turn stages survived actual network disconnect, reload and API restart against real PostgreSQL. Offers, selection, variant and active seat remained unchanged; no gameplay command was sent automatically. A hard crash also preserved the accepted command receipt: retry applied no second mutation.                                                                                                                                     |
| Clocks and absence                     | Pre-start clocks stayed stopped across restart; selection timeout awarded Black the game; absent Black caused an incomplete aborted draw with stopped clocks.                                                                                                                                                                                                                                                                                                        |
| Protocol and access                    | Wrong seat, early movement, stale version, command-ID conflict and changed selection were refused. Exact command retry was idempotent. Another room's capability received policy close 1008 without application data; private receipts did not reach the opponent. Lab WebSocket URLs had no query or fragment.                                                                                                                                                      |
| Review, exports and rematch            | Finished and incomplete records were reviewed/downloaded through the UI. White resignation awarded Black the game. Both participants entered one new rematch with the same variant revision/time control and exchanged colors.                                                                                                                                                                                                                                       |
| Independent verification               | Node `crypto` independently checked commitments and lab/classic dice vectors. All 11 complete retained transcripts passed offer and legal-path/FEN replay using the pinned rules engine; king-capture winner/reason were derived from the resulting board. Resign/timeout winners were checked against the known test action, not inferred cryptographically. Both incomplete exports returned `not-verifiable`, with no fairness reveal or verification-pass claim. |
| Isolation                              | Content hashes and row counts of all 31 ordinary `play` tables remained unchanged. Database roles could not cross-connect; schemas, listings and disabled routes stayed separated. Browser requests stayed on the two configured local origins; no ordinary history, ingest/outbox, ratings or training calls/storage appeared, and no IndexedDB database was created.                                                                                               |
| Responsive/accessibility               | Desktop 1440×900, phone 320×740 / 390×844 and landscape 844×390 had no horizontal overflow. Light/dark controls, reduced motion, touch selection, keyboard confirmation/Tab, phase focus and offline disabled controls passed. Browser pages had no uncaught exceptions.                                                                                                                                                                                             |
| Retirement handoff                     | Closing `LAB_ADMISSION_OPEN` blocked new rooms without changing the row count; existing completed transcripts remained exportable and independently verifiable.                                                                                                                                                                                                                                                                                                      |

Recovery resumes the **last committed clock bank**. Time since that commit and process downtime are forgiven; graceful shutdown does not add a checkpoint. The runner compares the restored bank and subsequent active-seat elapsed time with a 500 ms sampling tolerance; it rejects resets or extra increments. This documents the existing experimental recovery policy.

## Reproduction and quality gates

Follow [README.md](./README.md) for prerequisites, environment variables and the launch/export/retirement handoff. In the client checkout:

```sh
npm ci
npm run check:rules-version
npm run lint
npm run format:check
npm run check
npm test
npm run build
npm run build:laboratory
npm run test:e2e
npm run test:laboratory
npm run test:pwa
npm run test:laboratory:acceptance
```

Set `VITE_LAB_API_URL=http://127.0.0.1:8081` before the lab build and supply the staged API/JDK paths as documented. Run the acceptance harness after other Playwright suites, or put `LAB_ACCEPTANCE_OUTPUT` outside `test-results/`: Playwright cleans its output directory. This qualification used a separate output base. Retained artifact bytes are excluded from formatting so their checksums remain stable.

| Gate                                                | Result                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client unit tests                                   | 1,583 Vitest tests / 146 files passed                                                                                                                     |
| Independent oracle and retained evidence regression | 5 Node tests passed; checksums, golden vectors, transcript replay and expected outcomes checked in normal `npm test` / CI                                 |
| Rules compatibility                                 | 6 tests passed; client and API both `0.18.2`                                                                                                              |
| Static checks                                       | ESLint: 0 errors (47 pre-existing warnings); Svelte check: 0 errors / 0 warnings; format and Functions TypeScript checks passed                           |
| Built artifacts                                     | Main bundled-engine move/continuation checks passed; isolated lab module check passed (236 source modules)                                                |
| Browser regressions                                 | 6 main smoke + 2 lab smoke + 6 PWA tests passed                                                                                                           |
| API gate                                            | `scalafmtCheckAll;scalafmtSbtCheck;clean;coverage;testOnly *;coverageReport`: 1,365 passed, 0 failures; statement coverage 89.39%, branch coverage 82.59% |
| API remote checks                                   | Exact pinned SHA [check run](https://github.com/fortemate/dicechess-play-api/actions/runs/43431052671) and SonarCloud passed                              |
| PR checks / Sonar                                   | Final PR check links and status are recorded in the PR description after analysis finishes                                                                |

The API gate used a fresh SBT local cache with the pinned Java/SBT toolchain. An initial aggregate run reported a `BotRoutesSuite` failure; its unchanged focused suite passed 57 tests and the full rerun passed all 1,365. The first failure detail was overwritten, so its cause remains unproven. An intermediate clean/coverage run also encountered stale instrumented-cache measurements; a fresh cache resolved that validation problem. No product fixes were made for these earlier attempts.

SonarCloud's existing configuration excludes `scripts/**`; its green gate does not mean these new acceptance scripts received code analysis. Deterministic secret scanning passed for source and retained artifacts. Additional local agentic analysis was attempted but unavailable on this connection (403). The existing Sonar configuration was preserved.

## Retained evidence and limits

### Review follow-up

All six new review findings were addressed in the acceptance harness, without changing the client or API game behavior:

- Docker query capture waits for `close`, including final UTF-8 stdout/stderr chunks after child `exit`.
- Complete transcripts require supported termination values and the corresponding win/draw result shape. Records with no outcome are refused.
- A king-capture terminal selection must match the final recorded turn, with both offers retained.
- Masked WebSocket frames use the shortest length encoding; tests cover 0, 125, 126 and 65,535 bytes and reject overflow.
- Receipt privacy checks include the opponent's original connection and its replacement after the crash.
- SIGINT/SIGTERM stop subsequent operations and await idempotent owned-resource cleanup after in-flight setup settles. Interrupted records cannot report PASS.

The full real-service matrix passed again in `run-1794584215679`: [review-acceptance-results.json](./evidence/review-acceptance-results.json), 30/30 scenarios. Original transcript exports and screenshots remain preserved; their verification now runs through the stricter oracle. All 1,583 client unit tests and 15 local harness regression tests passed, along with lint, formatting and type checks.

The separate opt-in `check-interruptions.mjs` check also passed on Linux/WSL with Node 26.8.2: real SIGINT/SIGTERM produced `INTERRUPTED`, exit codes 130/143, and no remaining owned database container. It was rerun after the final cleanup changes. Abrupt SIGKILL, host loss or Docker daemon failure remain outside cooperative shutdown guarantees.

[SHA256SUMS](./evidence/SHA256SUMS) covers every retained evidence file. The final run's transcript/PNG artifacts are preserved verbatim. The versions metadata label for the staged JAR digest was renamed to serverArtifactSha256 after a false-positive API-key scan; its digest value and scenario outcomes are unchanged. Two additional `ui-smoke-choice-*` images come from the separate, passing built-client lab smoke suite with fixture transport; they document choice-screen appearance, not an extra real-service run. All screenshots were visually inspected. Public terminal seeds are intentional fairness reveals; invitation links, capabilities, private snapshots, socket frames and process logs were not retained.

- [Desktop choice, light](./evidence/ui-smoke-choice-desktop-light.png)
- [Phone choice, dark](./evidence/ui-smoke-choice-mobile-dark.png)
- [Actual incomplete-record review](./evidence/incomplete-record-review.png)

This qualifies Chromium with desktop/mobile viewport and touch emulation, not physical phones, Safari or every browser. The independent dice implementation is separate from the server; move replay uses the same pinned rules engine, not a second rules implementation. These results establish the listed acceptance scenarios, not competitive balance or future production readiness.

**No public laboratory deployment, DNS change, shared migration, release or admission opening was performed.** Public launch and any later retirement remain separate human decisions. Keep runtime/database isolation, export public records before retention expires, and follow the [operator handoff](./README.md#operator-handoff).

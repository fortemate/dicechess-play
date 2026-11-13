# Laboratory acceptance harness

This opt-in runner qualifies the built standalone laboratory client against a newly created laboratory API and disposable PostgreSQL databases. It never reuses or stops an existing service, and it does not add test or debug routes to either API. The regular `npm test` suite includes the local deterministic oracle test; the real-service/browser harness below is opt-in.

The harness creates one temporary PostgreSQL 18 container and two databases with separate login roles: one laboratory DB and one classic-API control DB. The classic control helps prove the laboratory traffic leaves ordinary tables unchanged. The runner owns and removes only the container it creates. It refuses to start when any required loopback port is occupied: external client preview `4175`, lab API proxy `8081`, classic control proxy `8082`, lab API process `18081`, classic control API process `18082`, and PostgreSQL `25433`. The proxies listen on `127.0.0.1` and forward to the two API processes; they let the harness drop lab WebSocket connections deterministically without restarting the API.

## Prerequisites

- Node.js 26, installed project dependencies, and Playwright's Chromium browser.
- Docker available through a local Unix-socket context in the environment running the harness, with permission to start `postgres:18-alpine`. Remote `DOCKER_HOST`/`DOCKER_CONTEXT` overrides are refused.
- A Linux-native `dicechess-play-api` universal stage built from the independent API `main` revision `e3254bb`, using SBT `2.0.12` and Java 25. The expected stage directory ends in `target/out/jvm/scala-3.10.0/dicechess-play-api/universal/stage`.
- On Windows, WSL using NAT networking, with that Linux stage and Java 25 available inside the selected distribution. Mirrored networking is refused. The default distribution is `Ubuntu`; `LAB_ACCEPTANCE_WSL_DISTRO` can select another installed distro.

The runner needs the stage and JDK paths in the Linux environment where the APIs run. Set `LAB_ACCEPTANCE_STAGE_DIR` to the API stage and `LAB_ACCEPTANCE_JAVA_HOME` to Java 25. On Windows, use Linux paths visible inside WSL. On Linux, use native Linux paths. `LAB_ACCEPTANCE_OUTPUT` is an optional output base; by default it is the ignored `test-results/laboratory-acceptance/` directory in this repository. Each invocation writes to a unique `run-<timestamp>/` subdirectory under that base.

Build the standalone client with its local lab API origin baked in, then run the opt-in harness. For example, in PowerShell:

```powershell
$env:VITE_LAB_API_URL = 'http://127.0.0.1:8081'
$env:LAB_ACCEPTANCE_STAGE_DIR = '<Linux path to the staged play-api>'
$env:LAB_ACCEPTANCE_JAVA_HOME = '<Linux path to Java 25>'
# Optional on Windows; defaults to Ubuntu.
$env:LAB_ACCEPTANCE_WSL_DISTRO = 'Ubuntu'
# Optional output base; each run creates a unique run-<timestamp> subdirectory.
$env:LAB_ACCEPTANCE_OUTPUT = '<output directory on the Node host>'
npm run build:laboratory
npm run test:laboratory:acceptance
```

For Linux, set the same variables to native paths; the WSL distro variable is not needed. `run.mjs` serves the already-built `dist-laboratory/` artifact, so rebuild after changing the API origin or client source. Its preview process also receives `VITE_LAB_API_URL=http://127.0.0.1:8081`.

Build the API stage from the API checkout with `sbt 'Universal/stage'` under the pinned SBT 2.0.12 and Java 25 toolchain. Pass the resulting Linux stage directory to the runner; a Windows stage cannot run inside the harness's Linux API process.

## Runner components

`environment.mjs` exports the external loopback origins `APP_ORIGIN` (`4175`), `API_ORIGIN` (`8081`), and `CLASSIC_ORIGIN` (`8082`), the bounded-poll helper `until`, and `AcceptanceEnvironment`. Its proxies forward to the API processes on `18081` (lab) and `18082` (classic); all four API proxy/process listeners and the client preview are checked before setup. `setup()` creates the uniquely named PostgreSQL container and its two databases/roles, starts both APIs and the built-client preview, then exposes `dropConnections()` to destroy the active lab proxy sockets independently of an API restart. `restart()` restarts only the harness's lab API; `cleanup()` stops only child processes, bridges, and the labeled container owned by that run.

`process.sh` is the Linux API process wrapper. Its command form is `process.sh <serve|stop|crash> <stage> <java-home> <state-dir> <api-port> <database-port> <client-origin> <laboratory|classic> [join-seconds] [admission-open]`. It validates the stage, JDK, mode, ports, and local client origin; uses a clean environment; and checks the staged executable path before stopping a PID recorded by that run. A graceful `stop` sends `TERM`, waits up to five seconds, then sends `KILL` only if the same owned staged process is still present. `crash` sends `KILL` directly. The harness entry point is `run.mjs`, invoked by `npm run test:laboratory:acceptance`.

## Commands

- `npm test` runs Vitest and then `npm run test:laboratory:oracle`.
- `npm run test:laboratory:oracle` runs the local deterministic dice and transcript oracle tests; it does not start services or require Docker.
- `npm run test:laboratory:acceptance` starts the disposable API/database processes, drives the real browser journey, writes evidence artifacts, and cleans up resources it created.
- `npm run test:laboratory` is the separate Playwright suite configured by `playwright.laboratory.config.ts`; it is not the disposable end-to-end acceptance runner.

## What the acceptance run checks

The fixture catalog is explicit in `fixtures.mjs`. For each fixture the runner creates a normal room first, reads its recovery snapshot, and searches client-seed candidates with the independent `oracle.mjs` until the committed offers match. It does not replace the room's server seed or commit. It then stops only its own lab API and updates the two DFEN fields in that room's pre-start snapshot (`dfen` and `lab.initialDfen`) in the disposable laboratory database. The guarded update requires that exact new room to remain active, version zero, not started, waiting for players, and have no generated offers. It restarts the lab API before joining the room through the ordinary public flow. This gives the server a valid recovery snapshot; no route accepts fixture positions or offers.

The current cases cover equal offers, unplayable versus playable offers, both offers unplayable, maximum legal dice consumption with rejected incomplete alternatives, castling, promotion, and king capture. Expected moves and resulting boards are checked against the API's public legal-move tree and replayed by the independent pinned rules engine. Each finished fixture's public transcript is independently checked for commitment, offers, and turn replay.

Other checks include:

- Legacy classic three-die behavior and refusal of a laboratory creation request at the classic API.
- Laboratory stage and seat rejection, stale-version behavior, exact command retry, command-ID conflict, and private receipt isolation.
- Timeout during pair selection and abort of a room whose second participant never joins.
- A two-browser UI journey for room creation, invitation-seat selection, rolling, pair choice, legal move submission, resignation, review, public transcript download, mutual rematch consent, responsive layouts, appearance, and reduced motion.
- Deterministic process restart at each in-flight stage: `AwaitingFirstRoll`, `AwaitingSecondRoll`, `AwaitingPairChoice`, and `PlayingSelectedPair`. It compares recovered public stage/offers/choice to the pre-restart state, checks that no gameplay command was sent automatically, and compares clocks to the last committed `remainingMs` snapshot within the harness tolerance.
- A restart while waiting for the invited seat, with clocks still stopped; a hard API crash after the first accepted roll, followed by reconnect and retry of the same command receipt.
- Lab-only WebSocket connection drops through the loopback proxy, separately from API restarts, followed by reconnect and recovery checks.
- No unexpected external browser requests, no ordinary lobby/auth/ingest calls from the lab client, no lab tables in the classic DB, no ordinary `play` tables in the lab DB, distinct DB-role isolation, and no lab game IDs in the classic listing.

The runner's API launcher uses `env -i` and supplies only the disposable runtime settings. The laboratory startup config requires `PLAY_RUNTIME_MODE=laboratory`, accepts `LAB_DB_*` settings, and rejects ordinary service settings such as `PLAY_DB_*`. The browser request audit allows only the local client and lab API origins. The test does not use auth URLs or production endpoints.

## Snapshot fixture and clock semantics

Fixture SQL is restricted to a row created by this run in its disposable lab database. The update preserves the original private seat credentials, server seed, room identity, and metadata; the independent seed search changes client seed inputs only through normal player join/seed messages. It edits no production/shared database and leaves offer generation to the server after both seats join.

On restart the server restores the last successfully committed snapshot. Time since that commit and process downtime are forgiven; graceful shutdown does not write an extra checkpoint. Sudden-death and Fischer clocks resume from the saved clock bank, while the lab per-move clock resumes from the saved active-seat remainder. The restart checks assert the last committed remainder, not elapsed wall-clock time since that commit.

## Network and isolation notes

The browser uses client `4175` and API proxy ports `8081` and `8082`, all bound to loopback. Those proxies forward to API process ports `18081` (lab) and `18082` (classic) on Linux loopback, or to WSL's IPv6 localhost from the Windows bridge. On Windows/WSL, the harness-owned IPv4 bridges listen only on Windows `127.0.0.1`; the API processes inside WSL bind `0.0.0.0` so the bridge can reach them. On native Linux, the lab binds `127.0.0.1`; the unchanged classic control binds `0.0.0.0`, so run it on an isolated host. Windows execution requires WSL NAT and refuses mirrored networking. Use a local firewall and an isolated host when running under WSL; do not expose those temporary listeners to a shared network. The client origin and API proxy origins remain local-only, and the browser audit fails if a page requests another origin.

## Artifact privacy

Artifacts are written under the unique `run-<timestamp>/` subdirectory of `LAB_ACCEPTANCE_OUTPUT` or the ignored default output base. They include scenario results, SHA-256 checksums, layout screenshots, selected public transcript exports, and a transcript summary. Terminal transcript exports intentionally include the public fairness reveal needed for independent verification. The runner keeps raw invitation/seat links, seat tokens, WebSocket frames, process IDs, process logs, and private operator paths out of evidence artifacts. The run may write transient API logs under its own temporary state directory; cleanup removes the processes, bridges, and container it created.

## Operator handoff

The pinned API [runtime runbook](https://github.com/fortemate/dicechess-play-api/blob/e3254bbc022b02a1635075f62c57d8ab6d410f54/contributor-docs/src/content/docs/laboratory-runtime.md) provides the local Compose launch, admission closure, public-transcript SQL export, restricted backup and volume-preserving retirement procedures. This acceptance harness runs staged API processes and its own disposable database instead of that Compose recipe.

This local harness does not select a production hostname, configure DNS, or launch a public service. Any later isolated launch or public admission decision is for the human operator. If an isolated deployment is authorized, keep its database and runtime separate, control admission with the actual `LAB_ADMISSION_OPEN` setting, avoid shared-database migrations, and have the operator decide any hostname or DNS changes. Keep the lab database and exported record under the configured retention policy (30 days by default); export completed records through the public UI/server transcript surface and verify them with the independent oracle before retention expires. Do not treat this local run as approval to open admission or as a deployed acceptance result.

See [`REPORT.md`](./REPORT.md) for the qualified revisions, final results and remaining limitations.

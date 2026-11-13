# Isolated pilot preparation report

**PASS — 27/27 scenarios, 2026-11-13 17:26:49–17:31:32 UTC.** The laboratory was served only on local loopback HTTPS ports. No public laboratory deployment, DNS change, public certificate provisioning, shared migration or participant admission occurred.

The [machine-readable evidence](evidence/results.json) records every scenario, immutable image identity, client artifact digest, migration identity, browser version and successful cleanup. [SHA256SUMS](evidence/SHA256SUMS) protects the retained evidence bytes.

## Qualified candidate

| Input                              | Value                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Client source                      | `897901ad0ae1723607c447b7e9fc780904e3a8ef`                                                      |
| Frontend build API origin          | `https://localhost:9443`                                                                        |
| Frontend origin                    | `https://localhost:8443`                                                                        |
| Client artifact SHA-256            | `e2c97b7c20fc78786aec10921851e1abd2339691e4f5aaabd622ed0b1f0b6b51`                              |
| API revision                       | `e3254bbc022b02a1635075f62c57d8ab6d410f54` (also verified against the image OCI revision label) |
| Rules                              | `0.18.2`                                                                                        |
| Variant / protocol / public record | `choice-2x2d6` revision 1 / protocol 1 / schema 1                                               |
| Dice algorithm                     | `choice-2x2d6-hmac-sha256-v1`                                                                   |
| PostgreSQL                         | `18.6`; `V1__laboratory_storage.sql`, Flyway checksum `-1267509805`                             |
| Test tools                         | Node `26.8.1`, Chromium `156.0.8078.4`, Docker Engine `29.9.2`, Compose `5.7.0`                 |
| Environment                        | Windows browser/runner, local Linux ARM64 Docker engine in WSL NAT                              |

The three exact image digests are retained in the evidence and [Compose profile](compose.yaml). The client artifact identity is SHA-256 over a UTF-8 byte-sorted recursive inventory of `sha256(file bytes)  relative/path\n`; file timestamps and absolute build paths are excluded. A build for another API origin has a different identity and requires another preflight.

## Checks performed

- Built the real standalone frontend and verified its module boundary against ordinary game, account and ingestion surfaces.
- Started the actual pinned API, PostgreSQL and Caddy with admission closed. Checked the rendered configuration before creating resources, and inspected running users, read-only filesystems, security options, port bindings and networks.
- Verified certificate/hostname validation with the disposable certificate explicitly trusted by Node. Requests without that trust failed. No system trust store was changed. The disposable Playwright contexts alone allowed the generated leaf certificate; this does not qualify a future public certificate.
- Checked exact CORS origin, refusal of an unapproved origin, ordinary-route 404s, least-privilege database access, SPA deep links, missing-asset 404s and privacy headers. API and database have no egress network. Only Caddy joins the standard ingress bridge; its outbound access is not blocked by Docker alone.
- Used two real browser contexts with the built frontend over HTTPS/WSS: invitation, assigned seats, both rolls, explicit pair choice, legal turn, resignation, review, export and mutual rematch. Checked light/dark appearance and 1440×900, 320×740, 390×844 and 844×390 layouts.
- Stopped/recreated the API at the waiting stage and all four active turn stages. Offers, selected pair, variant and committed clock recovery were preserved; reconnect sent no automatic gameplay command.
- Closed new-room admission while a waiting invitation existed: new room creation failed, and the invited player still joined the existing room. Closure preserves issued capabilities; it is not capability revocation. Stopping the gateway/API is the way to stop all existing access.
- Independently verified the completed public transcript. Reviewed an incomplete missing-participant record without a fairness-pass claim. Seat WebSocket URLs stayed query/fragment-free; a legacy token-query attempt was rejected. All stored seat capabilities were absent from container logs and public exports.
- Made a restricted `pg_dump` backup and restored it into a new disposable database. Compared room counts and all public transcript payloads. The dump and private snapshots were not retained as public evidence.
- Closed admission, exported unexpired records, ran `compose down` without deleting the volume, then restarted. Room counts and byte-identical exports survived. Final cleanup removed only the runner's project, volume and private temporary credentials; no `lab229-*` containers, networks or volumes remained.

## Other validation

Local gates passed: ESLint (existing warnings only), Prettier, Svelte/TypeScript checks, main and laboratory builds, bundled-engine verification, 1,583 Vitest tests, 15 existing acceptance/oracle tests, 16 pilot launcher/guard/cleanup/artifact/evidence tests and 6 built-main Playwright smoke tests. The new unit tests run in ordinary `npm test` without Docker. The real-service rehearsal is opt-in through `npm run test:laboratory:pilot`. Native command launches force `shell: false`; regression coverage preserves arguments containing spaces, quotes and shell metacharacters, even when a caller supplies `shell: true`.

The isolated run also caught and corrected CRLF shell entrypoint handling, the pinned image's BusyBox healthcheck syntax, and Docker's refusal to publish ports from an internal-only gateway network. Linux entrypoints now have enforced LF endings; only the gateway has an ingress bridge.

## Remaining owner gate

The follow-up launcher hardening keeps shell programs in checked-in scripts, supplies paths as separate arguments and forces `shell: false`. Qualification now also requires an unchanged clean checkout and executes the operator's `export.sql` file directly.

This validates the local candidate and preparation package. The [plan](PLAN.md) proposes a seven-day pilot for 2–6 invited active players, subject to owner selection. Hosting, exact live origins, ingress, certificate process, cohort, operator window and restricted-backup retention remain pending. The [operator procedure](README.md) includes closed startup, export, restore, compatible rollback and retirement.

A future host/ingress, freshly built live-origin frontend and physical phone/desktop smoke check require the separate owner go decision recorded in [#229](https://github.com/fortemate/dicechess-play/issues/229). This PR does not close that issue or reopen completed epic #221. The [#225 acceptance report](../../scripts/laboratory-acceptance/REPORT.md) remains the broader rules/protocol acceptance evidence; this report qualifies the additional pilot configuration.

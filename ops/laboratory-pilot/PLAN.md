# Laboratory pilot plan

## Purpose and status

Prepare a short, isolated, unrated two-player pilot with a dedicated PostgreSQL database. The service has no bots, ratings, game ingestion, or shared production data. This work prepares configuration, isolated validation, and an operator procedure. It does not deploy a public service or authorize opening admission.

The following is a concrete proposal for owner review, not an approved commitment:

- Cohort: 2–6 invited active players who agree to provide manual feedback.
- Duration: 7 days.
- Operator: `rabestro`, subject to owner confirmation.
- Admission: closed except for the exact owner-approved window.
- Room retention: 30 days by configured default; this does not define the operator's backup or deletion schedule.

## Hosting options

The owner must select and revalidate one arrangement before any live access. The two arrangements have different ingress, TLS, and browser-origin requirements.

| Option                       | Shape                                                                                                                                                                               | Advantages                                                                                       | Required checks and changes                                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Dedicated host            | Frontend, Caddy gateway, API, and PostgreSQL run in one isolated Compose project on a dedicated host. An owner-selected ingress provides the chosen TLS access path to the gateway. | One isolated application/database unit; frontend and API can share a controlled gateway.         | Current Compose publishes gateway ports only on loopback, so the ingress must be deliberately connected to it. Verify the exact frontend/API origins, TLS termination and certificates, CORS, firewall exposure, and device reachability.                                                |
| B. Separate frontend and API | Static frontend is hosted separately; API gateway, API, and PostgreSQL remain in a dedicated isolated project.                                                                      | Frontend artifact can use an owner-selected static host while the API/data plane stays separate. | Revalidate the remote API origin, CORS allowlist, both TLS endpoints and certificate names, ingress/firewall rules, frontend build setting, browser connectivity, and separation from production. The current single-host Compose profile does not configure this arrangement by itself. |

## Owner decisions required

| Decision                                                         | Proposed value                                                                                 | Owner selection/status |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------- |
| Hosting option                                                   | A or B above                                                                                   | Pending                |
| Exact host(s), ingress, and network path                         | Owner-selected                                                                                 | Pending                |
| Frontend and API HTTPS origins                                   | Exact origins for the selected option                                                          | Pending                |
| TLS certificate source, hostname coverage, and test-client trust | Certificate SANs cover both selected hostnames; local self-signed trust stays on pilot clients | Pending                |
| Cohort                                                           | 2–6 invited active players, manual feedback                                                    | Pending                |
| Duration                                                         | 7 days                                                                                         | Pending                |
| Operator                                                         | `rabestro`                                                                                     | Pending                |
| Admission window and on-call coverage                            | Exact start/end and operator contact window                                                    | Pending                |
| Restricted backup retention                                      | Access list, protected location, retention period, and deletion date                           | Pending                |

## Deployment shape and compatibility

The Compose profile pins the API, PostgreSQL, and Caddy images by digest in `compose.yaml`. It uses three networks: a standard bridge ingress network attached only to the gateway for host-local port publication; an internal edge network shared by the gateway and API; and an internal database network shared by the API and PostgreSQL. The API and PostgreSQL have no egress network. The gateway's standard bridge attachment can provide outbound access, so Docker networking alone does not enforce a gateway egress block; the owner must review the target host or ingress egress policy. This follows Docker's [multi-network frontend/backend pattern](https://docs.docker.com/engine/network/). PostgreSQL is not published to the host. The gateway is the only service with published ports, currently bound to loopback. Services use non-root identities, read-only root filesystems, dropped capabilities, no-new-privileges, and temporary filesystems where required.

Build the laboratory frontend outside Compose with `VITE_LAB_API_URL` set to the exact selected API origin, then mount the artifact read-only. The private operator env file contains public settings and secret-file paths only. Password values and the TLS private key remain in separately protected files. Ensure the mounted files are readable by their configured container users and keep their parent directory private. Password files are single-line values without trailing newlines. The app database role is limited to the laboratory database. Admission defaults closed.

Record the following compatibility set for every candidate or actual run:

| Component              | Required identity                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Play client base       | Revision `897901ad0ae1723607c447b7e9fc780904e3a8ef` plus the built artifact digest recorded by the runner |
| API                    | Revision `e3254bbc022b02a1635075f62c57d8ab6d410f54`; image digest pinned in `compose.yaml`                |
| PostgreSQL and gateway | Image digests pinned in `compose.yaml`                                                                    |
| Rules                  | `0.18.2`                                                                                                  |
| Public-record schema   | Version `1`                                                                                               |
| Protocol               | Version `1`                                                                                               |
| Dice algorithm         | `choice-2x2d6-hmac-sha256-v1`                                                                             |

Record actual build inputs, artifact digest, run result, and evidence in [`ops/laboratory-pilot/REPORT.md`](REPORT.md) after the runner completes. The [earlier #225 acceptance record](../../scripts/laboratory-acceptance/REPORT.md) is historical and does not establish this pilot's result. Do not report a candidate as validated before the new evidence exists.

## Stages and gates

1. **Owner selections.** Resolve every pending row above, including the exact origins, target, admission window, and restricted backup retention. Prepare the certificate and private secret files.
2. **Closed local validation.** Build the frontend, render the Compose configuration, and start a unique project with admission closed and `--wait`. Confirm container health before making any health claim. Check TLS, exact frontend/API origins, laboratory rules, room behavior, production-origin isolation, ordinary routes, and authentication URL behavior. Run `npm run test:laboratory:pilot`; retain its actual output and evidence. The runner cleans only its own unique disposable resources.
3. **Behavior and recovery review.** Exercise API behavior with admission closed: new friend-room and rematch creation must be stopped, while an existing invitation remains joinable until its join window or room retention expires; existing-room reconnect, gameplay, and export remain available. Rehearse an existing-invitation join after closure. If all access must stop, stop the gateway/API while preserving the volume; capability revocation is not implemented. Review backup/restore access, retention and deletion dates, plus the compatibility set.
4. **Owner go decision.** The owner explicitly approves the chosen hosting arrangement, target/origins, cohort, duration, admission window, operator coverage, and backup retention. Until this approval, leave `LAB_ADMISSION_OPEN=false`.
5. **Operate.** Open admission only for the approved window and cohort. Monitor room creation, joins, active games, storage, and operator health. Close admission at the agreed end time and confirm the verified behavior.
6. **Close and review.** Export unexpired terminal transcripts for routine review using the API-compatible public-record schema-1 export query. Restrict database backups because they may contain capabilities and active-game seeds. Record the deletion date and complete deletion after approved retention.

## Data, recovery, and rollback

Changing rules, protocol, dice derivation or recovery semantics requires appropriate requalification. Never rewrite stored variant or provenance fields to make an incompatible artifact appear compatible. Record the actual Flyway migration version/checksum separately from the public-record schema version.

Room retention defaults to 30 days, but expiration is not an operator backup or deletion plan. Export terminal transcripts before their records expire. Keep transcript exports in a private file with restrictive permissions; each JSON Lines record is an API-compatible wrapper containing `exportSchemaVersion: 1`, `gameId`, and `transcript`. This is the public-record schema version and does not assert the Flyway database schema version. Never use transcript export to disclose capabilities or active-game seeds. Store custom-format PostgreSQL dumps as restricted backups with the agreed access control, encryption, retention, and deletion date. Never restore a pilot dump into a shared database; restore into a new dedicated volume with matching credentials and verify compatibility first.

On restart, the API restores clock banks automatically from its persisted snapshot. Do not edit game records or create a manual checkpoint. Downtime and elapsed time not committed before shutdown are forgiven.

Record frontend artifact digest, API image digest and revision, PostgreSQL image digest, database schema revision, public-record schema version, rules, protocol, and dice algorithm as one compatible set. Roll back only to an artifact set known to support that database schema. Do not downgrade PostgreSQL in place. If application rollback cannot preserve compatibility, stop the pilot and restore an approved backup into a new dedicated volume. Routine `compose down` preserves the project volume; deletion requires the owner to confirm retention and backup obligations are complete.

## Acceptance still required

No public deployment or participant admission is authorized by this plan. Acceptance still requires the owner's hosting and origin decisions, verified closure of new friend-room and rematch creation, the rehearsal of joining an existing invitation after closure, a reviewed backup and recovery procedure, completed isolated-run evidence, and explicit approval to open the pilot. A physical phone-and-desktop check follows that go decision; Chromium device emulation does not count as physical-device acceptance.

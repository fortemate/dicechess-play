# Laboratory pilot operations

This directory prepares an isolated, owner-operated pilot for the unrated two-player laboratory. It does not publish the service or authorize opening admission. The pilot uses a separate PostgreSQL database and has no bots, ratings, game ingestion, or shared production data.

## Proposed pilot for owner review

The working proposal is 2–6 invited active players, for 7 days, with `rabestro` as the operator. These are proposals, not approved choices. Record the owner's decision before preparing a live pilot.

| Decision                    | Current proposal or state                                                 | Owner decision |
| --------------------------- | ------------------------------------------------------------------------- | -------------- |
| Participants                | 2–6 invited active players                                                | Pending        |
| Duration                    | 7 days                                                                    | Pending        |
| Operator                    | `rabestro`                                                                | Pending        |
| Host and ingress            | Choose one of the options in [the plan](PLAN.md)                          | Pending        |
| Frontend and API origins    | Exact HTTPS origins                                                       | Pending        |
| Certificate and trust       | Certificate covering both selected hostnames; trust only on pilot clients | Pending        |
| Admission window            | Exact start and end, with an operator present                             | Pending        |
| Restricted backup retention | Set an explicit period and deletion date                                  | Pending        |

## Prepare locally

From the client repository root, build the laboratory frontend with the API origin that the selected pilot arrangement will serve. Keep the build output outside version control; point `LAB_FRONTEND_DIR` in the private operator env file to that absolute path.

```sh
npm ci
VITE_LAB_API_URL=https://localhost:9443 npm run build:laboratory
```

Create the private operator env file by copying [`operator.env.example`](operator.env.example) to a path outside the repository. Set `pilot_env` to that absolute path and set `LAB_FRONTEND_DIR`, origins, ports, and secret-file paths there. The env file contains public configuration and file paths only. Never put password values, a TLS private key, or other secret values in it, command arguments, or this repository.

Keep the secret files in a private host directory with mode `0700`. Set file permissions to the least permissive values that still let the configured container users read them (uid `10001` for the gateway and API, uid `70` for PostgreSQL). Password files must contain one line without a trailing newline. The TLS certificate's Subject Alternative Names must cover both the exact frontend and API hostnames. A locally generated self-signed certificate may be trusted only by the pilot test clients, never system-wide.

The current Compose profile binds both gateway ports to `127.0.0.1` on its host. Choose an access path before testing from another device. Any ingress or origin change needs a fresh review of TLS, browser API access, and exposure.

## Start and check the closed pilot

Use a unique Compose project name. The following commands run from the client repository root; replace the private env-file path and keep the same project name for the pilot lifecycle.

```sh
pilot_env=/absolute/private/path/operator.env
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$pilot_env" --project-name lab-pilot config --quiet
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$pilot_env" --project-name lab-pilot up -d --wait --wait-timeout 180
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$pilot_env" --project-name lab-pilot ps
```

The config and `--wait` commands must succeed before reporting service health. Then check the exact frontend and API origins in a browser and the TLS endpoints with the pilot certificate. Confirm laboratory rules and room behavior, verify that production origins and ordinary public routes are not part of this pilot, and record the authentication URL behavior. Do not open admission until these checks and the actual admission-close behavior have been reviewed. `LAB_ADMISSION_OPEN=false` prevents new friend-room and rematch creation. It does not revoke existing invitation capabilities: those links can still be used to join until their join window or room retention expires, and existing-room reconnect, gameplay, and export remain available. Rehearse joining through an existing invitation after closure before the pilot.

The Compose project uses three networks: a standard bridge ingress network for the gateway's host-local port publication, an internal edge network shared by the gateway and API, and an internal database network shared by the API and PostgreSQL. The API and PostgreSQL have no egress network. The gateway is also attached to the standard bridge, so Docker networking alone does not block its outbound access; review and enforce any egress policy at the selected host or ingress. This follows Docker's [multi-network frontend/backend pattern](https://docs.docker.com/engine/network/). PostgreSQL is not published to the host. The gateway binds its published ports to loopback. PostgreSQL data lives in a project-scoped named volume. All services use pinned images, non-root users, read-only root filesystems, dropped capabilities, and no-new-privileges.

## Open and close admission

Opening is an owner-only action after a separate explicit go decision. Once approved, set `LAB_ADMISSION_OPEN=true` in the private operator env file and recreate the API service:

```sh
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$pilot_env" --project-name lab-pilot up -d --force-recreate api --wait --wait-timeout 180
```

Verify approved participants can create and join rooms. At the end of the approved window, set `LAB_ADMISSION_OPEN=false` and recreate the API service. This stops new friend-room and rematch creation, while existing invitations remain usable through their join window or room retention and active rooms remain available for reconnect, gameplay, and export. If all existing access must stop, stop the gateway/API while preserving the database volume; capability revocation is not implemented.

## Export and backup

The configured room retention defaults to 30 days. This is an application retention setting, not an operator backup or deletion schedule. Agree on a restricted backup location, access list, encryption, retention period, and deletion date before admission opens. Export terminal transcripts before their room data expires. The reviewed [schema-1 export query](export.sql) emits one JSON Lines record per unexpired game, with `exportSchemaVersion`, `gameId`, and `transcript`, matching the API export shape. It does not include room capabilities or active-game seeds.

Write routine exports to a private file without printing transcript rows in the terminal. Set `private_backup_dir` to the owner-approved restricted directory:

```sh
umask 077
private_backup_dir=/absolute/private/restricted/path
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$pilot_env" --project-name lab-pilot exec -T db psql -X -v ON_ERROR_STOP=1 -At -U postgres -d laboratory < ops/laboratory-pilot/export.sql > "$private_backup_dir/laboratory-transcripts.jsonl"
```

Database backups may contain room capabilities and active-game seeds and are restricted data. To make a restricted custom-format backup without passing a password in an argument:

```sh
umask 077
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$pilot_env" --project-name lab-pilot exec -T db pg_dump -U postgres -d laboratory --format=custom > "$private_backup_dir/laboratory.dump"
```

Never restore a pilot dump into a shared database. Prepare a new project and empty dedicated volume with its own secret files. Start only `db`, restore the dump into the empty `laboratory` database, and start the pinned API/gateway with admission closed after restore succeeds. Keep backup access and deletion auditable. The following `restore_env` and project must identify that new restore target, never the running source:

```sh
restore_env=/absolute/private/path/restore-operator.env
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$restore_env" --project-name lab-pilot-restore up -d --wait db
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$restore_env" --project-name lab-pilot-restore exec -T db pg_restore --exit-on-error -U postgres -d laboratory < "$private_backup_dir/laboratory.dump"
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$restore_env" --project-name lab-pilot-restore up -d --wait
```

Use different free loopback ports if the original project still exists, and rebuild the client for the restored API origin. Confirm migration checksums, health/rules versions, public exports and a controlled reconnect before switching any approved ingress. The local rehearsal validates restore into a new database and recovery from the preserved original volume; a restore onto the selected live host still needs its own closed-admission preflight.

## Restart, rollback, and retirement

On restart, the API restores clock banks automatically from its persisted snapshot. Do not edit game records or write a manual checkpoint. Downtime and elapsed time that was not committed before shutdown are forgiven.

Record the frontend artifact identity, API image digest, PostgreSQL image digest, rules version, protocol version, public-record schema version, and dice algorithm together. Roll back only to a compatible set. Do not downgrade PostgreSQL in place. If an application rollback cannot support the existing database schema, stop the pilot and use the approved backup procedure in a new dedicated volume.

Stop the services while preserving the data volume:

```sh
docker compose --file ops/laboratory-pilot/compose.yaml --env-file "$pilot_env" --project-name lab-pilot down
```

Do not use `down --volumes` for routine shutdown. Permanent deletion is a separate owner decision after the retention period and backup obligations are complete. The validation runner creates a unique disposable project and removes only the resources belonging to that project.

## Validation

Run the isolated harness from the client repository root:

Use a clean, committed checkout with Node 26, installed npm dependencies, Playwright Chromium (`npx playwright install chromium`), OpenSSL and a local Docker Engine/Compose. On Windows the runner uses WSL's local Unix socket and requires NAT networking; the default distribution is `Ubuntu` (`LAB_PILOT_WSL_DISTRO` can select another). Remote Docker contexts are refused. The runner checks that the checkout remains clean at the same revision throughout qualification, and executes the reviewed `export.sql` directly.

```sh
npm run test:laboratory:pilot
```

It creates disposable credentials outside version control, builds the laboratory client, exercises its own Compose resources, and cleans up only those resources. Review the actual generated result and evidence in [`ops/laboratory-pilot/REPORT.md`](REPORT.md); this documentation does not claim a pass. The [earlier #225 acceptance record](../../scripts/laboratory-acceptance/REPORT.md) is historical evidence, not this pilot's run result. A harness pass is not a public deployment or approval to admit participants.

The related work is tracked by #229, epic #221, follow-up #225, and API issue #293. A physical phone-and-desktop check remains a later acceptance step after explicit owner authorization; Chromium device emulation does not count as physical-device acceptance.

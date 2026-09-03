# Showcase Acceptance Verification Matrix & Cross-Repository Evidence

**Date / Timestamp**: `2026-09-03T10:52:31.570Z`  
**Target Issue**: [dicechess-play#62](https://github.com/fortemate/dicechess-play/issues/62)  
**Revisions Under Test**:

- `dicechess-play`: `101366d7390b219b907623d2846d9fb2330d892d` (Branch: `task/62-showcase-acceptance-matrix`)
- `dicechess-play-api`: `ad494c8ab62a86336281561ee0212f07698c7b9a` (Branch: `task/62-webhook-loopback-test-support`)

---

## 1. Executive Summary & Verification Matrix

All acceptance criteria, cross-repository concurrency invariants, fail-closed recovery policies, cryptographic HMAC signatures, and responsive layout constraints were verified against an isolated `postgres:18-alpine` instance and deterministic HMAC loopback fixture.

| Subsystem / Invariant                         |  Status  | Evidence Reference                                                              |
| :-------------------------------------------- | :------: | :------------------------------------------------------------------------------ |
| **Initial View & 5+3 Blitz Control**          | **PASS** | Section 2.1 — `GET /showcase` authoritative read model                          |
| **Atomic Contention & Mutual Exclusion**      | **PASS** | Section 2.2 — 4 concurrent claims yielded 1 player & 3 spectators               |
| **Idempotency Replay & Conflict Rejection**   | **PASS** | Section 2.3 — Replay returns exact token; mutated body returns 409              |
| **Global Capacity & No-Borrowing**            | **PASS** | Section 2.4 — 1 showcase + 2 general = 3 total; 3rd general rejected with 409   |
| **Clean Reopening & Color Alternation**       | **PASS** | Section 2.5 — Game resignation triggers finishing -> open with alternated color |
| **Database Durability & `origin` Provenance** | **PASS** | Section 3.1 — PostgreSQL `play.games` & `play.game_archive` assertions          |
| **Cryptographic Webhook HMAC Signatures**     | **PASS** | Section 3.2 — Validated HMAC-SHA256 signatures and timestamp headers            |
| **Bot Failure & Reopening Recovery**          | **PASS** | Section 2.6 — Unavailable bot reflects 503; healthy recovery restores open      |
| **Sporting Score Exclusion**                  | **PASS** | Section 3.3 — Technical aborts archived with `sporting_eligible = false`        |
| **Fail-Closed on Database Interruption**      | **PASS** | Section 2.7 — Stopped Postgres fails closed; API reboot resumes live game       |
| **Multi-Browser Seating & Contention**        | **PASS** | Section 4.1 — Playwright dual-context race test                                 |
| **Late Visitor Convergence**                  | **PASS** | Section 4.2 — 3rd browser context automatically converges to spectator          |
| **Responsive Layout & Zero-CLS**              | **PASS** | Section 4.3 — Desktop (1280×800) & Mobile (375×667) geometry assertions         |
| **Move History Controls Suppression**         | **PASS** | Section 4.4 — Zero history navigation buttons rendered on showcase              |
| **Regressions on Other Surfaces**             | **PASS** | Section 4.5 — `/play`, `/lobby`, `/licenses` smoke assertions                   |

---

## 2. API Acceptance Suite Execution

### 2.1 Matrix Results

- **Initial Showcase View & Fixed 5+3 Time Control**: `PASSED` (6ms)
- **Simultaneous Claims (1 Winner, 3 Spectators, No Duplicates)**: `PASSED` (140ms)
- **Idempotency Replay (Identical Key and Payload)**: `PASSED` (29ms)
- **Idempotency Conflict (Same Key, Different Payload)**: `PASSED` (12ms)
- **Capacity Check: 1 Showcase + 2 General = 3 Max; 3rd General Rejected**: `PASSED` (121ms)
- **Resign Showcase Game & Observe Reopen and Color Alternation**: `PASSED` (1383ms)
- **PostgreSQL Durability & Origin Assertions**: `PASSED` (613ms)
- **Deterministic Webhook HMAC Signatures & Hunter Compatibility**: `PASSED` (1ms)
- **Bot Unavailability Detection and Recovery**: `PASSED` (13463ms)
- **Sporting Score Exclusion for Aborted / Failed Games**: `PASSED` (598ms)
- **Fail-Closed Behavior on Database Interruption**: `PASSED` (11427ms)

---

## 3. Database Durability & Cryptographic Audit

### 3.1 Showcase Table State (`play.showcase_table`)

```json
{
	"id": 1,
	"next_human_color": "white",
	"current_game_id": null,
	"updated_at": "2026-09-03T10:52:04.466361+00:00"
}
```

### 3.2 Showcase Games Durability Sample (`play.games`)

- **Total Showcase Games in DB**: `4`
- All games have `origin = 'showcase'` and `rated = false`.

### 3.3 Archive & Sporting Eligibility (`play.game_archive`)

- **Archived Showcase Records**: `5`
- Normally concluded games carry `origin = 'showcase'` and `sporting_eligible = true`.
- Technically aborted games carry `origin = 'showcase'` and `sporting_eligible = false`.

### 3.4 Webhook HMAC Cryptographic Validation

- **Total Webhook Deliveries Recorded**: `18`
- **Invalid HMAC Signatures**: `0`
- **Sample Verified Delivery**:

```json
{
	"path": "/webhook",
	"headers": {
		"x-dicechess-signature": "fb704e507a88c0fe282866ebd4a4f771f296642e2c0f0007192f4ca82b2e8db0",
		"x-dicechess-timestamp": "1788432696"
	},
	"signatureValid": true,
	"bodySummary": "{\"type\":\"verification\",\"nonce\":\"2193b21d516b693a9cd135828244c0c5\"}..."
}
```

---

## 4. Browser & Responsive Layout Verification

### 4.1 Playwright E2E Results

- **Browser Acceptance Suite**: `PASSED (Desktop & Mobile)`

### 4.2 Geometry & Zero-CLS Metrics

- Board dimensions (`cg-board`) maintained square aspect ratio (1:1) across `open`, `live-player`, `live-spectator`, and `finishing` states.
- No layout shift was detected during transitions between states.
- Move history navigation buttons (`[data-testid="move-history"]`) were confirmed absent on `[data-surface="showcase"]`.

### 4.3 Evidence Screenshots

The following screenshots were captured during live browser execution:

- Desktop Open: `docs/acceptance/evidence/showcase-desktop-open.png`
- Desktop Live Player: `docs/acceptance/evidence/showcase-desktop-live-player.png`
- Desktop Live Spectator: `docs/acceptance/evidence/showcase-desktop-live-spectator.png`
- Desktop Finishing: `docs/acceptance/evidence/showcase-desktop-finishing.png`
- Mobile Open: `docs/acceptance/evidence/showcase-mobile-open.png`
- Mobile Live Player: `docs/acceptance/evidence/showcase-mobile-live-player.png`
- Mobile Live Spectator: `docs/acceptance/evidence/showcase-mobile-live-spectator.png`
- Mobile Finishing: `docs/acceptance/evidence/showcase-mobile-finishing.png`

---

## 5. Security & Safety Compliance

- **No production services or real Raspberry Pi hardware accessed**: All runs targeted local Docker container `dicechess-acceptance-postgres` and local mock `WebhookFixture` on loopback port `8089`.
- **Loopback isolation**: Loopback was only permitted due to explicit `WEBHOOK_ALLOW_LOOPBACK=true` environment flag on the test API instance. Production builds without this variable strictly refuse private IP addresses and loopback.
- **Fail-Closed Guard**: Confirmed that loss of database connectivity fails closed immediately with 503 or refused connection rather than leaking unreserved seats.

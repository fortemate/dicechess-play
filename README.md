# dicechess-play

The public **Dice Chess play site** ([fortemate.com](https://fortemate.com)) — anonymous, no
sign-up, and signing in is optional: it only adds a Glicko-2 rating shared with the bots, a place
on the leaderboard, and history that follows you across devices. Two ways to play:

- **`/practice` — against our bots**, fully in the browser: the Scala.js engine runs client-side in
  a Web Worker, so a game needs no server at all. Finished games are recorded to
  `dicechess-analytics` as the `playsite` source.
- **`/lobby` + `/live/[id]` — against another human**, served by the sibling `dicechess-play-api`.
  That server is authoritative: it owns the dice (provably fair), the clocks, and move legality;
  this client only applies versioned events and rolls back optimistic moves.

Around them: the game hub (`/play` — every way to start a game, also rendered on the landing
page), a bot catalog (`/bots`), the rating ladder (`/leaderboard`), local + server game
history with replays (`/games`, `/replay/[id]`), and a profile (`/me`) — guest by default, with an
optional account for a rating.

> Public repo, AGPL-3.0 — external contributors sign the CLA (`CLA.md`). Decisions and roadmap
> live in the private `dicechess-docs` wiki under **Play Site**; ADRs are referenced by number
> (ADR-0002 client authority, ADR-0007 server authority, ADR-0014 bot catalog).

## Stack

SvelteKit 2 · Svelte 5 (runes) · Tailwind 4 · `adapter-static` (SPA, `ssr=false`) · PWA
(`@vite-pwa/sveltekit`). Game rules come from one place — the `@fortemate/dicechess-engine`
(Scala.js) artifact, pinned in `package.json`. Theme system (7 themes) is shared with
`dicechess-analytics-ui`.

## Getting started

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # PAT with read:packages — see Configuration
mise run setup                            # npm install
mise run hook:install                     # register the lefthook Git hooks (once per clone)
mise run dev                              # vite dev → http://localhost:5173
mise run check                            # eslint + prettier --check + svelte-check
mise run test                             # vitest run
mise run compile                          # vite build → dist/
```

Only the `@fortemate` scope resolves from GitHub Packages (see `.npmrc`), and that needs
`NODE_AUTH_TOKEN` even though the packages are public — everything else, chessground included,
comes from the public npm registry. Failure signature: `npm install` dies with `401 Unauthorized`
on `@fortemate/dicechess-engine`.

Run `npm ci` right after every `git pull`: a stale `node_modules` makes local Prettier disagree
with CI and produce phantom formatting drift.

To work on live play, run `dicechess-play-api` locally and point `VITE_PLAY_API_URL` at it in
`.env.local`.

## Configuration

| Variable                  | When            | Effect                                                                                                       |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `NODE_AUTH_TOKEN`         | install         | GitHub PAT with `read:packages`, for the `@fortemate` scope                                                  |
| `VITE_PLAY_API_URL`       | build (client)  | Base URL of play-api. Empty = the `/live` routes are disabled AND recording is off (games stay in IndexedDB) |
| `VITE_SENTRY_DSN`         | build (client)  | Sentry DSN for the `dicechess-play` project. Empty = the SDK is disabled and adds nothing to the bundle      |
| `VITE_SENTRY_ENVIRONMENT` | build (client)  | Sentry environment tag: `production` on `main`, `preview` on a PR deployment                                 |
| `SENTRY_AUTH_TOKEN`       | build (CI only) | Uploads source maps so stack traces are readable. Absent = the build skips the upload and ships no maps      |

`VITE_*` values are **baked into the bundle at build time** — the site is Direct-Uploaded to
Cloudflare Pages, so Pages dashboard variables never reach `vite build`. Changing one means
a rebuild and redeploy; in CI they come from repo variables.

## Layout

```text
src/
├── routes/                    SPA pages (ssr/prerender disabled in +layout.ts)
│   ├── +layout.svelte         themed shell: nav, theme switcher, toasts, zen chrome
│   ├── +page.svelte           landing — marketing hero over the game hub
│   ├── rules/                 prerendered rules page (#254) — the only route with ssr/prerender
│   │                          re-enabled, so crawlers get real HTML + OG tags
│   │                          (src/hooks.server.ts strips app.html's default-head block there)
│   ├── play/                  game hub: every way to start a game (#217)
│   ├── practice/              vs-bot game (client-authoritative; engine in a Web Worker)
│   ├── lobby/                 seek list + live-board wall (polls play-api)
│   ├── live/ · live/[id]/     friend-link entry · server-authoritative live board (WebSocket)
│   ├── games/ · games/[id]/   game history (local + play-api's own lobby/live games), filters +
│   │                          head-to-head view (#151), "Show more" pagination (#150) · replay
│   ├── replay/[id]/           public replay for a server-recorded game (play-api GET
│   │                          /games/{id}/history, #163) — engine-walked per-turn positions,
│   │                          board-flip toggle, provably-fair commit/seed section
│   ├── leaderboard/           bot rating ladder (play-api GET /leaderboard)
│   ├── bots/                  human-play bot catalog (play-api GET /lobby/bots, ADR-0014)
│   │   └── [team]/[name]/     bot profile — rating, ladder W-D-L, recent games (#152 Tier 1;
│   │                          Tier 2/3 — human record, head-to-head vs models, rating history —
│   │                          are a separate, not-yet-agreed design)
│   └── me/                    guest profile + restore code; W-D-L on this device + in the lobby
│       ├── bots/              signed-in author's owned-bot surface: claim with one-time Bearer
│       │                      token, ladder/catalog/capacity, rotate token, release (#242)
│       └── admin/bots/        administrator-only full registry: ladder/catalog/description and
│                              one-time token recovery; ownership is display-only (#243)
├── components/                shared UI
│   ├── Board.svelte           thin chessground wrapper driven by either game store
│   ├── GameHub                the ways-to-start-a-game cards shared by the landing and /play
│   ├── lib/Chessground.svelte
│   ├── PlayerStrip · DicePanel · MoveHistory · GameEndModal · BotBadge · PawnPromotionSelector
│   ├── GameHistoryCard · LiveGameHistoryCard · BotProfileGameCard · WdlBar · WdlCounts
│   │                     WdlSummaryCard · MiniBoard · TimeControlPicker · ThemeMenu
│   │                     ToastContainer
│   ├── CategoryRatings        one rating per speed (bullet/blitz/rapid, #258) — shared by both
│   │                          public profiles; an unplayed speed renders as an explicit dash
│   ├── AuthMenu               header identity slot — Sign in / nickname badge; renders nothing
│   │                          while loading or when play-api is unreachable (anonymous-first)
│   ├── GamesFilterBar         /games's source/result pills + opponent search+chip (#151)
│   ├── BotCatalogCard · BotTimeControlPicker · BotChallengePanel — the /bots page's card
│   │                          (click → wake → config → start)
│   ├── BotRematchButton       one-click rematch of the bot game that just finished, on the live
│   │                          board's end-of-game surfaces (same wake → start handshake, #215)
│   └── RatingDeltaLine        a finished rated game's rating change on both end-of-game surfaces —
│                              says "updating…" while play-api's batch has not applied it yet
├── lib/
│   ├── auth/                  authApi — play-api /auth/* client (ADR-0017): session is an HttpOnly
│   │                          cookie, so the SPA holds no token; login is a full-page navigation
│   ├── authStore.svelte.ts    identity: guest by default, account once signed in (status/nickname/
│   │                          externalId; `user:<uuid>` signed in, `guest:<uuid>` otherwise)
│   ├── playWithBot/           bot-play core: store, engine worker, dice/history, opening book
│   ├── rules/                 seo.ts — shared origins for the prerendered rules page's absolute
│   │                          canonical/OG URLs (#254); sitemap.xml/app.html hardcode the same
│   ├── live/                  live-play client: liveGameStore, liveClient (WS + reconnect),
│   │                          liveApi/lobbyApi/historyApi/ratingApi (REST), ratingDelta (a finished
│   │                          game's own rating change: poll state, and rounding for display),
│   │                          liveTypes (play-api wire mirror),
│   │                          turnReplay (engine-driven per-turn walk, shared by liveGameStore and
│   │                          reconstructServerHistory, #163),
│   │                          dfen/board/clock/seat/timeControl/playerLabel helpers;
│   │                          ratingCategory (hand-mirror of play-api's RatingCategory rule:
│   │                          bullet/blitz/rapid from estimated duration, #258),
│   │                          replayLink — when a finished game has an archived replay and the
│   │                          shareable (token-free) URL for it (#216)
│   ├── leaderboard/           leaderboardApi — rating-ladder + bot-profile read client (play-api
│   │                          wire mirror; GET /bots/{team}/{name}, #152)
│   ├── catalog/               catalogApi — bot-catalog read/wake/play-bot client (play-api wire mirror);
│   │                          botChallenge — starting a game + how a failure reads, shared by the
│   │                          challenge panel and the rematch button; lastBotGame — the setup of the
│   │                          bot game this browser started, so a finished board can replay it (#215)
│   ├── bots/                  ownerApi + myBotsStore — credentialed `/me/bots` transport and
│   │                          account-scoped state; only claim receives a pasted Bearer token (#242);
│   │                          adminApi + adminBotsStore — credentialed `/admin/bots` inventory and
│   │                          operations; rotated tokens stay component-local (#243)
│   ├── games/                 gamesApi — GET /players/{guestId}/games (vs/result/before filters +
│   │                          hasMore, #173) + /opponents client (play-api wire mirror) + the
│   │                          signed-in account's union, GET /me/opponents, credentialed (#226);
│   │                          gamesFilters — /games's ?vs=/?result=/?source= URL state (VsFilter's
│   │                          local/lobby namespaces, local-game filtering, opponent search
│   │                          options, head-to-head totals) (#151)
│   ├── ingest/                finished-game recording via play-api POST /ingest/games
│   │   ├── types.ts           GameIngestWire contract (verbatim copy — see the file head)
│   │   ├── guestIdentity.ts   per-browser guest:<uuidv7> + restore code
│   │   ├── mapper.ts          LocalGameRecord → GameIngestWire (UUIDv5 id, dice decode)
│   │   ├── ingestClient.ts    POST to play-api /ingest/games (token never in browser)
│   │   └── outbox.ts          flush pending games → play-api
│   ├── history/               move-history reconstruction for replays: reconstructHistoryMap
│   │                          (local IndexedDB games) · reconstructServerHistory (play-api's
│   │                          per-turn archive → the same historyMap shape, #163)
│   ├── stats/                 playerRecord (local W-D-L) · lobbyRecord (play-api opponents
│   │                          aggregate + /me's "In the lobby" label/link helpers, head-to-head
│   │                          lookup by ?vs=)
│   ├── stores/                singleton rune stores (themeStore 7 themes · localGamesStore ·
│   │                          playerGamesStore + myGamesStore (paginated, keyset `before` cursor,
│   │                          #150; guest record vs the signed-in union — /games picks by auth
│   │                          status, #229) ·
│   │                          playerOpponentsStore + myOpponentsStore, the guest record vs the
│   │                          signed-in union — /me picks by auth status (#226) · chromeStore) +
│   │                          gameHistoryMerge (local +
│   │                          play-api games → one newest-first /games list) · gameHistoryPagination
│   │                          (render-cap + live-fetch-boundary logic over the merge, #150)
│   ├── utils/                 getPieceImage (piece sprite paths) · logger (DEV-gated console)
│   ├── localGamesDB.ts        IndexedDB via idb (sync_status: pending → synced | quarantined)
│   ├── timings.ts             presentation pacing shared by BOTH game surfaces — never fork per surface
│   ├── staleBundleRecovery.ts one-shot reload when a mid-session deploy breaks a lazy chunk import
│   ├── sentryFilters.ts       `beforeSend`: drops the chunk failure the reload above is about to fix
│   ├── sentryReplay.ts        Session Replay, dynamically imported so it stays out of the entry chunk
│   ├── appAssetFallback.ts    honest-404 logic for functions/_app/ (below) — pure, tested here
│   ├── boardStore.ts          the structural interface Board.svelte consumes, satisfied by both stores
│   ├── lastMove.ts            last-move highlight keys · types.ts shared history/board types
│   └── bots.ts · gameOutcome.ts · sound.ts · preferencesStore · toastStore · botStatsStore
│                              · authStore (guest stub)
└── utils/                     fenUtils · formatters
```

Sibling to `src/`, at the repo root (Cloudflare Pages Functions look for `functions/` there, not inside `dist/`):

```text
functions/
└── _app/[[path]].ts           Pages Function, scoped by its file-based route to /_app/*:
                                turns the SPA fallback (200 + index.html) into an honest 404
                                for a hashed asset a later deploy has already deleted (#220,
                                #223) — logic in src/lib/appAssetFallback.ts, wiring only here
```

## Error monitoring

Browser errors go to the Sentry project `dicechess-play` (org `fortemate`), wired up in
`src/hooks.client.ts`. There is no server-side half: `adapter-static` leaves no SvelteKit server
at runtime, and the one thing that does run — the `/_app/*` Pages Function — is an asset
fallback with no Sentry in it.

The shape of it is driven by page weight. The JS `index.html` pulls in before the first board
appears is 46.8 kB gzip; on top of that the error SDK costs 31.5 kB, performance tracing would
cost 20.5 kB and Session Replay 39.6 kB (all measured on the production bundle). So:

- **Errors** are the only part on the critical path.
- **Tracing** is compiled out via `__SENTRY_TRACING__` in `vite.config.ts`. Delete that line and
  add a `tracesSampleRate` to turn it on.
- **Replay** is recorded only for sessions that hit an error, and its chunk is fetched once the
  browser goes idle — so a failure in the first seconds arrives without one. Text stays
  masked: `/bots` reveals a rotated bot token as a text node, which no input-level masking
  would cover. Images are not blocked, or a replay of a board game would have no board.
- **Stale-chunk noise is filtered.** Every deploy replaces the hashed chunks, so tabs opened
  before it fail their next lazy import; `staleBundleRecovery.ts` fixes that with one reload and
  `sentryFilters.ts` drops the matching event — but only while that reload is still pending. An
  import that is still broken after a fresh `index.html` is a real broken deploy and is reported.

## How recording works

Finished games are saved to IndexedDB (`localGamesDB`, `sync_status: 'pending'`), then
`flushOutbox()` maps each to `GameIngestWire` and `POST`s it to **play-api's
`/ingest/games`** (same `VITE_PLAY_API_URL` base as live play). play-api validates the
payload structurally, queues it durably, and relays it to `dicechess-analytics`
server-side with its own Bearer token and retry/backoff. The browser never holds
`INGEST_TOKEN`. (This replaced the standalone Koyeb gateway of ADR-0005.)

Identity: `source='playsite'`; human = `guest:<uuidv7>` (per-browser), bot =
`bot:<algorithm>` (shared with the extension, disambiguated by `source`); game id =
`UUIDv5('playsite/game/<uuid>')`.

A 400/422 from play-api is permanent: `ingestClient` classifies it as `rejected`, the outbox
quarantines the record and never retries it. Acceptance is asynchronous — the authoritative
engine-replay validation happens later in analytics, and a replay rejection parks the report
on the server rather than reaching this client. Games only reachable through the live surface
are recorded by play-api itself, not from here.

## Deploy

Every push to `main` builds in GitHub Actions and Direct-Uploads `dist/` to Cloudflare Pages
(`.github/workflows/deploy.yaml`) — so **never commit to `main`**. Building in Actions is what
keeps the packages PAT out of Cloudflare. Releases are a manual `Ops: Release` dispatch that bumps
a git tag; `package.json` stays at `0.0.0`.

## Open follow-ups

- [ ] **Outbox retry backoff** — a `rejected`/`error` record is left pending and retried on the
      next flush with no delay (the `quarantined` state for 422 rejects is already implemented).

## License

AGPL-3.0 (inherited from the Dice Chess engine; the public site distributes the engine
bundle). See `LICENSE`.

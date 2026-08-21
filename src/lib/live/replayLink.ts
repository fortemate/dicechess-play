// Linking a finished live game to its public replay (#216) — `/replay/[id]`, served from play-api's
// durable archive (`GET /games/{id}/history`, #178).
//
// Two server facts decide when that link is safe to offer, both verified against play-api rather
// than assumed:
//
//   - **It is ready the instant the game ends.** `GameRoom.emit` persists and only then broadcasts
//     ("anything a player has seen is already durable"), and the archive row is written in the SAME
//     transaction as the game result (`PgGameStore.save`). So by the time a client renders
//     `GameEnded`, the replay is queryable — no probe, no retry, no "give it a second" copy.
//   - **Aborted games are never archived.** `GameArchive.payload` excludes `Termination.Aborted` by
//     design: there is no history worth serving. Offering the link there would hand the visitor a
//     page that can only say "history unavailable", so those games get no replay actions at all.
//
// A store write that failed is the one remaining gap — play-api is availability-first and lets a
// game finish in memory when persistence is down — and it degrades into exactly that "history
// unavailable" page. Rare, self-explanatory, and not worth a probe on every game end to pre-empt.

/** The wire's `Termination` value for a game that was called off before it counted. */
const ABORTED = 'Aborted';

/** Whether a finished game has an archived replay to link to. `termination` is the live store's raw
 * wire value; `null` means the game has not ended (or the client never saw how it did), which is
 * not something to offer a replay for either.
 */
export function hasReplay(gameStatus: string, termination: string | null): boolean {
	return gameStatus === 'over' && termination !== null && termination !== ABORTED;
}

/** The absolute, shareable replay URL — what "Copy link" puts on the clipboard.
 *
 * Deliberately built from the game id alone: the board's own URL carries a seat token
 * (`?seat=…&as=…`, see `seatLink.ts`), and sharing that would hand someone else a credential to sit
 * down rather than a link to watch. The replay wire is anonymized server-side, so this is safe to
 * post anywhere.
 */
export function buildReplayUrl(origin: string, gameId: string): string {
	return new URL(`/replay/${gameId}`, origin).toString();
}

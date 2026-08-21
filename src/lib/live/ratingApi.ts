import { apiBase } from './liveApi';

// REST client for the per-game rating change (play-api #296, `GET /games/{id}/rating`). The wire
// mirrors play-api's `RatingRoutes.scala` verbatim (camelCase) — do NOT reshape it here.
//
// This endpoint exists because a game's rating delta CANNOT be derived on this side. play-api
// applies rating in a background batch, one game at a time and up to `RATING_INTERVAL_SECONDS`
// after a game ends, so diffing a player's current rating against the rating frozen in the room at
// game start folds in every other game applied in between — and since a rematch usually starts
// before the previous game has been applied, that diff reports the PREVIOUS game's change. That is
// what this client used to do, and it is how a WIN came to show a negative delta in production
// (dicechess-play #235; Glicko-2 cannot lower a winner's rating).

/** One seat's rating on both sides of the game, on the public Glicko-2 scale and deliberately
 * unrounded — how many decimals a player sees is this client's decision, made at render time.
 */
export interface SeatRatingChange {
	before: number;
	after: number;
}

/** What one finished game did to each seat's rating.
 *
 * `applied` is the poll signal: `false` means the batch has not reached this game yet, which is
 * normal and temporary for a game that just ended. Once `applied` is true the answer is FINAL —
 * including both seats being `null`, which is what a game that moved nobody's rating looks like
 * (casual, a guest seat, an unregistered bot, self-play, a deleted account). A poller waiting for
 * numbers instead of for `applied` would wait forever on one of those.
 */
export interface GameRatingChange {
	gameId: string;
	applied: boolean;
	white: SeatRatingChange | null;
	black: SeatRatingChange | null;
}

/** The game's recorded rating movement, or `null` for the cases that will never become an answer:
 * an unknown id, a game that has not finished, and a play-api running without persistence (which
 * records no ratings at all). A caller polling this must stop on `null` — unlike `applied: false`,
 * it is not a "not yet". Any OTHER failure (network, 5xx) throws, so a transient blip stays
 * distinguishable from a permanent absence and the poll can simply try again.
 */
export async function fetchGameRatingChange(gameId: string): Promise<GameRatingChange | null> {
	const res = await fetch(`${apiBase()}/games/${encodeURIComponent(gameId)}/rating`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`fetchGameRatingChange failed: ${res.status}`);
	return (await res.json()) as GameRatingChange;
}

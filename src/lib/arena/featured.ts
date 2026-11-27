/**
 * Which live game Arena features (#259), and when it gives way to the next one.
 *
 * The rule, decided by the owner: the featured game is the one with the highest sum of both
 * seats' ratings, and a seat without a rating counts lowest. Once chosen, a game stays featured
 * until it ends. Its final position is then shown for a short while, and only after that the
 * next game takes over. It never changes in the middle of a game, however strong a game that
 * starts meanwhile.
 *
 * Both halves are pure functions, so the rule can be tested without a server or a clock:
 *
 *   - `rankGames` orders a list of live games by the rule (the same order lists the other
 *     games of the overview);
 *   - `featuredStep` is one step of the life of the featured game. The page feeds it what it
 *     learned (the current list, and what became of the featured game) and renders the answer.
 *
 * Until play-api can order the listing (play-api#332) the rule is applied to the page of games
 * the client receives, which the server caps and orders by activity.
 */
import type { LiveGame } from '#lib/live/liveTypes.js';

/** How long the final position of the featured game stays before the next game takes over. */
export const FINAL_POSITION_MS = 6000;

/** The sum the rule compares. A seat without a rating adds nothing, which is the lowest a seat
 * can count: every real rating is far above zero. */
export function ratingSum(game: LiveGame): number {
	return (game.players?.white.rating ?? 0) + (game.players?.black.rating ?? 0);
}

/** How many of the two seats carry a rating. Breaks a tie between equal sums: two rated seats
 * come before one seat that happens to carry the same number alone. */
const ratedSeats = (game: LiveGame): number =>
	Number(game.players?.white.rating !== undefined) +
	Number(game.players?.black.rating !== undefined);

/**
 * The games by the rule: highest sum of ratings first. Equal sums are ordered by the number of
 * rated seats, then by activity (the game further along first), then by id, so that the order
 * is the same on every poll and for every visitor.
 */
export function rankGames(games: readonly LiveGame[]): LiveGame[] {
	return [...games].sort(
		(a, b) =>
			ratingSum(b) - ratingSum(a) ||
			ratedSeats(b) - ratedSeats(a) ||
			b.version - a.version ||
			a.gameId.localeCompare(b.gameId),
	);
}

/** The game the rule features among `games`, leaving out `exceptId`. */
export function pickFeatured(games: readonly LiveGame[], exceptId?: string): LiveGame | undefined {
	return rankGames(games).find((game) => game.gameId !== exceptId);
}

/** What the page shows as the featured game. */
export type FeaturedState =
	/** Being played: it stays, whatever else starts. */
	| { phase: 'live'; gameId: string }
	/** Over: its final position stays until `until`, a time in milliseconds. */
	| { phase: 'final'; gameId: string; until: number };

/**
 * What became of the featured game since the last step:
 *   - `playing`: it is still being played, or nothing new is known (a missed poll changes
 *     nothing: the game stays);
 *   - `over`: the server says it has ended;
 *   - `gone`: the server no longer knows the game.
 */
export type FeaturedFate = 'playing' | 'over' | 'gone';

/**
 * One step. `games` is the current list of live games, `fate` what became of the featured game,
 * `now` the time in milliseconds. Returns the same object when nothing changes.
 */
export function featuredStep(
	current: FeaturedState | null,
	games: readonly LiveGame[],
	fate: FeaturedFate,
	now: number,
): FeaturedState | null {
	const choose = (exceptId?: string): FeaturedState | null => {
		const next = pickFeatured(games, exceptId);
		return next ? { phase: 'live', gameId: next.gameId } : null;
	};

	if (current === null) return choose();

	if (current.phase === 'live') {
		if (fate === 'playing') return current;
		if (fate === 'over')
			return { phase: 'final', gameId: current.gameId, until: now + FINAL_POSITION_MS };
		// Gone without a final position to show: the next game takes over at once.
		return choose(current.gameId);
	}

	// The final position has had its time. If no other game is being played it stays on screen:
	// a finished game is more to look at than an empty card.
	if (now < current.until) return current;
	return choose(current.gameId) ?? current;
}

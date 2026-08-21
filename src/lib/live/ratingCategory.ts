// Which rating scale a game counts on (#258): 'bullet', 'blitz' or 'rapid', keyed by how long the
// time control lets the game last. A HAND-MIRRORED copy of play-api's `core/RatingCategory.scala` —
// the single source of truth — in the same spirit as liveTypes.ts: there is no generated client
// here, and inventing one for three constants would be worse. Verify against the server's copy when
// changing either side; ratingCategory.test.ts pins both boundaries from both sides so a drift is a
// red test rather than a leaderboard that quietly disagrees with a profile.
//
// The category names are the server's `wireName` form (lowercase), so the values here can ride a
// `?category=` query parameter as-is once the server's phase 2 (play-api#280) ships it.

import type { TimeControl } from './liveTypes';

export type RatingCategory = 'bullet' | 'blitz' | 'rapid';

/** Expected moves per side in a dice chess game — the multiplier in the estimated-duration formula.
 *
 * Measured, not borrowed: Lichess uses `initial + 40 × increment` where 40 is chess's expected
 * moves per side, but dice chess games are far shorter — over 94,596 finished games in the
 * production archive the median is 14 turns per game, i.e. 7 moves per side. The bucketing is
 * insensitive to this anywhere in the 7–15 range, which is what makes the measurement safe to key
 * a permanent scale on.
 */
export const MOVES_PER_SIDE = 7;

/** Estimated seconds per player below which a control is 'bullet'. Lichess's own boundary, kept:
 * the boundaries are a naming convention players already know; only the multiplier above needed
 * re-measuring for dice chess. */
export const BULLET_CEILING_SECONDS = 180;

/** Estimated seconds per player below which a control is 'blitz', and at or above which 'rapid'. */
export const BLITZ_CEILING_SECONDS = 480;

/** Estimated total seconds one player spends on a game, or `null` when the control does not bound
 * a game's length at all.
 *
 * `Unlimited` has no budget to estimate, and `PerMove` bounds each move rather than the game — a
 * 30 s/move control is a 7-minute game or a 70-minute one depending only on how long the game
 * runs. Both are therefore uncategorised, and a game played under one counts on no scale. (The
 * server computes this in `Long`/`bigint` against overflow; JS number arithmetic is exact far
 * beyond any storable control here, so no special casing is needed.)
 *
 * Tolerates a missing control (same posture as `timeControlLabel`): a preset whose value is `null`
 * means "server default on create", which this function cannot know — uncategorised. */
export function estimatedSeconds(tc: TimeControl | null | undefined): number | null {
	if (!tc) return null;
	if ('Fischer' in tc)
		return tc.Fischer.initialSeconds + MOVES_PER_SIDE * tc.Fischer.incrementSeconds;
	if ('SuddenDeath' in tc) return tc.SuddenDeath.initialSeconds;
	return null; // Unlimited | PerMove
}

/** The scale this control's games count on, or `null` for an uncategorised control (see
 * `estimatedSeconds`). The formula reproduces the lobby's Blitz/Rapid grouping exactly — that is
 * what makes deriving `timeControlGroups` from it safe — and places the bot catalog's `1 + 1`
 * (67 s) in 'bullet'. The ladder's own control (Fischer 300+3 = 321 s) lands in 'blitz'. */
export function ratingCategoryOf(tc: TimeControl | null | undefined): RatingCategory | null {
	const estimated = estimatedSeconds(tc);
	if (estimated === null) return null;
	if (estimated < BULLET_CEILING_SECONDS) return 'bullet';
	if (estimated < BLITZ_CEILING_SECONDS) return 'blitz';
	return 'rapid';
}

/** Display names for the categories, in canonical fastest-first order — shared by everything that
 * renders a category (lobby groups today; leaderboard tabs and profiles once play-api#280 phase 2
 * ships the wire). */
export const RATING_CATEGORY_ORDER: readonly RatingCategory[] = ['bullet', 'blitz', 'rapid'];

export const RATING_CATEGORY_LABELS: Record<RatingCategory, string> = {
	bullet: 'Bullet',
	blitz: 'Blitz',
	rapid: 'Rapid',
};

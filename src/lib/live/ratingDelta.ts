import type { GameRatingChange, SeatRatingChange } from './ratingApi';
import type { Seat } from './liveTypes';

// Turning a server-recorded rating movement (`ratingApi.ts`) into the three numbers the game-over
// modal shows. Pure and separate from the page for the same reason the wire client is: this is
// where #235's two visible faults live, and both are worth pinning in tests rather than reading off
// a screenshot.

/** The movement for one seat, or `null` when that seat's rating did not move. Only meaningful once
 * the change is `applied` — before that both seats are null because the batch has not run yet, not
 * because nothing happened.
 */
export function seatChange(change: GameRatingChange, seat: Seat): SeatRatingChange | null {
	return seat === 'White' ? change.white : change.black;
}

/** `tone` says how to colour the delta, `label` is the parenthesised text. A move smaller than half
 * a point rounds to zero and is neutral — a red "(0)" would read as a loss that did not happen.
 */
export interface RatingDeltaDisplay {
	from: number;
	to: number;
	change: number;
	label: string;
	tone: 'gain' | 'loss' | 'none';
}

/** What the finished-game surfaces have to say about this game's rating, as ONE value so a pending
 * state and a settled one can never both be rendered:
 *
 * - `waiting` — the batch has not reached this game yet. Temporary, and worth SAYING: play-api
 *   applies rating up to `RATING_INTERVAL_SECONDS` after the game ends, so a modal that stays blank
 *   for a minute reads as broken rather than as busy (the complaint that produced this state).
 * - `moved` — the recorded movement for the local seat.
 * - `unmoved` — final without a movement for this seat. Server metadata explains why when present;
 *   older responses remain silent rather than inventing a reason.
 */
export type RatingOutcomeDetails = Pick<
	GameRatingChange,
	'outcome' | 'reason' | 'ratingDomain' | 'trainingReference'
>;

export type RatingOutcome =
	| { kind: 'waiting'; details?: RatingOutcomeDetails }
	| { kind: 'moved'; change: SeatRatingChange; details?: RatingOutcomeDetails }
	| { kind: 'unmoved'; details?: RatingOutcomeDetails };

/** One polled answer turned into what to render plus whether the poll is finished — the two travel
 * together because they are the same decision, and splitting them is how a poller ends up showing
 * "updating…" forever after a final answer.
 */
export interface RatingPollStep {
	outcome: RatingOutcome;
	/** True once the answer can no longer change; the caller stops polling. */
	done: boolean;
}

/** `applied` settles batch decisions even when both seats are absent. The server's explicit
 * `casual` outcome is also final: casual games never enter the rating batch and may stay unapplied.
 * A legacy response without that classification still waits for `applied`.
 */
export function ratingPollStep(change: GameRatingChange, seat: Seat): RatingPollStep {
	const details: RatingOutcomeDetails = {};
	for (const key of ['outcome', 'reason', 'ratingDomain', 'trainingReference'] as const) {
		if (change[key] !== undefined) Object.assign(details, { [key]: change[key] });
	}
	const metadata = Object.keys(details).length ? { details } : {};
	if (change.outcome === 'casual') return { outcome: { kind: 'unmoved', ...metadata }, done: true };
	if (!change.applied) return { outcome: { kind: 'waiting', ...metadata }, done: false };
	const mine = seatChange(change, seat);
	return mine
		? { outcome: { kind: 'moved', change: mine, ...metadata }, done: true }
		: { outcome: { kind: 'unmoved', ...metadata }, done: true };
}

/** Ratings arrive as Glicko-2 doubles (`1797.2144251082318` reached production), so they are
 * rounded for display — and the delta is derived from the ROUNDED pair rather than rounded on its
 * own, so the three numbers on screen always add up. Rounding the raw delta separately would let
 * 1775.67 → 1797.21 read as "1776 → 1797 (+22)".
 */
export function ratingDeltaDisplay(change: SeatRatingChange): RatingDeltaDisplay {
	const from = Math.round(change.before);
	const to = Math.round(change.after);
	const delta = to - from;
	if (delta > 0) return { from, to, change: delta, label: `+${delta}`, tone: 'gain' };
	if (delta < 0) return { from, to, change: delta, label: `${delta}`, tone: 'loss' };
	return { from, to, change: 0, label: '±0', tone: 'none' };
}

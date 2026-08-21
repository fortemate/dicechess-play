import type { Seat, TimeControl } from '$lib/live/liveTypes';

// The setup of the bot game this browser started most recently, so the board can offer an exact
// rematch when it ends (#215).
//
// It exists because the live wire cannot answer the question. `PublicGameState` carries the seats'
// public faces and `rated`, but no time control and no bot identity beyond the display name
// (play-api renders a bot as `"$team $name"`, a formatting choice, not a parseable key). Rather
// than splitting that string back apart on a guessed separator, the side that HAD the exact
// request — the challenge panel — records it.
//
// The record is keyed by the game it belongs to and read back only for that same game
// ({@link recallBotGame}). A rematch therefore replays settings we know, or is not offered at all:
// arriving at a finished bot game by link, or in another browser, simply shows the pre-existing
// actions. Guessing would be worse than not offering — "rematch with the same settings" that
// quietly changes the clock is a broken promise, not a degraded one.
//
// One slot, overwritten per bot game started: nothing accumulates, and a stale record can only
// ever be discarded (its game id will not match).

/** Everything needed to replay a bot challenge — the request that started the game, plus the id of
 * the game it produced. `preferredColor` is the choice as made, `'random'` included, not the seat
 * the server happened to deal. */
export interface BotGameSetup {
	gameId: string;
	team: string;
	name: string;
	timeControl: TimeControl;
	preferredColor: Seat | 'random';
	rated: boolean;
}

const KEY = 'dicechess-play-last-bot-game';

/** Whether a stored value is still a TimeControl the server would recognise.
 *
 * The wire type is a single-key discriminated union (`liveTypes.ts`), so "some non-null object" is
 * not enough: an array, an empty object or an unknown tag would sail through and be handed
 * straight to `playBot` as the clock for the new game. A record we cannot read is a record we do
 * not have — the board then offers no rematch, which is the honest outcome.
 */
function isTimeControl(value: unknown): value is TimeControl {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const keys = Object.keys(value);
	if (keys.length !== 1) return false;
	const v = value as Record<string, unknown>;
	const hasNumber = (payload: unknown, field: string): boolean =>
		typeof payload === 'object' &&
		payload !== null &&
		typeof (payload as Record<string, unknown>)[field] === 'number';
	switch (keys[0]) {
		case 'Unlimited':
			return typeof v.Unlimited === 'object' && v.Unlimited !== null;
		case 'SuddenDeath':
			return hasNumber(v.SuddenDeath, 'initialSeconds');
		case 'Fischer':
			return hasNumber(v.Fischer, 'initialSeconds') && hasNumber(v.Fischer, 'incrementSeconds');
		case 'PerMove':
			return hasNumber(v.PerMove, 'secondsPerMove');
		default:
			return false;
	}
}

function isSetup(value: unknown): value is BotGameSetup {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.gameId === 'string' &&
		typeof v.team === 'string' &&
		typeof v.name === 'string' &&
		isTimeControl(v.timeControl) &&
		(v.preferredColor === 'random' ||
			v.preferredColor === 'White' ||
			v.preferredColor === 'Black') &&
		typeof v.rated === 'boolean'
	);
}

export function rememberBotGame(setup: BotGameSetup): void {
	try {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(KEY, JSON.stringify(setup));
	} catch {
		// A browser with storage disabled just loses the rematch offer, which the board handles.
	}
}

/** The stored setup, but only when it belongs to `gameId` — a record from an earlier game says
 * nothing about this one. Unparseable or foreign records read as "nothing remembered". */
export function recallBotGame(gameId: string): BotGameSetup | null {
	try {
		if (typeof localStorage === 'undefined') return null;
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!isSetup(parsed) || parsed.gameId !== gameId) return null;
		return parsed;
	} catch {
		return null;
	}
}

/**
 * The setup for a rematch of `setup`: identical except that an explicitly chosen colour flips.
 *
 * Swapping is the fair rematch convention — you had the first move, now they do. `'random'` is left
 * alone on purpose: it is a statement that the player does not want to pick, so alternating seats
 * for them would be answering a question they declined to ask.
 */
export function rematchSetup(setup: BotGameSetup): BotGameSetup {
	const preferredColor =
		setup.preferredColor === 'White'
			? 'Black'
			: setup.preferredColor === 'Black'
				? 'White'
				: 'random';
	return { ...setup, preferredColor };
}

import { apiBase } from './liveApi';
import type { Players, TimeControl } from './liveTypes';

// REST client for the public replay endpoint (play-api #178, `GET /games/{id}/history`). The wire
// mirrors play-api's `HistoryRoutes.scala` verbatim (camelCase) — do NOT reshape it here.
//
// Unlike `PlayerGame` (`$lib/games/gamesApi`, POV-reframed for the requesting guest), this endpoint
// is public and unauthenticated: `result`/`termination` are white-POV/neutral, and `termination` is
// play-api's raw snake_case `game_termination_enum` string (the SAME convention `PlayerGame` already
// uses) — humanize it the same way `LiveGameHistoryCard` does, not via `liveTypes.ts`'s PascalCase
// `Termination` (that one is a different wire, the live game-stream protocol).

export interface HistoryTurn {
	turnNumber: number;
	activeColor: 'White' | 'Black';
	dice: number[];
	moves: string[]; // UCI; empty means a forced pass
	fenAfter: string;
}

/** The dice-fairness reveal (play-api #115): `commit` is always present; `seed`/`clientSeeds` are
 * `null` until reveal-eligible (immediately for an unpaired game, once the CRN partner has also
 * finished for a paired one) — see play-api's `HistoryRoutes` for the gate itself.
 */
export interface HistoryFairness {
	commit: string | null;
	seed: string | null;
	clientSeeds: { white: string; black: string } | null;
}

export interface GameHistory {
	gameId: string;
	players: Players;
	rated: boolean;
	timeControl: TimeControl;
	result: number; // white-POV: 1 white won, -1 black won, 0 draw
	termination: string; // raw snake_case, e.g. "king_captured" — humanize before display
	finishedAt: string; // ISO-8601
	initialDfen: string;
	turns: HistoryTurn[];
	fairness: HistoryFairness;
}

/** The finished game's full replay, or `null` for the two cases the caller must render as an
 * explicit "history unavailable" state rather than an error banner: an unknown id, and a known
 * game the server has no archive row for (pre-archive history — never backfilled, see play-api
 * #178's design note). Any OTHER failure (network, 5xx) throws, so the caller can tell "this
 * replay doesn't exist" apart from "something went wrong — try again".
 */
export async function fetchGameHistory(gameId: string): Promise<GameHistory | null> {
	const res = await fetch(`${apiBase()}/games/${encodeURIComponent(gameId)}/history`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`fetchGameHistory failed: ${res.status}`);
	return (await res.json()) as GameHistory;
}

import type { BotMoveHistoryState } from '../playWithBot/playWithBotHistory.svelte';
import type { HistoryTurn } from '../live/historyApi';
import { dieStateFromValue, expandTurn } from '../live/turnReplay';
import type { ReconstructedHistory } from './reconstructHistory';

/**
 * Rebuilds the index→state history map for a server-archived game (play-api #178,
 * `GET /games/{id}/history`) — the play-api counterpart of `reconstructHistoryMap`, for games
 * recorded server-side instead of in the browser's IndexedDB.
 *
 * Unlike a local record (which already has a materialized `fen_after` for every micro-move), the
 * archive carries only ONE `fenAfter` per TURN (a turn is up to three micro-moves of the same
 * colour) — so per-micro-move positions within a turn are derived by walking the engine forward
 * (`expandTurn`, `$lib/live/turnReplay`), exactly as the live board does for a joining client's
 * backlog (`LiveGameStore.replayHistory`). Each NEXT turn is chained from the server's own
 * `fenAfter`, not `expandTurn`'s locally-derived result, so a per-turn engine difference can never
 * compound across a long game (same reasoning as `replayHistory`).
 */
export function reconstructServerHistory(
	initialDfen: string,
	turns: HistoryTurn[],
): ReconstructedHistory {
	const historyMap: Record<string, BotMoveHistoryState> = {};
	historyMap['0'] = { fen: initialDfen, active_color: 'w', dices: [], gameMoveHistoryMove: null };
	let index = 0;
	let fen = initialDfen;

	turns.forEach((turn, turnIndex) => {
		const color: 'w' | 'b' = turn.activeColor === 'White' ? 'w' : 'b';
		const dices = turn.dice.map((value) => dieStateFromValue(value, color));

		if (turnIndex === 0) {
			// The first roll lands on the initial state (index 0), as in live/local replay.
			historyMap['0'] = { fen, active_color: color, dices, gameMoveHistoryMove: null };
		} else {
			index += 1;
			historyMap[String(index)] = { fen, active_color: color, dices, gameMoveHistoryMove: null };
		}

		const { entries } = expandTurn(fen, color, dices, turn.moves);
		for (const entry of entries) {
			index += 1;
			historyMap[String(index)] = {
				fen: entry.fen,
				active_color: color,
				dices: entry.dices,
				gameMoveHistoryMove: entry.move,
			};
		}

		fen = turn.fenAfter;
	});

	return { historyMap, maxMoveIndex: index };
}

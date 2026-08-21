import type { BotMoveHistoryState } from '../playWithBot/playWithBotHistory.svelte';
import type { DiceChessTurnHistory } from '../localGamesDB';

export interface ReconstructedHistory {
	historyMap: Record<string, BotMoveHistoryState>;
	maxMoveIndex: number;
}

/** A dfen is a 6-field FEN with an optional 7th dice field; keep the FEN part. */
function boardFenFromDfen(dfen: string): string {
	return dfen.trim().split(/\s+/).slice(0, 6).join(' ');
}

/** Parses the dice pool (7th dfen field) into the history-state dice shape. */
function diceFromDfen(dfen: string): BotMoveHistoryState['dices'] {
	const fields = dfen.trim().split(/\s+/);
	const diceField = fields.length > 6 ? fields[6] : '';
	return [...diceField].map((value) => ({ value, allowed: true, used: false }));
}

function parseUci(uci: string): { from: string; to: string; promotion: string } {
	// Guard against malformed/non-move strings (e.g. a pass): empty squares are
	// rendered as a PASS downstream rather than producing bogus coordinates.
	if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) {
		return { from: '', to: '', promotion: '' };
	}
	return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) };
}

/**
 * Rebuilds the index→state history map from a finished game's per-turn record so
 * it can be replayed move-by-move. Every board FEN is already materialized on the
 * record (`start_dfen`, per-move `fen_after`, `end_dfen`), so no engine replay is
 * needed.
 *
 * Mirrors how {@link DiceChessTurnHistory} is recorded during live play: index 0
 * is the initial position carrying the first turn's dice, then one state per
 * micro-move, with a dice-roll state introducing every later turn.
 */
export function reconstructHistoryMap(turns: DiceChessTurnHistory[]): ReconstructedHistory {
	const historyMap: Record<string, BotMoveHistoryState> = {};
	let index = 0;

	const initialFen = turns.length > 0 ? boardFenFromDfen(turns[0].start_dfen) : '';
	historyMap['0'] = {
		fen: initialFen,
		active_color: 'w',
		dices: [],
		gameMoveHistoryMove: null,
	};

	turns.forEach((turn, turnIndex) => {
		const color: 'w' | 'b' = turn.active_color === 'WHITE' ? 'w' : 'b';
		const dices = diceFromDfen(turn.start_dfen);

		if (turnIndex === 0) {
			// The first roll lands on the initial state (index 0), as in live play.
			historyMap['0'].dices = dices;
			historyMap['0'].active_color = color;
		} else {
			index += 1;
			historyMap[String(index)] = {
				fen: boardFenFromDfen(turn.start_dfen),
				active_color: color,
				dices,
				gameMoveHistoryMove: null,
			};
		}

		for (const move of turn.moves) {
			index += 1;
			historyMap[String(index)] = {
				fen: move.fen_after ?? boardFenFromDfen(turn.end_dfen),
				active_color: color,
				dices: [],
				gameMoveHistoryMove: parseUci(move.uci),
			};
		}
	});

	return { historyMap, maxMoveIndex: index };
}

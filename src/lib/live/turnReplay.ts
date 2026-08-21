import { getPieceFromFen, buildDfen, getDieValue, DICE_TO_CHAR_MAP } from '../../utils/fenUtils';
import type { DieState } from '../playWithBot/playWithBotDice.svelte';
import { logger } from '../utils/logger';
import * as DiceChessEngine from '@fortemate/dicechess-engine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DiceChess = (DiceChessEngine as any).DiceChess;

// Engine-driven replay of a single turn's UCI micro-moves — shared by the live store (replaying a
// joining client's backlog, or an incremental TurnPlayed) and archived-game replay
// (reconstructServerHistory, #163). Neither caller trusts a client-derived position: this always
// walks forward from a given starting fen through the engine, exactly like the live board applies
// its own moves, so the two replay paths can never diverge on move semantics.

/** Turns a raw dice value (1-6) back into the piece-letter DieState the UI (and getDieValue)
 * expects, via fenUtils' DICE_TO_CHAR_MAP — the same table buildDfen uses. Unlike a live
 * DiceRolled, a replayed turn's dice have no dfen to read the letters from directly: its dfen has
 * already moved on to the position after the turn.
 */
export function dieStateFromValue(value: number, color: 'w' | 'b'): DieState {
	const letter = DICE_TO_CHAR_MAP[value] ?? String(value);
	return { value: color === 'w' ? letter : letter.toLowerCase(), allowed: true, used: false };
}

/** One micro-move's resulting history entry — everything a historyMap entry needs except the index
 * and active_color (both are the same for every entry in one turn, so the caller supplies them
 * once).
 */
export interface TurnMoveEntry {
	fen: string;
	dices: DieState[];
	move: { from: string; to: string; promotion: string };
}

/** Walks a turn's UCI micro-moves through the engine, producing one entry per move — or one PASS
 * entry (the `{from:'',to:'',promotion:''}` convention `buildTurnBlocks` expects) when `moves` is
 * empty. Pure: takes the turn's starting board fen/color/dice, returns the per-move sequence plus
 * the resulting board fen; no history-map indices, no mutation.
 *
 * A move the engine rejects (an engine-version mismatch between client and server) truncates the
 * walk instead of throwing — the caller keeps everything successfully replayed up to that point.
 */
export function expandTurn(
	boardFen: string,
	color: 'w' | 'b',
	dice: DieState[],
	moves: string[],
): { entries: TurnMoveEntry[]; resultFen: string } {
	if (moves.length === 0) {
		return {
			entries: [
				{
					fen: boardFen,
					dices: dice.map((d) => ({ ...d })),
					move: { from: '', to: '', promotion: '' },
				},
			],
			resultFen: boardFen,
		};
	}

	const diceValues = dice.map((d) => getDieValue(d));
	let currentDfen = buildDfen(boardFen, diceValues, color);
	const tempDiceState = dice.map((d) => ({ ...d }));
	let nextBoardFen = boardFen;
	const entries: TurnMoveEntry[] = [];

	for (const move of moves) {
		if (move.length < 4) continue;
		const from = move.slice(0, 2);
		const dest = move.slice(2, 4);
		const promo = move.slice(4) || undefined;

		const piece = getPieceFromFen(nextBoardFen, from);
		if (piece) {
			const dieVal = getDieValue(piece);
			const dieIndex = tempDiceState.findIndex(
				(d) => d.allowed && !d.used && getDieValue(d) === dieVal,
			);
			if (dieIndex !== -1) {
				tempDiceState[dieIndex].used = true;
			}
			// Handle castling rook die consumption
			if (piece.toLowerCase() === 'k' && Math.abs(from.charCodeAt(0) - dest.charCodeAt(0)) === 2) {
				const rookDie = getDieValue('r');
				const rIdx = tempDiceState.findIndex(
					(d) => d.allowed && !d.used && getDieValue(d) === rookDie,
				);
				if (rIdx !== -1) {
					tempDiceState[rIdx].used = true;
				}
			}
		}

		const applied = DiceChess.applyMove(currentDfen, from, dest, promo);
		if (!applied) {
			logger.error('expandTurn: replay rejected a server-confirmed move; turn truncated', {
				move,
				moves,
				color,
			});
			break;
		}

		nextBoardFen = applied.split(/\s+/).slice(0, 6).join(' ');
		entries.push({
			fen: nextBoardFen,
			dices: tempDiceState.map((d) => ({ ...d })),
			move: { from, to: dest, promotion: promo ? promo.toUpperCase() : 'NONE' },
		});
		currentDfen = applied;
	}

	return { entries, resultFen: nextBoardFen };
}

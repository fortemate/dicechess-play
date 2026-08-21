import type { TurnBlock } from '../types';
import type { BotMoveHistoryState } from './playWithBotHistory.svelte';
import { getPieceFromFen, PIECE_TO_UNICODE } from '../../utils/fenUtils';
import { logger } from '../utils/logger';

/**
 * Groups the flat index→state history map into per-turn visual blocks (white and
 * black columns) for MoveHistory.svelte.
 *
 * Pure and shared between live play ({@link BotMoveHistoryState} via
 * PlayWithBotHistory) and game replay so both render histories identically.
 */
export function buildTurnBlocks(
	historyMap: Record<string, BotMoveHistoryState>,
	maxMoveIndex: number,
): TurnBlock[] {
	const blocks: TurnBlock[] = [];
	let currentTurnBlock: TurnBlock | null = null;
	let prevState: BotMoveHistoryState | null = null;

	try {
		for (let i = 0; i <= maxMoveIndex; i++) {
			const state = historyMap[String(i)];
			if (!state) continue;

			const activeColor = state.active_color || 'w';
			const isNewTurn =
				!currentTurnBlock || (prevState && activeColor === 'w' && prevState.active_color === 'b');

			if (isNewTurn) {
				currentTurnBlock = {
					turnNumber: blocks.length + 1,
					whiteDice: null,
					blackDice: null,
					whiteMoves: [],
					blackMoves: [],
					events: [],
				};
				blocks.push(currentTurnBlock);
			}

			if (currentTurnBlock && state.dices.length > 0) {
				if (activeColor === 'w' && !currentTurnBlock.whiteDice) {
					currentTurnBlock.whiteDice = {
						index: i,
						diceChars: state.dices.map((d) => d.value),
					};
				} else if (activeColor === 'b' && !currentTurnBlock.blackDice) {
					currentTurnBlock.blackDice = {
						index: i,
						diceChars: state.dices.map((d) => d.value),
					};
				}
			}

			if (state.gameMoveHistoryMove) {
				const fen = prevState?.fen ?? state.fen;
				const from = state.gameMoveHistoryMove.from;
				const to = state.gameMoveHistoryMove.to;
				const pieceChar = from ? getPieceFromFen(fen, from) : null;
				const pieceIcon = pieceChar ? PIECE_TO_UNICODE[pieceChar] : '';

				let text: string;
				if (!from || !to) {
					text = 'PASS';
				} else {
					text = `${from.toLowerCase()}-${to.toLowerCase()}`;
				}

				const moveData = {
					index: i,
					text,
					pieceIcon: pieceIcon || '',
					pieceChar: pieceChar ?? null,
				};

				if (currentTurnBlock) {
					if (activeColor === 'w') {
						currentTurnBlock.whiteMoves.push(moveData);
					} else {
						currentTurnBlock.blackMoves.push(moveData);
					}
				}
			}

			prevState = state;
		}
	} catch (e) {
		logger.error('Error parsing play-with-bot history blocks', e as Error);
		return blocks;
	}
	return blocks;
}

import type { TurnBlock } from '../types';
import type { BotMoveHistoryState } from './playWithBotHistory.svelte';
import { getPieceFromFen, PIECE_TO_UNICODE } from '../../utils/fenUtils';
import { logger } from '../utils/logger';

function createNewTurnBlock(turnNumber: number): TurnBlock {
	return {
		turnNumber,
		whiteDice: null,
		blackDice: null,
		whiteMoves: [],
		blackMoves: [],
		events: [],
	};
}

function recordDice(
	block: TurnBlock,
	state: BotMoveHistoryState,
	index: number,
	activeColor: string,
): void {
	if (state.dices.length === 0) return;
	const diceInfo = { index, diceChars: state.dices.map((d) => d.value) };
	if (activeColor === 'w' && !block.whiteDice) {
		block.whiteDice = diceInfo;
	} else if (activeColor === 'b' && !block.blackDice) {
		block.blackDice = diceInfo;
	}
}

function formatMoveText(from: string, to: string): string {
	if (!from || !to) return 'PASS';
	return `${from.toLowerCase()}-${to.toLowerCase()}`;
}

function recordMove(
	block: TurnBlock,
	state: BotMoveHistoryState,
	prevState: BotMoveHistoryState | null,
	index: number,
	activeColor: string,
): void {
	if (!state.gameMoveHistoryMove) return;

	const fen = prevState?.fen ?? state.fen;
	const { from, to } = state.gameMoveHistoryMove;
	const pieceChar = from ? getPieceFromFen(fen, from) : null;
	const pieceIcon = pieceChar ? PIECE_TO_UNICODE[pieceChar] : '';

	const moveData = {
		index,
		text: formatMoveText(from, to),
		pieceIcon: pieceIcon || '',
		pieceChar: pieceChar ?? null,
	};

	if (activeColor === 'w') {
		block.whiteMoves.push(moveData);
	} else {
		block.blackMoves.push(moveData);
	}
}

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
			if (!currentTurnBlock || (prevState?.active_color === 'b' && activeColor === 'w')) {
				currentTurnBlock = createNewTurnBlock(blocks.length + 1);
				blocks.push(currentTurnBlock);
			}

			recordDice(currentTurnBlock, state, i, activeColor);
			recordMove(currentTurnBlock, state, prevState, i, activeColor);

			prevState = state;
		}
	} catch (e) {
		logger.error('Error parsing play-with-bot history blocks', e as Error);
		return blocks;
	}
	return blocks;
}

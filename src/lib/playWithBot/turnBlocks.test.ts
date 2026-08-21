import { describe, it, expect } from 'vitest';
import { buildTurnBlocks } from './turnBlocks';
import type { BotMoveHistoryState } from './playWithBotHistory.svelte';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b - - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 2';

const die = (value: string) => ({ value, allowed: true, used: false });

const map: Record<string, BotMoveHistoryState> = {
	'0': { fen: START, active_color: 'w', dices: [die('P'), die('N')], gameMoveHistoryMove: null },
	'1': {
		fen: AFTER_E4,
		active_color: 'w',
		dices: [],
		gameMoveHistoryMove: { from: 'e2', to: 'e4', promotion: '' },
	},
	'2': { fen: AFTER_E4, active_color: 'b', dices: [die('p')], gameMoveHistoryMove: null },
	'3': {
		fen: AFTER_E5,
		active_color: 'b',
		dices: [],
		gameMoveHistoryMove: { from: 'e7', to: 'e5', promotion: '' },
	},
};

describe('buildTurnBlocks', () => {
	it('groups a white + black turn into a single block', () => {
		const blocks = buildTurnBlocks(map, 3);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].turnNumber).toBe(1);
	});

	it('captures dice per color at their move index', () => {
		const [block] = buildTurnBlocks(map, 3);
		expect(block.whiteDice).toEqual({ index: 0, diceChars: ['P', 'N'] });
		expect(block.blackDice).toEqual({ index: 2, diceChars: ['p'] });
	});

	it('derives move text and piece from the position before the move', () => {
		const [block] = buildTurnBlocks(map, 3);
		expect(block.whiteMoves[0]).toMatchObject({ index: 1, text: 'e2-e4', pieceChar: 'P' });
		expect(block.blackMoves[0]).toMatchObject({ index: 3, text: 'e7-e5', pieceChar: 'p' });
	});

	it('starts a new block on a black→white transition', () => {
		const twoTurns: Record<string, BotMoveHistoryState> = {
			...map,
			'4': { fen: AFTER_E5, active_color: 'w', dices: [die('Q')], gameMoveHistoryMove: null },
			'5': {
				fen: AFTER_E5,
				active_color: 'w',
				dices: [],
				gameMoveHistoryMove: { from: 'g1', to: 'f3', promotion: '' },
			},
		};
		const blocks = buildTurnBlocks(twoTurns, 5);
		expect(blocks).toHaveLength(2);
		expect(blocks[1].turnNumber).toBe(2);
		expect(blocks[1].whiteDice).toEqual({ index: 4, diceChars: ['Q'] });
	});

	it('labels a move with no squares as a pass', () => {
		const pass: Record<string, BotMoveHistoryState> = {
			'0': { fen: START, active_color: 'w', dices: [die('P')], gameMoveHistoryMove: null },
			'1': {
				fen: START,
				active_color: 'w',
				dices: [],
				gameMoveHistoryMove: { from: '', to: '', promotion: '' },
			},
		};
		expect(buildTurnBlocks(pass, 1)[0].whiteMoves[0].text).toBe('PASS');
	});

	it('returns no blocks for an empty map', () => {
		expect(buildTurnBlocks({}, 0)).toEqual([]);
	});
});

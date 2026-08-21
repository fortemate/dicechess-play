import { describe, it, expect } from 'vitest';
import { reconstructHistoryMap } from './reconstructHistory';
import type { DiceChessTurnHistory } from '$lib/localGamesDB';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b - - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 2';

const turns: DiceChessTurnHistory[] = [
	{
		turn_number: 1,
		active_color: 'WHITE',
		start_dfen: `${START} PNR`,
		moves: [{ uci: 'e2e4', piece: 'P', is_capture: false, fen_after: AFTER_E4 }],
		end_dfen: AFTER_E4,
	},
	{
		turn_number: 2,
		active_color: 'BLACK',
		start_dfen: `${AFTER_E4} pn`,
		moves: [{ uci: 'e7e5', piece: 'p', is_capture: false, fen_after: AFTER_E5 }],
		end_dfen: AFTER_E5,
	},
];

describe('reconstructHistoryMap', () => {
	it('places the initial position and the first turn dice at index 0', () => {
		const { historyMap } = reconstructHistoryMap(turns);
		expect(historyMap['0'].fen).toBe(START);
		expect(historyMap['0'].active_color).toBe('w');
		expect(historyMap['0'].dices.map((d) => d.value)).toEqual(['P', 'N', 'R']);
		expect(historyMap['0'].gameMoveHistoryMove).toBeNull();
	});

	it('creates one state per micro-move with the materialized fen', () => {
		const { historyMap } = reconstructHistoryMap(turns);
		expect(historyMap['1'].fen).toBe(AFTER_E4);
		expect(historyMap['1'].gameMoveHistoryMove).toEqual({ from: 'e2', to: 'e4', promotion: '' });
	});

	it('introduces later turns with a dice-roll state', () => {
		const { historyMap } = reconstructHistoryMap(turns);
		expect(historyMap['2'].active_color).toBe('b');
		expect(historyMap['2'].dices.map((d) => d.value)).toEqual(['p', 'n']);
		expect(historyMap['2'].gameMoveHistoryMove).toBeNull();
		expect(historyMap['3'].fen).toBe(AFTER_E5);
		expect(historyMap['3'].gameMoveHistoryMove).toEqual({ from: 'e7', to: 'e5', promotion: '' });
	});

	it('reports the last index as maxMoveIndex', () => {
		expect(reconstructHistoryMap(turns).maxMoveIndex).toBe(3);
	});

	it('handles an empty record without throwing', () => {
		const { historyMap, maxMoveIndex } = reconstructHistoryMap([]);
		expect(maxMoveIndex).toBe(0);
		expect(historyMap['0']).toBeDefined();
		expect(historyMap['0'].dices).toEqual([]);
	});

	it('parses a promotion suffix from the uci', () => {
		const promo: DiceChessTurnHistory[] = [
			{
				turn_number: 1,
				active_color: 'WHITE',
				start_dfen: `${START} P`,
				moves: [{ uci: 'e7e8q', piece: 'P', is_capture: false, fen_after: AFTER_E4 }],
				end_dfen: AFTER_E4,
			},
		];
		expect(reconstructHistoryMap(promo).historyMap['1'].gameMoveHistoryMove).toEqual({
			from: 'e7',
			to: 'e8',
			promotion: 'q',
		});
	});

	it('treats a malformed uci as a pass (empty squares)', () => {
		const malformed: DiceChessTurnHistory[] = [
			{
				turn_number: 1,
				active_color: 'WHITE',
				start_dfen: `${START} P`,
				moves: [{ uci: 'pass', piece: '', is_capture: false, fen_after: AFTER_E4 }],
				end_dfen: AFTER_E4,
			},
		];
		expect(reconstructHistoryMap(malformed).historyMap['1'].gameMoveHistoryMove).toEqual({
			from: '',
			to: '',
			promotion: '',
		});
	});

	it('falls back to the turn end fen when a move has no fen_after', () => {
		const noFen: DiceChessTurnHistory[] = [
			{
				turn_number: 1,
				active_color: 'WHITE',
				start_dfen: `${START} P`,
				moves: [{ uci: 'e2e4', piece: 'P', is_capture: false }],
				end_dfen: AFTER_E4,
			},
		];
		expect(reconstructHistoryMap(noFen).historyMap['1'].fen).toBe(AFTER_E4);
	});
});

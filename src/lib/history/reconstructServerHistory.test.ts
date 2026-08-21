import { describe, it, expect } from 'vitest';
import { reconstructServerHistory } from './reconstructServerHistory';
import type { HistoryTurn } from '../live/historyApi';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('reconstructServerHistory', () => {
	it('seeds index 0 with the initial position, even for a game with no turns', () => {
		const { historyMap, maxMoveIndex } = reconstructServerHistory(START, []);
		expect(historyMap).toEqual({
			'0': { fen: START, active_color: 'w', dices: [], gameMoveHistoryMove: null },
		});
		expect(maxMoveIndex).toBe(0);
	});

	it('places the first turn dice at index 0, then one entry per micro-move', () => {
		const turns: HistoryTurn[] = [
			{
				turnNumber: 1,
				activeColor: 'White',
				dice: [1],
				moves: ['e2e4'],
				fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
			},
		];
		const { historyMap, maxMoveIndex } = reconstructServerHistory(START, turns);
		expect(historyMap['0'].active_color).toBe('w');
		expect(historyMap['0'].dices.map((d) => d.value)).toEqual(['P']);
		expect(historyMap['0'].gameMoveHistoryMove).toBeNull();
		expect(historyMap['1'].gameMoveHistoryMove).toEqual({
			from: 'e2',
			to: 'e4',
			promotion: 'NONE',
		});
		expect(maxMoveIndex).toBe(1);
	});

	it('records a forced pass as a PASS entry, not a dropped turn', () => {
		const fenAfterA3B5 = 'rnbqkbnr/pppppppp/8/1N6/8/8/PPPPPPPP/R1BQKBNR b KQkq - 2 1';
		const turns: HistoryTurn[] = [
			{
				turnNumber: 1,
				activeColor: 'White',
				dice: [6, 2, 2],
				moves: ['b1a3', 'a3b5'],
				fenAfter: fenAfterA3B5,
			},
			{
				turnNumber: 2,
				activeColor: 'Black',
				dice: [5, 5, 6],
				moves: [],
				fenAfter: fenAfterA3B5,
			},
		];
		const { historyMap, maxMoveIndex } = reconstructServerHistory(START, turns);
		// index 0 = White's roll, 1-2 = the two knight micro-moves, 3 = Black's roll,
		// 4 = the PASS entry itself (a roll and its forced pass are two distinct scrubbable steps,
		// same as the live store's appendRollEntry + appendTurnEntries).
		expect(maxMoveIndex).toBe(4);
		expect(historyMap['3'].active_color).toBe('b');
		expect(historyMap['3'].dices.map((d) => d.value)).toEqual(['q', 'q', 'k']);
		expect(historyMap['3'].gameMoveHistoryMove).toBeNull();
		expect(historyMap['4'].fen).toBe(fenAfterA3B5);
		expect(historyMap['4'].gameMoveHistoryMove).toEqual({ from: '', to: '', promotion: '' });
	});

	it('chains the next turn from the server-authoritative fenAfter, not a locally re-derived position (#163)', () => {
		// A deliberately arbitrary fen — NOT what expandTurn would compute from e2e4 on its own — so
		// the only way turn 2 can start from it is if the reconstructor actually reads turn.fenAfter
		// rather than trusting its own engine walk. Real per-turn fenAfter values ARE server-derived
		// this way (the engine doesn't auto-flip the side to move mid-turn — see turnReplay.test.ts).
		const ARBITRARY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
		const turns: HistoryTurn[] = [
			{ turnNumber: 1, activeColor: 'White', dice: [1], moves: ['e2e4'], fenAfter: ARBITRARY_FEN },
			{ turnNumber: 2, activeColor: 'Black', dice: [1], moves: [], fenAfter: ARBITRARY_FEN },
		];
		const { historyMap } = reconstructServerHistory(START, turns);
		// index 2 = turn 2's roll entry (0 = turn 1's roll, 1 = its one micro-move, 2 = turn 2's roll).
		expect(historyMap['2'].fen).toBe(ARBITRARY_FEN);
	});
});

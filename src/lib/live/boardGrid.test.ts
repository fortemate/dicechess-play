import { describe, expect, it } from 'vitest';
import { boardGrid, fullmoveOf } from './boardGrid';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('boardGrid', () => {
	it('expands the starting position, rank 8 first', () => {
		const cells = boardGrid(START);
		expect(cells).toHaveLength(64);
		expect(cells.slice(0, 8)).toEqual(['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']);
		expect(cells.slice(8, 16)).toEqual(Array(8).fill('p'));
		expect(cells.slice(16, 48)).toEqual(Array(32).fill(null));
		expect(cells.slice(56)).toEqual(['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']);
	});

	it('accepts a DFEN (dice field ignored) and mid-game gaps', () => {
		const cells = boardGrid('8/5pk1/6p1/8/3B4/6P1/5PK1/3r4 b - - 1 41 nrk');
		expect(cells.filter(Boolean)).toEqual(['p', 'k', 'p', 'B', 'P', 'P', 'K', 'r']);
	});

	it('yields an empty board on malformed or missing input instead of throwing', () => {
		expect(boardGrid('not-a-fen')).toEqual(Array(64).fill(null));
		expect(boardGrid('8/8/8 w')).toEqual(Array(64).fill(null));
		expect(boardGrid('9/8/8/8/8/8/8/8 w - - 0 1')).toEqual(Array(64).fill(null));
		expect(boardGrid(undefined)).toEqual(Array(64).fill(null)); // a pre-dfen server
	});
});

describe('fullmoveOf', () => {
	it('reads the 6th field and falls back to 1', () => {
		expect(fullmoveOf(START)).toBe(1);
		expect(fullmoveOf('8/5pk1/6p1/8/3B4/6P1/5PK1/3r4 b - - 1 41 nrk')).toBe(41);
		expect(fullmoveOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).toBe(1);
	});
});

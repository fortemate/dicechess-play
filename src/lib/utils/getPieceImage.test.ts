import { describe, expect, it } from 'vitest';
import { getPieceImage } from './getPieceImage';

describe('getPieceImage', () => {
	it.each([
		['K', '/pieces/cburnett/wK.svg'],
		['Q', '/pieces/cburnett/wQ.svg'],
		['R', '/pieces/cburnett/wR.svg'],
		['B', '/pieces/cburnett/wB.svg'],
		['N', '/pieces/cburnett/wN.svg'],
		['P', '/pieces/cburnett/wP.svg'],
	])('maps uppercase %s to the white cburnett SVG', (input, expected) => {
		expect(getPieceImage(input)).toBe(expected);
	});

	it.each([
		['k', '/pieces/cburnett/bK.svg'],
		['q', '/pieces/cburnett/bQ.svg'],
		['r', '/pieces/cburnett/bR.svg'],
		['b', '/pieces/cburnett/bB.svg'],
		['n', '/pieces/cburnett/bN.svg'],
		['p', '/pieces/cburnett/bP.svg'],
	])('maps lowercase %s to the black cburnett SVG', (input, expected) => {
		expect(getPieceImage(input)).toBe(expected);
	});
});

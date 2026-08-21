import { describe, it, expect } from 'vitest';
import { splitDfen, stripDfen } from './dfenUtils';

describe('dfenUtils', () => {
	// Real DFENs observed from a play-api game.
	const whiteDfen = 'rnbqk1nr/ppppppbp/8/8/8/4P3/PPPP1PPP/RNB1KBNR w KQkq - 0 2 BRK';
	const whiteFen6 = 'rnbqk1nr/ppppppbp/8/8/8/4P3/PPPP1PPP/RNB1KBNR w KQkq - 0 2';

	it('strips the dice field to a 6-field FEN', () => {
		expect(stripDfen(whiteDfen)).toBe(whiteFen6);
	});

	it('splits white dice (uppercase), preserving case', () => {
		expect(splitDfen(whiteDfen)).toEqual({ fen6: whiteFen6, dice: ['B', 'R', 'K'] });
	});

	it('splits black dice (lowercase)', () => {
		const blackDfen = 'rnb1k1n1/p1pp1pbr/p3p2p/8/7P/4P3/PPPP1PPR/RNB1K1N1 b - - 4 4 rqk';
		expect(splitDfen(blackDfen).dice).toEqual(['r', 'q', 'k']);
	});

	it('returns no dice for a plain 6-field FEN', () => {
		const plain = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
		expect(splitDfen(plain)).toEqual({ fen6: plain, dice: [] });
		expect(stripDfen(plain)).toBe(plain);
	});
});

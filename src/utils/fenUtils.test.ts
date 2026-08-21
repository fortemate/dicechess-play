import { describe, it, expect } from 'vitest';
import {
	PIECE_TO_UNICODE,
	getFenBoardPart,
	getPieceFromFen,
	isOpponentKingAbsent,
	normalizeFenForPuzzleValidation,
	deriveChessgroundDests,
} from './fenUtils';

describe('fenUtils', () => {
	describe('getPieceFromFen', () => {
		it('should return the correct piece for a valid square', () => {
			const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
			expect(getPieceFromFen(fen, 'a1')).toBe('R');
			expect(getPieceFromFen(fen, 'e1')).toBe('K');
			expect(getPieceFromFen(fen, 'h8')).toBe('r');
			expect(getPieceFromFen(fen, 'e8')).toBe('k');
		});

		it('should return null for empty squares', () => {
			const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
			expect(getPieceFromFen(fen, 'e4')).toBe(null);
			expect(getPieceFromFen(fen, 'd4')).toBe(null);
		});

		it('should return null for invalid inputs', () => {
			expect(getPieceFromFen('', 'a1')).toBe(null);
			expect(getPieceFromFen('invalid', 'a1')).toBe(null);
			expect(getPieceFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', '')).toBe(
				null,
			);
			expect(
				getPieceFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'i9'),
			).toBe(null);
		});

		it('should handle FEN with numbers correctly', () => {
			const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1';
			expect(getPieceFromFen(fen, 'b8')).toBe(null); // b8 is empty (represented by '1')
			expect(getPieceFromFen(fen, 'c6')).toBe('n');
		});
	});

	describe('getFenBoardPart', () => {
		it('returns only the first FEN field (piece placement)', () => {
			const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
			expect(getFenBoardPart(fen)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
		});

		it('returns null for empty or missing values', () => {
			expect(getFenBoardPart('')).toBe(null);
			expect(getFenBoardPart('   ')).toBe(null);
			expect(getFenBoardPart(null)).toBe(null);
			expect(getFenBoardPart(undefined)).toBe(null);
		});
	});

	describe('PIECE_TO_UNICODE', () => {
		it('should contain all expected piece mappings', () => {
			expect(PIECE_TO_UNICODE['K']).toBe('♔\uFE0E');
			expect(PIECE_TO_UNICODE['Q']).toBe('♕\uFE0E');
			expect(PIECE_TO_UNICODE['R']).toBe('♖\uFE0E');
			expect(PIECE_TO_UNICODE['B']).toBe('♗\uFE0E');
			expect(PIECE_TO_UNICODE['N']).toBe('♘\uFE0E');
			expect(PIECE_TO_UNICODE['P']).toBe('♙\uFE0E');
			expect(PIECE_TO_UNICODE['k']).toBe('♚\uFE0E');
			expect(PIECE_TO_UNICODE['q']).toBe('♛\uFE0E');
			expect(PIECE_TO_UNICODE['r']).toBe('♜\uFE0E');
			expect(PIECE_TO_UNICODE['b']).toBe('♝\uFE0E');
			expect(PIECE_TO_UNICODE['n']).toBe('♞\uFE0E');
			expect(PIECE_TO_UNICODE['p']).toBe('♟\uFE0E');
		});
	});

	describe('normalizeFenForPuzzleValidation', () => {
		it('keeps only the first four FEN fields', () => {
			const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
			expect(normalizeFenForPuzzleValidation(fen)).toBe(
				'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
			);
		});

		it('throws when FEN has fewer than four fields', () => {
			expect(() => normalizeFenForPuzzleValidation('invalid fen')).toThrow(
				'Invalid FEN: expected at least 4 fields for puzzle validation.',
			);
		});
	});

	describe('isOpponentKingAbsent', () => {
		const WITH_BOTH_KINGS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
		// White king K captured — only black king k remains
		const WITHOUT_WHITE_KING = 'rnb2rk1/ppp2pp1/5n1p/3p4/8/8/PPPPPqPP/1RB1QB1R';
		// Black king k captured — only white king K remains
		const WITHOUT_BLACK_KING = '1RB1QB1R/PPPPPqPP/8/8/3P4/5N1P/PPP2PP1/RNB2R2';

		it('returns false when white trains and black king is still present', () => {
			expect(isOpponentKingAbsent(WITH_BOTH_KINGS, 'w')).toBe(false);
		});

		it('returns true when white trains and black king has been captured', () => {
			expect(isOpponentKingAbsent(WITHOUT_BLACK_KING, 'w')).toBe(true);
		});

		it('returns false when black trains and white king is still present', () => {
			expect(isOpponentKingAbsent(WITH_BOTH_KINGS, 'b')).toBe(false);
		});

		it('returns true when black trains and white king has been captured', () => {
			expect(isOpponentKingAbsent(WITHOUT_WHITE_KING, 'b')).toBe(true);
		});
	});

	describe('deriveChessgroundDests', () => {
		it('should correctly derive dests map from UCI moves', () => {
			const uciMoves = ['e2e4', 'g1f3', 'e2e3'];
			const dests = deriveChessgroundDests(uciMoves);

			expect(dests.size).toBe(2);
			expect(dests.get('e2')).toEqual(['e4', 'e3']);
			expect(dests.get('g1')).toEqual(['f3']);
		});

		it('should handle pawn promotions correctly by stripping promotion suffix', () => {
			const uciMoves = ['e7e8q', 'e7e8r'];
			const dests = deriveChessgroundDests(uciMoves);

			expect(dests.size).toBe(1);
			expect(dests.get('e7')).toEqual(['e8']);
		});

		it('should return empty map for empty array', () => {
			const dests = deriveChessgroundDests([]);
			expect(dests.size).toBe(0);
		});

		it('should ignore malformed or short strings', () => {
			const uciMoves = ['e2e', 'e2e4'];
			const dests = deriveChessgroundDests(uciMoves);
			expect(dests.size).toBe(1);
			expect(dests.get('e2')).toEqual(['e4']);
		});
	});
});

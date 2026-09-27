import { describe, it, expect } from 'vitest';
import { historyUci, moveCue, resultCue } from './soundCues';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('moveCue', () => {
	it('names a quiet move a move', () => {
		expect(moveCue(START, 'e2e4')).toBe('piece_move');
		expect(moveCue(START, 'g1f3')).toBe('piece_move');
	});

	it('names a move onto an enemy piece a capture', () => {
		const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
		expect(moveCue(fen, 'e4d5')).toBe('piece_capture');
	});

	it('names en passant a capture, though the target square is empty', () => {
		const fen = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
		expect(moveCue(fen, 'e5f6')).toBe('piece_capture');
	});

	it('names a king moving two files castling, and one file a move', () => {
		const fen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
		expect(moveCue(fen, 'e1g1')).toBe('castle');
		expect(moveCue(fen, 'e8c8')).toBe('castle');
		expect(moveCue(fen, 'e1f1')).toBe('piece_move');
	});

	it('names a promotion a promotion, even when it captures', () => {
		const fen = 'r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1';
		expect(moveCue(fen, 'b7b8q')).toBe('promotion');
		expect(moveCue(fen, 'b7a8n')).toBe('promotion');
	});
});

describe('historyUci', () => {
	it('drops the NONE placeholder and lowercases a promotion piece', () => {
		expect(historyUci({ from: 'e2', to: 'e4', promotion: 'NONE' })).toBe('e2e4');
		expect(historyUci({ from: 'e2', to: 'e4', promotion: '' })).toBe('e2e4');
		expect(historyUci({ from: 'b7', to: 'b8', promotion: 'Q' })).toBe('b7b8q');
		expect(historyUci({ from: 'b2', to: 'b1', promotion: 'n' })).toBe('b2b1n');
	});
});

describe('resultCue', () => {
	it("plays the viewer's own result", () => {
		expect(resultCue('won')).toBe('game_win');
		expect(resultCue('lost')).toBe('game_loss');
		expect(resultCue('draw')).toBe('game_draw');
	});

	it('ends a decisive game someone only watched on the winning jingle', () => {
		expect(resultCue(null)).toBe('game_win');
	});
});

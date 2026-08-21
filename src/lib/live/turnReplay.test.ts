import { describe, it, expect } from 'vitest';
import { dieStateFromValue, expandTurn } from './turnReplay';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Mid-turn (not the fully-completed turn's fen_after): the mover's side does NOT flip after a single
// micro-move — a dice-chess turn can hold up to three micro-moves for the SAME colour — and the
// engine still tracks the en passant square as usual. This is why the caller (reconstructServerHistory)
// chains the NEXT turn from the server's authoritative `fenAfter` rather than this per-move result.
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e3 0 1';

describe('dieStateFromValue', () => {
	it('maps a dice value to its uppercase piece letter for White', () => {
		expect(dieStateFromValue(1, 'w')).toEqual({ value: 'P', allowed: true, used: false });
	});

	it('maps a dice value to its lowercase piece letter for Black', () => {
		expect(dieStateFromValue(1, 'b')).toEqual({ value: 'p', allowed: true, used: false });
	});
});

describe('expandTurn', () => {
	it('produces one PASS entry when the turn has no legal move, without touching the fen', () => {
		const dice = [dieStateFromValue(6, 'w')]; // K, no legal king move from the start position
		const { entries, resultFen } = expandTurn(START, 'w', dice, []);
		expect(entries).toEqual([
			{ fen: START, dices: dice, move: { from: '', to: '', promotion: '' } },
		]);
		expect(resultFen).toBe(START);
	});

	it('walks a single micro-move through the engine, consuming its die', () => {
		const dice = [dieStateFromValue(1, 'w')]; // P
		const { entries, resultFen } = expandTurn(START, 'w', dice, ['e2e4']);
		expect(entries).toHaveLength(1);
		expect(entries[0].fen).toBe(AFTER_E4);
		// Non-promotion moves use the literal 'NONE' (matching the pre-extraction appendTurnEntries
		// convention) — distinct from the PASS entry's empty-string sentinel above.
		expect(entries[0].move).toEqual({ from: 'e2', to: 'e4', promotion: 'NONE' });
		expect(entries[0].dices[0].used).toBe(true);
		expect(resultFen).toBe(AFTER_E4);
	});

	it('leaves an unrelated die unused when only one of several rolled dice is played', () => {
		const dice = [dieStateFromValue(1, 'w'), dieStateFromValue(2, 'w')]; // P, N
		const { entries } = expandTurn(START, 'w', dice, ['e2e4']);
		const [pawnDie, knightDie] = entries[0].dices;
		expect(pawnDie.used).toBe(true);
		expect(knightDie.used).toBe(false);
	});

	it('truncates the walk (instead of throwing) when the engine rejects a move', () => {
		const dice = [dieStateFromValue(1, 'w'), dieStateFromValue(1, 'w')]; // two pawn dice
		// The second e2e4 is illegal — e2 is already empty after the first — so the engine must
		// reject it; the walk should stop with only the first move recorded.
		const { entries, resultFen } = expandTurn(START, 'w', dice, ['e2e4', 'e2e4']);
		expect(entries).toHaveLength(1);
		expect(resultFen).toBe(AFTER_E4);
	});
});

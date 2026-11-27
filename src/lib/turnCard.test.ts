import { describe, expect, it } from 'vitest';

import type { DieState } from '#lib/playWithBot/playWithBotDice.svelte.js';
import { diceHint, dieLabel, dieStatus, pieceList, pieceName } from './turnCard';

// The words of the turn card (#254). The stores decide which die is used or allowed; these
// functions only turn that into a state and a sentence, so the tests feed them dice as the
// stores expose them and read the result.

const die = (value: string, state: Partial<DieState> = {}): DieState => ({
	value,
	allowed: true,
	used: false,
	...state,
});

describe('dieStatus', () => {
	it('tells a used die, a playable die and one without a move apart', () => {
		expect(dieStatus(die('N'))).toBe('playable');
		expect(dieStatus(die('N', { used: true }))).toBe('used');
		expect(dieStatus(die('N', { allowed: false }))).toBe('idle');
	});

	it('calls a used die used even when the store no longer allows it', () => {
		expect(dieStatus(die('N', { used: true, allowed: false }))).toBe('used');
	});
});

describe('piece names', () => {
	it('names the piece of a die whatever its colour', () => {
		expect(pieceName('N')).toBe('Knight');
		expect(pieceName('n')).toBe('Knight');
		expect(['p', 'n', 'b', 'r', 'q', 'k'].map(pieceName)).toEqual([
			'Pawn',
			'Knight',
			'Bishop',
			'Rook',
			'Queen',
			'King',
		]);
	});

	it('returns a letter it does not know as it is', () => {
		expect(pieceName('x')).toBe('x');
	});

	it('joins names as a list, and repeats a piece that was rolled twice', () => {
		expect(pieceList(['N'])).toBe('knight');
		expect(pieceList(['N', 'B'])).toBe('knight and bishop');
		expect(pieceList(['q', 'k', 'n'])).toBe('queen, king, and knight');
		expect(pieceList(['N', 'N'])).toBe('knight and knight');
	});
});

describe('dieLabel', () => {
	it('is the piece, with the reason when the die cannot be played', () => {
		expect(dieLabel(die('B'))).toBe('Bishop');
		expect(dieLabel(die('P', { used: true }))).toBe('Pawn, used');
		expect(dieLabel(die('R', { allowed: false }))).toBe('Rook, no move');
	});
});

describe('diceHint', () => {
	it('is empty without dice', () => {
		expect(diceHint([], true)).toBe('');
		expect(diceHint([], false)).toBe('');
	});

	it('counts what the visitor can still play', () => {
		expect(diceHint([die('P'), die('N'), die('B')], true)).toBe(
			'Three dice to play: pawn, knight, and bishop, in any order.',
		);
		expect(diceHint([die('P', { used: true }), die('N'), die('B')], true)).toBe(
			'Two dice left: knight and bishop, in either order.',
		);
		expect(diceHint([die('P', { used: true }), die('N', { used: true }), die('B')], true)).toBe(
			'One die left: bishop.',
		);
	});

	it('leaves out a die that has no move', () => {
		expect(diceHint([die('P', { used: true }), die('N'), die('R', { allowed: false })], true)).toBe(
			'One die left: knight.',
		);
	});

	it('says when nothing is left to play', () => {
		const used = { used: true };
		expect(diceHint([die('P', used), die('N', used), die('B', used)], true)).toBe(
			'No die left that can be played.',
		);
		expect(diceHint([die('P', used), die('R', { allowed: false })], true)).toBe(
			'No die left that can be played.',
		);
	});

	it('only names the dice of somebody else, used or not', () => {
		expect(diceHint([die('q', { used: true }), die('k'), die('n')], false)).toBe(
			'Dice rolled: queen, king, and knight.',
		);
	});
});

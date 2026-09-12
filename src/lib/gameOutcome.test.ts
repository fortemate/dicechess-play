import { describe, it, expect } from 'vitest';
import {
	playerOutcome,
	outcomeLabel,
	endReasonLabel,
	terminationLabel,
	RESULT_LABEL,
	RESULT_CLASS,
	UNKNOWN_TERMINATION_LABEL,
} from './gameOutcome';

describe('playerOutcome', () => {
	it('reads a White win from each color', () => {
		expect(playerOutcome(1, 'WHITE')).toBe('win');
		expect(playerOutcome(1, 'BLACK')).toBe('loss');
	});

	it('reads a Black win from each color', () => {
		expect(playerOutcome(-1, 'WHITE')).toBe('loss');
		expect(playerOutcome(-1, 'BLACK')).toBe('win');
	});

	it('treats a zero result as a draw regardless of color', () => {
		expect(playerOutcome(0, 'WHITE')).toBe('draw');
		expect(playerOutcome(0, 'BLACK')).toBe('draw');
	});
});

describe('outcomeLabel and RESULT_LABEL', () => {
	it('maps each outcome to its label', () => {
		expect(outcomeLabel('win')).toBe('Won');
		expect(outcomeLabel('loss')).toBe('Lost');
		expect(outcomeLabel('draw')).toBe('Draw');
		expect(outcomeLabel('unknown')).toBe('Unknown');
	});

	it('provides identical static mapping in RESULT_LABEL', () => {
		expect(RESULT_LABEL.win).toBe('Won');
		expect(RESULT_LABEL.loss).toBe('Lost');
		expect(RESULT_LABEL.draw).toBe('Draw');
		expect(RESULT_LABEL.unknown).toBe('Unknown');
	});

	it('returns an empty string when given a null or undefined outcome', () => {
		expect(outcomeLabel(null)).toBe('');
		expect(outcomeLabel(undefined)).toBe('');
	});
});

describe('RESULT_CLASS', () => {
	it('provides styling classes for all game results', () => {
		expect(RESULT_CLASS.win).toContain('text-primary');
		expect(RESULT_CLASS.loss).toContain('text-danger');
		expect(RESULT_CLASS.draw).toContain('text-content-muted');
		expect(RESULT_CLASS.unknown).toContain('text-content-muted');
	});
});

describe('endReasonLabel', () => {
	it('maps each end reason to a human label', () => {
		expect(endReasonLabel('mate')).toBe('King captured');
		expect(endReasonLabel('timeout')).toBe('On time');
		expect(endReasonLabel('resign')).toBe('Resigned');
		expect(endReasonLabel('agreement')).toBe('Draw agreed');
		expect(endReasonLabel('double_declined')).toBe('Double declined');
	});

	it('returns an empty string for a missing reason (legacy records)', () => {
		expect(endReasonLabel(null)).toBe('');
		expect(endReasonLabel(undefined)).toBe('');
	});
});

describe('terminationLabel', () => {
	it.each([
		['king_captured', 'King captured'],
		['timeout', 'Timeout'],
		['resign', 'Resign'],
		['draw_agreement', 'Draw agreement'],
		['aborted', 'Aborted'],
		['double_declined', 'Double declined'],
	])('maps known play-api wire value %s to %s', (termination, expected) => {
		expect(terminationLabel(termination)).toBe(expected);
	});

	it('returns "Game ended" for unknown or unmapped termination values', () => {
		expect(terminationLabel('future_new_reason')).toBe(UNKNOWN_TERMINATION_LABEL);
		expect(terminationLabel('unknown')).toBe(UNKNOWN_TERMINATION_LABEL);
		expect(terminationLabel('threefold_repetition')).toBe('Game ended');
	});

	it('returns an empty string for null, undefined, or empty values', () => {
		expect(terminationLabel(null)).toBe('');
		expect(terminationLabel(undefined)).toBe('');
		expect(terminationLabel('')).toBe('');
	});
});

import { describe, it, expect } from 'vitest';
import { lastMoveKeys } from './lastMove';

describe('lastMoveKeys', () => {
	it('extracts [from, to] from a move entry', () => {
		expect(
			lastMoveKeys({ gameMoveHistoryMove: { from: 'e2', to: 'e4', promotion: 'NONE' } }),
		).toEqual(['e2', 'e4']);
	});

	it('returns undefined for a roll entry (no move yet)', () => {
		expect(lastMoveKeys({ gameMoveHistoryMove: null })).toBeUndefined();
	});

	it('returns undefined for a pass entry (empty squares)', () => {
		expect(
			lastMoveKeys({ gameMoveHistoryMove: { from: '', to: '', promotion: '' } }),
		).toBeUndefined();
	});

	it('returns undefined for a missing entry', () => {
		expect(lastMoveKeys(undefined)).toBeUndefined();
	});
});

import { describe, it, expect } from 'vitest';
import { seatChange, ratingDeltaDisplay, ratingPollStep } from './ratingDelta';
import type { GameRatingChange } from './ratingApi';

describe('seatChange', () => {
	const change: GameRatingChange = {
		gameId: 'game-1',
		applied: true,
		white: { before: 1500, after: 1512.5 },
		black: { before: 1601.5, after: 1580.25 },
	};

	it('picks the asked-for seat, never the other one', () => {
		expect(seatChange(change, 'White')).toEqual({ before: 1500, after: 1512.5 });
		expect(seatChange(change, 'Black')).toEqual({ before: 1601.5, after: 1580.25 });
	});

	it('is null for a seat whose rating did not move', () => {
		const halfRated = { ...change, black: null };
		expect(seatChange(halfRated, 'Black')).toBeNull();
	});
});

describe('ratingPollStep', () => {
	const pending: GameRatingChange = {
		gameId: 'game-1',
		applied: false,
		white: null,
		black: null,
	};

	it('reports a wait, and is NOT done, while the batch has not reached the game', () => {
		expect(ratingPollStep(pending, 'White')).toEqual({ outcome: { kind: 'waiting' }, done: false });
	});

	it('is done with the local seat’s movement once the batch has applied the game', () => {
		const applied: GameRatingChange = {
			gameId: 'game-1',
			applied: true,
			white: { before: 1500, after: 1512.5 },
			black: { before: 1601.5, after: 1580.25 },
		};
		expect(ratingPollStep(applied, 'Black')).toEqual({
			outcome: { kind: 'moved', change: { before: 1601.5, after: 1580.25 } },
			done: true,
		});
	});

	it('treats applied-with-no-numbers as a FINAL "moved nothing", never as a not-yet', () => {
		// A guest seat, an unregistered opponent, self-play: the batch stamps the row and writes no
		// numbers. Waiting for numbers here would hang the pending line on screen forever.
		const skipped: GameRatingChange = { gameId: 'game-1', applied: true, white: null, black: null };
		expect(ratingPollStep(skipped, 'White')).toEqual({ outcome: { kind: 'unmoved' }, done: true });
	});

	it('is done even when only the OPPONENT’s rating moved', () => {
		// Not a shape play-api produces today (both seats move or neither does), but the poll must
		// terminate on `applied` regardless of which seats carry numbers.
		const half: GameRatingChange = {
			gameId: 'game-1',
			applied: true,
			white: { before: 1500, after: 1512.5 },
			black: null,
		};
		expect(ratingPollStep(half, 'Black')).toEqual({ outcome: { kind: 'unmoved' }, done: true });
	});
});

describe('ratingDeltaDisplay', () => {
	it('rounds the doubles the server sends — the modal showed 16 digits (#235)', () => {
		const shown = ratingDeltaDisplay({ before: 1775.6714474976957, after: 1797.2144251082318 });
		expect(shown.from).toBe(1776);
		expect(shown.to).toBe(1797);
	});

	it('derives the delta from the rounded pair, so the three numbers add up', () => {
		// The raw delta here is 21.54, which would round to 22 on its own and leave 1776 + 22 ≠ 1797.
		const shown = ratingDeltaDisplay({ before: 1775.6714474976957, after: 1797.2144251082318 });
		expect(shown.to - shown.from).toBe(shown.change);
		expect(shown.label).toBe('+21');
		expect(shown.tone).toBe('gain');
	});

	it('marks a drop as a loss and keeps the minus sign the number already carries', () => {
		const shown = ratingDeltaDisplay({ before: 1601.5, after: 1580.25 });
		expect(shown).toEqual({ from: 1602, to: 1580, change: -22, label: '-22', tone: 'loss' });
	});

	it('is neutral when the move rounds away — a red "(0)" would read as a loss', () => {
		const shown = ratingDeltaDisplay({ before: 1500.1, after: 1500.4 });
		expect(shown).toEqual({ from: 1500, to: 1500, change: 0, label: '±0', tone: 'none' });
	});
});

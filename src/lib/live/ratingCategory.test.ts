import { describe, expect, it } from 'vitest';
import type { TimeControl } from './liveTypes';
import {
	BLITZ_CEILING_SECONDS,
	BULLET_CEILING_SECONDS,
	MOVES_PER_SIDE,
	estimatedSeconds,
	ratingCategoryOf,
} from './ratingCategory';

/*
 * Pins the hand-mirrored copy of play-api's core/RatingCategory.scala (#258). The server's copy is
 * the single source of truth; these tests fix both boundaries FROM BOTH SIDES plus every
 * uncategorised case, so a drift between the two implementations is a red test here rather than a
 * leaderboard that quietly disagrees with a profile. If one of these fails after a server change,
 * the fix is to re-mirror ratingCategory.ts, never to bend the test.
 */
const fischer = (initial: number, increment: number): TimeControl => ({
	Fischer: { initialSeconds: initial, incrementSeconds: increment },
});
const suddenDeath = (initial: number): TimeControl => ({
	SuddenDeath: { initialSeconds: initial },
});

describe('estimatedSeconds', () => {
	it("estimates Fischer as initial + 7 × increment (the measured multiplier, not chess's 40)", () => {
		expect(MOVES_PER_SIDE).toBe(7);
		expect(estimatedSeconds(fischer(300, 3))).toBe(321);
		expect(estimatedSeconds(fischer(60, 1))).toBe(67);
	});

	it('estimates SuddenDeath as the initial budget alone', () => {
		expect(estimatedSeconds(suddenDeath(300))).toBe(300);
	});

	it('declares Unlimited, PerMove, and a missing control unbounded', () => {
		expect(estimatedSeconds({ Unlimited: {} })).toBeNull();
		expect(estimatedSeconds({ PerMove: { secondsPerMove: 30 } })).toBeNull();
		expect(estimatedSeconds(null)).toBeNull();
		expect(estimatedSeconds(undefined)).toBeNull();
	});
});

describe('ratingCategoryOf', () => {
	it('splits bullet from blitz at exactly 180 estimated seconds, from both sides', () => {
		expect(BULLET_CEILING_SECONDS).toBe(180);
		expect(ratingCategoryOf(suddenDeath(179))).toBe('bullet');
		expect(ratingCategoryOf(suddenDeath(180))).toBe('blitz');
		// The same boundary through the Fischer formula: 173 + 7×1 = 180.
		expect(ratingCategoryOf(fischer(172, 1))).toBe('bullet');
		expect(ratingCategoryOf(fischer(173, 1))).toBe('blitz');
	});

	it('splits blitz from rapid at exactly 480 estimated seconds, from both sides', () => {
		expect(BLITZ_CEILING_SECONDS).toBe(480);
		expect(ratingCategoryOf(suddenDeath(479))).toBe('blitz');
		expect(ratingCategoryOf(suddenDeath(480))).toBe('rapid');
		// Through the Fischer formula: 410 + 7×10 = 480.
		expect(ratingCategoryOf(fischer(409, 10))).toBe('blitz');
		expect(ratingCategoryOf(fischer(410, 10))).toBe('rapid');
	});

	it("places the bot catalog's 1 + 1 (67 s) in bullet and the ladder's 5 + 3 (321 s) in blitz", () => {
		expect(ratingCategoryOf(fischer(60, 1))).toBe('bullet');
		expect(ratingCategoryOf(fischer(300, 3))).toBe('blitz');
	});

	it('leaves Unlimited, PerMove, and a missing control uncategorised', () => {
		expect(ratingCategoryOf({ Unlimited: {} })).toBeNull();
		expect(ratingCategoryOf({ PerMove: { secondsPerMove: 30 } })).toBeNull();
		expect(ratingCategoryOf(null)).toBeNull();
		expect(ratingCategoryOf(undefined)).toBeNull();
	});
});

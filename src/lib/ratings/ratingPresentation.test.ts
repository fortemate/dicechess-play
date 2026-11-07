import { describe, expect, it } from 'vitest';
import {
	confidenceInterval,
	knownEpoch,
	orderingScore,
	ratingDate,
	sameRatingCutoff,
} from './ratingPresentation';

describe('public rating presentation', () => {
	it('compares equivalent ISO instants without collapsing nanosecond identities', () => {
		expect(sameRatingCutoff('2026-11-01T00:00:00Z', '2026-11-01T00:00:00.000Z')).toBe(true);
		expect(
			sameRatingCutoff('2026-11-01T00:00:00.123456789Z', '2026-11-01T01:00:00.123456789+01:00'),
		).toBe(true);
		expect(
			sameRatingCutoff('2026-11-01T00:00:00.000000001Z', '2026-11-01T00:00:00.000000002Z'),
		).toBe(false);
		expect(sameRatingCutoff('bad', 'bad')).toBe(false);
	});
	it('uses recorded bounds rather than silently recalculating an interval', () => {
		expect(confidenceInterval({ rating: 1800, rd: 50, ciLow: 1600, ciHigh: 1950 })).toEqual({
			low: 1600,
			high: 1950,
		});
	});
	it('converts legacy Glicko RD to approximate 95% bounds, not rating ± RD', () => {
		expect(confidenceInterval({ rating: 1800, rd: 50 })).toEqual({ low: 1702, high: 1898 });
	});
	it('does not invent bounds for missing/invalid RD, malformed bounds or an unknown algorithm', () => {
		for (const estimate of [
			{ rating: 1800 },
			{ rating: 1800, rd: -1 },
			{ rating: NaN, rd: 50 },
			{ rating: 1800, rd: 50, algorithm: 'unknown' },
			{ rating: 1800, rd: 50, ciLow: 2000, ciHigh: 1900 },
			{ rating: 1800, rd: 50, ciLow: 1700 },
		])
			expect(confidenceInterval(estimate)).toBeNull();
	});
	it('shows server ordering values and only uses the documented legacy fallback', () => {
		expect(orderingScore({ rating: 1800, rd: 50, orderingValue: 1725 })).toBe(1725);
		expect(orderingScore({ rating: 1800, rd: 50 })).toBe(1700);
		expect(orderingScore({ rating: 1800, rd: 50, orderingRule: 'other' })).toBeNull();
		expect(orderingScore({ rating: 1800, rd: 50, algorithm: 'other' })).toBeNull();
	});
	it('keeps unknown epochs unknown', () => {
		for (const value of [null, undefined, 0, -1, 1.5, NaN, '2'])
			expect(knownEpoch(value)).toBe(false);
		expect(knownEpoch(2)).toBe(true);
	});
	it('uses UTC and preserves distinct nanosecond cutoff labels', () => {
		expect(ratingDate('2026-11-01T01:00:00+01:00')).toContain('00:00:00');
		expect(ratingDate('2026-11-01T00:00:00.000001Z')).not.toBe(
			ratingDate('2026-11-01T00:00:00.000002Z'),
		);
		expect(ratingDate(null)).toBeNull();
		expect(ratingDate('bad')).toBeNull();
	});
});

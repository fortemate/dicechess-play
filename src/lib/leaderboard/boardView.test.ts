import { describe, expect, it } from 'vitest';
import {
	NEWCOMER_GAMES,
	barOf,
	displayName,
	isNewcomer,
	rangeOf,
	ranksAt,
	savedDay,
	scaleMiddle,
	scaleOf,
	searchRows,
	updatedAt,
} from './boardView';

const row = (rating: number, rd: number, extra: Record<string, unknown> = {}) => ({
	rating,
	rd,
	...extra,
});

describe('the range and the ranking number of a row', () => {
	it('prefers the bounds the server sends', () => {
		expect(rangeOf(row(2337, 45, { ciLow: 2248, ciHigh: 2426 }))).toEqual({
			low: 2248,
			high: 2426,
		});
	});

	it('falls back to the documented Glicko-2 conversion, and to nothing for another algorithm', () => {
		const range = rangeOf(row(2000, 50))!;
		expect(range.low).toBeCloseTo(1902);
		expect(range.high).toBeCloseTo(2098);
		expect(rangeOf(row(2000, 50, { algorithm: 'other' }))).toBeNull();
	});

	it('keeps the number the server ordered by', () => {
		expect(ranksAt(row(2337, 45, { orderingValue: 2246 }))).toBe(2246);
		expect(ranksAt(row(2000, 50))).toBe(1900);
	});
});

describe('one scale for the bars of a table', () => {
	const rows = [
		row(2337, 45, { ciLow: 2248, ciHigh: 2426 }),
		row(2229, 45, { ciLow: 2141, ciHigh: 2317 }),
	];

	it('runs from the lowest low end to the highest high end, widened to round numbers', () => {
		expect(scaleOf(rows)).toEqual({ min: 2140, max: 2430 });
		expect(scaleMiddle({ min: 2140, max: 2430 })).toBe(2285);
	});

	it('leaves a row without a range out, and has no scale when no row has one', () => {
		const odd = row(9999, 45, { ciLow: 5, ciHigh: 1 });
		expect(scaleOf([...rows, odd])).toEqual({ min: 2140, max: 2430 });
		expect(scaleOf([odd])).toBeNull();
		expect(scaleOf([])).toBeNull();
	});

	it('still has a width for a single point', () => {
		expect(scaleOf([row(2000, 0)])).toEqual({ min: 1995, max: 2005 });
	});

	it('places a bar and its dot in percent of the scale', () => {
		const scale = { min: 2000, max: 2400 };
		expect(barOf(row(2300, 0, { ciLow: 2100, ciHigh: 2400 }), scale)).toEqual({
			start: 25,
			width: 75,
			dot: 75,
		});
	});

	it('steps the left ends down the table as the places do', () => {
		const scale = scaleOf(rows)!;
		expect(barOf(rows[0], scale)!.start).toBeGreaterThan(barOf(rows[1], scale)!.start);
	});

	it('never draws outside the scale, and draws nothing without a range or a scale', () => {
		const bar = barOf(row(2500, 0, { ciLow: 1900, ciHigh: 2600 }), { min: 2000, max: 2400 })!;
		expect(bar).toEqual({ start: 0, width: 100, dot: 100 });
		expect(barOf(row(2000, 50, { algorithm: 'other' }), { min: 0, max: 1 })).toBeNull();
		expect(barOf(row(2000, 50), null)).toBeNull();
	});
});

describe('search by name', () => {
	const rows = [
		{ kind: 'bot' as const, team: 'acme', name: 'Cedar-4', rank: 1 },
		{ kind: 'player' as const, team: null, name: 'RollingDice', rank: 2 },
		{ kind: 'bot' as const, team: 'birch', name: 'larch-1', rank: 3 },
	];

	it('writes a bot by its team and name, a person by the nickname', () => {
		expect(rows.map(displayName)).toEqual(['acme Cedar-4', 'RollingDice', 'birch larch-1']);
	});

	it('ignores case and outer spaces, and searches the team too', () => {
		expect(searchRows(rows, '  cedar ').map((r) => r.rank)).toEqual([1]);
		expect(searchRows(rows, 'DICE').map((r) => r.rank)).toEqual([2]);
		expect(searchRows(rows, 'birch').map((r) => r.rank)).toEqual([3]);
	});

	it('keeps the order and the places of the server, and everything for an empty search', () => {
		expect(searchRows(rows, 'c').map((r) => r.rank)).toEqual([1, 2, 3]);
		expect(searchRows(rows, '   ')).toEqual(rows);
		expect(searchRows(rows, 'nobody')).toEqual([]);
	});
});

describe('newcomers and dates', () => {
	it('tags a row below the threshold of rated games', () => {
		expect(isNewcomer({ games: NEWCOMER_GAMES - 1 })).toBe(true);
		expect(isNewcomer({ games: NEWCOMER_GAMES })).toBe(false);
	});

	it('writes the update to the minute, in UTC, without the fraction the server sends', () => {
		expect(updatedAt('2026-11-27T07:15:42.344971Z')).toBe('27 Nov 2026, 07:15');
		expect(updatedAt('2026-11-27T09:15:00+02:00')).toBe('27 Nov 2026, 07:15');
		expect(savedDay('2026-11-20T23:59:59Z')).toBe('20 Nov 2026');
	});

	it('says nothing when the server does not say or the value is not a date', () => {
		expect(updatedAt(null)).toBeNull();
		expect(updatedAt('yesterday')).toBeNull();
		expect(savedDay(undefined)).toBeNull();
	});
});

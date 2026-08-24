import { describe, expect, it } from 'vitest';
import {
	DATE_LOCALE,
	formatDate,
	formatGameResult,
	formatWholeNumber,
	RATING_LOCALE,
} from './formatters';

describe('formatters', () => {
	describe('exported locale constants', () => {
		it('exports RATING_LOCALE and DATE_LOCALE', () => {
			expect(RATING_LOCALE).toBe('en-US');
			expect(DATE_LOCALE).toBe('en-GB');
		});
	});

	describe('formatWholeNumber', () => {
		it('formats numbers without fraction digits using en-US locale formatting', () => {
			expect(formatWholeNumber(0)).toBe('0');
			expect(formatWholeNumber(1200)).toBe('1,200');
			expect(formatWholeNumber(2500)).toBe('2,500');
			expect(formatWholeNumber(1500.6)).toBe('1,501');
		});
	});

	describe('formatDate', () => {
		it('returns "Unknown Date" for null, undefined, or invalid date strings', () => {
			expect(formatDate(null)).toBe('Unknown Date');
			expect(formatDate(undefined)).toBe('Unknown Date');
			expect(formatDate('invalid-date')).toBe('Unknown Date');
		});

		it('formats valid ISO date strings using en-GB date locale', () => {
			const formatted = formatDate('2025-01-15T14:30:00Z');
			expect(formatted).not.toBe('Unknown Date');
			expect(formatted).toContain('2025');
			expect(formatted).toContain('Jan');
			expect(formatted).toContain('15');
		});
	});

	describe('formatGameResult', () => {
		it.each([
			[1, '1-0 • White wins'],
			[-1, '0-1 • Black wins'],
			[0, '½-½ • Draw'],
			[null, ''],
			[undefined, ''],
			[2, ''],
			[-2, ''],
			[999, ''],
		])('formats %s as %s', (result, expected) => {
			expect(formatGameResult(result)).toBe(expected);
		});
	});
});

import { describe, it, expect } from 'vitest';
import { formatGameResult } from './formatters';

describe('formatters', () => {
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

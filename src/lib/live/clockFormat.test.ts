import { describe, it, expect } from 'vitest';
import { formatClock, isLowTime } from './clockFormat';

describe('formatClock', () => {
	it('shows m:ss above ten seconds', () => {
		expect(formatClock(180_000)).toBe('3:00');
		expect(formatClock(65_000)).toBe('1:05');
		expect(formatClock(10_000)).toBe('0:10');
	});

	it('shows tenths under ten seconds', () => {
		expect(formatClock(9_400)).toBe('9.4');
		expect(formatClock(500)).toBe('0.5');
	});

	it('floors tenths so it never rounds up to 10.0', () => {
		expect(formatClock(9_990)).toBe('9.9');
		expect(formatClock(9_950)).toBe('9.9');
	});

	it('clamps negatives to zero', () => {
		expect(formatClock(-1_000)).toBe('0.0');
		expect(formatClock(0)).toBe('0.0');
	});
});

describe('isLowTime', () => {
	it('flags ten seconds and under', () => {
		expect(isLowTime(10_000)).toBe(true);
		expect(isLowTime(5_000)).toBe(true);
		expect(isLowTime(10_001)).toBe(false);
	});
});

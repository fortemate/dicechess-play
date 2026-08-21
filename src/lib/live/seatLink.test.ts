import { describe, it, expect } from 'vitest';
import { buildJoinUrl, parseSeat, resolveSeats } from './seatLink';
import type { SeatToken } from './liveTypes';

describe('seatLink', () => {
	it('builds a join URL with token and colour', () => {
		expect(buildJoinUrl('https://play.example', 'g1', 'tok-123', 'Black')).toBe(
			'https://play.example/live/g1?seat=tok-123&as=black',
		);
	});

	it('parses token and colour from a URL', () => {
		expect(parseSeat(new URL('https://x/live/g1?seat=tok&as=white'))).toEqual({
			token: 'tok',
			as: 'white',
		});
	});

	it('treats a tokenless URL as a spectator', () => {
		expect(parseSeat(new URL('https://x/live/g1'))).toEqual({ token: null, as: null });
	});

	it('ignores an invalid colour', () => {
		expect(parseSeat(new URL('https://x/live/g1?seat=t&as=purple'))).toEqual({
			token: 't',
			as: null,
		});
	});

	describe('resolveSeats', () => {
		const white: SeatToken = { seat: 'White', token: 'white-tok' };
		const black: SeatToken = { seat: 'Black', token: 'black-tok' };

		it('keeps White and hands over Black when White is preferred', () => {
			expect(resolveSeats('White', white, black)).toEqual({ mine: white, theirs: black });
		});

		it('keeps Black and hands over White when Black is preferred', () => {
			expect(resolveSeats('Black', white, black)).toEqual({ mine: black, theirs: white });
		});

		it('resolves random via the injected picker — White branch', () => {
			expect(resolveSeats('random', white, black, () => 'White')).toEqual({
				mine: white,
				theirs: black,
			});
		});

		it('resolves random via the injected picker — Black branch', () => {
			expect(resolveSeats('random', white, black, () => 'Black')).toEqual({
				mine: black,
				theirs: white,
			});
		});
	});
});

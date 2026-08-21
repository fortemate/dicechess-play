import type { Seat, SeatToken } from './liveTypes';

// The share link a creator hands to the opponent: it carries the seat's opaque join token plus
// the colour, so the joining tab knows its orientation without an extra round-trip. The token is
// the credential; the colour is advisory — the server validates every move regardless.

export function buildJoinUrl(origin: string, gameId: string, token: string, seat: Seat): string {
	// Use the URL API so origin edge cases (trailing slash) and encoding are handled correctly.
	const url = new URL(`/live/${gameId}`, origin);
	url.searchParams.set('seat', token);
	url.searchParams.set('as', seat === 'White' ? 'white' : 'black');
	return url.toString();
}

export interface ParsedSeat {
	/** The join token, or null for a (tokenless) spectator. */
	token: string | null;
	/** The seat colour from the link, or null if absent/invalid. */
	as: 'white' | 'black' | null;
}

export function parseSeat(url: URL): ParsedSeat {
	const token = url.searchParams.get('seat');
	const asRaw = url.searchParams.get('as');
	const as = asRaw === 'white' || asRaw === 'black' ? asRaw : null;
	return { token, as };
}

/**
 * Splits a freshly created game's two seat tokens into "mine" and "theirs" for the friend-invite
 * flow. Both seats are already registered to the creator's guest id — colour choice is purely
 * local bookkeeping over which token the creator keeps vs. hands to the friend, no extra request.
 * `pickRandom` is injectable so callers (and tests) don't depend on real randomness.
 */
export function resolveSeats(
	preferred: Seat | 'random',
	white: SeatToken,
	black: SeatToken,
	pickRandom: () => Seat = () => (Math.random() < 0.5 ? 'White' : 'Black'),
): { mine: SeatToken; theirs: SeatToken } {
	const seat = preferred === 'random' ? pickRandom() : preferred;
	return seat === 'White' ? { mine: white, theirs: black } : { mine: black, theirs: white };
}

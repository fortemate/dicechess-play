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

/** The `?spectate=1` marker: an explicit, deliberate request to watch rather than play. */
export const SPECTATE_PARAM = 'spectate';

/**
 * The link a follower opens on a rematch (ADR 007 / rematch-v1). It carries no credential — the
 * marker is the whole point: a tokenless URL alone is NOT a spectator guarantee, because a
 * signed-in participant who lost their `?seat=` link is deliberately restored to their seat from
 * the session (play-api #235). Watching a chain must never do that, so the intent is stated.
 */
export function buildSpectateUrl(origin: string, gameId: string): string {
	const url = new URL(`/live/${gameId}`, origin);
	url.searchParams.set(SPECTATE_PARAM, '1');
	return url.toString();
}

export interface ParsedSeat {
	/** The join token, or null for a (tokenless) spectator. */
	token: string | null;
	/** The seat colour from the link, or null if absent/invalid. */
	as: 'white' | 'black' | null;
	/** True when the link explicitly asks to watch read-only, whatever else it carries. */
	spectate: boolean;
}

export function parseSeat(url: URL): ParsedSeat {
	const spectate = url.searchParams.get(SPECTATE_PARAM) === '1';
	const asRaw = url.searchParams.get('as');
	const as = asRaw === 'white' || asRaw === 'black' ? asRaw : null;
	// Explicit spectator mode outranks a seat token in the same URL, exactly as it outranks the
	// account session server-side: one link cannot both watch and claim.
	const token = spectate ? null : url.searchParams.get('seat');
	return { token, as: spectate ? null : as, spectate };
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

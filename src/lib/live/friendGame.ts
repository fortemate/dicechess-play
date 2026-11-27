/**
 * Creating a game with a friend, by link (#256, #258).
 *
 * Two pages start such a game, the friend tab of Play and the older `/live` setup, and both must
 * do exactly the same: one request, the creator straight to their own board, and the link for the
 * friend handed over through session storage (`friendInvite.ts`), never through the address. The
 * board's address is what people copy, and it must carry no seat but the creator's own.
 *
 * Both seats of the game are registered to the creator, so the "colour choice" is only which of
 * the two seat tokens the creator keeps. A random colour is resolved here, when the game is
 * created, not when the friend joins. For the same reason a game by link is always casual.
 */
import { getGuestUuid } from '#lib/ingest/guestIdentity.js';
import { rememberFriendInvite } from './friendInvite';
import { createGame } from './liveApi';
import type { Seat, TimeControl } from './liveTypes';
import { buildJoinUrl, resolveSeats } from './seatLink';

export type FriendColor = Seat | 'random';

/** The setup panel speaks of three colours; `resolveSeats` takes a seat or 'random'. */
export const FRIEND_COLOR_VALUES = { random: 'random', white: 'White', black: 'Black' } as const;

/**
 * Create the game and return the address of the creator's own board. Throws when the server
 * cannot be reached or answers without both seats; the caller shows one plain message for both.
 */
export async function createFriendGame(
	timeControl: TimeControl | null,
	color: FriendColor,
	origin: string,
): Promise<string> {
	const guest = getGuestUuid();
	const res = await createGame(guest, guest, timeControl);
	const white = res.tokens.find((t) => t.seat === 'White');
	const black = res.tokens.find((t) => t.seat === 'Black');
	if (!white || !black) throw new Error('Server did not return both seat tokens');
	const { mine, theirs } = resolveSeats(color, white, black);
	rememberFriendInvite(res.gameId, buildJoinUrl(origin, res.gameId, theirs.token, theirs.seat));
	return buildJoinUrl(origin, res.gameId, mine.token, mine.seat);
}

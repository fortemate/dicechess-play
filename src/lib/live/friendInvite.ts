// The invitation link of the game by link that this browser created most recently, so the board
// can show it (#256).
//
// It exists because of where the link is born. Creating a game returns BOTH seat tokens to the
// creator; the board's own address carries only the creator's. Since #256 the creator goes
// straight from "Create game" to the board, so the link for the friend has to travel with them,
// and it must not travel in the address bar: that address is what people copy and share, and a
// seat token in it would hand the friend's seat to whoever reads it.
//
// One slot in `sessionStorage`, keyed by the game it belongs to and read back only for that same
// game: it lives as long as the tab, survives a reload of the board, and is never offered on
// another game. Storage that is unavailable (a privacy mode) means no card on the board, never
// an error: the creator can still resign and create another game.

const KEY = 'dicechess-play-friend-invite';

interface FriendInvite {
	gameId: string;
	url: string;
}

function read(): FriendInvite | null {
	try {
		const raw = sessionStorage.getItem(KEY);
		if (!raw) return null;
		const value: unknown = JSON.parse(raw);
		if (typeof value !== 'object' || value === null) return null;
		const { gameId, url } = value as Record<string, unknown>;
		return typeof gameId === 'string' && typeof url === 'string' ? { gameId, url } : null;
	} catch {
		return null;
	}
}

/** Keeps the link to send for `gameId`, replacing the one of an earlier game. */
export function rememberFriendInvite(gameId: string, url: string): void {
	try {
		sessionStorage.setItem(KEY, JSON.stringify({ gameId, url }));
	} catch {
		// No storage: the board simply will not show the link.
	}
}

/** The link to send for `gameId`, if this tab created that game and has not let go of it. */
export function recallFriendInvite(gameId: string): string | null {
	const invite = read();
	return invite?.gameId === gameId ? invite.url : null;
}

/** Lets go of the link of `gameId`: the friend has moved, or the creator hid the card. */
export function forgetFriendInvite(gameId: string): void {
	try {
		if (read()?.gameId === gameId) sessionStorage.removeItem(KEY);
	} catch {
		// Nothing to forget.
	}
}

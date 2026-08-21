import type { Players, PublicPlayer, Seat, Seek } from './liveTypes';

// Who the user is looking at: pure display helpers over the server's public player identities
// (PublicGameState.players / Seek.kind+name).
//
// A `name` means the server chose to identify that participant: a bot by its team-qualified name, a
// registered player by nickname (#194 step 4). Absence means anonymity — a guest — and it is a promise,
// not missing data, so every helper here treats `null` as "do not name this person" rather than as a
// value to go looking for.

/** The seat's public face from the game state, when the server sent one. */
export function publicPlayer(players: Players | null | undefined, seat: Seat): PublicPlayer | null {
	if (!players) return null;
	return seat === 'White' ? players.white : players.black;
}

/**
 * Board-strip name for a seat: a named participant (a bot) shows its name; anonymous humans stay
 * "You"/"Opponent" from the player's point of view, or the bare seat for spectators.
 */
export function seatDisplayName(
	players: Players | null | undefined,
	seat: Seat,
	bottomSeat: Seat,
	spectator: boolean,
): string {
	const name = publicPlayer(players, seat)?.name;
	if (name) return name;
	if (spectator) return seat;
	return seat === bottomSeat ? 'You' : 'Opponent';
}

/** Board-strip rating for a seat (play-api #290): `undefined` when the server didn't send one —
 * no persistence, a guest, or an unrated participant — which must render as nothing, never 0/"?". */
export function seatRating(players: Players | null | undefined, seat: Seat): number | undefined {
	return publicPlayer(players, seat)?.rating;
}

/** Board-strip subtitle: what kind of participant sits there ("bot" for bots, the old labels otherwise). */
export function seatDisplaySub(
	players: Players | null | undefined,
	seat: Seat,
	spectator: boolean,
): string {
	const face = publicPlayer(players, seat);
	// A named human is a registered player, not a guest — calling them "guest" would be plainly wrong now
	// that accounts exist. Only an unnamed human is one.
	const who = face?.kind === 'Bot' ? 'bot' : face?.name ? 'player' : spectator ? 'live' : 'guest';
	return `${who} · ${seat.toLowerCase()}`;
}

/** Lobby-row label for who is offering a seek. */
export function seekOffer(seek: Seek): { name: string; bot: boolean } {
	const bot = seek.kind === 'Bot';
	return { name: seek.name ?? 'Anonymous player', bot };
}

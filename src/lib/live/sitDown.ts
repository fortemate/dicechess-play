/**
 * Sitting down at an open table (#258, #259): accepting a seek, and what the answer means to
 * the visitor.
 *
 * Three outcomes matter, and every list of tables tells them apart the same way:
 *
 *   - seated: the address of the visitor's own board. The server draws the seats when the
 *     table is taken, so the address carries whichever seat it gave (never assume a colour);
 *   - `refused`: a rated table and a visitor who is not signed in (play-api #279). The table
 *     is still standing, so "just taken" would be wrong: the only way in is to sign in;
 *   - `taken`: someone else was faster, or the table has expired. The caller reads the
 *     tables again.
 */
import { getGuestUuid } from '#lib/ingest/guestIdentity.js';
import { acceptSeek, SeekAcceptError } from './lobbyApi';
import { buildJoinUrl } from './seatLink';

export type SitDownResult = { boardUrl: string } | 'refused' | 'taken';

export async function sitDown(seekId: string, origin: string): Promise<SitDownResult> {
	try {
		const match = await acceptSeek(seekId, getGuestUuid());
		return { boardUrl: buildJoinUrl(origin, match.gameId, match.token, match.seat) };
	} catch (e) {
		return e instanceof SeekAcceptError && e.status === 403 ? 'refused' : 'taken';
	}
}

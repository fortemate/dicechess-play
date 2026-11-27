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
 *     tables again;
 *   - `failed`: the request did not get through, or the server answered something else. The
 *     table may well be standing, so the visitor is asked to try again, not to pick another.
 */
import { getGuestUuid } from '#lib/ingest/guestIdentity.js';
import { acceptSeek, SeekAcceptError } from './lobbyApi';
import { buildJoinUrl } from './seatLink';

export type SitDownResult = { boardUrl: string } | 'refused' | 'taken' | 'failed';

export async function sitDown(seekId: string, origin: string): Promise<SitDownResult> {
	try {
		const match = await acceptSeek(seekId, getGuestUuid());
		return { boardUrl: buildJoinUrl(origin, match.gameId, match.token, match.seat) };
	} catch (e) {
		if (!(e instanceof SeekAcceptError)) return 'failed';
		if (e.status === 403) return 'refused';
		// The server says the seek is not there (expired) or already matched.
		return e.status === 404 || e.status === 409 ? 'taken' : 'failed';
	}
}

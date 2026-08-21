import { apiBase } from './liveApi';
import type { CreatedSeek, LiveGames, Seek, SeekMatch, SeekState, TimeControl } from './liveTypes';

// REST client for the lobby (polling). The list is polled while browsing; a creator polls its seek's
// status until matched. All anonymous — the guest id seats the player, the secret gates the creator's match.

/** The open seeks, for the lobby list. */
export async function listSeeks(): Promise<Seek[]> {
	const res = await fetch(`${apiBase()}/lobby/seeks`);
	if (!res.ok) throw new Error(`listSeeks failed: ${res.status}`);
	return (await res.json()) as Seek[];
}

/** The live games (most action first, capped server-side) — the lobby's board-wall tiles. */
export async function listGames(): Promise<LiveGames> {
	const res = await fetch(`${apiBase()}/games`);
	if (!res.ok) throw new Error(`listGames failed: ${res.status}`);
	return (await res.json()) as LiveGames;
}

/** Post an open seek; returns its id + the creator's secret. The eventual seat is decided at accept
 * time (randomly) — poll status for it, never assume White.
 *
 * `rated` is required rather than defaulted (play-api #279): a forgotten argument silently producing a
 * casual game is exactly the failure #279 existed to remove, so the caller must state its intent. Only
 * a signed-in creator can actually get a rated seek — play-api degrades the flag for a guest.
 */
export async function createSeek(
	creator: string,
	timeControl: TimeControl | null,
	rated: boolean,
): Promise<CreatedSeek> {
	const body: { creator: string; rated: boolean; timeControl?: TimeControl } = { creator, rated };
	if (timeControl) body.timeControl = timeControl;
	const res = await fetch(`${apiBase()}/lobby/seeks`, {
		method: 'POST',
		// Session-aware since #235: the session wins, `creator`/`accepter` is the guest fallback. See
		// `liveApi.createGame` for why omitting the cookie silently seats an account as a guest.
		credentials: 'include',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`createSeek failed: ${res.status}`);
	return (await res.json()) as CreatedSeek;
}

/** Poll a seek's status with the creator's secret; refreshes its liveness server-side. */
export async function seekStatus(id: string, secret: string): Promise<SeekState> {
	const res = await fetch(`${apiBase()}/lobby/seeks/${id}?secret=${encodeURIComponent(secret)}`);
	if (!res.ok) throw new Error(`seekStatus failed: ${res.status}`);
	return (await res.json()) as SeekState;
}

/** Thrown by `acceptSeek` so the caller can tell apart the one failure whose honest answer is NOT
 * "someone beat you to it". Every other status means the offer is gone (claimed, expired, unknown), but
 * a **403** means the seek is rated and this visitor is anonymous (play-api #279) — the table is still
 * standing and the fix is to sign in, so presenting it as taken would send the visitor hunting for
 * another row that will refuse them just the same.
 */
export class SeekAcceptError extends Error {
	constructor(public readonly status: number) {
		super(`acceptSeek failed: ${status}`);
	}
}

/** Accept an open seek; returns the game id, the accepter's seat token, and the seat it names (randomly
 * assigned server-side — never assume Black).
 */
export async function acceptSeek(id: string, accepter: string): Promise<SeekMatch> {
	const res = await fetch(`${apiBase()}/lobby/seeks/${id}/accept`, {
		method: 'POST',
		// Session-aware since #235: the session wins, `creator`/`accepter` is the guest fallback. See
		// `liveApi.createGame` for why omitting the cookie silently seats an account as a guest.
		credentials: 'include',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ accepter }),
	});
	if (!res.ok) throw new SeekAcceptError(res.status);
	return (await res.json()) as SeekMatch;
}

/** Cancel the creator's own seek (best-effort; the server's TTL also reaps it). */
export async function cancelSeek(id: string, secret: string): Promise<void> {
	await fetch(`${apiBase()}/lobby/seeks/${id}?secret=${encodeURIComponent(secret)}`, {
		method: 'DELETE',
	});
}

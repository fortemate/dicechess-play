// Transport for play-api's `/auth/*` surface (ADR-0017). Rune-free on purpose, like `liveClient.ts`:
// the store owns reactive state, this module only speaks HTTP.
//
// The session is an HttpOnly cookie set by play-api on its own host, so **the SPA never sees a
// token** and cannot construct one. Two consequences shape every call here:
//
//   - `credentials: 'include'` is required, and is added ONLY on these calls plus the ones that
//     genuinely need a session (game start, `/me/*` history). Public reads stay credential-less so
//     they keep working against a play-api whose `PLAY_CORS_ORIGINS` is the permissive default —
//     credentialed mode requires an explicit origin allow-list on the server.
//   - Login cannot be a `fetch`: it is a full-page navigation to `{API}/auth/login`, which 303s to
//     Google and eventually 303s back to this site with the cookie set. An XHR would follow the
//     redirect chain in the background and drop the user nowhere.
//
// Every function here reports failure as a value rather than throwing, mirroring the ingest path's
// classification idiom: a 401 is the normal "not signed in" answer on a public site, not an error,
// and a nickname 409 is a routine outcome the UI must render inline.

import { apiBase } from '$lib/live/liveApi';
import type { CategoryRating } from '$lib/leaderboard/leaderboardApi';

/** play-api's `MeResponse` (per-category since play-api #280 phase 2). */
export interface Me {
	id: string;
	nickname: string;
	/** The scalar rating fields describe the DEFAULT category (blitz) since play-api #280 phase 2 —
	 * or the fresh 1500/350/provisional state when blitz was never played. `ratings` is the honest
	 * per-category view; an unplayed category is absent from it, not 1500. */
	rating: number;
	rd: number;
	/** True until the deviation converges; the public leaderboard hides provisional accounts. */
	provisional: boolean;
	/** Rated, decided games in the default category — pairs with the scalar rating above. */
	games: number;
	/** One entry per PLAYED category, bullet→blitz→rapid — the same `CategoryRating` the public
	 * profiles carry, so one component renders both. */
	ratings: CategoryRating[];
	/** Server-derived membership in the live `PLAY_ADMINS` allowlist; never infer this from nickname. */
	admin: boolean;
}

/** Guest ids this account has claimed, oldest first — bare uuids, without the `guest:` prefix. */
export interface ClaimedGuests {
	guests: string[];
}

export type MeResult =
	{ outcome: 'signed-in'; me: Me } | { outcome: 'signed-out' } | { outcome: 'unavailable' };

export type NicknameResult =
	| { outcome: 'updated'; me: Me }
	| { outcome: 'taken' }
	| { outcome: 'invalid'; reason: string }
	| { outcome: 'signed-out' }
	| { outcome: 'unavailable' };

export type ClaimResult =
	| { outcome: 'linked'; guests: string[] }
	| { outcome: 'claimed-by-another' }
	| { outcome: 'invalid'; reason: string }
	| { outcome: 'signed-out' }
	| { outcome: 'unavailable' };

export type DeleteResult =
	| { outcome: 'deleted' }
	| { outcome: 'invalid'; reason: string }
	| { outcome: 'signed-out' }
	| { outcome: 'unavailable' };

/** Whether accounts are reachable at all — same switch as live play, since both need play-api. */
export function isAuthEnabled(): boolean {
	return apiBase() !== '';
}

/**
 * Where to send the browser to sign in. A full-page assignment to this URL is the whole login flow;
 * play-api redirects back to `PLAY_FRONTEND_URL` once the session cookie is set.
 */
export function loginUrl(): string {
	return `${apiBase()}/auth/login`;
}

async function readJson<T>(res: Response): Promise<T | null> {
	try {
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

/** The plain-text body play-api sends with a 4xx, used verbatim as the inline reason. */
async function readText(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.text()).trim();
		return body === '' ? fallback : body;
	} catch {
		return fallback;
	}
}

/**
 * The signed-in account, if any. `signed-out` is the expected answer for most visitors — the site is
 * anonymous-first — while `unavailable` means the request never got an answer (offline, play-api
 * down, or auth not configured on that deployment, which answers 404). The caller treats both
 * non-signed-in cases the same way; they are distinguished so the UI can avoid claiming someone is
 * signed out when it simply could not ask.
 */
export async function fetchMe(): Promise<MeResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${apiBase()}/auth/me`, { credentials: 'include' });
	} catch {
		return { outcome: 'unavailable' };
	}
	if (res.status === 401) return { outcome: 'signed-out' };
	if (!res.ok) return { outcome: 'unavailable' };
	const me = await readJson<Me>(res);
	return me ? { outcome: 'signed-in', me } : { outcome: 'unavailable' };
}

/** Rename. Format rules are play-api's; a 409 means the nickname is taken by another account. */
export async function updateNickname(nickname: string): Promise<NicknameResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${apiBase()}/auth/me`, {
			method: 'PATCH',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ nickname }),
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	if (res.status === 401) return { outcome: 'signed-out' };
	if (res.status === 409) return { outcome: 'taken' };
	if (res.status === 400)
		return { outcome: 'invalid', reason: await readText(res, 'invalid nickname') };
	if (!res.ok) return { outcome: 'unavailable' };
	const me = await readJson<Me>(res);
	return me ? { outcome: 'updated', me } : { outcome: 'unavailable' };
}

/** The guest ids this account has claimed. */
export async function fetchClaimedGuests(): Promise<
	{ outcome: 'ok'; guests: string[] } | { outcome: 'signed-out' } | { outcome: 'unavailable' }
> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${apiBase()}/auth/me/guests`, { credentials: 'include' });
	} catch {
		return { outcome: 'unavailable' };
	}
	if (res.status === 401) return { outcome: 'signed-out' };
	if (!res.ok) return { outcome: 'unavailable' };
	const body = await readJson<ClaimedGuests>(res);
	return body ? { outcome: 'ok', guests: body.guests } : { outcome: 'unavailable' };
}

/**
 * Link this browser's guest identity to the account, so past anonymous games join the owner's own
 * history. Takes the BARE uuid — play-api's `Principal.guest` prepends `guest:` itself, and passing
 * the already-prefixed form double-prefixes it. Use `getGuestUuid()`, never `getGuestId()`.
 *
 * First-writer-wins and terminal: `claimed-by-another` is final, because one guest identity belongs
 * to at most one account forever.
 */
export async function claimGuest(guestUuid: string): Promise<ClaimResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${apiBase()}/auth/me/guests`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ guestId: guestUuid }),
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	if (res.status === 401) return { outcome: 'signed-out' };
	if (res.status === 409) return { outcome: 'claimed-by-another' };
	if (res.status === 400)
		return { outcome: 'invalid', reason: await readText(res, 'invalid guest id') };
	if (!res.ok) return { outcome: 'unavailable' };
	const body = await readJson<ClaimedGuests>(res);
	return body ? { outcome: 'linked', guests: body.guests } : { outcome: 'unavailable' };
}

/**
 * End the session. Best-effort by design: the cookie is cleared by play-api's response, but a failed
 * request must not leave the UI stuck as signed-in — the caller clears local state either way, and
 * the next `fetchMe` is the source of truth.
 */
export async function logout(): Promise<void> {
	if (!isAuthEnabled()) return;
	try {
		await fetch(`${apiBase()}/auth/logout`, { method: 'POST', credentials: 'include' });
	} catch {
		// Deliberately swallowed — see the doc comment.
	}
}

/**
 * Delete the account. `confirm` must echo the current nickname; play-api uses it as a guard against
 * a mis-wired client deleting the wrong account, so the UI must ask the person to type it.
 *
 * Game history is NOT rewritten: the `user:<uuid>` left in past records simply stops resolving.
 */
export async function deleteAccount(confirm: string): Promise<DeleteResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${apiBase()}/auth/me`, {
			method: 'DELETE',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ confirm }),
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	if (res.status === 401) return { outcome: 'signed-out' };
	if (res.status === 400)
		return { outcome: 'invalid', reason: await readText(res, 'confirmation did not match') };
	if (!res.ok) return { outcome: 'unavailable' };
	return { outcome: 'deleted' };
}

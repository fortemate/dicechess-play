import type { CreateGameResponse, PublicGameState, TimeControl } from './liveTypes';

// REST + WebSocket-URL helpers against play-api. The base URL is configured via VITE_PLAY_API_URL;
// when empty, live play is disabled (and so is finished-game recording — see ingest/ingestClient.ts,
// which shares this base). Read at call time so it is easy to stub in tests.

export function apiBase(): string {
	return (import.meta.env.VITE_PLAY_API_URL as string | undefined) ?? '';
}

/** Whether a play-api base URL is configured (live play available). */
export function isLiveEnabled(): boolean {
	return apiBase() !== '';
}

/**
 * Create a game; returns the game id, the dice commitment, and a join token per seat. A `timeControl`
 * is sent only when given — omitting it lets the server default to Unlimited.
 */
export async function createGame(
	white: string,
	black: string,
	timeControl?: TimeControl | null,
): Promise<CreateGameResponse> {
	const body: { white: string; black: string; timeControl?: TimeControl } = { white, black };
	if (timeControl) body.timeControl = timeControl;
	const res = await fetch(`${apiBase()}/games`, {
		method: 'POST',
		// `credentials: 'include'` because #235 made this path session-aware: the session WINS and the body's
		// guest id is only the anonymous fallback. Without the cookie the server sees no session, seats the
		// account as a guest, and the game is recorded under `guest:<uuid>` — so the account's history stays
		// empty and its rating never moves, which is exactly what production showed before this.
		credentials: 'include',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`createGame failed: ${res.status}`);
	return (await res.json()) as CreateGameResponse;
}

/** Fetch the current public state of a game (e.g. before connecting, or for a spectator). */
export async function getState(id: string): Promise<PublicGameState> {
	const res = await fetch(`${apiBase()}/games/${id}`);
	if (!res.ok) throw new Error(`getState failed: ${res.status}`);
	return (await res.json()) as PublicGameState;
}

/** The WebSocket URL for a game; pass the seat token to play, or null to spectate.
 *
 * `guest` is our anonymous identity, and it is what makes a friend-by-link game have two players
 * (play-api #285). Both seats of such a game start held by the SAME id — the creator's, because a
 * friend is authorized by possessing a seat token rather than by being named — so until the joiner
 * says who they are, the game is recorded as the creator playing themselves and neither player finds
 * it in their history afterwards. Redeeming the token is the only moment to say it, and a handshake
 * has no body to put it in, hence a query param.
 *
 * Only sent alongside a token: a spectator claims nothing, and the server only looks at it on the
 * seated path. A signed-in visitor's session wins over it server-side, so it is harmless to send.
 */
export function wsUrl(id: string, token: string | null, guest: string | null = null): string {
	const base = apiBase().replace(/^http/, 'ws');
	// Built by hand rather than with URLSearchParams on purpose: that encodes a space as `+`, and this
	// is a live path whose escaping should not change as a side effect of adding a parameter.
	const parts: string[] = [];
	if (token) parts.push(`token=${encodeURIComponent(token)}`);
	if (token && guest) parts.push(`guest=${encodeURIComponent(guest)}`);
	const query = parts.length > 0 ? `?${parts.join('&')}` : '';
	return `${base}/games/${id}/ws${query}`;
}

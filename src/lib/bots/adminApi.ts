// Transport for the administrator's `/admin/bots` surface (#243). This module deliberately stays
// rune-free: it mirrors play-api's HTTP contract while `adminBotsStore` owns reactive inventory
// state and `AdminBotCard` keeps a rotated plaintext token component-local.
//
// The session is the HttpOnly account cookie, so every request has `credentials: 'include'`. There
// is no client-side authority here: `GET /auth/me` merely decides whether to offer the route; every
// request still relies on play-api's live administrator check and exposes a server 403 honestly.

import { isAuthEnabled } from '$lib/auth/authApi';
import { apiBase } from '$lib/live/liveApi';

/** One row from play-api's full administrator inventory (`GET /admin/bots`). */
export interface AdminBot {
	team: string;
	name: string;
	rating: number;
	rd: number;
	provisional: boolean;
	onLadder: boolean;
	openToHumans: boolean;
	description: string | null;
	/** Whether any account owns the bot; the identity and ownership controls stay private. */
	owned: boolean;
}

export interface AdminBots {
	bots: AdminBot[];
}

export type AdminBotFailure =
	| { outcome: 'signed-out' }
	| { outcome: 'forbidden' }
	| { outcome: 'no-such-bot' }
	| { outcome: 'invalid'; reason: string }
	| { outcome: 'unavailable' };

export type FetchAdminBotsResult =
	| { outcome: 'ok'; bots: AdminBot[] }
	| Exclude<AdminBotFailure, { outcome: 'no-such-bot' } | { outcome: 'invalid' }>;

export type AdminBotActionResult = { outcome: 'ok' } | AdminBotFailure;

export type RotateAdminTokenResult =
	| { outcome: 'rotated'; token: string }
	| { outcome: 'mismatch'; reason: string }
	| Exclude<AdminBotFailure, { outcome: 'invalid' }>;

function botPath(team: string, name: string): string {
	return `${apiBase()}/admin/bots/${encodeURIComponent(team)}/${encodeURIComponent(name)}`;
}

async function readJson<T>(res: Response): Promise<T | null> {
	try {
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

async function readText(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.text()).trim();
		return body === '' ? fallback : body;
	} catch {
		return fallback;
	}
}

function isAdminBot(value: unknown): value is AdminBot {
	if (typeof value !== 'object' || value === null) return false;
	const bot = value as Record<string, unknown>;
	return (
		typeof bot.team === 'string' &&
		typeof bot.name === 'string' &&
		typeof bot.rating === 'number' &&
		typeof bot.rd === 'number' &&
		typeof bot.provisional === 'boolean' &&
		typeof bot.onLadder === 'boolean' &&
		typeof bot.openToHumans === 'boolean' &&
		(bot.description === null || typeof bot.description === 'string') &&
		typeof bot.owned === 'boolean'
	);
}

function isAdminBots(value: unknown): value is AdminBots {
	return (
		typeof value === 'object' &&
		value !== null &&
		Array.isArray((value as Record<string, unknown>).bots) &&
		(value as { bots: unknown[] }).bots.every(isAdminBot)
	);
}

/** Status vocabulary shared by every admin mutation. 403 must not be folded into a generic error. */
async function adminFailure(res: Response): Promise<AdminBotFailure> {
	if (res.status === 401) return { outcome: 'signed-out' };
	if (res.status === 403) return { outcome: 'forbidden' };
	if (res.status === 404) return { outcome: 'no-such-bot' };
	if (res.status === 400)
		return { outcome: 'invalid', reason: await readText(res, 'The server rejected that change.') };
	return { outcome: 'unavailable' };
}

/** Lists the complete registered-bot inventory — including bots absent from all public surfaces. */
export async function fetchAdminBots(): Promise<FetchAdminBotsResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${apiBase()}/admin/bots`, { credentials: 'include' });
	} catch {
		return { outcome: 'unavailable' };
	}
	if (!res.ok) {
		const failure = await adminFailure(res);
		return failure.outcome === 'no-such-bot' || failure.outcome === 'invalid'
			? { outcome: 'unavailable' }
			: failure;
	}
	const body = await readJson<unknown>(res);
	return isAdminBots(body) ? { outcome: 'ok', bots: body.bots } : { outcome: 'unavailable' };
}

export async function setAdminLadder(
	team: string,
	name: string,
	onLadder: boolean,
): Promise<AdminBotActionResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${botPath(team, name)}/ladder/${onLadder ? 'join' : 'leave'}`, {
			method: 'POST',
			credentials: 'include',
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	return res.ok ? { outcome: 'ok' } : adminFailure(res);
}

/** Opens the human catalog, optionally placing a short description in the same audited operation. */
export async function openAdminToHumans(
	team: string,
	name: string,
	description: string,
): Promise<AdminBotActionResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	const trimmed = description.trim();
	let res: Response;
	try {
		res = await fetch(`${botPath(team, name)}/open-to-humans`, {
			method: 'POST',
			credentials: 'include',
			...(trimmed
				? {
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ description: trimmed }),
					}
				: {}),
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	return res.ok ? { outcome: 'ok' } : adminFailure(res);
}

export async function closeAdminToHumans(
	team: string,
	name: string,
): Promise<AdminBotActionResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${botPath(team, name)}/open-to-humans/leave`, {
			method: 'POST',
			credentials: 'include',
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	return res.ok ? { outcome: 'ok' } : adminFailure(res);
}

/** Replaces a catalog description, including while the bot is closed to human games. */
export async function setAdminDescription(
	team: string,
	name: string,
	description: string,
): Promise<AdminBotActionResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${botPath(team, name)}/description`, {
			method: 'PUT',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ description: description.trim() }),
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	return res.ok ? { outcome: 'ok' } : adminFailure(res);
}

/** Rotates a credential after the name echo. The plaintext token must remain in the calling card only. */
export async function rotateAdminToken(
	team: string,
	name: string,
	confirm: string,
): Promise<RotateAdminTokenResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${botPath(team, name)}/token`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ confirm }),
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	if (res.status === 400)
		return {
			outcome: 'mismatch',
			reason: await readText(res, 'Confirmation did not match the bot name.'),
		};
	if (!res.ok) {
		const failure = await adminFailure(res);
		return failure.outcome === 'invalid' ? { outcome: 'unavailable' } : failure;
	}
	const body = await readJson<unknown>(res);
	if (
		typeof body !== 'object' ||
		body === null ||
		typeof (body as Record<string, unknown>).token !== 'string'
	)
		return { outcome: 'unavailable' };
	return { outcome: 'rotated', token: (body as { token: string }).token };
}

// Transport for the signed-in author's `/me/bots` surface (#242). Rune-free on purpose: reactive
// ownership belongs in `myBotsStore`, while this module only mirrors play-api's HTTP contract.
//
// The route is deliberately absent from the public Bot API: it combines an HttpOnly account
// session with an author's bot token. The token reaches exactly one request — `claimBot`'s
// `Authorization` header — and is never retained here. All other calls use only the session.

import { isAuthEnabled } from '$lib/auth/authApi';
import { apiBase } from '$lib/live/liveApi';

/** The owner-only list wire from play-api's `OwnerBotRoutes.MyBot`, copied verbatim. */
export interface MyBot {
	team: string;
	name: string;
	rating: number;
	rd: number;
	onLadder: boolean;
	openToHumans: boolean;
}

export interface MyBots {
	bots: MyBot[];
}

/** The per-bot capacity wire from `BotRoutes.Capacity`, including its live occupancy. */
export interface BotCapacity {
	maxConcurrentGames: number;
	openToHumans: boolean;
	ladderAllowance: number;
	activeGames: number;
}

export type ManagedFailure =
	| { outcome: 'signed-out' }
	| { outcome: 'not-yours' }
	| { outcome: 'no-such-bot' }
	| { outcome: 'invalid'; reason: string }
	| { outcome: 'unavailable' };

/** Every owner-management failure which can be rendered by a bot card. */
export type OwnerBotFailure = ManagedFailure | { outcome: 'mismatch'; reason: string };

export type FetchMyBotsResult =
	{ outcome: 'ok'; bots: MyBot[] } | { outcome: 'signed-out' } | { outcome: 'unavailable' };

export type ClaimBotResult =
	| { outcome: 'claimed'; bots: MyBot[] }
	| { outcome: 'signed-out' }
	| { outcome: 'taken' }
	| { outcome: 'not-registered' }
	| { outcome: 'bad-token' }
	| { outcome: 'unavailable' };

export type BotActionResult = { outcome: 'ok' } | ManagedFailure;

export type RotateTokenResult =
	| { outcome: 'rotated'; token: string }
	| { outcome: 'mismatch'; reason: string }
	| Exclude<ManagedFailure, { outcome: 'invalid' }>;

export type ReleaseBotResult =
	{ outcome: 'released'; bots: MyBot[] } | Exclude<ManagedFailure, { outcome: 'invalid' }>;

export type FetchCapacityResult =
	{ outcome: 'ok'; capacity: BotCapacity } | Exclude<ManagedFailure, { outcome: 'invalid' }>;

export type SetCapacityResult = { outcome: 'ok'; capacity: BotCapacity } | ManagedFailure;

function botPath(team: string, name: string): string {
	return `${apiBase()}/me/bots/${encodeURIComponent(team)}/${encodeURIComponent(name)}`;
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

function isMyBot(value: unknown): value is MyBot {
	if (typeof value !== 'object' || value === null) return false;
	const bot = value as Record<string, unknown>;
	return (
		typeof bot.team === 'string' &&
		typeof bot.name === 'string' &&
		typeof bot.rating === 'number' &&
		typeof bot.rd === 'number' &&
		typeof bot.onLadder === 'boolean' &&
		typeof bot.openToHumans === 'boolean'
	);
}

function isMyBots(value: unknown): value is MyBots {
	return (
		typeof value === 'object' &&
		value !== null &&
		Array.isArray((value as Record<string, unknown>).bots) &&
		(value as { bots: unknown[] }).bots.every(isMyBot)
	);
}

function isCapacity(value: unknown): value is BotCapacity {
	if (typeof value !== 'object' || value === null) return false;
	const capacity = value as Record<string, unknown>;
	return (
		typeof capacity.maxConcurrentGames === 'number' &&
		typeof capacity.openToHumans === 'boolean' &&
		typeof capacity.ladderAllowance === 'number' &&
		typeof capacity.activeGames === 'number'
	);
}

/** Every management route shares this status vocabulary. `403` and `404` must stay distinct. */
async function managedFailure(res: Response): Promise<ManagedFailure> {
	if (res.status === 401) return { outcome: 'signed-out' };
	if (res.status === 403) return { outcome: 'not-yours' };
	if (res.status === 404) return { outcome: 'no-such-bot' };
	if (res.status === 400)
		return { outcome: 'invalid', reason: await readText(res, 'The server rejected that change.') };
	return { outcome: 'unavailable' };
}

/** Lists only bots owned by the signed-in account. */
export async function fetchMyBots(): Promise<FetchMyBotsResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${apiBase()}/me/bots`, { credentials: 'include' });
	} catch {
		return { outcome: 'unavailable' };
	}
	if (res.status === 401) return { outcome: 'signed-out' };
	if (!res.ok) return { outcome: 'unavailable' };
	const body = await readJson<unknown>(res);
	return isMyBots(body) ? { outcome: 'ok', bots: body.bots } : { outcome: 'unavailable' };
}

/**
 * Claims whichever registered bot the one-time Bearer token proves control of. There is deliberately
 * no team/name body: the server derives that identity from the token, so copied form fields cannot
 * claim one bot while merely naming another.
 */
export async function claimBot(token: string): Promise<ClaimBotResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${apiBase()}/me/bots/claim`, {
			method: 'POST',
			credentials: 'include',
			headers: { authorization: `Bearer ${token}` },
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	if (res.status === 401) {
		// OwnerBotRoutes says "Not signed in" before it checks the bot token; its separate
		// "bot token required" body is the only honest way to distinguish the two 401 causes.
		return (await readText(res, '')) === 'Not signed in'
			? { outcome: 'signed-out' }
			: { outcome: 'bad-token' };
	}
	if (res.status === 409) return { outcome: 'taken' };
	if (res.status === 404) return { outcome: 'not-registered' };
	if (!res.ok) return { outcome: 'unavailable' };
	const body = await readJson<unknown>(res);
	return isMyBots(body) ? { outcome: 'claimed', bots: body.bots } : { outcome: 'unavailable' };
}

export async function setLadder(
	team: string,
	name: string,
	onLadder: boolean,
): Promise<BotActionResult> {
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
	return res.ok ? { outcome: 'ok' } : managedFailure(res);
}

/** Opens the public catalog, optionally setting its short description in the same atomic write. */
export async function openToHumans(
	team: string,
	name: string,
	description: string,
): Promise<BotActionResult> {
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
	return res.ok ? { outcome: 'ok' } : managedFailure(res);
}

export async function closeToHumans(team: string, name: string): Promise<BotActionResult> {
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
	return res.ok ? { outcome: 'ok' } : managedFailure(res);
}

export async function fetchCapacity(team: string, name: string): Promise<FetchCapacityResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${botPath(team, name)}/capacity`, { credentials: 'include' });
	} catch {
		return { outcome: 'unavailable' };
	}
	if (!res.ok) {
		const failure = await managedFailure(res);
		return failure.outcome === 'invalid' ? { outcome: 'unavailable' } : failure;
	}
	const body = await readJson<unknown>(res);
	return isCapacity(body) ? { outcome: 'ok', capacity: body } : { outcome: 'unavailable' };
}

export async function setCapacity(
	team: string,
	name: string,
	maxConcurrentGames: number,
): Promise<SetCapacityResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(`${botPath(team, name)}/capacity`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ maxConcurrentGames }),
		});
	} catch {
		return { outcome: 'unavailable' };
	}
	if (!res.ok) return managedFailure(res);
	const body = await readJson<unknown>(res);
	return isCapacity(body) ? { outcome: 'ok', capacity: body } : { outcome: 'unavailable' };
}

/** Rotates a bot's credential. The returned plaintext belongs only in component-local state. */
export async function rotateToken(
	team: string,
	name: string,
	confirm: string,
): Promise<RotateTokenResult> {
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
		const failure = await managedFailure(res);
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

/** Releases ownership so another person holding the bot token may explicitly claim it. */
export async function releaseBot(team: string, name: string): Promise<ReleaseBotResult> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	let res: Response;
	try {
		res = await fetch(botPath(team, name), { method: 'DELETE', credentials: 'include' });
	} catch {
		return { outcome: 'unavailable' };
	}
	if (!res.ok) {
		const failure = await managedFailure(res);
		return failure.outcome === 'invalid' ? { outcome: 'unavailable' } : failure;
	}
	const body = await readJson<unknown>(res);
	return isMyBots(body) ? { outcome: 'released', bots: body.bots } : { outcome: 'unavailable' };
}

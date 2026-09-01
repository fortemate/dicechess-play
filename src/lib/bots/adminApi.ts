// Transport for the administrator's `/admin/bots` surface (#243, #47). This module deliberately
// stays rune-free: it mirrors play-api's HTTP contract while `adminBotsStore` owns reactive
// inventory state and detail components keep rotated plaintext tokens component-local.
//
// The session is the HttpOnly account cookie, so every request has `credentials: 'include'`. There
// is no client-side authority here: `GET /auth/me` merely decides whether to offer the route; every
// request still relies on play-api's live administrator check and exposes a server 403 honestly.

import { isAuthEnabled } from '$lib/auth/authApi';
import { apiBase } from '$lib/live/liveApi';

export interface AdminWebhookFailure {
	at: string;
	reason: string;
}

/** Summary of a bot's webhook registration for administrator inspection (#34). Secret is never exposed. */
export interface AdminWebhook {
	url: string;
	verifiedAt: string;
	capabilities: string[];
	lastFailure?: AdminWebhookFailure | null;
}

/** The per-bot capacity wire from `BotRoutes.Capacity`, including its live occupancy. */
export interface BotCapacity {
	maxConcurrentGames: number;
	openToHumans: boolean;
	ladderAllowance: number;
	activeGames: number;
}

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
	maxConcurrentGames: number;
	ladderAllowance: number;
	activeGames: number;
	/** Whether any account owns the bot; the identity and ownership controls stay private. */
	owned: boolean;
	webhook: AdminWebhook | null;
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

export type SetAdminCapacityResult = { outcome: 'ok'; capacity: BotCapacity } | AdminBotFailure;

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

function isCapacity(value: unknown): value is BotCapacity {
	if (typeof value !== 'object' || value === null) return false;
	const cap = value as Record<string, unknown>;
	return (
		typeof cap.maxConcurrentGames === 'number' &&
		typeof cap.openToHumans === 'boolean' &&
		typeof cap.ladderAllowance === 'number' &&
		typeof cap.activeGames === 'number'
	);
}

function isAdminWebhook(value: unknown): value is AdminWebhook {
	if (typeof value !== 'object' || value === null) return false;
	const hook = value as Record<string, unknown>;
	return (
		typeof hook.url === 'string' &&
		typeof hook.verifiedAt === 'string' &&
		Array.isArray(hook.capabilities) &&
		hook.capabilities.every((c) => typeof c === 'string') &&
		(hook.lastFailure === undefined ||
			hook.lastFailure === null ||
			(typeof hook.lastFailure === 'object' &&
				typeof (hook.lastFailure as Record<string, unknown>).at === 'string' &&
				typeof (hook.lastFailure as Record<string, unknown>).reason === 'string'))
	);
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
		typeof bot.maxConcurrentGames === 'number' &&
		typeof bot.ladderAllowance === 'number' &&
		typeof bot.activeGames === 'number' &&
		typeof bot.owned === 'boolean' &&
		(bot.webhook === null || bot.webhook === undefined || isAdminWebhook(bot.webhook))
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
	if (!isAdminBots(body)) return { outcome: 'unavailable' };
	const normalizedBots: AdminBot[] = body.bots.map((b) => ({
		...b,
		webhook: b.webhook ?? null,
	}));
	return { outcome: 'ok', bots: normalizedBots };
}

async function sendAdminRequest(
	path: string,
	method: 'POST' | 'PUT',
	body?: unknown,
): Promise<Response | { outcome: 'unavailable' }> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	try {
		return await fetch(path, {
			method,
			credentials: 'include',
			...(body !== undefined
				? {
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body),
					}
				: {}),
		});
	} catch {
		return { outcome: 'unavailable' };
	}
}

export async function setAdminLadder(
	team: string,
	name: string,
	onLadder: boolean,
): Promise<AdminBotActionResult> {
	const res = await sendAdminRequest(
		`${botPath(team, name)}/ladder/${onLadder ? 'join' : 'leave'}`,
		'POST',
	);
	if ('outcome' in res) return res;
	return res.ok ? { outcome: 'ok' } : adminFailure(res);
}

/** Opens the human catalog, optionally placing a short description in the same audited operation. */
export async function openAdminToHumans(
	team: string,
	name: string,
	description: string,
): Promise<AdminBotActionResult> {
	const trimmed = description.trim();
	const res = await sendAdminRequest(
		`${botPath(team, name)}/open-to-humans`,
		'POST',
		trimmed ? { description: trimmed } : undefined,
	);
	if ('outcome' in res) return res;
	return res.ok ? { outcome: 'ok' } : adminFailure(res);
}

export async function closeAdminToHumans(
	team: string,
	name: string,
): Promise<AdminBotActionResult> {
	const res = await sendAdminRequest(`${botPath(team, name)}/open-to-humans/leave`, 'POST');
	if ('outcome' in res) return res;
	return res.ok ? { outcome: 'ok' } : adminFailure(res);
}

/** Replaces a catalog description, including while the bot is closed to human games. */
export async function setAdminDescription(
	team: string,
	name: string,
	description: string,
): Promise<AdminBotActionResult> {
	const res = await sendAdminRequest(`${botPath(team, name)}/description`, 'PUT', {
		description: description.trim(),
	});
	if ('outcome' in res) return res;
	return res.ok ? { outcome: 'ok' } : adminFailure(res);
}

/** Sets declared capacity for a bot in an audited admin operation (#47). */
export async function setAdminCapacity(
	team: string,
	name: string,
	maxConcurrentGames: number,
): Promise<SetAdminCapacityResult> {
	const res = await sendAdminRequest(`${botPath(team, name)}/capacity`, 'POST', {
		maxConcurrentGames,
	});
	if ('outcome' in res) return res;
	if (!res.ok) return adminFailure(res);
	const body = await readJson<unknown>(res);
	return isCapacity(body) ? { outcome: 'ok', capacity: body } : { outcome: 'unavailable' };
}

/** Rotates a credential after the name echo. The plaintext token must remain in the calling card only. */
export async function rotateAdminToken(
	team: string,
	name: string,
	confirm: string,
): Promise<RotateAdminTokenResult> {
	const res = await sendAdminRequest(`${botPath(team, name)}/token`, 'POST', { confirm });
	if ('outcome' in res) return res;
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

/**
 * REST helpers for the singleton showcase table (play-api ADR-005, #46).
 *
 * Implements typed access to:
 * - GET /showcase: uncacheable discovery read, supporting weak ETag 304 validation.
 * - POST /showcase/claim: atomic idempotent claim returning either ShowcaseClaimed (credential)
 *   or ShowcaseSpectating (for race losers), parsing RFC 7807 problem details.
 *
 * Cross-repo contract: mirrors dicechess-play-api's ShowcaseRoutes.scala.
 * Credential isolation: seatToken is returned only in ShowcaseClaimed and must be held in-memory only.
 */

import type { Clocks, GameStatusWire, Players, Seat } from './liveTypes';
import { apiBase } from './liveApi';
import { getGuestUuid } from '../ingest/guestIdentity';
import { v4 as uuidv4 } from 'uuid';

export interface ShowcaseBotView {
	team: string;
	name: string;
	displayName: string;
}

export interface ShowcaseTimeControlView {
	initialSeconds: number;
	incrementSeconds: number;
	display: string;
}

export interface ShowcaseGameView {
	gameId: string;
	players: Players | null;
	humanSeat: Seat;
	activeSeat: Seat;
	dicePending: boolean;
	clocks: Clocks | null;
	version: number;
	dfen: string;
	status: GameStatusWire;
}

export interface ShowcaseSpectatorView {
	wsUrl: string;
}

export type ShowcaseServerStatus = 'unavailable' | 'open' | 'live' | 'finishing';

export interface ShowcaseView {
	status: ShowcaseServerStatus;
	featuredBot: ShowcaseBotView | null;
	timeControl: ShowcaseTimeControlView;
	nextHumanColor: 'White' | 'Black' | null;
	currentGame: ShowcaseGameView | null;
	spectator: ShowcaseSpectatorView | null;
	reason: 'disabled' | 'maintenance' | 'bot_unavailable' | string | null;
}

export interface ShowcaseClaimed {
	outcome: 'claimed';
	gameId: string;
	seat: Seat;
	seatToken: string;
	wsUrl: string;
}

export interface ShowcaseSpectating {
	outcome: 'spectating';
	reason: string;
	gameId?: string;
	spectatorWsUrl?: string;
}

export type ShowcaseClaimOutcome = ShowcaseClaimed | ShowcaseSpectating;

export interface ShowcaseProblem {
	status: number;
	code: string;
	title: string;
	detail: string;
	instance: string;
}

export class ShowcaseProblemError extends Error {
	readonly status: number;
	readonly code: string;
	readonly detail: string;
	readonly instance: string;
	readonly retryAfterSeconds: number | null;

	constructor(problem: ShowcaseProblem, retryAfterSeconds: number | null = null) {
		super(problem.detail || problem.title || `Showcase error: ${problem.status}`);
		this.name = 'ShowcaseProblemError';
		this.status = problem.status;
		this.code = problem.code;
		this.detail = problem.detail;
		this.instance = problem.instance;
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

export interface GetShowcaseResult {
	notModified: boolean;
	view?: ShowcaseView;
	etag?: string;
}

/**
 * Fetch the public read model for the singleton showcase table.
 * Supports weak ETag conditional requests (returns notModified: true on 304).
 */
export async function getShowcase(ifNoneMatch?: string): Promise<GetShowcaseResult> {
	const base = apiBase();
	if (!base) {
		return {
			notModified: false,
			view: {
				status: 'unavailable',
				featuredBot: null,
				timeControl: { initialSeconds: 300, incrementSeconds: 3, display: '5+3' },
				nextHumanColor: null,
				currentGame: null,
				spectator: null,
				reason: 'disabled',
			},
		};
	}

	const headers: Record<string, string> = {};
	if (ifNoneMatch) {
		headers['If-None-Match'] = ifNoneMatch;
	}

	const res = await fetch(`${base}/showcase`, {
		method: 'GET',
		headers: Object.keys(headers).length > 0 ? headers : undefined,
	});

	const etag = res.headers.get('etag') ?? undefined;

	if (res.status === 304) {
		return {
			notModified: true,
			etag: etag ?? ifNoneMatch,
		};
	}

	if (!res.ok) {
		throw new Error(`getShowcase failed: ${res.status}`);
	}

	const view = (await res.json()) as ShowcaseView;
	return {
		notModified: false,
		view,
		etag,
	};
}

export interface ClaimShowcaseOptions {
	idempotencyKey?: string;
	clientEntropy?: string;
	guestId?: string;
}

/**
 * Atomically claim the singleton showcase table.
 * Always sends Idempotency-Key and X-DiceChess-CSRF headers.
 * Resolves to ShowcaseClaimed (winner) or ShowcaseSpectating (loser).
 * Throws ShowcaseProblemError on RFC 7807 problem responses (503, 429, 400, etc.).
 */
export async function claimShowcase(
	options?: ClaimShowcaseOptions,
): Promise<ShowcaseClaimOutcome> {
	const base = apiBase();
	if (!base) {
		throw new ShowcaseProblemError({
			status: 503,
			code: 'showcase_unavailable',
			title: 'Showcase unavailable',
			detail: 'Live play is disabled.',
			instance: '/showcase/claim',
		});
	}

	const key = options?.idempotencyKey ?? uuidv4();
	const body: { guestId?: string; clientEntropy?: string } = {};
	const guestId = options?.guestId ?? getGuestUuid();
	if (guestId) body.guestId = guestId;
	if (options?.clientEntropy) body.clientEntropy = options.clientEntropy;

	const res = await fetch(`${base}/showcase/claim`, {
		method: 'POST',
		credentials: 'include',
		headers: {
			'content-type': 'application/json',
			'Idempotency-Key': key,
			'X-DiceChess-CSRF': '1',
		},
		body: JSON.stringify(body),
	});

	if (res.ok) {
		return (await res.json()) as ShowcaseClaimOutcome;
	}

	const rawRetry = res.headers.get('retry-after');
	const retryAfterSeconds = rawRetry ? parseInt(rawRetry, 10) : null;

	let problem: ShowcaseProblem;
	try {
		problem = (await res.json()) as ShowcaseProblem;
	} catch {
		problem = {
			status: res.status,
			code: 'unknown_error',
			title: res.statusText || 'Error',
			detail: `Request failed with status ${res.status}`,
			instance: '/showcase/claim',
		};
	}

	throw new ShowcaseProblemError(problem, isNaN(Number(retryAfterSeconds)) ? null : retryAfterSeconds);
}

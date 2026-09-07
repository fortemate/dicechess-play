import { apiBase } from './liveApi';
import type {
	PrivateRematch,
	RematchAction,
	RematchErrorResponse,
	RematchRequestBody,
} from './rematchTypes';

export class RematchApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly state?: PrivateRematch;

	constructor(status: number, code: string, state?: PrivateRematch, message?: string) {
		super(message ?? `Rematch API error: ${code} (${status})`);
		this.name = 'RematchApiError';
		this.status = status;
		this.code = code;
		this.state = state;
	}
}

async function parseError(res: Response): Promise<RematchApiError> {
	let code = 'unknown_error';
	let state: PrivateRematch | undefined;
	try {
		const json = (await res.json()) as RematchErrorResponse;
		if (json?.error?.code) {
			code = json.error.code;
		}
		if (json?.state) {
			state = json.state;
		}
	} catch {
		// Response was not JSON
	}
	return new RematchApiError(res.status, code, state);
}

const REMATCH_TIMEOUT_MS = 10_000;

/**
 * Fetch the private rematch state for an authorized participant of a finished game.
 */
export async function getRematch(
	gameId: string,
	seatToken?: string | null,
): Promise<PrivateRematch> {
	const headers: Record<string, string> = {};
	if (seatToken) {
		headers['X-Rematch-Seat-Token'] = seatToken;
	}

	const res = await fetch(`${apiBase()}/games/${encodeURIComponent(gameId)}/rematch`, {
		method: 'GET',
		credentials: 'include',
		headers,
		signal: AbortSignal.timeout(REMATCH_TIMEOUT_MS),
	});

	if (!res.ok) {
		throw await parseError(res);
	}

	return (await res.json()) as PrivateRematch;
}

/**
 * Submit a rematch mutation (propose, accept, decline, cancel) with an idempotent request ID.
 */
export async function postRematch(
	gameId: string,
	action: RematchAction,
	requestId: string,
	seatToken?: string | null,
): Promise<PrivateRematch> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'X-DiceChess-CSRF': '1',
	};
	if (seatToken) {
		headers['X-Rematch-Seat-Token'] = seatToken;
	}

	const payload: RematchRequestBody = {
		requestId,
		action,
	};

	const res = await fetch(`${apiBase()}/games/${encodeURIComponent(gameId)}/rematch`, {
		method: 'POST',
		credentials: 'include',
		headers,
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(REMATCH_TIMEOUT_MS),
	});

	if (!res.ok) {
		throw await parseError(res);
	}

	return (await res.json()) as PrivateRematch;
}

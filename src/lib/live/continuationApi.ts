import { apiBase } from './liveApi';
import type { PublicContinuation } from './rematchTypes';

/**
 * The public half of the rematch contract (play-api ADR 007 / rematch-v1): reading where a
 * finished game continued, for a viewer who holds no seat.
 *
 * Deliberately separate from `rematchApi.ts`, which speaks the PARTICIPANT half: that one sends
 * the account cookie and a seat capability and can come back holding join data. This one is the
 * spectator's only rematch call, and it is credential-free by construction —
 * `credentials: 'omit'` means an account cookie belonging to a participant of the watched game
 * cannot turn a spectator's read into a participant's read, and no response this module returns
 * can contain a seat token.
 */

export class ContinuationError extends Error {
	readonly status: number;

	constructor(status: number, message?: string) {
		super(message ?? `Continuation read failed: ${status}`);
		this.name = 'ContinuationError';
		this.status = status;
	}

	/** A source that will never continue: an unknown id. Distinct from a transient failure. */
	get isPermanent(): boolean {
		return this.status === 404;
	}
}

const CONTINUATION_TIMEOUT_MS = 10_000;

/**
 * Read the public continuation of `gameId`. Throws `ContinuationError` on any non-2xx answer, so
 * a caller can tell "no such game" (permanent) from "try again" (transient) — a follower must
 * keep the last readable result on the latter rather than treating it as a broken chain.
 */
export async function getContinuation(gameId: string): Promise<PublicContinuation> {
	const res = await fetch(`${apiBase()}/games/${encodeURIComponent(gameId)}/continuation`, {
		method: 'GET',
		credentials: 'omit',
		signal: AbortSignal.timeout(CONTINUATION_TIMEOUT_MS),
	});
	if (!res.ok) throw new ContinuationError(res.status);
	return (await res.json()) as PublicContinuation;
}

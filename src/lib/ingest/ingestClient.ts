// Posts a finished game to play-api's POST /ingest/games — never directly to analytics.
//
// The browser MUST NOT hold INGEST_TOKEN. play-api accepts the bare GameIngestWire JSON
// with no Authorization header, validates it structurally, queues it durably, and relays
// it to analytics server-side with its own Bearer token and retry/backoff (this replaced
// the standalone Koyeb gateway of ADR-0005). Acceptance is asynchronous: 201 means
// "queued for delivery"; the authoritative engine-replay validation still happens in
// analytics, and a replay rejection now parks the report on the server instead of being
// surfaced to this client.
//
// The endpoint lives on the same base URL as live play (VITE_PLAY_API_URL); when empty,
// recording is disabled along with the live surface.

import { apiBase } from '$lib/live/liveApi';
import type { GameIngestWire } from './types';

export type IngestOutcome = 'created' | 'exists' | 'rejected' | 'error';

export interface IngestResult {
	outcome: IngestOutcome;
	status: number;
	body?: unknown;
}

function classify(status: number): IngestOutcome {
	if (status === 201) return 'created';
	if (status === 200) return 'exists'; // first-writer-wins: already ingested
	// 422 = structural reject; 400 = malformed body. Both are permanent — retrying re-fails,
	// so the outbox quarantines them instead of looping.
	if (status === 422 || status === 400) return 'rejected';
	return 'error';
}

// A hung connection would otherwise stall the sequential flushOutbox() loop for the whole
// visit — an abort classifies as 'error' and the record stays pending for the next flush.
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Send one game to play-api. Resolves with a classified outcome; never throws on
 * HTTP status (transport errors and timeouts resolve to 'error' so the caller can
 * retry/quarantine via the localGamesDB outbox).
 *
 * TODO(phase-1): retry with backoff on error instead of waiting for the next visit.
 */
export async function postGame(payload: GameIngestWire): Promise<IngestResult> {
	const base = apiBase();
	if (!base) {
		return { outcome: 'error', status: 0, body: 'VITE_PLAY_API_URL is not configured' };
	}
	try {
		const res = await fetch(`${base.replace(/\/$/, '')}/ingest/games`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		let body: unknown = undefined;
		try {
			body = await res.json();
		} catch {
			// non-JSON body is fine
		}
		return { outcome: classify(res.status), status: res.status, body };
	} catch (err) {
		return { outcome: 'error', status: 0, body: String(err) };
	}
}

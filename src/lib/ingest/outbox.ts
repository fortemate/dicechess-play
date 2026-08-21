// Durable ingest outbox: flush finished games from IndexedDB to play-api.
//
// The play store saves every finished game to localGamesDB with sync_status 'pending'
// (the durable, offline-first outbox). This flush maps each pending record to the
// analytics contract and posts it to play-api's /ingest/games, which relays it to
// analytics server-side. On 'created'/'exists' the record is marked synced; 'rejected'
// (400/422, permanent) is quarantined and never retried; 'error' is left pending for
// the next flush.
//
// TODO(phase-1): retry with backoff for 'error' records instead of waiting for the
// next visit, and surface quarantined records for review.

import { getPendingGames, markGameAsSynced, markGameAsQuarantined } from '$lib/localGamesDB';
import { getGuestId } from './guestIdentity';
import { toGameIngest } from './mapper';
import { postGame } from './ingestClient';

export interface FlushSummary {
	created: number;
	exists: number;
	rejected: number;
	error: number;
}

export async function flushOutbox(): Promise<FlushSummary> {
	const summary: FlushSummary = { created: 0, exists: 0, rejected: 0, error: 0 };
	const pending = await getPendingGames();
	if (pending.length === 0) return summary;

	const guestId = getGuestId();
	for (const record of pending) {
		const res = await postGame(toGameIngest(record, guestId));
		summary[res.outcome]++;
		if (res.outcome === 'created' || res.outcome === 'exists') {
			await markGameAsSynced(record.id);
		} else if (res.outcome === 'rejected') {
			// Permanent reject (400/422) — quarantine so it is not retried forever.
			await markGameAsQuarantined(record.id);
		}
		// 'error' (network / 5xx): leave pending for the next flush.
	}
	return summary;
}

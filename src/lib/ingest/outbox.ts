// Durable ingest outbox: flush finished games from IndexedDB to play-api.
//
// The play store saves every finished game to localGamesDB with sync_status 'pending'
// (the durable, offline-first outbox). This flush maps each pending record to the
// analytics contract and posts it to play-api's /ingest/games, which relays it to
// analytics server-side. On 'created'/'exists' the record is marked synced; 'rejected'
// (400/422, permanent) is quarantined and never retried; 'error' is left pending for
// the next flush.
//
// Note (phase-1): retry with backoff for 'error' records instead of waiting for the
// next visit, and surface quarantined records for review.

import {
	getPendingGames,
	markGameAsSynced,
	markGameAsQuarantined,
	type LocalGameRecord,
} from '#lib/localGamesDB.js';
import { getGuestId } from './guestIdentity';
import { toGameIngest } from './mapper';
import { postGame, type IngestResult } from './ingestClient';

export interface FlushSummary {
	created: number;
	exists: number;
	rejected: number;
	error: number;
}

async function flushRecord(
	record: LocalGameRecord,
	guestId: string,
): Promise<IngestResult['outcome']> {
	const res = await postGame(toGameIngest(record, guestId));
	if (res.outcome === 'created' || res.outcome === 'exists') {
		await markGameAsSynced(record.id);
	} else if (res.outcome === 'rejected') {
		// Permanent reject (400/422) — quarantine so it is not retried forever.
		await markGameAsQuarantined(record.id);
	}
	return res.outcome;
}

const MAX_CONCURRENT_FLUSH = 4;

export async function flushOutbox(): Promise<FlushSummary> {
	const summary: FlushSummary = { created: 0, exists: 0, rejected: 0, error: 0 };
	const pending = await getPendingGames();
	if (pending.length === 0) return summary;

	const guestId = getGuestId();
	let nextIndex = 0;

	async function drainWorker(): Promise<void> {
		if (nextIndex >= pending.length) return;
		const record = pending[nextIndex++];
		const outcome = await flushRecord(record, guestId);
		summary[outcome]++;
		await drainWorker();
	}

	const workerCount = Math.min(MAX_CONCURRENT_FLUSH, pending.length);
	await Promise.all(Array.from({ length: workerCount }, drainWorker));
	return summary;
}

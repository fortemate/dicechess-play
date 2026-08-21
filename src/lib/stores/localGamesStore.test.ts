import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { getDB, saveLocalGame, type LocalGameRecord } from '$lib/localGamesDB';
import { localGamesStore } from './localGamesStore.svelte';

function game(
	id: string,
	start_time: string,
	overrides: Partial<LocalGameRecord> = {},
): LocalGameRecord {
	return {
		id,
		bot_id: 'bot:greedy',
		player_color: 'WHITE',
		result: 1,
		start_time,
		sync_status: 'synced',
		moves_history: [],
		...overrides,
	};
}

describe('localGamesStore', () => {
	beforeEach(async () => {
		const db = await getDB();
		const tx = db.transaction('local_games', 'readwrite');
		await tx.store.clear();
		await tx.done;
		// Reset the singleton between tests.
		localGamesStore.games = [];
		localGamesStore.loaded = false;
		localGamesStore.loading = false;
		localGamesStore.error = null;
	});

	it('loads games newest-first and flags loaded', async () => {
		await saveLocalGame(game('a', '2023-10-01T12:00:00Z'));
		await saveLocalGame(game('b', '2023-10-02T12:00:00Z'));

		await localGamesStore.load();

		expect(localGamesStore.games.map((g) => g.id)).toEqual(['b', 'a']);
		expect(localGamesStore.loaded).toBe(true);
		expect(localGamesStore.loading).toBe(false);
		expect(localGamesStore.error).toBeNull();
	});

	it('handles an empty store', async () => {
		await localGamesStore.load();

		expect(localGamesStore.games).toEqual([]);
		expect(localGamesStore.loaded).toBe(true);
		expect(localGamesStore.error).toBeNull();
	});

	it('ignores a concurrent load while one is in flight', async () => {
		await saveLocalGame(game('a', '2023-10-01T12:00:00Z'));

		// The first call flips `loading` synchronously before its first await; the
		// second must short-circuit on the guard rather than run a parallel read.
		const first = localGamesStore.load();
		const second = localGamesStore.load();
		await Promise.all([first, second]);

		expect(localGamesStore.games.map((g) => g.id)).toEqual(['a']);
		expect(localGamesStore.loading).toBe(false);
	});
});

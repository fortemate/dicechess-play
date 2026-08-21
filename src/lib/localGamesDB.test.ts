import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
	getDB,
	saveLocalGame,
	getLocalGame,
	getPendingGames,
	getAllLocalGames,
	markGameAsSynced,
	type LocalGameRecord,
} from './localGamesDB';

describe('localGamesDB', () => {
	const dummyGame1: LocalGameRecord = {
		id: '1111-2222',
		bot_id: 'bot:greedy',
		player_color: 'WHITE',
		result: 1,
		start_time: '2023-10-01T12:00:00Z',
		sync_status: 'pending',
		moves_history: [],
	};

	const dummyGame2: LocalGameRecord = {
		id: '3333-4444',
		bot_id: 'bot:random',
		player_color: 'BLACK',
		result: -1,
		start_time: '2023-10-02T12:00:00Z',
		sync_status: 'synced',
		moves_history: [],
	};

	beforeEach(async () => {
		// Clear the DB before each test
		const db = await getDB();
		const tx = db.transaction('local_games', 'readwrite');
		await tx.store.clear();
		await tx.done;
	});

	it('should save and retrieve a game', async () => {
		await saveLocalGame(dummyGame1);
		const retrieved = await getLocalGame(dummyGame1.id);
		expect(retrieved).toEqual(dummyGame1);
	});

	it('should retrieve pending games', async () => {
		await saveLocalGame(dummyGame1);
		await saveLocalGame(dummyGame2);

		const pending = await getPendingGames();
		expect(pending.length).toBe(1);
		expect(pending[0].id).toBe(dummyGame1.id);
	});

	it('should retrieve all local games sorted by start_time descending', async () => {
		await saveLocalGame(dummyGame1); // 2023-10-01
		await saveLocalGame(dummyGame2); // 2023-10-02

		const all = await getAllLocalGames();
		expect(all.length).toBe(2);
		// Newest first
		expect(all[0].id).toBe(dummyGame2.id);
		expect(all[1].id).toBe(dummyGame1.id);
	});

	it('should mark a game as synced', async () => {
		await saveLocalGame(dummyGame1);
		await markGameAsSynced(dummyGame1.id);

		const retrieved = await getLocalGame(dummyGame1.id);
		expect(retrieved?.sync_status).toBe('synced');

		const pending = await getPendingGames();
		expect(pending.length).toBe(0);
	});
});

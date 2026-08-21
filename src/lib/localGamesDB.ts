import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type SyncStatus = 'pending' | 'synced' | 'quarantined';
export type PlayerColor = 'WHITE' | 'BLACK';

/** Why a game ended, as known by the play store (not inferred from the board). */
export type GameEndReason = 'mate' | 'timeout' | 'resign' | 'agreement';

export interface DiceChessTurnHistory {
	turn_number: number;
	active_color: PlayerColor;
	start_dfen: string;
	moves: { uci: string; piece: string; is_capture: boolean; fen_after?: string }[];
	end_dfen: string;
}

export interface LocalGameRecord {
	id: string; // UUID
	bot_id: string; // e.g., 'bot:greedy'
	player_color: PlayerColor; // 'WHITE' or 'BLACK'
	result: number; // 1 (White win), -1 (Black win), 0 (Draw)
	start_time: string; // ISO-8601 Timestamp
	sync_status: SyncStatus; // 'pending' or 'synced'
	moves_history: DiceChessTurnHistory[]; // Array of turns
	end_reason?: GameEndReason | null; // why the game ended (absent on legacy records)
	time_limit?: number | null;
	time_bonus?: number | null;
	bet?: number;
	mode?: 'classic' | 'x2';
}

interface LocalGamesDBSchema extends DBSchema {
	local_games: {
		key: string;
		value: LocalGameRecord;
		indexes: {
			'by-sync-status': string;
			'by-start-time': string;
		};
	};
}

const DB_NAME = 'dicechess-play-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LocalGamesDBSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<LocalGamesDBSchema>> {
	if (!dbPromise) {
		dbPromise = openDB<LocalGamesDBSchema>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('local_games')) {
					const store = db.createObjectStore('local_games', { keyPath: 'id' });
					store.createIndex('by-sync-status', 'sync_status');
					store.createIndex('by-start-time', 'start_time');
				}
			},
		});
	}
	return dbPromise;
}

export async function saveLocalGame(game: LocalGameRecord): Promise<void> {
	const db = await getDB();
	await db.put('local_games', game);
}

export async function getLocalGame(id: string): Promise<LocalGameRecord | undefined> {
	const db = await getDB();
	return db.get('local_games', id);
}

export async function getPendingGames(): Promise<LocalGameRecord[]> {
	const db = await getDB();
	return db.getAllFromIndex('local_games', 'by-sync-status', 'pending');
}

export async function getAllLocalGames(): Promise<LocalGameRecord[]> {
	const db = await getDB();
	const games = await db.getAllFromIndex('local_games', 'by-start-time');
	return games.reverse();
}

async function setSyncStatus(id: string, status: SyncStatus): Promise<void> {
	const db = await getDB();
	const tx = db.transaction('local_games', 'readwrite');
	const game = await tx.store.get(id);
	if (game) {
		game.sync_status = status;
		await tx.store.put(game);
	}
	await tx.done;
}

export async function markGameAsSynced(id: string): Promise<void> {
	await setSyncStatus(id, 'synced');
}

/** A permanently-rejected game (400/422): kept for inspection, never retried. */
export async function markGameAsQuarantined(id: string): Promise<void> {
	await setSyncStatus(id, 'quarantined');
}

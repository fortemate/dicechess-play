import { describe, it, expect } from 'vitest';
import { mergeGameHistory } from './gameHistoryMerge';
import type { LocalGameRecord } from '$lib/localGamesDB';
import type { PlayerGame } from '$lib/games/gamesApi';

function localGame(id: string, start_time: string): LocalGameRecord {
	return {
		id,
		bot_id: 'bot:greedy',
		player_color: 'WHITE',
		result: 1,
		start_time,
		sync_status: 'synced',
		moves_history: [],
	};
}

function liveGame(gameId: string, finishedAt: string): PlayerGame {
	return {
		gameId,
		seat: 'White',
		opponent: { kind: 'Bot', name: 'acme alice' },
		result: 'win',
		rated: false,
		termination: 'resign',
		timeControl: 'Fischer(300,3)',
		finishedAt,
	};
}

describe('mergeGameHistory', () => {
	it('interleaves both sources newest-first by their respective timestamps', () => {
		const local = [
			localGame('l-1', '2026-07-15T00:00:00Z'),
			localGame('l-2', '2026-07-17T00:00:00Z'),
		];
		const live = [liveGame('v-1', '2026-07-16T00:00:00Z')];

		const merged = mergeGameHistory(local, live);

		expect(
			merged.map((item) => (item.source === 'local' ? item.game.id : item.game.gameId)),
		).toEqual(['l-2', 'v-1', 'l-1']);
	});

	it('tags each item with its source', () => {
		const merged = mergeGameHistory(
			[localGame('l-1', '2026-07-15T00:00:00Z')],
			[liveGame('v-1', '2026-07-16T00:00:00Z')],
		);

		expect(merged.find((i) => i.source === 'local')?.game).toMatchObject({ id: 'l-1' });
		expect(merged.find((i) => i.source === 'live')?.game).toMatchObject({ gameId: 'v-1' });
	});

	it('drops a live entry whose id collides with a local one (defensive dedup)', () => {
		const local = [localGame('shared-id', '2026-07-15T00:00:00Z')];
		const live = [liveGame('shared-id', '2026-07-16T00:00:00Z')];

		const merged = mergeGameHistory(local, live);

		expect(merged).toHaveLength(1);
		expect(merged[0].source).toBe('local');
	});

	it('sorts an unparseable timestamp to the end rather than throwing', () => {
		const local = [localGame('l-1', 'not-a-date')];
		const live = [liveGame('v-1', '2026-07-16T00:00:00Z')];

		const merged = mergeGameHistory(local, live);

		expect(
			merged.map((item) => (item.source === 'local' ? item.game.id : item.game.gameId)),
		).toEqual(['v-1', 'l-1']);
	});

	it('handles both sources empty', () => {
		expect(mergeGameHistory([], [])).toEqual([]);
	});
});

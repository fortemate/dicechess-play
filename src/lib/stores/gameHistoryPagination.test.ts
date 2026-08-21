import { describe, it, expect } from 'vitest';
import { liveBoundary, paginateGameHistory } from './gameHistoryPagination';
import { mergeGameHistory, type GameHistoryItem } from './gameHistoryMerge';
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

function ids(items: GameHistoryItem[]): string[] {
	return items.map((item) => (item.source === 'local' ? item.game.id : item.game.gameId));
}

describe('liveBoundary', () => {
	it('is null once every live game has been fetched (hasMore false)', () => {
		expect(liveBoundary([liveGame('v-1', '2026-07-16T00:00:00Z')], false)).toBeNull();
		expect(liveBoundary([], false)).toBeNull();
	});

	it('is the oldest fetched live timestamp while more remain', () => {
		const live = [
			liveGame('v-1', '2026-07-16T00:00:00Z'),
			liveGame('v-2', '2026-07-14T00:00:00Z'),
			liveGame('v-3', '2026-07-15T00:00:00Z'),
		];
		expect(liveBoundary(live, true)).toBe(Date.parse('2026-07-14T00:00:00Z'));
	});

	it('is Infinity when more remain but nothing has been fetched yet (degenerate first-load state)', () => {
		expect(liveBoundary([], true)).toBe(Infinity);
	});
});

describe('paginateGameHistory', () => {
	it('handles both sources empty', () => {
		const page = paginateGameHistory(mergeGameHistory([], []), [], false, 24);
		expect(page).toEqual({ visible: [], canShowMore: false, needsFetch: false });
	});

	it('all-local: no boundary, plain cap over the local list', () => {
		const local = [
			localGame('l-1', '2026-07-16T00:00:00Z'),
			localGame('l-2', '2026-07-15T00:00:00Z'),
		];
		const merged = mergeGameHistory(local, []);

		const page = paginateGameHistory(merged, [], false, 24);

		expect(ids(page.visible)).toEqual(['l-1', 'l-2']);
		expect(page.canShowMore).toBe(false);
		expect(page.needsFetch).toBe(false);
	});

	it('caps without touching the server when there is more already-safe material buffered', () => {
		const local = [
			localGame('l-1', '2026-07-16T00:00:00Z'),
			localGame('l-2', '2026-07-15T00:00:00Z'),
			localGame('l-3', '2026-07-14T00:00:00Z'),
		];
		const merged = mergeGameHistory(local, []);

		const page = paginateGameHistory(merged, [], false, 2);

		expect(ids(page.visible)).toEqual(['l-1', 'l-2']);
		expect(page.canShowMore).toBe(true);
		expect(page.needsFetch).toBe(false);
	});

	it('holds back a local game older than the boundary while more live games remain unfetched', () => {
		const local = [
			localGame('newer-local', '2026-07-16T00:00:00Z'), // newer than boundary — safe
			localGame('older-local', '2026-07-10T00:00:00Z'), // older than boundary — held back
		];
		const live = [liveGame('v-1', '2026-07-14T00:00:00Z')]; // boundary = this timestamp
		const merged = mergeGameHistory(local, live);

		const page = paginateGameHistory(merged, live, true, 24);

		expect(ids(page.visible)).toEqual(['newer-local', 'v-1']);
		expect(page.canShowMore).toBe(true); // hasMore still true — more could exist once fetched
		expect(page.needsFetch).toBe(true); // nothing more is already-safe; must fetch to get it
	});

	it('renders a local game exactly at the boundary (server cursor is a strict <, so a tie is safe)', () => {
		const local = [localGame('at-boundary', '2026-07-14T00:00:00Z')];
		const live = [liveGame('v-1', '2026-07-14T00:00:00Z')];
		const merged = mergeGameHistory(local, live);

		const page = paginateGameHistory(merged, live, true, 24);

		expect(ids(page.visible)).toContain('at-boundary');
	});

	it('holds back every local game when hasMore is true but nothing has been fetched yet', () => {
		const local = [localGame('l-1', '2026-07-16T00:00:00Z')];
		const merged = mergeGameHistory(local, []);

		const page = paginateGameHistory(merged, [], true, 24);

		expect(page.visible).toEqual([]);
		expect(page.canShowMore).toBe(true);
		expect(page.needsFetch).toBe(true);
	});

	it('a live error mid-walk (page passes hasMore: false) unlocks every held-back local game', () => {
		const local = [
			localGame('newer-local', '2026-07-16T00:00:00Z'),
			localGame('older-local', '2026-07-10T00:00:00Z'),
		];
		const live = [liveGame('v-1', '2026-07-14T00:00:00Z')];
		const merged = mergeGameHistory(local, live);

		// The page treats "can't fetch more" (disabled or errored) the same as hasMore: false —
		// nothing more is ever coming, so nothing should stay held back on a boundary that can
		// never resolve further.
		const page = paginateGameHistory(merged, live, false, 24);

		expect(ids(page.visible)).toEqual(['newer-local', 'v-1', 'older-local']);
		expect(page.canShowMore).toBe(false);
		expect(page.needsFetch).toBe(false);
	});

	it("a transient fetch failure releases the boundary but keeps 'Show more' offering a retry (canFetchMore independent of hasMore)", () => {
		const local = [
			localGame('newer-local', '2026-07-16T00:00:00Z'),
			localGame('older-local', '2026-07-10T00:00:00Z'),
		];
		const live = [liveGame('v-1', '2026-07-14T00:00:00Z')];
		const merged = mergeGameHistory(local, live);

		// hasMore: false releases the boundary (as above); canFetchMore: true says the server
		// genuinely still has more, so the page must not also hide the retry affordance.
		const page = paginateGameHistory(merged, live, false, 24, true);

		expect(ids(page.visible)).toEqual(['newer-local', 'v-1', 'older-local']); // boundary released
		expect(page.canShowMore).toBe(true); // NOT hidden — the guest can retry
		expect(page.needsFetch).toBe(true); // clicking it calls loadMore() again
	});

	it('canFetchMore defaults to hasMore when omitted (the happy-path shape existing callers use)', () => {
		const live = [liveGame('v-1', '2026-07-16T00:00:00Z')];
		const merged = mergeGameHistory([], live);

		const page = paginateGameHistory(merged, live, true, 24);

		expect(page.canShowMore).toBe(true);
		expect(page.needsFetch).toBe(true);
	});

	it('needsFetch is true when hasMore is true and every already-fetched item is already shown', () => {
		const live = [liveGame('v-1', '2026-07-16T00:00:00Z'), liveGame('v-2', '2026-07-15T00:00:00Z')];
		const merged = mergeGameHistory([], live);

		const page = paginateGameHistory(merged, live, true, 24);

		// Both fetched live games are >= the boundary (they define it) — always safe regardless of cap.
		expect(ids(page.visible)).toEqual(['v-1', 'v-2']);
		expect(page.canShowMore).toBe(true); // hasMore still true
		expect(page.needsFetch).toBe(true); // no MORE already-safe material beyond what's shown
	});

	it("needsFetch is false when the cap alone hides already-safe material — 'Show more' just reveals it", () => {
		const live = [liveGame('v-1', '2026-07-16T00:00:00Z'), liveGame('v-2', '2026-07-15T00:00:00Z')];
		const merged = mergeGameHistory([], live);

		const page = paginateGameHistory(merged, live, true, 1);

		expect(ids(page.visible)).toEqual(['v-1']);
		expect(page.canShowMore).toBe(true);
		expect(page.needsFetch).toBe(false); // v-2 is already fetched and safe — just raise the cap
	});
});

import type { LocalGameRecord } from '$lib/localGamesDB';
import type { PlayerGame } from '$lib/games/gamesApi';

// Combines the two "My Games" sources — local IndexedDB bot games and play-api's server-recorded
// lobby/live games — into one newest-first list for /games. Kept as a discriminated union rather
// than reshaping either side into a shared model: the two records carry genuinely different data
// (a local record has full move history for a replay thumbnail; a live record has only a summary,
// see PlayerRoutes' file-head comment in play-api for why), so the UI renders each with its own
// card rather than pretending they're the same shape.

export type GameHistoryItem =
	{ source: 'local'; game: LocalGameRecord } | { source: 'live'; game: PlayerGame };

/** Newest-first merge of both sources. Deduplicates by id — local and live ids are minted by
 * different generators (browser `crypto.randomUUID()` vs play-api's `GameId.random`) and never
 * collide in practice, but a live entry is dropped if its id ever matches an already-included
 * local one, so a future change to either id scheme can't silently double-list a game.
 */
export function mergeGameHistory(local: LocalGameRecord[], live: PlayerGame[]): GameHistoryItem[] {
	const seenIds = new Set(local.map((g) => g.id));
	const items: GameHistoryItem[] = [
		...local.map((game) => ({ source: 'local' as const, game })),
		...live
			.filter((game) => !seenIds.has(game.gameId))
			.map((game) => ({ source: 'live' as const, game })),
	];
	return items.sort((a, b) => sortTimestamp(b) - sortTimestamp(a));
}

/** Each item's own timestamp as epoch millis (`start_time` for local, `finishedAt` for live) — the
 * ordering key `mergeGameHistory` sorts by; exported for `gameHistoryPagination.ts` (#150), which
 * needs the same per-item timestamp to decide what's safe to render relative to the live boundary.
 */
export function sortTimestamp(item: GameHistoryItem): number {
	const raw = item.source === 'local' ? item.game.start_time : item.game.finishedAt;
	const parsed = Date.parse(raw);
	// An unparseable timestamp sorts last rather than throwing or landing at the (very wrong) 1970
	// epoch — matches formatDate's "tolerate a malformed date" stance elsewhere in this codebase.
	return Number.isNaN(parsed) ? -Infinity : parsed;
}

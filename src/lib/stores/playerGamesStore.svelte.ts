import {
	fetchMyGames,
	fetchPlayerGames,
	type PlayerGame,
	type PlayerGamesFilters,
	type PlayerGamesPage,
} from '$lib/games/gamesApi';
import { getGuestUuid } from '$lib/ingest/guestIdentity';
import { isLiveEnabled } from '$lib/live/liveApi';

/** The exact `finishedAt` of the oldest game in an already-fetched page — the next page's `before`
 * cursor (#150/#173). Never recomputed/reformatted: play-api's `before` comparison is a strict
 * `<` on the stored instant, so passing back anything but the exact string it returned risks
 * skipping or repeating a row at the boundary.
 */
function oldestFinishedAt(games: PlayerGame[]): string {
	return games.reduce(
		(oldest, g) => (g.finishedAt < oldest ? g.finishedAt : oldest),
		games[0].finishedAt,
	);
}

/**
 * Loads and holds a visitor's finished lobby/live games from play-api (#151) — the
 * server-authoritative counterpart to `localGamesStore`'s IndexedDB-backed bot games.
 *
 * Two singletons share this class, mirroring `playerOpponentsStore` (#226/#229):
 * {@link playerGamesStore} holds this browser's guest games (`GET /players/{guestId}/games`),
 * {@link myGamesStore} the signed-in account's union over itself plus every claimed guest
 * (`GET /me/games`, credentialed — a guest asking would just 401 into the error state, so
 * `/games` gates on the settled `authStore.status`).
 *
 * A singleton so the loaded list survives navigation, matching `localGamesStore`; call
 * {@link load} to (re)fetch the first page — pass `vs`/`result` to narrow the server-side query
 * (#151/#173), forwarded to `fetchPlayerGames` verbatim and remembered for {@link loadMore}. A
 * no-op (empty `games`, no error) when live play is off (`VITE_PLAY_API_URL` unset) — same rule
 * that disables `/live`. Any fetch failure degrades to an honest `error` flag rather than
 * throwing: the local list on `/games` must always render regardless of play-api's health.
 *
 * `/games`'s filter bar reloads this store every time `vs`/`result` change (a fresh server query,
 * not client-side post-filtering — see `gamesFilters.ts`'s doc comment for why). Call {@link reset}
 * first: it bumps a generation counter so a request from before the filter change (or a stale
 * `loadMore` from before a `reset`) can't land after the new one and clobber it, however the two
 * happen to resolve — same pattern as `playerOpponentsStore`.
 *
 * Pagination (#150): {@link loadMore} appends the next page (same filters, `before` = the oldest
 * fetched game's own `finishedAt`) rather than replacing `games`. `hasMore` is the server's own
 * count, not something inferred client-side — see `gameHistoryPagination.ts` for how the page
 * combines it with local games to decide what's actually safe to render.
 */
class PlayerGamesStore {
	games = $state<PlayerGame[]>([]);
	hasMore = $state(false);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);
	#generation = 0;
	#filters: PlayerGamesFilters = {};
	readonly #fetchPage: (filters: PlayerGamesFilters) => Promise<PlayerGamesPage>;

	constructor(fetchPage: (filters: PlayerGamesFilters) => Promise<PlayerGamesPage>) {
		this.#fetchPage = fetchPage;
	}

	reset(): void {
		this.games = [];
		this.hasMore = false;
		this.loading = false;
		this.loaded = false;
		this.error = null;
		this.#filters = {};
		this.#generation++;
	}

	async load(filters: PlayerGamesFilters = {}): Promise<void> {
		if (this.loading || !isLiveEnabled()) return;
		this.#filters = filters;
		this.loading = true;
		this.error = null;
		const generation = this.#generation;
		try {
			const page = await this.#fetchPage(filters);
			if (generation !== this.#generation) return;
			this.games = page.games;
			this.hasMore = page.hasMore;
			this.loaded = true;
		} catch {
			if (generation !== this.#generation) return;
			// Any failure here — unreachable server, a bad response — means the same thing to the
			// visitor: their lobby/live games just aren't available right now. One honest,
			// non-technical message (matching the lobby/leaderboard convention) instead of a raw
			// fetch exception.
			this.error = "Your lobby games aren't available right now.";
		} finally {
			if (generation === this.#generation) this.loading = false;
		}
	}

	/** Fetch and append the next page under the SAME filters `load` was last called with. A no-op
	 * while a load is already in flight, once `hasMore` is false, or before anything has loaded yet
	 * (there is no oldest game to cursor from).
	 */
	async loadMore(): Promise<void> {
		if (this.loading || !this.hasMore || this.games.length === 0) return;
		this.loading = true;
		this.error = null;
		const generation = this.#generation;
		const before = oldestFinishedAt(this.games);
		try {
			const page = await this.#fetchPage({ ...this.#filters, before });
			if (generation !== this.#generation) return;
			this.games = [...this.games, ...page.games];
			this.hasMore = page.hasMore;
		} catch {
			if (generation !== this.#generation) return;
			this.error = "Your lobby games aren't available right now.";
		} finally {
			if (generation === this.#generation) this.loading = false;
		}
	}
}

/** This browser's guest games. The guest id is read per page fetch, not captured at
 * construction: a restore/reset on `/me` changes it mid-session. */
export const playerGamesStore = new PlayerGamesStore((filters) =>
	fetchPlayerGames(getGuestUuid(), filters),
);

/** The signed-in account's union (own games + every claimed guest), #229. */
export const myGamesStore = new PlayerGamesStore(fetchMyGames);

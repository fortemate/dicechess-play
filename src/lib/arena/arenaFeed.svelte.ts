/**
 * What the Arena overview shows, read from play-api and kept current (#259).
 *
 * Three reads, each at its own pace:
 *
 *   - the list of live games and the open seeks, every few seconds. The list feeds the "more
 *     live games" block and is where a featured game is chosen from;
 *   - the featured game itself, more often and by its own address (`GET /games/{id}`). The
 *     listing cannot follow it: the server caps the listing and orders it by activity, so a game
 *     can drop off the page while it is still being played, and the listing never says how a
 *     game ended. The game's own state does both;
 *   - nothing else. The standings are read once by their own component.
 *
 * Which game is featured, and when it gives way, is decided by `featured.ts`. This class only
 * supplies what that rule needs to know and holds the answer for the page.
 *
 * One instance per page: `start()` returns the function that stops it. Polls are skipped while
 * the tab is hidden, and a missed poll changes nothing: the last known picture stays.
 */
import { apiBase } from '#lib/live/liveApi.js';
import type { LiveGame, Over, PublicGameState, Seek } from '#lib/live/liveTypes.js';
import { listGames, listSeeks } from '#lib/live/lobbyApi.js';
import { featuredStep, rankGames, type FeaturedFate, type FeaturedState } from './featured';

export const LIST_POLL_MS = 5000;
export const FEATURED_POLL_MS = 2000;
/** One missed poll is a blip; a run of them means the server cannot be reached. */
const POLL_FAILURES_BEFORE_UNAVAILABLE = 2;

/** The featured game as the page draws it. */
export interface FeaturedView {
	phase: 'live' | 'final';
	game: LiveGame;
	/** How it ended, once it has. */
	over: Over | null;
	/** When `game` was read, in milliseconds: the running clock is counted down from here. */
	readAt: number;
}

/** The state of one game, or `null` when the server no longer knows it. Throws on any other
 * failure, so a missed read is not mistaken for a game that is gone. */
export async function readGame(id: string): Promise<PublicGameState | null> {
	const res = await fetch(`${apiBase()}/games/${id}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`readGame failed: ${res.status}`);
	return (await res.json()) as PublicGameState;
}

export class ArenaFeed {
	games = $state<LiveGame[]>([]);
	/** How many games are being played in all; the list is one page of them. */
	total = $state(0);
	seeks = $state<Seek[]>([]);
	/** The first list has arrived: until then there is nothing to call empty. */
	loaded = $state(false);
	unavailable = $state(false);
	featured = $state<FeaturedView | null>(null);

	/** The other live games, by the rule that picks the featured one. */
	others = $derived(
		rankGames(this.games).filter((game) => game.gameId !== this.featured?.game.gameId),
	);

	#state: FeaturedState | null = null;
	#failures = 0;
	#stopped = false;
	// One read of each kind at a time. A slow answer must not be overtaken by the next request
	// and then land on top of newer news.
	#listing = false;
	#following = false;

	#now: () => number = Date.now;

	start(now: () => number = Date.now): () => void {
		this.#now = now;
		this.#stopped = false;
		const list = () => void this.#readList(now);
		const follow = () => void this.#followFeatured(now);
		list();
		const listTimer = setInterval(list, LIST_POLL_MS);
		const featuredTimer = setInterval(follow, FEATURED_POLL_MS);
		return () => {
			this.#stopped = true;
			clearInterval(listTimer);
			clearInterval(featuredTimer);
		};
	}

	/** Read the games and the seeks again now, e.g. after a seat turned out to be taken. */
	refresh(): void {
		if (!this.#stopped) void this.#readList(this.#now);
	}

	async #readList(now: () => number) {
		if (document.hidden || this.#listing) return;
		this.#listing = true;
		try {
			const [games, seeks] = await Promise.all([listGames(), listSeeks()]);
			if (this.#stopped) return;
			this.games = games.games;
			this.total = games.total;
			this.seeks = seeks;
			this.loaded = true;
			this.#failures = 0;
			this.unavailable = false;
			// The list never ends a featured game: only its own state does. It can start one.
			this.#advance('playing', now());
		} catch {
			if (this.#stopped) return;
			this.#failures += 1;
			if (this.#failures >= POLL_FAILURES_BEFORE_UNAVAILABLE) this.unavailable = true;
		} finally {
			this.#listing = false;
		}
	}

	async #followFeatured(now: () => number) {
		if (document.hidden || this.#following) return;
		const state = this.#state;
		if (state === null) return;
		if (state.phase === 'final') {
			this.#advance('over', now());
			return;
		}
		this.#following = true;
		let read: PublicGameState | null;
		try {
			read = await readGame(state.gameId);
		} catch {
			return; // a missed read: the game stays as it was
		} finally {
			this.#following = false;
		}
		// Only act on the answer if the same game is still the featured one.
		if (this.#stopped || this.#state !== state) return;
		if (read === null) {
			this.#advance('gone', now());
			return;
		}
		const view = this.featured;
		if (view?.game.gameId !== state.gameId) return;
		// The server counts every change of a game. An answer older than the picture on screen
		// is dropped, whichever way it came to be late.
		if (read.version < view.game.version) return;
		const ended = 'Ended' in read.status ? read.status.Ended.over : null;
		this.featured = {
			phase: view.phase,
			over: ended,
			readAt: now(),
			game: {
				...view.game,
				dfen: read.dfen,
				activeSeat: read.activeSeat,
				dicePending: read.dicePending,
				clocks: read.clocks,
				version: read.version,
				players: read.players ?? view.game.players,
			},
		};
		if (ended) this.#advance('over', now());
	}

	#advance(fate: FeaturedFate, now: number) {
		const next = featuredStep(this.#state, this.games, fate, now);
		if (next === this.#state) return;
		const previous = this.#state;
		this.#state = next;
		if (next === null) {
			this.featured = null;
			return;
		}
		if (previous?.gameId === next.gameId) {
			// The same game, now over: keep the position that was read last.
			if (this.featured) this.featured = { ...this.featured, phase: next.phase };
			return;
		}
		const game = this.games.find((candidate) => candidate.gameId === next.gameId);
		this.featured = game ? { phase: 'live', game, over: null, readAt: now } : null;
		if (!game) this.#state = null;
	}
}

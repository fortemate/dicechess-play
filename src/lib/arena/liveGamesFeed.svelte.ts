/**
 * The games of the Arena live list, read from play-api and kept current (#260).
 *
 * One read of the listing every few seconds, and nothing per game: a list of a hundred rows
 * must not open a hundred connections. Rows and small boards are redrawn from what the listing
 * says. A visitor who wants a game move by move opens it.
 *
 * One instance per page: `start()` returns the function that stops it. Reads are skipped while
 * the tab is hidden, never overlap, and a missed read changes nothing.
 */
import type { LiveGame } from '#lib/live/liveTypes.js';
import { listGames } from '#lib/live/lobbyApi.js';

export const LIVE_LIST_POLL_MS = 5000;
/** One missed read is a blip; a run of them means the server cannot be reached. */
const FAILURES_BEFORE_UNAVAILABLE = 2;

export class LiveGamesFeed {
	/** The page of games the server lists: capped, most active first. */
	games = $state<LiveGame[]>([]);
	/** How many games are being played in all. */
	total = $state(0);
	loaded = $state(false);
	unavailable = $state(false);

	#failures = 0;
	#stopped = false;
	#reading = false;

	start(): () => void {
		this.#stopped = false;
		const read = () => void this.#read();
		read();
		const timer = setInterval(read, LIVE_LIST_POLL_MS);
		return () => {
			this.#stopped = true;
			clearInterval(timer);
		};
	}

	async #read() {
		if (document.hidden || this.#reading) return;
		this.#reading = true;
		try {
			const answer = await listGames();
			if (this.#stopped) return;
			this.games = answer.games;
			this.total = answer.total;
			this.loaded = true;
			this.#failures = 0;
			this.unavailable = false;
		} catch {
			if (this.#stopped) return;
			this.#failures += 1;
			if (this.#failures >= FAILURES_BEFORE_UNAVAILABLE) this.unavailable = true;
		} finally {
			this.#reading = false;
		}
	}
}

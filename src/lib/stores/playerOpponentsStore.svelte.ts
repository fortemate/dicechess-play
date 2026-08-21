import { fetchMyOpponents, fetchPlayerOpponents, type PlayerOpponent } from '$lib/games/gamesApi';
import { getGuestUuid } from '$lib/ingest/guestIdentity';
import { isLiveEnabled } from '$lib/live/liveApi';

/**
 * Loads and holds an aggregate W-D-L record against every lobby opponent from play-api (#174) —
 * the "Online" counterpart to `/me`'s on-device `buildPlayerRecord`.
 *
 * Two singletons share this class, differing only in WHOSE record they hold (#226):
 *
 * - {@link playerOpponentsStore} — this browser's guest id (`GET /players/{guestId}/opponents`).
 *   `FirstLoginOnboarding` counts THIS record on purpose: right after a first sign-in it must
 *   measure the anonymous history that could be adopted, which the account union cannot see
 *   until the claim happens. `/games`' filter options read it too, matching the guest-scoped
 *   list that page shows today (#229 moves both together).
 * - {@link myOpponentsStore} — the signed-in account's union over itself plus every claimed
 *   guest (`GET /me/opponents`, credentialed). `/me` renders it whenever the visitor is signed
 *   in; loading it as a guest just 401s into the error state, so callers gate on
 *   `authStore.status === 'signed-in'`.
 *
 * Singletons so the loaded list survives navigation, matching `playerGamesStore`; call
 * {@link load} to (re)fetch. A no-op (empty `opponents`, no error) when live play is off
 * (`VITE_PLAY_API_URL` unset) — same rule that disables `/live`. Any fetch failure degrades to
 * an honest `error` flag rather than throwing: the on-device record on `/me` must always render
 * regardless of play-api's health.
 *
 * Each store is identity-scoped: call {@link reset} before reloading whenever its identity
 * changes (guest restore/reset on `/me`), or the previous identity's stats linger in memory
 * until the page remounts. `reset()` also bumps a generation counter so a still-in-flight
 * request from the identity being left behind can never land after a newer one — see `load()`.
 */
class OpponentsStore {
	opponents = $state<PlayerOpponent[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);
	#generation = 0;
	readonly #fetchOpponents: () => Promise<PlayerOpponent[]>;

	constructor(fetchOpponents: () => Promise<PlayerOpponent[]>) {
		this.#fetchOpponents = fetchOpponents;
	}

	reset(): void {
		this.opponents = [];
		this.loading = false;
		this.loaded = false;
		this.error = null;
		this.#generation++;
	}

	async load(): Promise<void> {
		if (this.loading || !isLiveEnabled()) return;
		this.loading = true;
		this.error = null;
		const generation = this.#generation;
		try {
			const opponents = await this.#fetchOpponents();
			if (generation !== this.#generation) return;
			this.opponents = opponents;
			this.loaded = true;
		} catch {
			if (generation !== this.#generation) return;
			// Any failure here — unreachable server, a bad response — means the same thing to the
			// visitor: their lobby record just isn't available right now. One honest, non-technical
			// message (matching playerGamesStore's convention) instead of a raw fetch exception.
			this.error = "Your lobby record isn't available right now.";
		} finally {
			if (generation === this.#generation) this.loading = false;
		}
	}
}

/** This browser's guest record. The guest id is read per load, not captured at construction:
 * a restore/reset on `/me` changes it mid-session. */
export const playerOpponentsStore = new OpponentsStore(() => fetchPlayerOpponents(getGuestUuid()));

/** The signed-in account's union (own games + every claimed guest), #226. */
export const myOpponentsStore = new OpponentsStore(fetchMyOpponents);

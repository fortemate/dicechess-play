import { getAllLocalGames, type LocalGameRecord } from '$lib/localGamesDB';

/**
 * Loads and holds the guest's locally-stored games (newest first) for the
 * history views.
 *
 * Backed entirely by IndexedDB — no network. A singleton so the loaded list
 * survives navigation between routes; call {@link load} to (re)read from disk.
 */
class LocalGamesStore {
	games = $state<LocalGameRecord[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	async load(): Promise<void> {
		if (this.loading) return;
		this.loading = true;
		this.error = null;
		try {
			this.games = await getAllLocalGames();
			this.loaded = true;
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.loading = false;
		}
	}
}

export const localGamesStore = new LocalGamesStore();

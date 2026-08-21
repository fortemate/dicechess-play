// Reactive inventory for `/me/admin/bots` (#243). This store deliberately contains only public-ish
// bot metadata; a rotated plaintext token belongs to its `AdminBotCard` component and cannot outlive
// that card, a route navigation, or a reload.

import { fetchAdminBots, type AdminBot } from './adminApi';

class AdminBotsStore {
	bots = $state<AdminBot[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);
	sessionExpired = $state(false);
	forbidden = $state(false);
	#generation = 0;

	reset(): void {
		this.bots = [];
		this.loading = false;
		this.loaded = false;
		this.error = null;
		this.sessionExpired = false;
		this.forbidden = false;
		this.#generation++;
	}

	/** Load once; reactive effects can safely re-run without repeatedly fetching the inventory. */
	async load(): Promise<void> {
		if (this.loading || this.loaded) return;
		await this.#fetch();
	}

	/** Re-read the authoritative inventory after an individual administration action. */
	async refresh(): Promise<void> {
		if (this.loading) return;
		await this.#fetch();
	}

	async #fetch(): Promise<void> {
		this.loading = true;
		this.error = null;
		this.sessionExpired = false;
		this.forbidden = false;
		const generation = this.#generation;
		const result = await fetchAdminBots();
		if (generation !== this.#generation) return;
		this.loading = false;
		switch (result.outcome) {
			case 'ok':
				this.bots = result.bots;
				this.loaded = true;
				break;
			case 'signed-out':
				this.bots = [];
				this.sessionExpired = true;
				break;
			case 'forbidden':
				this.bots = [];
				this.forbidden = true;
				break;
			case 'unavailable':
				this.bots = [];
				this.error = "The bot inventory isn't available right now.";
				break;
		}
	}
}

export const adminBotsStore = new AdminBotsStore();

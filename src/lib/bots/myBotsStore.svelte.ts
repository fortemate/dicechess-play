// Reactive state for `/me/bots` (#242). `ownerApi` is deliberately rune-free; this singleton owns
// the list's loading lifecycle and keeps it scoped to the current signed-in account. Plaintext bot
// tokens never enter this store — they exist only in an `OwnedBotCard` component after rotation.

import { fetchMyBots, type MyBot } from './ownerApi';

class MyBotsStore {
	bots = $state<MyBot[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);
	sessionExpired = $state(false);
	#ownerId: string | null = null;
	#generation = 0;

	reset(): void {
		this.bots = [];
		this.loading = false;
		this.loaded = false;
		this.error = null;
		this.sessionExpired = false;
		this.#ownerId = null;
		this.#generation++;
	}

	/** Accept the authoritative list returned by claim/release without another round trip. */
	replace(ownerId: string, bots: MyBot[]): void {
		this.#ownerId = ownerId;
		this.bots = bots;
		this.loading = false;
		this.loaded = true;
		this.error = null;
		this.sessionExpired = false;
		this.#generation++;
	}

	/** Load once for an account; a repeat effect on the same route must not refetch on every render. */
	async load(ownerId: string): Promise<void> {
		if (this.#ownerId === ownerId && (this.loading || this.loaded)) return;
		await this.#fetch(ownerId);
	}

	/** Re-read after an individual card changes server-side state. */
	async refresh(ownerId: string): Promise<void> {
		if (this.loading && this.#ownerId === ownerId) return;
		await this.#fetch(ownerId);
	}

	async #fetch(ownerId: string): Promise<void> {
		if (this.#ownerId !== ownerId) this.reset();
		this.#ownerId = ownerId;
		this.loading = true;
		this.error = null;
		this.sessionExpired = false;
		const generation = this.#generation;
		const result = await fetchMyBots();
		if (generation !== this.#generation || this.#ownerId !== ownerId) return;
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
			case 'unavailable':
				this.bots = [];
				this.error = "Your bots aren't available right now.";
				break;
		}
	}
}

export const myBotsStore = new MyBotsStore();

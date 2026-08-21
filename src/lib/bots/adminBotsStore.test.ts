import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchAdminBots: vi.fn() }));
vi.mock('./adminApi', () => api);

const bot = {
	team: 'acme',
	name: 'alice',
	rating: 1720,
	rd: 85,
	provisional: false,
	onLadder: false,
	openToHumans: false,
	description: null,
	owned: false,
};

describe('adminBotsStore', () => {
	beforeEach(() => {
		api.fetchAdminBots.mockReset();
	});

	async function freshStore() {
		vi.resetModules();
		return (await import('./adminBotsStore.svelte')).adminBotsStore;
	}

	it('loads the full inventory once for repeated reactive effects', async () => {
		api.fetchAdminBots.mockResolvedValue({ outcome: 'ok', bots: [bot] });
		const store = await freshStore();
		await store.load();
		await store.load();
		expect(store.bots).toEqual([bot]);
		expect(store.loaded).toBe(true);
		expect(api.fetchAdminBots).toHaveBeenCalledTimes(1);
	});

	it('re-reads the inventory after a completed load when an admin action changes a bot', async () => {
		api.fetchAdminBots
			.mockResolvedValueOnce({ outcome: 'ok', bots: [bot] })
			.mockResolvedValueOnce({ outcome: 'ok', bots: [{ ...bot, onLadder: true }] });
		const store = await freshStore();
		await store.load();
		await store.refresh();
		expect(api.fetchAdminBots).toHaveBeenCalledTimes(2);
		expect(store.bots).toEqual([{ ...bot, onLadder: true }]);
	});

	it('renders a server 403 separately from an expired session', async () => {
		api.fetchAdminBots.mockResolvedValue({ outcome: 'forbidden' });
		const store = await freshStore();
		await store.load();
		expect(store.forbidden).toBe(true);
		expect(store.sessionExpired).toBe(false);
	});

	it('discards an in-flight inventory response after reset', async () => {
		let resolveFetch!: (value: { outcome: 'ok'; bots: (typeof bot)[] }) => void;
		api.fetchAdminBots.mockReturnValue(
			new Promise((resolve) => {
				resolveFetch = resolve;
			}),
		);
		const store = await freshStore();
		const loading = store.load();
		store.reset();
		resolveFetch({ outcome: 'ok', bots: [bot] });
		await loading;
		expect(store.bots).toEqual([]);
		expect(store.loaded).toBe(false);
	});
});

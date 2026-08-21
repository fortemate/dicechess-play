import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { myBotsStore } from './myBotsStore.svelte';

const bot = {
	team: 'acme',
	name: 'alice',
	rating: 1720,
	rd: 85,
	onLadder: true,
	openToHumans: false,
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

describe('myBotsStore', () => {
	beforeEach(() => {
		myBotsStore.reset();
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('loads the signed-in owner’s bots and does not repeat the route-effect fetch', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { bots: [bot] }));
		vi.stubGlobal('fetch', fetchMock);

		await myBotsStore.load('owner-a');
		await myBotsStore.load('owner-a');

		expect(myBotsStore.bots).toEqual([bot]);
		expect(myBotsStore.loaded).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('refreshes after a card action and scopes state to the current account', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(200, { bots: [bot] }))
			.mockResolvedValueOnce(jsonResponse(200, { bots: [{ ...bot, name: 'bob' }] }));
		vi.stubGlobal('fetch', fetchMock);

		await myBotsStore.load('owner-a');
		await myBotsStore.refresh('owner-a');

		expect(myBotsStore.bots.map((bot) => bot.name)).toEqual(['bob']);
	});

	it('clears one account’s list before loading another account', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(200, { bots: [bot] }))
			.mockResolvedValueOnce(jsonResponse(200, { bots: [] }));
		vi.stubGlobal('fetch', fetchMock);

		await myBotsStore.load('owner-a');
		await myBotsStore.load('owner-b');

		expect(myBotsStore.bots).toEqual([]);
		expect(myBotsStore.loaded).toBe(true);
	});

	it('does not leave a previous account’s list on screen when the session has expired', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('Not signed in', { status: 401 })),
		);

		await myBotsStore.load('owner-a');

		expect(myBotsStore.bots).toEqual([]);
		expect(myBotsStore.sessionExpired).toBe(true);
		expect(myBotsStore.error).toBeNull();
	});

	it('discards an old account’s in-flight response after reset', async () => {
		let resolveFetch: (response: Response) => void = () => {};
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(new Promise<Response>((resolve) => (resolveFetch = resolve))),
		);

		const first = myBotsStore.load('owner-a');
		myBotsStore.reset();
		resolveFetch(jsonResponse(200, { bots: [bot] }));
		await first;

		expect(myBotsStore.bots).toEqual([]);
		expect(myBotsStore.loaded).toBe(false);
	});

	it('loads the next account while an earlier account request is pending', async () => {
		const resolveFetches: Array<(response: Response) => void> = [];
		const fetchMock = vi
			.fn()
			.mockImplementation(() => new Promise<Response>((resolve) => resolveFetches.push(resolve)));
		vi.stubGlobal('fetch', fetchMock);

		const ownerA = myBotsStore.load('owner-a');
		const ownerB = myBotsStore.load('owner-b');
		expect(fetchMock).toHaveBeenCalledTimes(2);

		resolveFetches[0](jsonResponse(200, { bots: [bot] }));
		await ownerA;
		expect(myBotsStore.bots).toEqual([]);
		expect(myBotsStore.loading).toBe(true);

		const ownerBBot = { ...bot, name: 'bob' };
		resolveFetches[1](jsonResponse(200, { bots: [ownerBBot] }));
		await ownerB;

		expect(myBotsStore.bots).toEqual([ownerBBot]);
		expect(myBotsStore.loaded).toBe(true);
	});
});

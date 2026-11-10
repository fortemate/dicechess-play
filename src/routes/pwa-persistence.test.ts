import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';

const worker = vi.hoisted(() => ({
	handlers: {} as Record<string, () => void>,
	activate: vi.fn(),
}));
vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/state', () => ({ page: { url: { pathname: '/practice' } } }));
vi.mock('virtual:pwa-info', () => ({ pwaInfo: null }));
vi.mock('virtual:pwa-register/svelte', () => ({
	useRegisterSW: (handlers: Record<string, () => void>) => {
		worker.handlers = handlers;
		return { updateServiceWorker: worker.activate };
	},
}));
vi.mock('../components/GameShell.svelte', () => import('./live/[id]/ChildStub.test.svelte'));
vi.mock('#lib/staleBundleRecovery.js', () => ({ attachStaleBundleRecovery: vi.fn() }));
vi.mock('../lib/sound', () => ({ playCue: vi.fn(), preloadSounds: vi.fn() }));
vi.mock('../lib/localGamesDB', async (original) => ({
	...(await original<typeof import('../lib/localGamesDB')>()),
	saveLocalGame: vi.fn(),
}));

import Layout from './+layout.svelte';
import { chromeStore } from '../lib/stores/chromeStore.svelte';
import { PlayWithBotStore } from '../lib/playWithBot/playWithBotStore.svelte';
import { saveLocalGame } from '../lib/localGamesDB';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	worker.activate.mockReset();
});

describe('PWA activation and durable practice results', () => {
	it.each(['resolve', 'reject'] as const)(
		'waits for a resigned game write to %s, even after route cleanup',
		async (settlement) => {
			let resolve!: () => void;
			let reject!: (error: Error) => void;
			vi.mocked(saveLocalGame).mockReturnValueOnce(
				new Promise<void>((yes, no) => {
					resolve = yes;
					reject = no;
				}),
			);
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const store = new PlayWithBotStore();
			store.gameStatus = 'playing';
			chromeStore.holdReload = true;
			render(Layout, {
				children: createRawSnippet(() => ({ render: () => '<main>Practice</main>' })),
			});
			store.resignGame();
			expect(store.gameStatus).toBe('defeat');
			expect(saveLocalGame).toHaveBeenCalledOnce();
			expect(chromeStore.pendingGameSaves).toBe(1);
			// The route can release its own hold while its durable write is still in flight.
			chromeStore.holdReload = false;
			worker.handlers.onNeedRefresh();
			await tick();
			expect(chromeStore.reloadHeld).toBe(true);
			expect(worker.activate).not.toHaveBeenCalled();
			store.endSession();
			expect(chromeStore.reloadHeld).toBe(true);
			if (settlement === 'resolve') resolve();
			else reject(new Error('isolated IndexedDB failure'));
			await waitFor(() => expect(worker.activate).toHaveBeenCalledOnce());
			expect(chromeStore.pendingGameSaves).toBe(0);
			expect(chromeStore.reloadHeld).toBe(false);
		},
	);
});

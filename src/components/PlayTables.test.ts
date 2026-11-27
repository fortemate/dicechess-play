import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import type { Seek } from '#lib/live/liveTypes.js';

// The open-table tab of Play (#258). The lobby's requests are faked at the network edge to pin
// the rules of the tab: who may sit down where, what opening a table asks for, and what the
// visitor is told when the server says no.
const api = vi.hoisted(() => ({
	live: true,
	listSeeks: vi.fn(),
	acceptSeek: vi.fn(),
	createSeek: vi.fn(),
}));
vi.mock('#lib/live/liveApi.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/live/liveApi.js')>()),
	isLiveEnabled: () => api.live,
}));
vi.mock('#lib/live/lobbyApi.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/live/lobbyApi.js')>()),
	listSeeks: api.listSeeks,
	acceptSeek: api.acceptSeek,
	createSeek: api.createSeek,
}));
vi.mock('#lib/ingest/guestIdentity.js', () => ({ getGuestUuid: () => 'guest-uuid' }));
const auth = vi.hoisted(() => ({
	authStore: {
		status: 'signed-out' as 'loading' | 'signed-in' | 'signed-out' | 'unavailable',
		canSignIn: true,
		signIn: vi.fn(),
	},
}));
vi.mock('#lib/authStore.svelte.js', () => auth);

import { SeekAcceptError } from '#lib/live/lobbyApi.js';
import PlayTables from './PlayTables.svelte';

const blitz = { Fischer: { initialSeconds: 300, incrementSeconds: 3 } };
const seek = (id: string, extra: Partial<Seek> = {}): Seek => ({
	id,
	timeControl: blitz,
	kind: 'Human',
	name: null,
	rated: false,
	...extra,
});
const SEEKS = [
	seek('s1', { kind: 'Bot', name: 'house oracle' }),
	seek('s2', { name: 'PlayerOne', rated: true }),
	seek('s3'),
];

const onopened = vi.fn();
const mount = () => render(PlayTables, { onopened });
const rows = (container: HTMLElement) =>
	[...container.querySelectorAll('ul > li')].map((li) =>
		li.textContent?.replace(/\s+/g, ' ').trim(),
	);

describe('PlayTables', () => {
	beforeEach(() => {
		api.live = true;
		api.listSeeks.mockReset().mockResolvedValue(SEEKS);
		api.acceptSeek.mockReset();
		api.createSeek.mockReset().mockResolvedValue({ seekId: 'seek-9', secret: 'secret-9' });
		auth.authStore.status = 'signed-out';
		auth.authStore.canSignIn = true;
		auth.authStore.signIn.mockReset();
		onopened.mockReset();
		vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	describe('the list', () => {
		it('says who waits, on what terms, and whether the table is casual or rated', async () => {
			const view = mount();
			await view.findByText('house oracle');
			expect(rows(view.container)).toEqual([
				'house oracle Bot Blitz 5 + 3 Casual Sit down',
				'PlayerOne Player Blitz 5 + 3 Rated Sign in to sit',
				'Anonymous player Player Blitz 5 + 3 Casual Sit down',
			]);
		});

		it('gives a table no label when the server does not say whether it is rated', async () => {
			api.listSeeks.mockResolvedValue([seek('s1', { rated: undefined, name: 'Old' })]);
			const view = mount();
			await view.findByText('Old');
			expect(rows(view.container)).toEqual(['Old Player Blitz 5 + 3 Sit down']);
		});

		it('filters by casual and rated', async () => {
			const view = mount();
			await view.findByText('house oracle');
			await fireEvent.click(view.getByRole('button', { name: 'Rated' }));
			expect(rows(view.container)).toHaveLength(1);
			expect(rows(view.container)[0]).toContain('PlayerOne');
			await fireEvent.click(view.getByRole('button', { name: 'Casual' }));
			expect(rows(view.container)).toHaveLength(2);
			await fireEvent.click(view.getByRole('button', { name: 'All tables' }));
			expect(rows(view.container)).toHaveLength(3);
		});

		it('says so when no table is waiting, and when none matches the filter', async () => {
			api.listSeeks.mockResolvedValue([seek('s3')]);
			const view = mount();
			await view.findByText('Anonymous player');
			await fireEvent.click(view.getByRole('button', { name: 'Rated' }));
			expect(view.getByText('No table matches this filter.')).toBeTruthy();
			cleanup();
			api.listSeeks.mockResolvedValue([]);
			expect(await mount().findByText(/No table is waiting right now/)).toBeTruthy();
		});

		it('follows the tables, and keeps the last list through one missed poll', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			const view = mount();
			await view.findByText('house oracle');
			api.listSeeks.mockRejectedValue(new Error('blip'));
			await vi.advanceTimersByTimeAsync(3000);
			expect(view.getByText('house oracle')).toBeTruthy();
			await vi.advanceTimersByTimeAsync(3000);
			expect((await view.findByRole('alert')).textContent).toContain('cannot be loaded');
			api.listSeeks.mockResolvedValue([seek('s7', { name: 'Newcomer' })]);
			await vi.advanceTimersByTimeAsync(3000);
			expect(await view.findByText('Newcomer')).toBeTruthy();
		});

		it('asks the server nothing in a build without one', () => {
			api.live = false;
			const view = mount();
			expect(api.listSeeks).not.toHaveBeenCalled();
			expect(view.getAllByText(/this build has none/)).toHaveLength(2);
			expect(view.queryByRole('button', { name: 'Open a table' })).toBeNull();
		});
	});

	describe('sitting down', () => {
		it('starts the game at a casual table, on the seat the server drew', async () => {
			api.acceptSeek.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'Black' });
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /table of house oracle/ }));
			await waitFor(() =>
				expect(location.href).toBe('https://play.example/live/g1?seat=t1&as=black'),
			);
			expect(api.acceptSeek).toHaveBeenCalledExactlyOnceWith('s1', 'guest-uuid');
		});

		it('offers a guest "Sign in to sit" at a rated table, and does not try to sit', async () => {
			const view = mount();
			const button = await view.findByRole('button', { name: /rated table of PlayerOne/ });
			expect(button.textContent?.trim()).toBe('Sign in to sit');
			await fireEvent.click(button);
			expect(auth.authStore.signIn).toHaveBeenCalledOnce();
			expect(api.acceptSeek).not.toHaveBeenCalled();
		});

		it('lets a signed-in visitor sit down at a rated table', async () => {
			auth.authStore.status = 'signed-in';
			api.acceptSeek.mockResolvedValue({ gameId: 'g2', token: 't2', seat: 'White' });
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /table of PlayerOne/ }));
			await waitFor(() =>
				expect(api.acceptSeek).toHaveBeenCalledExactlyOnceWith('s2', 'guest-uuid'),
			);
		});

		it('tells a refused guest that the table plays for rating, with a clear message', async () => {
			// The list can be older than the session: the server still has the last word.
			auth.authStore.status = 'signed-in';
			api.acceptSeek.mockRejectedValue(new SeekAcceptError(403));
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /table of PlayerOne/ }));
			expect((await view.findByRole('alert')).textContent).toBe(
				'That table plays for rating. Sign in to sit down.',
			);
			expect(location.href).toBe('about:blank');
		});

		it('says the table was taken and reads the tables again', async () => {
			api.acceptSeek.mockRejectedValue(new SeekAcceptError(409));
			const view = mount();
			const button = await view.findByRole('button', { name: /table of house oracle/ });
			const reads = api.listSeeks.mock.calls.length;
			await fireEvent.click(button);
			expect((await view.findByRole('alert')).textContent).toBe(
				'That table was just taken. Pick another.',
			);
			expect(api.listSeeks.mock.calls).toHaveLength(reads + 1);
		});

		it('takes one seat at a time', async () => {
			api.acceptSeek.mockReturnValue(new Promise(() => {}));
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /table of house oracle/ }));
			const other = view.getByRole('button', { name: /table of Anonymous player/ });
			expect((other as HTMLButtonElement).disabled).toBe(true);
			other.click();
			expect(api.acceptSeek).toHaveBeenCalledOnce();
		});
	});

	describe("one's own table", () => {
		const own = (view: ReturnType<typeof mount>) =>
			within(view.getByRole('region', { name: 'Your own table' }));

		it('offers no colour, and no rated table to a guest', async () => {
			const view = mount();
			expect(own(view).queryByRole('radio', { name: 'White' })).toBeNull();
			expect(own(view).getByText('Your color is drawn when someone sits down.')).toBeTruthy();
			expect(own(view).queryByRole('radio', { name: 'Rated' })).toBeNull();
		});

		it('opens a casual table for a guest and hands it to the page', async () => {
			const view = mount();
			await fireEvent.click(own(view).getByRole('radio', { name: '10 min' }));
			await fireEvent.click(own(view).getByRole('button', { name: 'Open a table' }));
			await waitFor(() => expect(onopened).toHaveBeenCalledOnce());
			expect(api.createSeek).toHaveBeenCalledExactlyOnceWith(
				'guest-uuid',
				{ SuddenDeath: { initialSeconds: 600 } },
				false,
			);
			expect(onopened).toHaveBeenCalledWith({
				id: 'seek-9',
				secret: 'secret-9',
				label: '10 min',
				rated: false,
				clockMs: 600_000,
			});
		});

		it('opens a rated table only for a signed-in visitor who asked for it', async () => {
			auth.authStore.status = 'signed-in';
			const view = mount();
			await fireEvent.click(own(view).getByRole('radio', { name: 'Rated' }));
			await fireEvent.click(own(view).getByRole('button', { name: 'Open a table' }));
			await waitFor(() => expect(api.createSeek).toHaveBeenCalledOnce());
			expect(api.createSeek.mock.calls[0][2]).toBe(true);
		});

		it('says one plain thing when the table cannot be opened', async () => {
			api.createSeek.mockRejectedValue(new Error('createSeek failed: 503'));
			const view = mount();
			await fireEvent.click(own(view).getByRole('button', { name: 'Open a table' }));
			expect((await own(view).findByRole('alert')).textContent).toBe(
				'The tables are unavailable right now. Try again in a minute.',
			);
			expect(onopened).not.toHaveBeenCalled();
		});
	});
});

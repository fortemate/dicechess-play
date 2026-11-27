import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

/*
 * Waiting at one's own table (#256). After "Open a table" the visitor is on the game frame, in a
 * waiting state, instead of inside the lobby; "Close the table" cancels the seek and brings the
 * lobby back; a table that is taken goes to the board as the seat the server dealt.
 *
 * Named `page.test.ts`, not `+page.test.ts`: a leading `+` marks a SvelteKit route file.
 */
vi.mock('$app/paths', () => ({
	resolve: (path: string) => (path.startsWith('/') ? path : `/${path}`),
}));
vi.mock('#lib/live/liveApi.js', () => ({ isLiveEnabled: () => true }));
vi.mock('#lib/ingest/guestIdentity.js', () => ({ getGuestUuid: () => 'guest-uuid' }));
vi.mock('#lib/authStore.svelte.js', () => ({
	authStore: { status: 'signed-out', canSignIn: false, signIn: vi.fn() },
}));
const lobby = vi.hoisted(() => ({
	listSeeks: vi.fn(),
	listGames: vi.fn(),
	createSeek: vi.fn(),
	seekStatus: vi.fn(),
	acceptSeek: vi.fn(),
	cancelSeek: vi.fn(),
	SeekAcceptError: class extends Error {
		status = 0;
	},
}));
vi.mock('#lib/live/lobbyApi.js', () => lobby);

import LobbyPage from './+page.svelte';
import { chromeStore } from '#lib/stores/chromeStore.svelte.js';
import { timeControlPresets } from '#lib/live/timeControls.js';

let location: { origin: string; href: string };

beforeEach(() => {
	lobby.listSeeks.mockReset().mockResolvedValue([]);
	lobby.listGames.mockReset().mockResolvedValue({ games: [], total: 0 });
	lobby.createSeek.mockReset().mockResolvedValue({ seekId: 'seek-1', secret: 'seek-secret' });
	lobby.seekStatus.mockReset().mockResolvedValue({ matched: false });
	lobby.cancelSeek.mockReset().mockResolvedValue(undefined);
	location = { origin: 'https://play.test', href: 'https://play.test/lobby' };
	vi.stubGlobal('location', location);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function openTable() {
	const view = render(LobbyPage);
	await fireEvent.click(view.getByRole('button', { name: '+ Open a table' }));
	await fireEvent.click(view.getByRole('button', { name: 'Open a table' }));
	await view.findByRole('region', { name: 'Waiting' });
	return view;
}

describe('/lobby — waiting at a table of your own', () => {
	it('opens the table with the request it always sent', async () => {
		await openTable();
		expect(lobby.createSeek).toHaveBeenCalledExactlyOnceWith(
			'guest-uuid',
			timeControlPresets[0].value,
			false,
		);
	});

	it('waits on the game frame, not inside the lobby', async () => {
		const { getByRole, queryByRole } = await openTable();
		// The frame: the title of what is being waited for, and a way to leave.
		expect(getByRole('heading', { level: 1 }).textContent).toContain('Open table');
		expect(getByRole('button', { name: 'Leave game' })).toBeTruthy();
		const card = getByRole('region', { name: 'Waiting' });
		expect(card.textContent).toContain('Waiting for an opponent');
		// The lobby itself is gone while waiting.
		expect(queryByRole('button', { name: '+ Open a table' })).toBeNull();
		// And the site header gets out of the way, as on a board.
		expect(chromeStore.zen).toBe(true);
	});

	it('shows both clocks standing at what they will start from', async () => {
		const { getAllByText } = await openTable();
		// The first preset is 5 + 3: five minutes on each clock, and no game to run them yet.
		expect(getAllByText('5:00')).toHaveLength(2);
	});

	it('offers no game action: there is no game to resign or to draw', async () => {
		const { queryByRole } = await openTable();
		expect(queryByRole('button', { name: /resign/i })).toBeNull();
		expect(queryByRole('button', { name: /draw/i })).toBeNull();
	});

	it('closes the table: the seek is cancelled and the lobby is back', async () => {
		const { getByRole, findByRole, queryByRole } = await openTable();
		await fireEvent.click(getByRole('button', { name: 'Close the table' }));
		expect(lobby.cancelSeek).toHaveBeenCalledExactlyOnceWith('seek-1', 'seek-secret');
		// Back in the lobby, with the form still open, as it was left: another table is one press away.
		await findByRole('button', { name: 'Open a table' });
		expect(queryByRole('region', { name: 'Waiting' })).toBeNull();
		expect(chromeStore.zen).toBe(false);
	});

	it('closes the table from the top bar as well', async () => {
		const { getByRole, findByRole } = await openTable();
		await fireEvent.click(getByRole('button', { name: 'Leave game' }));
		expect(lobby.cancelSeek).toHaveBeenCalledExactlyOnceWith('seek-1', 'seek-secret');
		await findByRole('button', { name: 'Open a table' });
	});

	it('goes to the board as the seat the server dealt when someone sits down', async () => {
		lobby.seekStatus.mockResolvedValue({
			matched: true,
			gameId: 'game-9',
			token: 'my-token',
			seat: 'Black',
		});
		await openTable();
		await vi.waitFor(() => expect(location.href).toContain('/live/game-9'));
		const board = new URL(location.href);
		expect(board.searchParams.get('seat')).toBe('my-token');
		expect(board.searchParams.get('as')).toBe('black');
		expect(lobby.cancelSeek).not.toHaveBeenCalled();
	});
});

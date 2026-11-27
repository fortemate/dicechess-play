import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

// The friend tab of Play (#258). It starts the same game as the `/live` setup page, which keeps
// its own tests; here the network edge is faked to pin what the tab sends and what it says.
const api = vi.hoisted(() => ({ live: true, createGame: vi.fn() }));
vi.mock('#lib/live/liveApi.js', () => ({
	isLiveEnabled: () => api.live,
	createGame: api.createGame,
}));
vi.mock('#lib/ingest/guestIdentity.js', () => ({ getGuestUuid: () => 'guest-uuid' }));
const invite = vi.hoisted(() => ({ rememberFriendInvite: vi.fn() }));
vi.mock('#lib/live/friendInvite.js', () => invite);
vi.mock('#lib/authStore.svelte.js', () => ({
	authStore: { status: 'signed-in', canSignIn: true, signIn: vi.fn() },
}));

import PlayFriend from './PlayFriend.svelte';

const GAME = {
	gameId: 'g1',
	tokens: [
		{ seat: 'White', token: 'tw' },
		{ seat: 'Black', token: 'tb' },
	],
};

describe('PlayFriend', () => {
	beforeEach(() => {
		api.live = true;
		api.createGame.mockReset().mockResolvedValue(GAME);
		invite.rememberFriendInvite.mockReset();
		vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('explains the flow in three steps', () => {
		const { getByRole } = render(PlayFriend);
		const steps = getByRole('region', { name: 'How it works' }).querySelectorAll('ol > li');
		expect(steps).toHaveLength(3);
		expect(steps[1].textContent).toContain('send the link');
	});

	it('says that a game by link is casual, even to a signed-in visitor, and points at the tables', () => {
		const { getByRole, queryByRole, getByText } = render(PlayFriend);
		expect(queryByRole('radio', { name: 'Rated' })).toBeNull();
		expect(getByText('Games by link are casual')).toBeTruthy();
		expect(getByRole('link', { name: 'Open tables' }).getAttribute('href')).toBe('/play?tab=table');
	});

	it('creates the game with the chosen clock and keeps the chosen colour for the creator', async () => {
		const { getByRole } = render(PlayFriend);
		await fireEvent.click(getByRole('radio', { name: '10 min' }));
		await fireEvent.click(getByRole('radio', { name: 'Black' }));
		await fireEvent.click(getByRole('button', { name: 'Create game' }));

		await waitFor(() =>
			expect(location.href).toBe('https://play.example/live/g1?seat=tb&as=black'),
		);
		expect(api.createGame).toHaveBeenCalledExactlyOnceWith('guest-uuid', 'guest-uuid', {
			SuddenDeath: { initialSeconds: 600 },
		});
		// The friend's link travels through session storage, never through the address.
		expect(invite.rememberFriendInvite).toHaveBeenCalledExactlyOnceWith(
			'g1',
			'https://play.example/live/g1?seat=tw&as=white',
		);
	});

	it('cannot create a second game while the first is on its way', async () => {
		let answer!: (value: typeof GAME) => void;
		api.createGame.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const { getByRole } = render(PlayFriend);
		await fireEvent.click(getByRole('button', { name: 'Create game' }));
		const button = getByRole('button', { name: /Creating/ }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		button.click();
		answer(GAME);
		await waitFor(() => expect(location.href).toContain('/live/g1'));
		expect(api.createGame).toHaveBeenCalledOnce();
		// Still locked: the browser is on its way to the board.
		expect((getByRole('button', { name: /Creating/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('says one plain thing when the server cannot be reached, and can be tried again', async () => {
		api.createGame.mockRejectedValue(new Error('createGame failed: 503'));
		const { getByRole, findByRole } = render(PlayFriend);
		await fireEvent.click(getByRole('button', { name: 'Create game' }));
		expect((await findByRole('alert')).textContent).toBe(
			'Live play is unavailable right now. Try again in a minute.',
		);
		expect((getByRole('button', { name: 'Create game' }) as HTMLButtonElement).disabled).toBe(
			false,
		);
		expect(location.href).toBe('about:blank');
	});

	it('offers nothing to create in a build without a play server', () => {
		api.live = false;
		const { queryByRole, getByText } = render(PlayFriend);
		expect(queryByRole('button', { name: 'Create game' })).toBeNull();
		expect(getByText(/this build has none/)).toBeTruthy();
	});
});

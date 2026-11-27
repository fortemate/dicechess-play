import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

/*
 * The setup of a game by link (#256): after "Create game" the creator goes straight to their own
 * board, and the link for the friend travels with them through session storage. What must hold:
 * the request is the one the page always sent, the board's address carries the creator's seat and
 * nothing of the friend's, and the friend's link is kept for exactly that game.
 *
 * Named `page.test.ts`, not `+page.test.ts`: a leading `+` marks a SvelteKit route file.
 */
const api = vi.hoisted(() => ({
	createGame: vi.fn(),
	isLiveEnabled: vi.fn(() => true),
}));
vi.mock('#lib/live/liveApi.js', () => api);
vi.mock('#lib/ingest/guestIdentity.js', () => ({ getGuestUuid: () => 'guest-uuid' }));
const invite = vi.hoisted(() => ({ rememberFriendInvite: vi.fn() }));
vi.mock('#lib/live/friendInvite.js', () => invite);
// Rated play is never offered here, so the choice component is not rendered and needs no account.
vi.mock('#lib/authStore.svelte.js', () => ({
	authStore: { status: 'signed-out', canSignIn: false, signIn: vi.fn() },
}));

import FriendSetupPage from './+page.svelte';
import { timeControlPresets } from '#lib/live/timeControls.js';

const GAME = {
	gameId: 'game-1',
	commit: 'c0ffee',
	tokens: [
		{ seat: 'White', token: 'white-token' },
		{ seat: 'Black', token: 'black-token' },
	],
};

let location: { origin: string; href: string };

beforeEach(() => {
	api.createGame.mockReset().mockResolvedValue(GAME);
	api.isLiveEnabled.mockReturnValue(true);
	invite.rememberFriendInvite.mockClear();
	location = { origin: 'https://play.test', href: 'https://play.test/live' };
	vi.stubGlobal('location', location);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('/live — creating a game by link', () => {
	it('sends the request it always sent: the creator on both seats, the chosen time control', async () => {
		const { getByRole } = render(FriendSetupPage);
		await fireEvent.click(getByRole('button', { name: 'Create game' }));
		await vi.waitFor(() => expect(api.createGame).toHaveBeenCalledTimes(1));
		expect(api.createGame).toHaveBeenCalledWith(
			'guest-uuid',
			'guest-uuid',
			timeControlPresets[0].value,
		);
	});

	it('goes straight to the board of the creator, as the colour they chose', async () => {
		const { getByRole } = render(FriendSetupPage);
		await fireEvent.click(getByRole('radio', { name: 'Black' }));
		await fireEvent.click(getByRole('button', { name: 'Create game' }));
		await vi.waitFor(() => expect(location.href).toContain('/live/game-1'));

		const board = new URL(location.href);
		expect(board.origin).toBe('https://play.test');
		expect(board.searchParams.get('seat')).toBe('black-token');
		expect(board.searchParams.get('as')).toBe('black');
		// The address of the board is what people copy: the friend's seat must not be in it.
		expect(location.href).not.toContain('white-token');
	});

	it('keeps the link of the OTHER seat for the friend, for that game', async () => {
		const { getByRole } = render(FriendSetupPage);
		await fireEvent.click(getByRole('radio', { name: 'Black' }));
		await fireEvent.click(getByRole('button', { name: 'Create game' }));
		await vi.waitFor(() => expect(invite.rememberFriendInvite).toHaveBeenCalledTimes(1));

		const [gameId, link] = invite.rememberFriendInvite.mock.calls[0];
		expect(gameId).toBe('game-1');
		const friend = new URL(link);
		expect(friend.pathname).toBe('/live/game-1');
		expect(friend.searchParams.get('seat')).toBe('white-token');
		expect(friend.searchParams.get('as')).toBe('white');
		expect(link).not.toContain('black-token');
	});

	it('keeps the link before it leaves the page', async () => {
		// The board reads the link as soon as it loads: storing it after the navigation started
		// would be a race.
		const order: string[] = [];
		invite.rememberFriendInvite.mockImplementation(() => order.push('remember'));
		Object.defineProperty(location, 'href', {
			configurable: true,
			get: () => 'https://play.test/live',
			set: () => order.push('navigate'),
		});
		const { getByRole } = render(FriendSetupPage);
		await fireEvent.click(getByRole('button', { name: 'Create game' }));
		await vi.waitFor(() => expect(order).toHaveLength(2));
		expect(order).toEqual(['remember', 'navigate']);
	});

	it('stays on the page and says so when the server cannot create the game', async () => {
		api.createGame.mockRejectedValue(new Error('createGame failed: 503'));
		const { getByRole, findByRole } = render(FriendSetupPage);
		await fireEvent.click(getByRole('button', { name: 'Create game' }));
		const alert = await findByRole('alert');
		expect(alert.textContent).toContain('Live play is unavailable right now');
		expect(location.href).toBe('https://play.test/live');
		expect(invite.rememberFriendInvite).not.toHaveBeenCalled();
		// And the visitor can try again.
		expect((getByRole('button', { name: 'Create game' }) as HTMLButtonElement).disabled).toBe(
			false,
		);
	});

	it('does not create a game from a response without both seats', async () => {
		api.createGame.mockResolvedValue({ ...GAME, tokens: [GAME.tokens[0]] });
		const { getByRole, findByRole } = render(FriendSetupPage);
		await fireEvent.click(getByRole('button', { name: 'Create game' }));
		await findByRole('alert');
		expect(invite.rememberFriendInvite).not.toHaveBeenCalled();
		expect(location.href).toBe('https://play.test/live');
	});
});

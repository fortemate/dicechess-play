import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { myBotsStore } from '$lib/bots/myBotsStore.svelte';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

const auth = vi.hoisted(() => ({
	authStore: {
		status: 'signed-out' as 'loading' | 'signed-in' | 'signed-out' | 'unavailable',
		account: null as { id: string } | null,
		canSignIn: true,
		signIn: vi.fn(),
	},
}));
vi.mock('$lib/authStore.svelte', () => auth);

const toasts = vi.hoisted(() => ({ toastStore: { success: vi.fn() } }));
vi.mock('$lib/toastStore.svelte', () => toasts);

import MyBotsPage from './+page.svelte';

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

describe('/me/bots page', () => {
	beforeEach(() => {
		myBotsStore.reset();
		auth.authStore.status = 'signed-out';
		auth.authStore.account = null;
		auth.authStore.canSignIn = true;
		auth.authStore.signIn.mockReset();
		toasts.toastStore.success.mockReset();
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
	});

	afterEach(() => {
		cleanup();
		myBotsStore.reset();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('does not attempt a /me/bots request for a signed-out visitor', () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const view = render(MyBotsPage);

		expect(view.getByText('Sign in to claim and manage your own bots.')).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('does not attempt a /me/bots request when account sign-in is unavailable', () => {
		auth.authStore.status = 'unavailable';
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const view = render(MyBotsPage);

		expect(view.getByText(/Bot management is unavailable/)).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('renders the owned list after the authenticated session resolves', async () => {
		auth.authStore.status = 'signed-in';
		auth.authStore.account = { id: 'owner-uuid' };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(200, { bots: [bot] }))
			.mockResolvedValueOnce(
				jsonResponse(200, {
					maxConcurrentGames: 1,
					openToHumans: false,
					ladderAllowance: 1,
					activeGames: 0,
				}),
			);
		vi.stubGlobal('fetch', fetchMock);

		const view = render(MyBotsPage);

		expect(await view.findByText('acme alice')).toBeTruthy();
		expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/me/bots');
		expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
	});

	it('explains how an author with no bots can claim one', async () => {
		auth.authStore.status = 'signed-in';
		auth.authStore.account = { id: 'owner-uuid' };
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { bots: [] })));

		const view = render(MyBotsPage);

		expect(await view.findByText(/Register a bot with the Bot API/)).toBeTruthy();
		await fireEvent.click(view.getAllByRole('button', { name: 'Claim a bot' })[0]);
		const tokenInput = view.getByRole('textbox', { name: 'Bot token' });
		expect(tokenInput).toBeTruthy();
		await waitFor(() => expect(document.activeElement).toBe(tokenInput));
	});

	it('clears a pasted claim token before its request completes', async () => {
		auth.authStore.status = 'signed-in';
		auth.authStore.account = { id: 'owner-uuid' };
		let resolveClaim: (response: Response) => void = () => {};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(200, { bots: [] }))
			.mockReturnValueOnce(new Promise<Response>((resolve) => (resolveClaim = resolve)))
			.mockResolvedValueOnce(
				jsonResponse(200, {
					maxConcurrentGames: 1,
					openToHumans: false,
					ladderAllowance: 1,
					activeGames: 0,
				}),
			);
		vi.stubGlobal('fetch', fetchMock);

		const view = render(MyBotsPage);
		await view.findByText(/You do not own any bots yet/);
		await fireEvent.click(view.getAllByRole('button', { name: 'Claim a bot' })[0]);
		const tokenInput = view.getByRole('textbox', { name: 'Bot token' }) as HTMLInputElement;
		await fireEvent.input(tokenInput, { target: { value: 'once-secret' } });
		await fireEvent.click(view.getByRole('button', { name: 'Claim bot' }));

		await waitFor(() => expect(tokenInput.value).toBe(''));
		resolveClaim(jsonResponse(200, { bots: [bot] }));
		await view.findByText('acme alice');
		expect(fetchMock.mock.calls[1][1]).toMatchObject({
			credentials: 'include',
			headers: { authorization: 'Bearer once-secret' },
		});
	});
});

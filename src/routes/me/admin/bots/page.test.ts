import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { AdminBot } from '$lib/bots/adminApi';

const nav = vi.hoisted(() => ({
	goto: vi.fn(),
}));
vi.mock('$app/navigation', () => nav);

const pageState = vi.hoisted(() => ({
	url: new URL('http://localhost:3000/me/admin/bots'),
}));
vi.mock('$app/state', () => ({
	get page() {
		return { url: pageState.url };
	},
}));

vi.mock('$app/paths', () => ({
	resolve: (path: string) => path,
}));

const state = vi.hoisted(() => {
	const mockBot1: AdminBot = {
		team: 'acme',
		name: 'alice',
		rating: 1720,
		rd: 85,
		provisional: false,
		onLadder: true,
		openToHumans: true,
		description: 'A helpful bot',
		maxConcurrentGames: 4,
		ladderAllowance: 3,
		activeGames: 1,
		owned: true,
		webhook: {
			url: 'https://acme.org/webhook',
			verifiedAt: '2026-08-01T00:00:00Z',
			capabilities: ['draws'],
			lastFailure: null,
		},
	};

	const mockBot2: AdminBot = {
		team: 'beta',
		name: 'bob',
		rating: 1500,
		rd: 350,
		provisional: true,
		onLadder: false,
		openToHumans: false,
		description: null,
		maxConcurrentGames: 2,
		ladderAllowance: 2,
		activeGames: 0,
		owned: false,
		webhook: null,
	};

	return {
		mockBot1,
		mockBot2,
		authStore: {
			status: 'signed-in',
			account: {
				id: 'account-id',
				nickname: 'AdminUser',
				rating: 1500,
				rd: 350,
				provisional: false,
				admin: true,
			},
			canSignIn: true,
			signIn: vi.fn(),
		},
		adminBotsStore: {
			bots: [mockBot1, mockBot2] as AdminBot[],
			loading: false,
			loaded: true,
			error: null,
			sessionExpired: false,
			forbidden: false,
			load: vi.fn(),
			refresh: vi.fn(),
			reset: vi.fn(),
		},
	};
});

vi.mock('$lib/authStore.svelte', () => ({ authStore: state.authStore }));
vi.mock('$lib/bots/adminBotsStore.svelte', () => ({ adminBotsStore: state.adminBotsStore }));

import AdminBotsPage from './+page.svelte';

describe('/me/admin/bots', () => {
	beforeEach(() => {
		pageState.url = new URL('http://localhost:3000/me/admin/bots');
		nav.goto.mockReset();
		state.authStore.status = 'signed-in';
		state.authStore.account = {
			id: 'account-id',
			nickname: 'AdminUser',
			rating: 1500,
			rd: 350,
			provisional: false,
			admin: true,
		};
		state.adminBotsStore.bots = [state.mockBot1, state.mockBot2];
		state.adminBotsStore.loaded = true;
		state.adminBotsStore.loading = false;
		state.adminBotsStore.error = null;
		state.adminBotsStore.sessionExpired = false;
		state.adminBotsStore.forbidden = false;

		for (const mock of [
			state.authStore.signIn,
			state.adminBotsStore.load,
			state.adminBotsStore.refresh,
			state.adminBotsStore.reset,
		])
			mock.mockReset();
	});

	afterEach(() => cleanup());

	it('renders an honest 403 for a signed-in non-admin direct navigation without touching the inventory', () => {
		state.authStore.account = {
			id: 'account-id',
			nickname: 'NotAdmin',
			rating: 1500,
			rd: 350,
			provisional: true,
			admin: false,
		};
		const view = render(AdminBotsPage);
		expect(view.getByRole('alert').textContent).toContain('403 — Administrator access required');
		expect(state.adminBotsStore.load).not.toHaveBeenCalled();
	});

	it('loads the inventory for the server-designated administrator', async () => {
		state.adminBotsStore.loaded = false;
		const view = render(AdminBotsPage);
		expect(view.queryByText('403 — Administrator access required')).toBeNull();
		await waitFor(() => expect(state.adminBotsStore.load).toHaveBeenCalledOnce());
	});

	it('renders the inventory table and filter controls', () => {
		const view = render(AdminBotsPage);
		expect(view.getByRole('region', { name: /admin bot inventory/i })).toBeTruthy();
		expect(view.getAllByText('alice').length).toBeGreaterThan(0);
		expect(view.getAllByText('bob').length).toBeGreaterThan(0);
	});

	it('opens detail drawer when a bot is selected from inventory', async () => {
		const view = render(AdminBotsPage);
		const inspectBtns = view.getAllByRole('button', { name: /inspect →/i });
		await fireEvent.click(inspectBtns[0]);

		await waitFor(() =>
			expect(view.getByRole('dialog', { name: /details for acme alice/i })).toBeTruthy(),
		);
	});

	it('filters inventory based on URL search query', () => {
		pageState.url = new URL('http://localhost:3000/me/admin/bots?q=bob');
		const view = render(AdminBotsPage);
		expect(view.getAllByText('bob').length).toBeGreaterThan(0);
		expect(view.queryByText('alice')).toBeNull();
	});

	it('updates URL when changing search in the filter bar', async () => {
		const view = render(AdminBotsPage);
		const searchInput = view.getByRole('searchbox', { name: /search bots/i });
		await fireEvent.input(searchInput, { target: { value: 'alice' } });

		expect(nav.goto).toHaveBeenCalledWith(
			expect.stringContaining('q=alice'),
			expect.objectContaining({ noScroll: true, keepFocus: true }),
		);
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';

const state = vi.hoisted(() => ({
	authStore: {
		status: 'signed-in',
		account: {
			id: 'account-id',
			nickname: 'NotAdmin',
			rating: 1500,
			rd: 350,
			provisional: true,
			admin: false,
		},
		canSignIn: true,
		signIn: vi.fn(),
	},
	adminBotsStore: {
		bots: [],
		loading: false,
		loaded: false,
		error: null,
		sessionExpired: false,
		forbidden: false,
		load: vi.fn(),
		refresh: vi.fn(),
		reset: vi.fn(),
	},
}));

vi.mock('$lib/authStore.svelte', () => ({ authStore: state.authStore }));
vi.mock('$lib/bots/adminBotsStore.svelte', () => ({ adminBotsStore: state.adminBotsStore }));

import AdminBotsPage from './+page.svelte';

describe('/me/admin/bots', () => {
	beforeEach(() => {
		state.authStore.status = 'signed-in';
		state.authStore.account = {
			id: 'account-id',
			nickname: 'NotAdmin',
			rating: 1500,
			rd: 350,
			provisional: true,
			admin: false,
		};
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
		const view = render(AdminBotsPage);
		expect(view.getByRole('alert').textContent).toContain('403 — Administrator access required');
		expect(state.adminBotsStore.load).not.toHaveBeenCalled();
	});

	it('loads the inventory for the server-designated administrator', async () => {
		state.authStore.account.admin = true;
		const view = render(AdminBotsPage);
		expect(view.queryByText('403 — Administrator access required')).toBeNull();
		await waitFor(() => expect(state.adminBotsStore.load).toHaveBeenCalledOnce());
	});
});

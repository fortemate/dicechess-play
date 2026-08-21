import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { AdminBot } from '$lib/bots/adminApi';

const api = vi.hoisted(() => ({
	setAdminLadder: vi.fn(),
	openAdminToHumans: vi.fn(),
	closeAdminToHumans: vi.fn(),
	setAdminDescription: vi.fn(),
	rotateAdminToken: vi.fn(),
}));
vi.mock('$lib/bots/adminApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/bots/adminApi')>();
	return { ...actual, ...api };
});

const toasts = vi.hoisted(() => ({ toastStore: { success: vi.fn() } }));
vi.mock('$lib/toastStore.svelte', () => toasts);

import AdminBotCard from './AdminBotCard.svelte';

function bot(overrides: Partial<AdminBot> = {}): AdminBot {
	return {
		team: 'acme',
		name: 'alice',
		rating: 1720,
		rd: 85,
		provisional: false,
		onLadder: false,
		openToHumans: false,
		description: null,
		owned: false,
		...overrides,
	};
}

describe('AdminBotCard', () => {
	beforeEach(() => {
		for (const mock of Object.values(api)) mock.mockReset();
		api.setAdminLadder.mockResolvedValue({ outcome: 'ok' });
		api.openAdminToHumans.mockResolvedValue({ outcome: 'ok' });
		api.closeAdminToHumans.mockResolvedValue({ outcome: 'ok' });
		api.setAdminDescription.mockResolvedValue({ outcome: 'ok' });
		toasts.toastStore.success.mockReset();
	});

	afterEach(() => cleanup());

	it('shows every inventory state while keeping ownership display-only', () => {
		const view = render(AdminBotCard, {
			bot: bot({ provisional: true, owned: true, openToHumans: true, description: 'Calm bot' }),
			onChanged: vi.fn(),
		});
		expect(view.getByText('Owned')).toBeTruthy();
		expect(view.getByText(/provisional/)).toBeTruthy();
		expect(view.getByText(/administrators cannot claim or release it/i)).toBeTruthy();
		expect(view.queryByRole('button', { name: /claim|release/i })).toBeNull();
	});

	it('updates the description through the dedicated PUT action while the catalog is closed', async () => {
		const changed = vi.fn();
		const view = render(AdminBotCard, { bot: bot(), onChanged: changed });
		await fireEvent.input(view.getByRole('textbox', { name: 'Catalog description' }), {
			target: { value: 'Retired after 2026' },
		});
		await fireEvent.click(view.getByRole('button', { name: 'Save description' }));
		await waitFor(() =>
			expect(api.setAdminDescription).toHaveBeenCalledWith('acme', 'alice', 'Retired after 2026'),
		);
		expect(changed).toHaveBeenCalledOnce();
	});

	it('joins the ladder and refreshes the inventory after the audited action', async () => {
		const changed = vi.fn();
		const view = render(AdminBotCard, { bot: bot(), onChanged: changed });
		await fireEvent.click(view.getByRole('button', { name: 'Join ladder' }));
		await waitFor(() => expect(api.setAdminLadder).toHaveBeenCalledWith('acme', 'alice', true));
		expect(changed).toHaveBeenCalledOnce();
	});

	it('opens and closes the human catalog through their respective audited actions', async () => {
		const opening = render(AdminBotCard, { bot: bot(), onChanged: vi.fn() });
		await fireEvent.click(opening.getByRole('button', { name: 'Open to humans' }));
		await waitFor(() => expect(api.openAdminToHumans).toHaveBeenCalledWith('acme', 'alice', ''));
		opening.unmount();

		const closing = render(AdminBotCard, {
			bot: bot({ openToHumans: true }),
			onChanged: vi.fn(),
		});
		await fireEvent.click(closing.getByRole('button', { name: 'Close catalog' }));
		await waitFor(() => expect(api.closeAdminToHumans).toHaveBeenCalledWith('acme', 'alice'));
	});

	it('renders a server 403 instead of a generic action failure', async () => {
		api.setAdminLadder.mockResolvedValue({ outcome: 'forbidden' });
		const view = render(AdminBotCard, { bot: bot(), onChanged: vi.fn() });
		await fireEvent.click(view.getByRole('button', { name: 'Join ladder' }));
		await waitFor(() => expect(view.getByRole('alert').textContent).toContain('403'));
	});

	it('keeps controls disabled until its parent has refreshed the inventory', async () => {
		let completeRefresh!: () => void;
		const changed = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					completeRefresh = resolve;
				}),
		);
		const view = render(AdminBotCard, { bot: bot(), onChanged: changed });
		await fireEvent.click(view.getByRole('button', { name: 'Join ladder' }));
		await waitFor(() => expect(changed).toHaveBeenCalledOnce());
		expect((view.getByRole('button', { name: 'Saving' }) as HTMLButtonElement).disabled).toBe(true);
		completeRefresh();
		await waitFor(() =>
			expect(
				(view.getByRole('button', { name: 'Join ladder' }) as HTMLButtonElement).disabled,
			).toBe(false),
		);
	});

	it('requires the echoed name and reveals the rotated plaintext token only once', async () => {
		api.rotateAdminToken.mockResolvedValue({ outcome: 'rotated', token: 'fresh-secret' });
		const changed = vi.fn();
		const view = render(AdminBotCard, { bot: bot(), onChanged: changed });

		await fireEvent.click(view.getByRole('button', { name: 'Rotate token' }));
		const confirm = view.getByRole('textbox', {
			name: /type alice to confirm/i,
		}) as HTMLInputElement;
		const submit = view.getByRole('button', { name: 'Confirm rotation' }) as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		await fireEvent.input(confirm, { target: { value: 'ALICE' } });
		expect(submit.disabled).toBe(false);
		await fireEvent.click(submit);

		await waitFor(() =>
			expect(view.getByText('Copy this token now — it will not be shown again.')).toBeTruthy(),
		);
		expect(view.getByRole('status')).toBeTruthy();
		expect(view.getAllByText('fresh-secret')).toHaveLength(1);
		expect(api.rotateAdminToken).toHaveBeenCalledWith('acme', 'alice', 'ALICE');
		expect(changed).toHaveBeenCalledOnce();

		// A fresh component (as on reload) has no route/store source from which it could restore this token.
		view.unmount();
		const afterReload = render(AdminBotCard, { bot: bot(), onChanged: vi.fn() });
		expect(afterReload.queryByText('fresh-secret')).toBeNull();
	});
});

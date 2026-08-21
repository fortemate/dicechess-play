import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { MyBot } from '$lib/bots/ownerApi';

const api = vi.hoisted(() => ({
	fetchCapacity: vi.fn(),
	setLadder: vi.fn(),
	openToHumans: vi.fn(),
	closeToHumans: vi.fn(),
	setCapacity: vi.fn(),
	rotateToken: vi.fn(),
	releaseBot: vi.fn(),
}));
vi.mock('$lib/bots/ownerApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/bots/ownerApi')>();
	return { ...actual, ...api };
});

const toasts = vi.hoisted(() => ({ toastStore: { success: vi.fn() } }));
vi.mock('$lib/toastStore.svelte', () => toasts);

import OwnedBotCard from './OwnedBotCard.svelte';

const capacity = {
	maxConcurrentGames: 4,
	openToHumans: false,
	ladderAllowance: 4,
	activeGames: 1,
};

function bot(overrides: Partial<MyBot> = {}): MyBot {
	return {
		team: 'acme',
		name: 'alice',
		rating: 1720,
		rd: 85,
		onLadder: false,
		openToHumans: false,
		...overrides,
	};
}

describe('OwnedBotCard', () => {
	beforeEach(() => {
		for (const mock of Object.values(api)) mock.mockReset();
		api.fetchCapacity.mockResolvedValue({ outcome: 'ok', capacity });
		api.setLadder.mockResolvedValue({ outcome: 'ok' });
		toasts.toastStore.success.mockReset();
	});

	afterEach(() => cleanup());

	it('renders the owner-only controls and current capacity', async () => {
		const view = render(OwnedBotCard, { bot: bot(), onChanged: vi.fn() });
		expect(view.getByText('acme alice')).toBeTruthy();
		expect(await view.findByDisplayValue('4')).toBeTruthy();
		expect(view.getByRole('button', { name: 'Join ladder' })).toBeTruthy();
		expect(view.getByRole('button', { name: 'Open to humans' })).toBeTruthy();
	});

	it('requires an echoed name before rotation and renders the plaintext token once', async () => {
		api.rotateToken.mockResolvedValue({ outcome: 'rotated', token: 'fresh-secret' });
		const changed = vi.fn();
		const view = render(OwnedBotCard, { bot: bot(), onChanged: changed });

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
		expect(view.getAllByText('fresh-secret')).toHaveLength(1);
		expect(api.rotateToken).toHaveBeenCalledWith('acme', 'alice', 'ALICE');
		expect(changed).toHaveBeenCalledOnce();

		// The token is component-local state: recreating the card (as a reload does) cannot reveal it.
		view.unmount();
		const afterReload = render(OwnedBotCard, { bot: bot(), onChanged: vi.fn() });
		expect(afterReload.queryByText('fresh-secret')).toBeNull();
	});

	it('clears a revealed token as soon as another action begins', async () => {
		api.rotateToken.mockResolvedValue({ outcome: 'rotated', token: 'fresh-secret' });
		const view = render(OwnedBotCard, { bot: bot(), onChanged: vi.fn() });
		await fireEvent.click(view.getByRole('button', { name: 'Rotate token' }));
		await fireEvent.input(view.getByRole('textbox', { name: /type alice to confirm/i }), {
			target: { value: 'alice' },
		});
		await fireEvent.click(view.getByRole('button', { name: 'Confirm rotation' }));
		await view.findByText('fresh-secret');

		await fireEvent.click(view.getByRole('button', { name: 'Join ladder' }));
		expect(view.queryByText('fresh-secret')).toBeNull();
	});

	it('requires the bot name before release and explains the consequence', async () => {
		api.releaseBot.mockResolvedValue({ outcome: 'released', bots: [] });
		const view = render(OwnedBotCard, { bot: bot(), onChanged: vi.fn() });
		await fireEvent.click(view.getByRole('button', { name: 'Release bot' }));

		expect(view.getByText(/Anyone holding this bot’s token can claim it afterwards/)).toBeTruthy();
		const submit = view.getByRole('button', { name: 'Confirm release' }) as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		await fireEvent.input(view.getByRole('textbox', { name: /type alice to confirm/i }), {
			target: { value: 'alice' },
		});
		expect(submit.disabled).toBe(false);
		await fireEvent.click(submit);
		expect(api.releaseBot).toHaveBeenCalledWith('acme', 'alice');
	});

	it('renders not-yours distinctly from an absent bot', async () => {
		api.setLadder.mockResolvedValue({ outcome: 'not-yours' });
		const view = render(OwnedBotCard, { bot: bot(), onChanged: vi.fn() });
		await fireEvent.click(view.getByRole('button', { name: 'Join ladder' }));
		await waitFor(() => expect(view.getByRole('alert').textContent).toContain('not yours'));

		api.setLadder.mockResolvedValue({ outcome: 'no-such-bot' });
		await fireEvent.click(view.getByRole('button', { name: 'Join ladder' }));
		await waitFor(() => expect(view.getByRole('alert').textContent).toContain('No such bot'));
	});
});

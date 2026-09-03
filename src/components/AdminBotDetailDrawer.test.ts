import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import AdminBotDetailDrawer from './AdminBotDetailDrawer.svelte';
import type { AdminBot } from '$lib/bots/adminApi';

const api = vi.hoisted(() => ({
	setAdminLadder: vi.fn(),
	openAdminToHumans: vi.fn(),
	closeAdminToHumans: vi.fn(),
	setAdminDescription: vi.fn(),
	setAdminCapacity: vi.fn(),
	rotateAdminToken: vi.fn(),
}));

vi.mock('$lib/bots/adminApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/bots/adminApi')>();
	return { ...actual, ...api };
});

const toasts = vi.hoisted(() => ({ toastStore: { success: vi.fn() } }));
vi.mock('$lib/toastStore.svelte', () => toasts);

// Every rendered drawer mounts BotWebhookPanel, which reads its own authoritative webhook slot.
// Without a play-api base the transport short-circuits before `fetch`, so this suite issues no
// requests either way — but stubbing it makes the panel render real state instead of its
// "unavailable in this build" branch, which is what gives the delegation assertion below its
// meaning. The panel's own flows are covered in BotWebhookPanel.test.ts.
const webhookApi = vi.hoisted(() => ({
	readWebhook: vi.fn(),
	createWebhookSetup: vi.fn(),
	activateWebhookSetup: vi.fn(),
	cancelWebhookSetup: vi.fn(),
	updateWebhookCapabilities: vi.fn(),
	deleteWebhook: vi.fn(),
	fetchWebhookCapabilityCatalog: vi.fn(),
}));
vi.mock('$lib/bots/webhookApi', () => webhookApi);

function makeBot(overrides: Partial<AdminBot> = {}): AdminBot {
	return {
		team: 'acme',
		name: 'alice',
		rating: 1720,
		rd: 85,
		provisional: false,
		onLadder: false,
		openToHumans: false,
		description: null,
		maxConcurrentGames: 4,
		ladderAllowance: 4,
		activeGames: 1,
		owned: false,
		webhook: {
			url: 'https://acme.org/webhook',
			verifiedAt: '2026-08-01T00:00:00Z',
			capabilities: ['draws'],
			lastFailure: null,
		},
		...overrides,
	};
}

describe('AdminBotDetailDrawer', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		for (const mock of Object.values(webhookApi)) mock.mockReset();
		webhookApi.readWebhook.mockResolvedValue({
			outcome: 'ok',
			value: {
				revision: 'whrev_01',
				registration: {
					registrationId: 'whreg_01',
					url: 'https://panel.example.com/turn',
					verifiedAt: '2026-08-01T12:00:00Z',
					capabilities: ['draws'],
					lastFailure: null,
				},
				pendingSetup: null,
			},
		});
		webhookApi.fetchWebhookCapabilityCatalog.mockResolvedValue({
			outcome: 'ok',
			value: [
				{ name: 'draws', status: 'available', selectable: true },
				{ name: 'doubling', status: 'reserved', selectable: false },
			],
		});
		for (const mock of Object.values(api)) mock.mockReset();
		api.setAdminLadder.mockResolvedValue({ outcome: 'ok' });
		api.openAdminToHumans.mockResolvedValue({ outcome: 'ok' });
		api.closeAdminToHumans.mockResolvedValue({ outcome: 'ok' });
		api.setAdminDescription.mockResolvedValue({ outcome: 'ok' });
		api.setAdminCapacity.mockResolvedValue({
			outcome: 'ok',
			capacity: {
				maxConcurrentGames: 8,
				openToHumans: false,
				ladderAllowance: 8,
				activeGames: 1,
			},
		});
		toasts.toastStore.success.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
	});

	it('renders bot details, capacity, and the webhook summary badge', () => {
		const view = render(AdminBotDetailDrawer, {
			bot: makeBot({
				provisional: true,
				owned: true,
				openToHumans: true,
				description: 'A helpful test bot',
			}),
			onClose: vi.fn(),
			onChanged: vi.fn(),
		});

		expect(view.getByText(/Provisional/i)).toBeTruthy();
		expect(view.getByText('Owned')).toBeTruthy();
		expect(view.getByText('1 / 4 active')).toBeTruthy();
		expect(view.getByText('Webhook active')).toBeTruthy();
	});

	it('delegates webhook and capability management to the guarded panel', async () => {
		// The drawer must not render webhook state from its inventory row: those fields are a list
		// summary with no revision, and every mutation needs the panel's own authoritative read
		// (#48). The panel's own suite covers the flows; this only pins the delegation.
		const view = render(AdminBotDetailDrawer, {
			bot: makeBot(),
			onClose: vi.fn(),
			onChanged: vi.fn(),
		});

		expect(view.getByRole('region', { name: /Webhook & capabilities/i })).toBeTruthy();
		expect(view.queryByDisplayValue('https://acme.org/webhook')).toBeNull();
		expect(webhookApi.readWebhook).toHaveBeenCalledWith('admin', 'acme', 'alice');
		expect(await view.findByDisplayValue('https://panel.example.com/turn')).toBeTruthy();
	});

	it('joins and leaves the ladder through audited action', async () => {
		const onChanged = vi.fn();
		const view = render(AdminBotDetailDrawer, {
			bot: makeBot(),
			onClose: vi.fn(),
			onChanged,
		});

		await fireEvent.click(view.getByRole('button', { name: /join ladder/i }));
		await waitFor(() => expect(api.setAdminLadder).toHaveBeenCalledWith('acme', 'alice', true));
		expect(onChanged).toHaveBeenCalledOnce();
	});

	it('updates catalog description', async () => {
		const onChanged = vi.fn();
		const view = render(AdminBotDetailDrawer, {
			bot: makeBot(),
			onClose: vi.fn(),
			onChanged,
		});

		const textarea = view.getByRole('textbox', { name: /catalog description/i });
		await fireEvent.input(textarea, { target: { value: 'New description' } });
		await fireEvent.click(view.getByRole('button', { name: /save description/i }));

		await waitFor(() =>
			expect(api.setAdminDescription).toHaveBeenCalledWith('acme', 'alice', 'New description'),
		);
		expect(onChanged).toHaveBeenCalledOnce();
	});

	it('toggles open/close to humans with description validation', async () => {
		const onChanged = vi.fn();
		const view = render(AdminBotDetailDrawer, {
			bot: makeBot({ openToHumans: false, description: 'Friendly bot' }),
			onClose: vi.fn(),
			onChanged,
		});

		await fireEvent.click(view.getByRole('button', { name: /open to humans/i }));
		await waitFor(() =>
			expect(api.openAdminToHumans).toHaveBeenCalledWith('acme', 'alice', 'Friendly bot'),
		);
		expect(onChanged).toHaveBeenCalledOnce();

		// Validation when opening with empty description
		view.rerender({
			bot: makeBot({ openToHumans: false, description: null }),
			onClose: vi.fn(),
			onChanged,
		});
		const textarea = view.getByRole('textbox', { name: /catalog description/i });
		await fireEvent.input(textarea, { target: { value: '' } });
		await fireEvent.click(view.getByRole('button', { name: /open to humans/i }));
		expect(view.getByRole('alert').textContent).toContain('Enter a catalog description');
	});

	it('updates capacity with validation, server readback, and error reporting', async () => {
		const onChanged = vi.fn();
		const view = render(AdminBotDetailDrawer, {
			bot: makeBot({ maxConcurrentGames: 4 }),
			onClose: vi.fn(),
			onChanged,
		});

		const capacityInput = view.getByLabelText(/max concurrent games:/i);
		await fireEvent.input(capacityInput, { target: { value: '8' } });
		await fireEvent.click(view.getByRole('button', { name: /save capacity/i }));

		await waitFor(() => expect(api.setAdminCapacity).toHaveBeenCalledWith('acme', 'alice', 8));
		expect(onChanged).toHaveBeenCalledOnce();

		// Non-ok error reporting
		api.setAdminCapacity.mockResolvedValueOnce({
			outcome: 'invalid',
			reason: 'Capacity exceeds system limit.',
		});
		await fireEvent.input(capacityInput, { target: { value: '16' } });
		await fireEvent.click(view.getByRole('button', { name: /save capacity/i }));
		await waitFor(() => {
			expect(view.getByRole('alert').textContent).toContain('Capacity exceeds system limit.');
		});
	});

	it('resets edit fields, secret token, and error state when switching selected bot', async () => {
		const botA = makeBot({
			team: 'acme',
			name: 'alice',
			description: 'Original A',
			maxConcurrentGames: 4,
		});
		const botB = makeBot({
			team: 'beta',
			name: 'bob',
			description: 'Original B',
			maxConcurrentGames: 6,
		});

		const view = render(AdminBotDetailDrawer, {
			bot: botA,
			onClose: vi.fn(),
			onChanged: vi.fn(),
		});

		// User edits fields for bot A
		const descInput = view.getByRole('textbox', { name: /catalog description/i });
		const capInput = view.getByLabelText(/max concurrent games:/i);
		await fireEvent.input(descInput, { target: { value: 'Dirty A edit' } });
		await fireEvent.input(capInput, { target: { value: '20' } });

		// Switch to bot B
		view.rerender({
			bot: botB,
			onClose: vi.fn(),
			onChanged: vi.fn(),
		});

		// Verify bot B values are freshly populated
		const updatedDesc = view.getByRole('textbox', {
			name: /catalog description/i,
		}) as HTMLTextAreaElement;
		const updatedCap = view.getByLabelText(/max concurrent games:/i) as HTMLInputElement;
		expect(updatedDesc.value).toBe('Original B');
		expect(updatedCap.value).toBe('6');
	});

	it('validates capacity range (1..32)', async () => {
		const view = render(AdminBotDetailDrawer, {
			bot: makeBot({ maxConcurrentGames: 4 }),
			onClose: vi.fn(),
			onChanged: vi.fn(),
		});

		const capacityInput = view.getByLabelText(/max concurrent games:/i);
		await fireEvent.input(capacityInput, { target: { value: '50' } });
		await fireEvent.click(view.getByRole('button', { name: /save capacity/i }));

		expect(api.setAdminCapacity).not.toHaveBeenCalled();
		expect(view.getByRole('alert').textContent).toContain('between 1 and 32');
	});

	it('rotates token with name-echo confirmation and reveals secret only once in local state', async () => {
		api.rotateAdminToken.mockResolvedValue({ outcome: 'rotated', token: 'new-secret-123' });
		const onChanged = vi.fn();
		const view = render(AdminBotDetailDrawer, {
			bot: makeBot(),
			onClose: vi.fn(),
			onChanged,
		});

		await fireEvent.click(view.getByRole('button', { name: /rotate token/i }));
		const confirmInput = view.getByRole('textbox', { name: /type alice to proceed:/i });
		const confirmBtn = view.getByRole('button', { name: /confirm rotation/i }) as HTMLButtonElement;

		expect(confirmBtn.disabled).toBe(true);
		await fireEvent.input(confirmInput, { target: { value: 'ALICE' } });
		expect(confirmBtn.disabled).toBe(false);

		await fireEvent.click(confirmBtn);
		await waitFor(() =>
			expect(view.getByText('Copy this token now — it will not be shown again.')).toBeTruthy(),
		);
		expect(view.getByText('new-secret-123')).toBeTruthy();
		expect(onChanged).toHaveBeenCalledOnce();
	});

	it('closes when close button or Escape key is pressed', async () => {
		const onClose = vi.fn();
		const view = render(AdminBotDetailDrawer, {
			bot: makeBot(),
			onClose,
			onChanged: vi.fn(),
		});

		const closeBtn = view.getByRole('button', { name: /close detail drawer/i });
		await fireEvent.click(closeBtn);
		expect(onClose).toHaveBeenCalledOnce();

		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(2);
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import BotWebhookPanel from './BotWebhookPanel.svelte';
import type { ManagedWebhookSlot } from '$lib/bots/webhookApi';

const api = vi.hoisted(() => ({
	readWebhook: vi.fn(),
	createWebhookSetup: vi.fn(),
	activateWebhookSetup: vi.fn(),
	cancelWebhookSetup: vi.fn(),
	updateWebhookCapabilities: vi.fn(),
	deleteWebhook: vi.fn(),
	fetchWebhookCapabilityCatalog: vi.fn(),
}));
vi.mock('$lib/bots/webhookApi', () => api);

const SECRET = 'd'.repeat(64);

const registry = [
	{ name: 'draws', status: 'available', selectable: true },
	{ name: 'doubling', status: 'reserved', selectable: false },
];

function makeSlot(overrides: Partial<ManagedWebhookSlot> = {}): ManagedWebhookSlot {
	return {
		revision: 'whrev_01',
		registration: {
			registrationId: 'whreg_01',
			url: 'https://bot.example.com/turn',
			verifiedAt: '2026-08-01T12:00:00Z',
			capabilities: ['draws'],
			lastFailure: null,
		},
		pendingSetup: null,
		...overrides,
	};
}

const problem = (code: string, status: number, extra: Record<string, unknown> = {}) => ({
	outcome: 'problem' as const,
	status,
	code,
	title: 'nope',
	detail: 'server detail',
	current: null,
	retryAfterSeconds: null,
	...extra,
});

function mount(props: Partial<{ root: 'owner' | 'admin'; onChanged: () => void }> = {}) {
	return render(BotWebhookPanel, {
		root: props.root ?? 'admin',
		team: 'acme',
		name: 'alice',
		onChanged: props.onChanged ?? vi.fn(),
	});
}

describe('BotWebhookPanel', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		for (const mock of Object.values(api)) mock.mockReset();
		api.fetchWebhookCapabilityCatalog.mockResolvedValue({ outcome: 'ok', value: registry });
		api.readWebhook.mockResolvedValue({ outcome: 'ok', value: makeSlot() });
		vi.stubGlobal('navigator', {
			clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	describe('inspection', () => {
		it('shows URL, verification state, and capabilities without any secret', async () => {
			const view = mount();
			expect(await view.findByDisplayValue('https://bot.example.com/turn')).toBeTruthy();
			expect(view.getByText('whreg_01')).toBeTruthy();
			expect(view.getByText(/signing secret is never readable/i)).toBeTruthy();
			expect(view.queryByLabelText(/Candidate signing secret/i)).toBeNull();
		});

		it('summarizes the last delivery failure', async () => {
			api.readWebhook.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					registration: {
						...makeSlot().registration!,
						lastFailure: { at: '2026-08-30T10:00:00Z', reason: 'connect timeout' },
					},
				}),
			});
			const view = mount();
			expect(await view.findByText(/Last delivery failure/i)).toBeTruthy();
			expect(view.getByText('connect timeout')).toBeTruthy();
		});

		it('reads the owner root when mounted on the owner surface', async () => {
			mount({ root: 'owner' });
			await waitFor(() => expect(api.readWebhook).toHaveBeenCalledWith('owner', 'acme', 'alice'));
		});
	});

	describe('inaccessible actions', () => {
		it('explains a closed feature gate and offers no controls', async () => {
			api.readWebhook.mockResolvedValue({ outcome: 'gated' });
			const view = mount();
			expect(await view.findByText(/switched off on this play-api instance/i)).toBeTruthy();
			expect(view.queryByRole('button', { name: /Register a webhook/i })).toBeNull();
			expect(view.queryByRole('button', { name: /Delete webhook/i })).toBeNull();
		});

		it('reports an authorization refusal and offers no controls', async () => {
			api.readWebhook.mockResolvedValue(problem('bot_not_owned', 403));
			const view = mount();
			expect(await view.findByText(/refused access/i)).toBeTruthy();
			expect(view.queryByRole('button', { name: /Replace URL/i })).toBeNull();
		});

		it('reports an expired session without offering controls', async () => {
			api.readWebhook.mockResolvedValue(problem('authentication_required', 401));
			const view = mount();
			expect(await view.findByText(/session has expired/i)).toBeTruthy();
			expect(view.queryByRole('button', { name: /Rotate secret/i })).toBeNull();
		});

		it('offers a retry when the read simply failed, and drops the failure once it succeeds', async () => {
			api.readWebhook.mockResolvedValue({ outcome: 'offline' });
			const view = mount();
			const retry = await view.findByRole('button', { name: 'Retry' });
			api.readWebhook.mockResolvedValue({ outcome: 'ok', value: makeSlot() });
			await fireEvent.click(retry);

			expect(await view.findByDisplayValue('https://bot.example.com/turn')).toBeTruthy();
			// The failure notice is invisible while the read is failing, so carrying it over would
			// announce the problem only after it had been fixed.
			expect(view.queryByText(/Could not read the webhook configuration/i)).toBeNull();
		});

		it('withdraws staging controls when the server has no verification transport', async () => {
			api.readWebhook.mockResolvedValue({ outcome: 'ok', value: makeSlot() });
			api.createWebhookSetup.mockResolvedValue(problem('webhook_verification_unavailable', 503));
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Rotate secret/i }));
			await fireEvent.input(view.getByLabelText(/type alice to confirm/i), {
				target: { value: 'alice' },
			});
			await fireEvent.click(view.getByRole('button', { name: /Issue new secret/i }));

			expect(await view.findByText(/Webhook verification is unavailable/i)).toBeTruthy();

			// Leaving the rotate form returns to the action row, which must now be inert: with no
			// outbound transport the server cannot verify any candidate, so offering to stage one
			// would promise a flow that fails closed.
			await fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
			await waitFor(() =>
				expect(
					(view.getByRole('button', { name: /Replace URL/i }) as HTMLButtonElement).disabled,
				).toBe(true),
			);
			expect(
				(view.getByRole('button', { name: /Rotate secret/i }) as HTMLButtonElement).disabled,
			).toBe(true);
			// Deletion does not verify anything, so it stays available.
			expect(
				(view.getByRole('button', { name: /Delete webhook/i }) as HTMLButtonElement).disabled,
			).toBe(false);
		});
	});

	describe('capabilities', () => {
		it('never renders the reserved doubling capability as a working control', async () => {
			const view = mount();
			expect(await view.findByRole('checkbox', { name: 'draws' })).toBeTruthy();
			expect(view.queryByRole('checkbox', { name: 'doubling' })).toBeNull();
			expect(view.getByText(/doubling · reserved/)).toBeTruthy();
			expect(view.getByText(/Reserved by play-api and not selectable yet/i)).toBeTruthy();
		});

		it('offers doubling only once the server advertises it as available', async () => {
			api.fetchWebhookCapabilityCatalog.mockResolvedValue({
				outcome: 'ok',
				value: [
					{ name: 'draws', status: 'available', selectable: true },
					{ name: 'doubling', status: 'available', selectable: true },
				],
			});
			const view = mount();
			expect(await view.findByRole('checkbox', { name: 'doubling' })).toBeTruthy();
		});

		it('shows an unknown legacy capability read-only and warns a save would drop it', async () => {
			api.readWebhook.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					registration: { ...makeSlot().registration!, capabilities: ['draws', 'telepathy'] },
				}),
			});
			const view = mount();
			expect(await view.findByText(/telepathy · unrecognised/)).toBeTruthy();
			expect(view.queryByRole('checkbox', { name: 'telepathy' })).toBeNull();
			expect(view.getByText(/Saving capabilities will drop/i)).toBeTruthy();
		});

		it('states that a capability save leaves credentials alone, and confirms server state', async () => {
			api.updateWebhookCapabilities.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					revision: 'whrev_02',
					registration: { ...makeSlot().registration!, capabilities: [] },
				}),
			});
			const view = mount();
			const draws = await view.findByRole('checkbox', { name: 'draws' });
			await fireEvent.click(draws);
			await fireEvent.click(view.getByRole('button', { name: 'Save capabilities' }));

			expect(await view.findByText(/No credential changed/i)).toBeTruthy();
			expect(api.updateWebhookCapabilities).toHaveBeenCalledWith(
				'admin',
				'acme',
				'alice',
				'whrev_01',
				[],
			);
		});

		it('keeps the save button inert until the selection actually differs', async () => {
			const view = mount();
			await view.findByRole('checkbox', { name: 'draws' });
			const save = view.getByRole('button', { name: 'Save capabilities' }) as HTMLButtonElement;
			expect(save.disabled).toBe(true);
			await fireEvent.click(view.getByRole('checkbox', { name: 'draws' }));
			await waitFor(() => expect(save.disabled).toBe(false));
		});

		it('recovers a stale capability write by showing the server state', async () => {
			api.updateWebhookCapabilities.mockResolvedValue(
				problem('stale_webhook_revision', 412, {
					current: makeSlot({
						revision: 'whrev_99',
						registration: {
							...makeSlot().registration!,
							url: 'https://changed.example.com/turn',
						},
					}),
				}),
			);
			const view = mount();
			await fireEvent.click(await view.findByRole('checkbox', { name: 'draws' }));
			await fireEvent.click(view.getByRole('button', { name: 'Save capabilities' }));

			expect(await view.findByText(/changed this webhook first/i)).toBeTruthy();
			expect(view.getByDisplayValue('https://changed.example.com/turn')).toBeTruthy();
		});
	});

	describe('URL edit-and-verify flow', () => {
		function stageCreated(kind: 'create' | 'replaceUrl' | 'rotateSecret') {
			api.createWebhookSetup.mockResolvedValue({
				outcome: 'ok',
				value: {
					setupId: 'whs_01',
					kind,
					secret: SECRET,
					expiresAt: '2026-09-01T10:15:00Z',
					revision: 'whrev_02',
				},
			});
		}

		it('registers a first webhook through an explicit staged form', async () => {
			api.readWebhook.mockResolvedValue({
				outcome: 'ok',
				value: { revision: 'whrev_01', registration: null, pendingSetup: null },
			});
			stageCreated('create');
			const view = mount();

			expect(await view.findByText(/No webhook is registered/i)).toBeTruthy();
			await fireEvent.click(view.getByRole('button', { name: /Register a webhook/i }));
			await fireEvent.input(view.getByLabelText(/Callback URL to register/i), {
				target: { value: 'https://new.example.com/turn' },
			});
			await fireEvent.click(view.getByRole('button', { name: /Issue secret and continue/i }));

			expect(api.createWebhookSetup).toHaveBeenCalledWith('admin', 'acme', 'alice', 'whrev_01', {
				kind: 'create',
				url: 'https://new.example.com/turn',
				capabilities: [],
			});
			expect(await view.findByText(/it is shown once/i)).toBeTruthy();
		});

		it('requires explicit consent to the secret change before a URL replacement can be staged', async () => {
			stageCreated('replaceUrl');
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Replace URL/i }));
			await fireEvent.input(view.getByLabelText(/New callback URL/i), {
				target: { value: 'https://v2.example.com/turn' },
			});

			const submit = view.getByRole('button', {
				name: /Issue secret and continue/i,
			}) as HTMLButtonElement;
			expect(submit.disabled).toBe(true);

			await fireEvent.click(view.getByRole('checkbox', { name: /new signing secret/i }));
			await waitFor(() => expect(submit.disabled).toBe(false));
			await fireEvent.click(submit);

			expect(api.createWebhookSetup).toHaveBeenCalledWith('admin', 'acme', 'alice', 'whrev_01', {
				kind: 'replaceUrl',
				url: 'https://v2.example.com/turn',
				confirmSecretRotation: true,
			});
		});

		it('blocks activation until the operator confirms the secret is stored', async () => {
			stageCreated('replaceUrl');
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Replace URL/i }));
			await fireEvent.input(view.getByLabelText(/New callback URL/i), {
				target: { value: 'https://v2.example.com/turn' },
			});
			await fireEvent.click(view.getByRole('checkbox', { name: /new signing secret/i }));
			await fireEvent.click(view.getByRole('button', { name: /Issue secret and continue/i }));

			const activate = (await view.findByRole('button', {
				name: /Verify and activate/i,
			})) as HTMLButtonElement;
			expect(activate.disabled).toBe(true);
			expect(view.getByDisplayValue(SECRET)).toBeTruthy();

			await fireEvent.click(view.getByRole('checkbox', { name: /I have stored this secret/i }));
			await waitFor(() => expect(activate.disabled).toBe(false));
		});

		it('disables activation again when the acknowledgement checkbox is cleared', async () => {
			stageCreated('replaceUrl');
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Replace URL/i }));
			await fireEvent.input(view.getByLabelText(/New callback URL/i), {
				target: { value: 'https://v2.example.com/turn' },
			});
			await fireEvent.click(view.getByRole('checkbox', { name: /new signing secret/i }));
			await fireEvent.click(view.getByRole('button', { name: /Issue secret and continue/i }));

			const activate = (await view.findByRole('button', {
				name: /Verify and activate/i,
			})) as HTMLButtonElement;
			const ack = view.getByRole('checkbox', { name: /I have stored this secret/i });

			await fireEvent.click(ack);
			await waitFor(() => expect(activate.disabled).toBe(false));

			await fireEvent.click(ack);
			await waitFor(() => expect(activate.disabled).toBe(true));
		});

		async function stagedAndAcknowledged() {
			stageCreated('replaceUrl');
			const onChanged = vi.fn();
			const view = mount({ onChanged });
			await fireEvent.click(await view.findByRole('button', { name: /Replace URL/i }));
			await fireEvent.input(view.getByLabelText(/New callback URL/i), {
				target: { value: 'https://v2.example.com/turn' },
			});
			await fireEvent.click(view.getByRole('checkbox', { name: /new signing secret/i }));
			await fireEvent.click(view.getByRole('button', { name: /Issue secret and continue/i }));
			await view.findByRole('button', { name: /Verify and activate/i });
			await fireEvent.click(view.getByRole('checkbox', { name: /I have stored this secret/i }));
			return { view, onChanged };
		}

		it('confirms the authoritative server state and removes the secret from the DOM on success', async () => {
			api.activateWebhookSetup.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					revision: 'whrev_03',
					registration: {
						registrationId: 'whreg_02',
						url: 'https://v2.example.com/turn',
						verifiedAt: '2026-09-01T10:05:00Z',
						capabilities: ['draws'],
						lastFailure: null,
					},
				}),
			});
			const { view, onChanged } = await stagedAndAcknowledged();
			await fireEvent.click(view.getByRole('button', { name: /Verify and activate/i }));

			expect(await view.findByText(/Verified and activated/i)).toBeTruthy();
			expect(view.getByDisplayValue('https://v2.example.com/turn')).toBeTruthy();
			expect(view.getByText('whreg_02')).toBeTruthy();
			expect(view.queryByDisplayValue(SECRET)).toBeNull();
			await waitFor(() => expect(onChanged).toHaveBeenCalled());
		});

		it('says the old registration is untouched when verification fails, and keeps the secret', async () => {
			api.activateWebhookSetup.mockResolvedValue(problem('webhook_verification_failed', 422));
			const { view, onChanged } = await stagedAndAcknowledged();
			await fireEvent.click(view.getByRole('button', { name: /Verify and activate/i }));

			expect(await view.findByText(/still live and unchanged/i)).toBeTruthy();
			// The same candidate secret drives the retry, so it must survive a retryable failure.
			expect(view.getByDisplayValue(SECRET)).toBeTruthy();
			expect(view.getByRole('button', { name: /Verify and activate/i })).toBeTruthy();
			expect(onChanged).not.toHaveBeenCalled();
		});

		it('shows verification progress with a way out, then reports the unknown outcome', async () => {
			api.activateWebhookSetup.mockImplementation(
				(...args: unknown[]) =>
					new Promise((resolve) => {
						(args[5] as AbortSignal).addEventListener('abort', () =>
							resolve({ outcome: 'aborted' }),
						);
					}),
			);
			const { view } = await stagedAndAcknowledged();
			await fireEvent.click(view.getByRole('button', { name: /Verify and activate/i }));

			const stop = await view.findByRole('button', { name: /Stop waiting/i });
			expect(view.getByText(/waiting for a signed proof/i)).toBeTruthy();
			await fireEvent.click(stop);
			expect(await view.findByText(/may still have been spent/i)).toBeTruthy();
		});

		it('discards the dead secret when the candidate is destroyed', async () => {
			api.activateWebhookSetup.mockResolvedValue(problem('setup_attempts_exhausted', 410));
			const { view } = await stagedAndAcknowledged();
			await fireEvent.click(view.getByRole('button', { name: /Verify and activate/i }));

			expect(await view.findByText(/All five activation attempts were spent/i)).toBeTruthy();
			await waitFor(() => expect(view.queryByDisplayValue(SECRET)).toBeNull());
		});

		it('lets the operator discard a staged candidate without touching the registration', async () => {
			api.cancelWebhookSetup.mockResolvedValue({ outcome: 'ok', value: makeSlot() });
			const { view } = await stagedAndAcknowledged();
			await fireEvent.click(view.getByRole('button', { name: /Discard candidate/i }));

			expect(await view.findByText(/not touched/i)).toBeTruthy();
			expect(view.queryByDisplayValue(SECRET)).toBeNull();
			expect(view.getByDisplayValue('https://bot.example.com/turn')).toBeTruthy();
		});
	});

	describe('lost one-time secret', () => {
		it('explains that a pending candidate without its secret cannot be recovered', async () => {
			api.readWebhook.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					pendingSetup: {
						setupId: 'whs_01',
						kind: 'replaceUrl',
						candidateUrl: 'https://v2.example.com/turn',
						createdAt: '2026-09-01T10:00:00Z',
						expiresAt: '2026-09-01T10:15:00Z',
						canActivate: true,
					},
				}),
			});
			const view = mount();

			expect(await view.findByText(/without its secret/i)).toBeTruthy();
			expect(view.getByText(/no recovery endpoint/i)).toBeTruthy();
			expect(view.getByRole('button', { name: /Cancel candidate/i })).toBeTruthy();
			// Activation is impossible without the secret, so it must not be offered.
			expect(view.queryByRole('button', { name: /Verify and activate/i })).toBeNull();
			// Nor may a competing flow be started while a candidate holds the slot.
			expect(view.queryByRole('button', { name: /Replace URL/i })).toBeNull();
		});

		it('cancels the orphaned candidate so a fresh setup can be staged', async () => {
			api.readWebhook.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					pendingSetup: {
						setupId: 'whs_01',
						kind: 'create',
						candidateUrl: 'https://v2.example.com/turn',
						createdAt: '2026-09-01T10:00:00Z',
						expiresAt: '2026-09-01T10:15:00Z',
						canActivate: true,
					},
				}),
			});
			api.cancelWebhookSetup.mockResolvedValue({ outcome: 'ok', value: makeSlot() });
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Cancel candidate/i }));

			expect(api.cancelWebhookSetup).toHaveBeenCalledWith(
				'admin',
				'acme',
				'alice',
				'whrev_01',
				'whs_01',
			);
			expect(await view.findByRole('button', { name: /Replace URL/i })).toBeTruthy();
		});
	});

	describe('deletion and rotation confirmations', () => {
		it('requires an exact bot-name echo before deletion, and separates it from edits', async () => {
			api.deleteWebhook.mockResolvedValue({
				outcome: 'ok',
				value: { revision: 'whrev_02', registration: null, pendingSetup: null },
			});
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Delete webhook…/i }));

			const submit = view.getByRole('button', { name: 'Delete webhook' }) as HTMLButtonElement;
			expect(submit.disabled).toBe(true);
			expect(view.getByText(/not a URL or capability edit/i)).toBeTruthy();

			await fireEvent.input(view.getByLabelText(/Delete the webhook/i), {
				target: { value: 'Alice' },
			});
			await waitFor(() => expect(submit.disabled).toBe(true));

			await fireEvent.input(view.getByLabelText(/Delete the webhook/i), {
				target: { value: 'alice' },
			});
			await waitFor(() => expect(submit.disabled).toBe(false));
			await fireEvent.click(submit);

			expect(api.deleteWebhook).toHaveBeenCalledWith('admin', 'acme', 'alice', 'whrev_01', 'alice');
			expect(await view.findByText(/deliveries have stopped/i)).toBeTruthy();
		});

		it('requires the bot-name echo before rotating the secret', async () => {
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Rotate secret…/i }));
			const submit = view.getByRole('button', { name: /Issue new secret/i }) as HTMLButtonElement;
			expect(submit.disabled).toBe(true);
			await fireEvent.input(view.getByLabelText(/type alice to confirm/i), {
				target: { value: 'alice' },
			});
			await waitFor(() => expect(submit.disabled).toBe(false));
		});

		it('moves focus to the confirmation field when a destructive form opens', async () => {
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Delete webhook…/i }));
			await waitFor(() =>
				expect(document.activeElement).toBe(view.getByLabelText(/Delete the webhook/i)),
			);
		});
	});

	describe('parent refresh', () => {
		it('keeps the confirmation and does not reload when the parent re-renders the same bot', async () => {
			// `onChanged` makes the parent re-read its bot list and re-render with fresh bot objects,
			// so the same team/name arrive again. That must not rebuild the controller: doing so
			// discarded the success confirmation and re-fetched the slot and registry every time.
			api.updateWebhookCapabilities.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					revision: 'whrev_02',
					registration: { ...makeSlot().registration!, capabilities: [] },
				}),
			});
			const view = mount();
			await fireEvent.click(await view.findByRole('checkbox', { name: 'draws' }));
			await fireEvent.click(view.getByRole('button', { name: 'Save capabilities' }));
			expect(await view.findByText(/No credential changed/i)).toBeTruthy();

			const readsBefore = api.readWebhook.mock.calls.length;
			await view.rerender({ root: 'admin', team: 'acme', name: 'alice', onChanged: vi.fn() });

			expect(view.getByText(/No credential changed/i)).toBeTruthy();
			expect(api.readWebhook.mock.calls).toHaveLength(readsBefore);
			expect(api.fetchWebhookCapabilityCatalog).toHaveBeenCalledTimes(1);
		});

		it('rebuilds for a genuinely different bot, dropping the previous state', async () => {
			const view = mount();
			await view.findByDisplayValue('https://bot.example.com/turn');

			api.readWebhook.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					registration: { ...makeSlot().registration!, url: 'https://other.example.com/turn' },
				}),
			});
			await view.rerender({ root: 'admin', team: 'acme', name: 'bob', onChanged: vi.fn() });

			expect(await view.findByDisplayValue('https://other.example.com/turn')).toBeTruthy();
			await waitFor(() => expect(api.readWebhook).toHaveBeenCalledWith('admin', 'acme', 'bob'));
		});
	});

	describe('accessibility', () => {
		it('names the region and marks the capability group as a labelled fieldset', async () => {
			const view = mount();
			expect(await view.findByRole('region', { name: /Webhook & capabilities/i })).toBeTruthy();
			expect(view.getByRole('group', { name: 'Capabilities' })).toBeTruthy();
		});

		it('announces failures assertively and progress politely', async () => {
			api.activateWebhookSetup.mockResolvedValue(problem('webhook_verification_failed', 422));
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Rotate secret…/i }));
			await fireEvent.input(view.getByLabelText(/type alice to confirm/i), {
				target: { value: 'alice' },
			});
			api.createWebhookSetup.mockResolvedValue({
				outcome: 'ok',
				value: {
					setupId: 'whs_01',
					kind: 'rotateSecret',
					secret: SECRET,
					expiresAt: '2026-09-01T10:15:00Z',
					revision: 'whrev_02',
				},
			});
			await fireEvent.click(view.getByRole('button', { name: /Issue new secret/i }));
			await fireEvent.click(
				await view.findByRole('checkbox', { name: /I have stored this secret/i }),
			);
			await fireEvent.click(view.getByRole('button', { name: /Verify and activate/i }));

			const alert = await view.findByRole('alert');
			expect(alert.getAttribute('aria-live')).toBe('assertive');
		});

		it('focuses the secret when it appears, so it is never silently shown', async () => {
			api.createWebhookSetup.mockResolvedValue({
				outcome: 'ok',
				value: {
					setupId: 'whs_01',
					kind: 'rotateSecret',
					secret: SECRET,
					expiresAt: '2026-09-01T10:15:00Z',
					revision: 'whrev_02',
				},
			});
			const view = mount();
			await fireEvent.click(await view.findByRole('button', { name: /Rotate secret…/i }));
			await fireEvent.input(view.getByLabelText(/type alice to confirm/i), {
				target: { value: 'alice' },
			});
			await fireEvent.click(view.getByRole('button', { name: /Issue new secret/i }));

			const heading = await view.findByText(/it is shown once/i);
			await waitFor(() => expect(document.activeElement).toBe(heading));
		});
	});
});

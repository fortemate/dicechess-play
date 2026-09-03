import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedWebhookSlot } from './webhookApi';

const api = vi.hoisted(() => ({
	readWebhook: vi.fn(),
	createWebhookSetup: vi.fn(),
	activateWebhookSetup: vi.fn(),
	cancelWebhookSetup: vi.fn(),
	updateWebhookCapabilities: vi.fn(),
	deleteWebhook: vi.fn(),
	fetchWebhookCapabilityCatalog: vi.fn(),
}));
vi.mock('./webhookApi', () => api);

const SECRET = 'c'.repeat(64);

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

async function controllerFor(root: 'owner' | 'admin' = 'owner') {
	vi.resetModules();
	const { BotWebhookController } = await import('./webhookStore.svelte');
	return new BotWebhookController(root, 'acme', 'alice');
}

/** Every notice the operator can be shown, for secret-leak assertions. */
function noticeText(store: { notice: { text: string } | null }): string {
	return store.notice?.text ?? '';
}

describe('BotWebhookController', () => {
	beforeEach(() => {
		for (const mock of Object.values(api)) mock.mockReset();
		api.fetchWebhookCapabilityCatalog.mockResolvedValue({ outcome: 'ok', value: registry });
		api.readWebhook.mockResolvedValue({ outcome: 'ok', value: makeSlot() });
	});

	describe('load', () => {
		it('adopts the slot and derives the capability draft from the server', async () => {
			const store = await controllerFor();
			await store.load();
			expect(store.access).toEqual({ state: 'ready' });
			expect(store.slot?.revision).toBe('whrev_01');
			expect(store.selection).toEqual(['draws']);
			expect(store.selectionDirty).toBe(false);
		});

		it('reports a closed feature gate distinctly from every other failure', async () => {
			api.readWebhook.mockResolvedValue({ outcome: 'gated' });
			const store = await controllerFor();
			await store.load();
			expect(store.access).toEqual({ state: 'gated' });
		});

		it('maps each authorization refusal to its own state', async () => {
			for (const [code, state] of [
				['authentication_required', 'signed-out'],
				['bot_not_owned', 'denied'],
				['admin_required', 'denied'],
				['bot_not_found', 'missing'],
			] as const) {
				api.readWebhook.mockResolvedValue(problem(code, 403));
				const store = await controllerFor();
				await store.load();
				expect(store.access).toEqual({ state });
			}
		});

		it('keeps the capability registry when the slot read fails, so names stay honest', async () => {
			api.readWebhook.mockResolvedValue({ outcome: 'offline' });
			const store = await controllerFor();
			await store.load();
			expect(store.access).toEqual({ state: 'unavailable' });
			expect(store.catalog).toEqual(registry);
			expect(noticeText(store)).toContain('Nothing has been changed');
		});

		it('fetches the registry once across repeated loads', async () => {
			const store = await controllerFor();
			await store.load();
			await store.load();
			expect(api.fetchWebhookCapabilityCatalog).toHaveBeenCalledTimes(1);
		});
	});

	describe('capability presentation', () => {
		it('never offers the reserved doubling capability as an editable control', async () => {
			const store = await controllerFor();
			await store.load();
			expect(store.view.selectable.map((row) => row.name)).toEqual(['draws']);
			expect(store.view.reserved.map((row) => row.name)).toEqual(['doubling']);
		});

		it('shows an unknown legacy value read-only and warns that a save would drop it', async () => {
			api.readWebhook.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					registration: { ...makeSlot().registration!, capabilities: ['draws', 'telepathy'] },
				}),
			});
			const store = await controllerFor();
			await store.load();
			expect(store.view.unknown.map((row) => row.name)).toEqual(['telepathy']);
			expect(store.droppedByPatch).toEqual(['telepathy']);
		});
	});

	describe('staging a candidate', () => {
		it('takes custody of the one-time secret and adopts the new revision', async () => {
			api.createWebhookSetup.mockResolvedValue({
				outcome: 'ok',
				value: {
					setupId: 'whs_01',
					kind: 'create',
					secret: SECRET,
					expiresAt: '2026-09-01T10:15:00Z',
					revision: 'whrev_02',
				},
			});
			const store = await controllerFor();
			await store.load();
			await store.stage({ kind: 'create', url: 'https://new.example.com/turn', capabilities: [] });

			expect(store.handoff?.secret).toBe(SECRET);
			expect(store.handoff?.candidateUrl).toBe('https://new.example.com/turn');
			expect(store.slot?.revision).toBe('whrev_02');
			expect(store.secretAcknowledged).toBe(false);
			expect(store.canActivate).toBe(false);
			expect(noticeText(store)).toContain('Store the secret below');
		});

		it('takes the candidate URL from the live registration when only rotating the secret', async () => {
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
			const store = await controllerFor();
			await store.load();
			await store.stage({ kind: 'rotateSecret', cutoverMode: 'dualKey', confirm: 'alice' });
			expect(store.handoff?.candidateUrl).toBe('https://bot.example.com/turn');
		});

		it('sends the mutation against the revision of the last authoritative read', async () => {
			api.createWebhookSetup.mockResolvedValue({ outcome: 'offline' });
			const store = await controllerFor();
			await store.load();
			await store.stage({ kind: 'create', url: 'https://new.example.com/turn', capabilities: [] });
			expect(api.createWebhookSetup).toHaveBeenCalledWith(
				'owner',
				'acme',
				'alice',
				'whrev_01',
				expect.objectContaining({ kind: 'create' }),
			);
		});

		it('explains a rejected URL without staging anything', async () => {
			api.createWebhookSetup.mockResolvedValue(problem('webhook_url_rejected', 422));
			const store = await controllerFor();
			await store.load();
			await store.stage({ kind: 'create', url: 'http://insecure.example', capabilities: [] });
			expect(store.handoff).toBeNull();
			expect(noticeText(store)).toContain('nothing was staged');
		});

		it('recovers from a competing candidate by re-reading it so it can be cancelled', async () => {
			api.createWebhookSetup.mockResolvedValue(problem('pending_setup_exists', 409));
			const pending = makeSlot({
				pendingSetup: {
					setupId: 'whs_other',
					kind: 'replaceUrl',
					candidateUrl: 'https://other.example.com/turn',
					createdAt: '2026-09-01T10:00:00Z',
					expiresAt: '2026-09-01T10:15:00Z',
					canActivate: true,
				},
			});
			const store = await controllerFor();
			await store.load();
			api.readWebhook.mockResolvedValue({ outcome: 'ok', value: pending });
			await store.stage({ kind: 'create', url: 'https://new.example.com/turn', capabilities: [] });

			expect(store.slot?.pendingSetup?.setupId).toBe('whs_other');
			expect(store.orphanedSetup).toBe(true);
			expect(noticeText(store)).toContain('Cancel it below');
		});
	});

	describe('activation', () => {
		async function staged() {
			api.createWebhookSetup.mockResolvedValue({
				outcome: 'ok',
				value: {
					setupId: 'whs_01',
					kind: 'replaceUrl',
					secret: SECRET,
					expiresAt: '2026-09-01T10:15:00Z',
					revision: 'whrev_02',
				},
			});
			const store = await controllerFor();
			await store.load();
			await store.stage({
				kind: 'replaceUrl',
				url: 'https://v2.example.com/turn',
				confirmSecretRotation: true,
			});
			return store;
		}

		it('refuses to activate until the operator acknowledges storing the secret', async () => {
			const store = await staged();
			await store.activate();
			expect(api.activateWebhookSetup).not.toHaveBeenCalled();

			store.acknowledgeSecret();
			expect(store.canActivate).toBe(true);
		});

		it('adopts the authoritative slot and scrubs the secret on success', async () => {
			const committed = makeSlot({
				revision: 'whrev_03',
				registration: {
					registrationId: 'whreg_02',
					url: 'https://v2.example.com/turn',
					verifiedAt: '2026-09-01T10:05:00Z',
					capabilities: ['draws'],
					lastFailure: null,
				},
			});
			api.activateWebhookSetup.mockResolvedValue({ outcome: 'ok', value: committed });

			const store = await staged();
			store.acknowledgeSecret();
			await store.activate();

			expect(api.activateWebhookSetup).toHaveBeenCalledWith(
				'owner',
				'acme',
				'alice',
				'whrev_02',
				'whs_01',
				expect.any(AbortSignal),
			);
			expect(store.handoff).toBeNull();
			expect(store.secretAcknowledged).toBe(false);
			expect(store.slot).toEqual(committed);
			expect(noticeText(store)).toContain('authoritative');
		});

		it('keeps the secret after a verification failure, because the retry reuses it', async () => {
			api.activateWebhookSetup.mockResolvedValue(problem('webhook_verification_failed', 422));
			const store = await staged();
			store.acknowledgeSecret();
			await store.activate();

			expect(store.handoff?.secret).toBe(SECRET);
			expect(store.secretAcknowledged).toBe(true);
			expect(noticeText(store)).toContain('still live and unchanged');
			expect(noticeText(store)).toContain('five attempts');
		});

		it('discards the now-useless secret when the candidate is destroyed', async () => {
			api.activateWebhookSetup.mockResolvedValue(problem('setup_attempts_exhausted', 410));
			const store = await staged();
			store.acknowledgeSecret();
			await store.activate();

			expect(store.handoff).toBeNull();
			expect(noticeText(store)).toContain('All five activation attempts were spent');
			expect(noticeText(store)).toContain('previous registration is unchanged');
			expect(api.readWebhook).toHaveBeenCalledTimes(2);
		});

		it('states that the previous registration survives a spent verification budget', async () => {
			api.activateWebhookSetup.mockResolvedValue(
				problem('webhook_verification_rate_limited', 429, { retryAfterSeconds: 42 }),
			);
			const store = await staged();
			store.acknowledgeSecret();
			await store.activate();
			expect(noticeText(store)).toContain('previous registration is unchanged');
			expect(noticeText(store)).toContain('42 seconds');
		});

		it('treats a timeout as an unknown outcome and re-reads the server state', async () => {
			vi.useFakeTimers();
			try {
				api.activateWebhookSetup.mockImplementation(
					(...args: unknown[]) =>
						new Promise((resolve) => {
							const signal = args[5] as AbortSignal;
							signal.addEventListener('abort', () => resolve({ outcome: 'aborted' }));
						}),
				);
				const store = await staged();
				store.acknowledgeSecret();
				const running = store.activate();
				await vi.advanceTimersByTimeAsync(30_000);
				await running;

				expect(noticeText(store)).toContain('may still have been spent');
				expect(api.readWebhook).toHaveBeenCalledTimes(2);
				// The re-read shows no candidate, so the held secret is either live or dead — either
				// way it must not linger in memory.
				expect(store.handoff).toBeNull();
			} finally {
				vi.useRealTimers();
			}
		});

		it('activates against the current revision, not the one frozen when the candidate was staged', async () => {
			// Staging then editing capabilities bumps the revision. Pinning the create response's
			// revision made every later activation fail 412 with no recovery but discarding a
			// candidate that was fine.
			api.updateWebhookCapabilities.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({ revision: 'whrev_07' }),
			});
			api.activateWebhookSetup.mockResolvedValue({ outcome: 'ok', value: makeSlot() });

			const store = await staged();
			store.selection = [];
			await store.saveCapabilities();
			expect(store.slot?.revision).toBe('whrev_07');

			store.acknowledgeSecret();
			await store.activate();
			expect(api.activateWebhookSetup).toHaveBeenCalledWith(
				'owner',
				'acme',
				'alice',
				'whrev_07',
				'whs_01',
				expect.any(AbortSignal),
			);
		});

		it('keeps the secret when the re-read still shows the candidate pending', async () => {
			api.activateWebhookSetup.mockResolvedValue({ outcome: 'aborted' });
			const store = await staged();
			store.acknowledgeSecret();
			api.readWebhook.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					revision: 'whrev_02',
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
			await store.activate();
			expect(store.handoff?.secret).toBe(SECRET);
		});
	});

	describe('lost one-time secret', () => {
		it('flags a server-side candidate with no secret in memory as unrecoverable', async () => {
			api.readWebhook.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					pendingSetup: {
						setupId: 'whs_01',
						kind: 'create',
						candidateUrl: 'https://new.example.com/turn',
						createdAt: '2026-09-01T10:00:00Z',
						expiresAt: '2026-09-01T10:15:00Z',
						canActivate: true,
					},
				}),
			});
			const store = await controllerFor();
			await store.load();
			expect(store.orphanedSetup).toBe(true);
			expect(store.canActivate).toBe(false);
		});

		it('cancels the orphan using the slot revision and setup id', async () => {
			const pending = makeSlot({
				pendingSetup: {
					setupId: 'whs_01',
					kind: 'create',
					candidateUrl: 'https://new.example.com/turn',
					createdAt: '2026-09-01T10:00:00Z',
					expiresAt: '2026-09-01T10:15:00Z',
					canActivate: true,
				},
			});
			api.readWebhook.mockResolvedValue({ outcome: 'ok', value: pending });
			api.cancelWebhookSetup.mockResolvedValue({ outcome: 'ok', value: makeSlot() });

			const store = await controllerFor();
			await store.load();
			await store.cancelSetup();

			expect(api.cancelWebhookSetup).toHaveBeenCalledWith(
				'owner',
				'acme',
				'alice',
				'whrev_01',
				'whs_01',
			);
			expect(store.slot?.pendingSetup).toBeNull();
			expect(noticeText(store)).toContain('not touched');
		});
	});

	describe('capability-only save', () => {
		it('writes only writable names, even when the draft holds a reserved one', async () => {
			api.updateWebhookCapabilities.mockResolvedValue({ outcome: 'ok', value: makeSlot() });
			const store = await controllerFor();
			await store.load();
			store.selection = ['draws', 'doubling', 'telepathy'];
			await store.saveCapabilities();
			expect(api.updateWebhookCapabilities).toHaveBeenCalledWith(
				'owner',
				'acme',
				'alice',
				'whrev_01',
				['draws'],
			);
		});

		it('states that no credential changed when the registration id is preserved', async () => {
			api.updateWebhookCapabilities.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({ revision: 'whrev_02' }),
			});
			const store = await controllerFor();
			await store.load();
			store.selection = [];
			await store.saveCapabilities();

			expect(noticeText(store)).toContain('No credential changed');
			expect(noticeText(store)).toContain('authoritative');
			expect(store.slot?.revision).toBe('whrev_02');
		});

		it('resets the draft from the server response, not from the submitted draft', async () => {
			api.updateWebhookCapabilities.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({
					registration: { ...makeSlot().registration!, capabilities: ['draws'] },
				}),
			});
			const store = await controllerFor();
			await store.load();
			store.selection = [];
			await store.saveCapabilities();
			expect(store.selection).toEqual(['draws']);
			expect(store.selectionDirty).toBe(false);
		});

		it('adopts the server slot from a stale-revision refusal so the retry is against real state', async () => {
			const server = makeSlot({
				revision: 'whrev_99',
				registration: { ...makeSlot().registration!, capabilities: [] },
			});
			api.updateWebhookCapabilities.mockResolvedValue(
				problem('stale_webhook_revision', 412, { current: server }),
			);
			const store = await controllerFor();
			await store.load();
			store.selection = [];
			await store.saveCapabilities();

			expect(store.slot?.revision).toBe('whrev_99');
			expect(store.selection).toEqual([]);
			expect(noticeText(store)).toContain('changed this webhook first');
			expect(store.notice?.retryable).toBe(true);
		});

		it('reports a rejected capability without changing local state', async () => {
			api.updateWebhookCapabilities.mockResolvedValue(problem('capability_rejected', 422));
			const store = await controllerFor();
			await store.load();
			store.selection = [];
			await store.saveCapabilities();
			expect(noticeText(store)).toContain('not saved');
			expect(store.slot?.revision).toBe('whrev_01');
		});
	});

	describe('deletion', () => {
		it('passes the bot-name echo and destroys the held secret', async () => {
			api.deleteWebhook.mockResolvedValue({
				outcome: 'ok',
				value: { revision: 'whrev_02', registration: null, pendingSetup: null },
			});
			const store = await controllerFor();
			await store.load();
			await store.remove('alice');

			expect(api.deleteWebhook).toHaveBeenCalledWith('owner', 'acme', 'alice', 'whrev_01', 'alice');
			expect(store.slot?.registration).toBeNull();
			expect(store.handoff).toBeNull();
			expect(noticeText(store)).toContain('deliveries have stopped');
		});

		it('reports a confirmation mismatch as changing nothing', async () => {
			api.deleteWebhook.mockResolvedValue(problem('confirmation_mismatch', 400));
			const store = await controllerFor();
			await store.load();
			await store.remove('wrong');
			expect(noticeText(store)).toContain('nothing was changed');
			expect(store.slot?.registration).not.toBeNull();
		});
	});

	describe('secret hygiene', () => {
		async function stagedStore() {
			api.createWebhookSetup.mockResolvedValue({
				outcome: 'ok',
				value: {
					setupId: 'whs_01',
					kind: 'create',
					secret: SECRET,
					expiresAt: '2026-09-01T10:15:00Z',
					revision: 'whrev_02',
				},
			});
			const store = await controllerFor();
			await store.load();
			await store.stage({ kind: 'create', url: 'https://new.example.com/turn', capabilities: [] });
			return store;
		}

		it('never places the secret in operator-facing text', async () => {
			const store = await stagedStore();
			expect(noticeText(store)).not.toContain(SECRET);

			api.activateWebhookSetup.mockResolvedValue(problem('webhook_verification_failed', 422));
			store.acknowledgeSecret();
			await store.activate();
			expect(noticeText(store)).not.toContain(SECRET);
		});

		it('drops the secret on dispose', async () => {
			const store = await stagedStore();
			store.dispose();
			expect(store.handoff).toBeNull();
			expect(store.secretAcknowledged).toBe(false);
		});

		it('stops applying results after dispose', async () => {
			api.updateWebhookCapabilities.mockResolvedValue({
				outcome: 'ok',
				value: makeSlot({ revision: 'whrev_77' }),
			});
			const store = await stagedStore();
			const pending = store.saveCapabilities();
			store.dispose();
			await pending;
			expect(store.slot?.revision).not.toBe('whrev_77');
		});

		it('drops the secret when authorization is lost mid-flow', async () => {
			api.activateWebhookSetup.mockResolvedValue(problem('bot_not_owned', 403));
			const store = await stagedStore();
			store.acknowledgeSecret();
			await store.activate();
			expect(store.access).toEqual({ state: 'denied' });
			expect(store.handoff).toBeNull();
		});
	});

	describe('verification transport', () => {
		it('marks verification unavailable so staging controls can be withdrawn', async () => {
			api.createWebhookSetup.mockResolvedValue(problem('webhook_verification_unavailable', 503));
			const store = await controllerFor();
			await store.load();
			await store.stage({ kind: 'create', url: 'https://new.example.com/turn', capabilities: [] });
			expect(store.verificationUnavailable).toBe(true);
			expect(store.access).toEqual({ state: 'ready' });
			expect(noticeText(store)).toContain('read-only view are unaffected');
		});
	});

	describe('concurrency', () => {
		it('ignores a second action while one is in flight', async () => {
			let release: (value: unknown) => void = () => {};
			api.updateWebhookCapabilities.mockImplementation(
				() => new Promise((resolve) => (release = resolve)),
			);
			const store = await controllerFor();
			await store.load();

			const first = store.saveCapabilities();
			await store.remove('alice');
			expect(api.deleteWebhook).not.toHaveBeenCalled();

			release({ outcome: 'ok', value: makeSlot() });
			await first;
			expect(store.busy).toBeNull();
		});
	});
});

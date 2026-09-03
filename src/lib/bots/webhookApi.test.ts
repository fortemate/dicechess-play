import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	activateWebhookSetup,
	cancelWebhookSetup,
	createWebhookSetup,
	deleteWebhook,
	fetchWebhookCapabilityCatalog,
	readWebhook,
	updateWebhookCapabilities,
	type ManagedWebhookSlot,
} from './webhookApi';

const slot: ManagedWebhookSlot = {
	revision: 'whrev_01',
	registration: {
		registrationId: 'whreg_01',
		url: 'https://bot.example.com/turn',
		verifiedAt: '2026-08-01T12:00:00Z',
		capabilities: ['draws'],
		lastFailure: null,
	},
	pendingSetup: null,
};

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json', ...headers },
	});

const problem = (
	code: string,
	status: number,
	extra: Record<string, unknown> = {},
	headers: Record<string, string> = {},
) =>
	new Response(JSON.stringify({ code, title: 'nope', detail: 'because', status, ...extra }), {
		status,
		headers: { 'content-type': 'application/problem+json', ...headers },
	});

describe('webhookApi transport', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it('reads the owner and admin roots through one implementation, differing only in path', async () => {
		fetchMock.mockImplementation(() => json(slot));
		expect(await readWebhook('owner', 'acme', 'alice')).toEqual({ outcome: 'ok', value: slot });
		expect(await readWebhook('admin', 'acme', 'alice')).toEqual({ outcome: 'ok', value: slot });

		expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/me/bots/acme/alice/webhook');
		expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8080/admin/bots/acme/alice/webhook');
		for (const call of fetchMock.mock.calls) expect(call[1].credentials).toBe('include');
	});

	it('percent-encodes team and name so a crafted path cannot escape the bot scope', async () => {
		fetchMock.mockResolvedValue(json(slot));
		await readWebhook('admin', 'a/b', 'x?y');
		expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/admin/bots/a%2Fb/x%3Fy/webhook');
	});

	it('sends the CSRF header and a strong quoted If-Match on every mutation', async () => {
		fetchMock.mockResolvedValue(json(slot));
		await updateWebhookCapabilities('owner', 'acme', 'alice', 'whrev_01', ['draws']);
		const init = fetchMock.mock.calls[0][1];
		expect(init.method).toBe('PATCH');
		expect(init.headers).toEqual({
			'x-dicechess-csrf': '1',
			'if-match': '"whrev_01"',
			'content-type': 'application/json',
		});
		expect(JSON.parse(init.body)).toEqual({ capabilities: ['draws'] });
	});

	it('sends each staged-setup variant as exactly the fields its server decoder accepts', async () => {
		const created = {
			setupId: 'whs_01',
			kind: 'create',
			secret: 'a'.repeat(64),
			expiresAt: '2026-09-01T10:15:00Z',
			revision: 'whrev_02',
		};
		fetchMock.mockImplementation(() => json(created, 201));

		await createWebhookSetup('owner', 'acme', 'alice', 'whrev_01', {
			kind: 'create',
			url: 'https://bot.example.com/turn',
			capabilities: ['draws'],
		});
		await createWebhookSetup('owner', 'acme', 'alice', 'whrev_01', {
			kind: 'replaceUrl',
			url: 'https://v2.example.com/turn',
			confirmSecretRotation: true,
		});
		await createWebhookSetup('owner', 'acme', 'alice', 'whrev_01', {
			kind: 'rotateSecret',
			cutoverMode: 'dualKey',
			confirm: 'alice',
		});

		const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
		expect(Object.keys(bodies[0]).sort()).toEqual(['capabilities', 'kind', 'url']);
		expect(Object.keys(bodies[1]).sort()).toEqual(['confirmSecretRotation', 'kind', 'url']);
		expect(Object.keys(bodies[2]).sort()).toEqual(['confirm', 'cutoverMode', 'kind']);
		expect(bodies[1].confirmSecretRotation).toBe(true);
		expect(bodies[2].cutoverMode).toBe('dualKey');
	});

	it('returns the one-time secret from the create response only', async () => {
		fetchMock.mockResolvedValue(
			json(
				{
					setupId: 'whs_01',
					kind: 'replaceUrl',
					secret: 'b'.repeat(64),
					expiresAt: '2026-09-01T10:15:00Z',
					revision: 'whrev_02',
				},
				201,
			),
		);
		const result = await createWebhookSetup('owner', 'acme', 'alice', 'whrev_01', {
			kind: 'replaceUrl',
			url: 'https://v2.example.com/turn',
			confirmSecretRotation: true,
		});
		expect(result).toEqual({
			outcome: 'ok',
			value: {
				setupId: 'whs_01',
				kind: 'replaceUrl',
				secret: 'b'.repeat(64),
				expiresAt: '2026-09-01T10:15:00Z',
				revision: 'whrev_02',
			},
		});
	});

	it('activates with secretStored and forwards the abort signal', async () => {
		fetchMock.mockResolvedValue(json(slot));
		const controller = new AbortController();
		await activateWebhookSetup('admin', 'acme', 'alice', 'whrev_02', 'whs_01', controller.signal);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:8080/admin/bots/acme/alice/webhook/setups/whs_01/activate');
		expect(JSON.parse(init.body)).toEqual({ secretStored: true });
		expect(init.signal).toBe(controller.signal);
	});

	it('cancels with no body and no content-type, because any body is malformed_request', async () => {
		fetchMock.mockResolvedValue(json(slot));
		await cancelWebhookSetup('owner', 'acme', 'alice', 'whrev_02', 'whs_01');
		const init = fetchMock.mock.calls[0][1];
		expect(init.method).toBe('DELETE');
		expect('body' in init).toBe(false);
		expect(init.headers).toEqual({ 'x-dicechess-csrf': '1', 'if-match': '"whrev_02"' });
	});

	it('deletes with the bot-name echo in a JSON body', async () => {
		fetchMock.mockResolvedValue(json({ ...slot, registration: null }));
		await deleteWebhook('owner', 'acme', 'alice', 'whrev_01', 'alice');
		const init = fetchMock.mock.calls[0][1];
		expect(init.method).toBe('DELETE');
		expect(JSON.parse(init.body)).toEqual({ confirm: 'alice' });
		expect(init.headers['content-type']).toBe('application/json');
	});

	it('classifies a problem body by its stable code', async () => {
		fetchMock.mockResolvedValue(problem('webhook_verification_failed', 422));
		const result = await readWebhook('owner', 'acme', 'alice');
		expect(result).toMatchObject({
			outcome: 'problem',
			status: 422,
			code: 'webhook_verification_failed',
			detail: 'because',
			current: null,
			retryAfterSeconds: null,
		});
	});

	it('carries the current slot out of a stale-revision problem so recovery needs no extra read', async () => {
		const server: ManagedWebhookSlot = { ...slot, revision: 'whrev_09' };
		fetchMock.mockResolvedValue(problem('stale_webhook_revision', 412, { current: server }));
		const result = await updateWebhookCapabilities('owner', 'acme', 'alice', 'whrev_01', []);
		expect(result).toMatchObject({ outcome: 'problem', code: 'stale_webhook_revision' });
		expect(result.outcome === 'problem' && result.current).toEqual(server);
	});

	it('reads Retry-After from the header, which the problem body deliberately omits', async () => {
		fetchMock.mockResolvedValue(
			problem('webhook_verification_rate_limited', 429, {}, { 'retry-after': '42' }),
		);
		const result = await activateWebhookSetup('owner', 'acme', 'alice', 'whrev_01', 'whs_01');
		expect(result).toMatchObject({
			code: 'webhook_verification_rate_limited',
			retryAfterSeconds: 42,
		});
	});

	it('degrades an unrecognized code instead of dropping the failure', async () => {
		fetchMock.mockResolvedValue(problem('some_future_code', 409));
		const result = await readWebhook('owner', 'acme', 'alice');
		expect(result).toMatchObject({ outcome: 'problem', code: 'unrecognized', status: 409 });
	});

	it('separates a closed feature gate from bot_not_found by the presence of a problem body', async () => {
		fetchMock.mockResolvedValue(new Response('', { status: 404 }));
		expect(await readWebhook('owner', 'acme', 'alice')).toEqual({ outcome: 'gated' });

		fetchMock.mockResolvedValue(problem('bot_not_found', 404));
		expect(await readWebhook('owner', 'acme', 'alice')).toMatchObject({
			outcome: 'problem',
			code: 'bot_not_found',
		});
	});

	it('reports a network error as offline and an abort as aborted', async () => {
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await readWebhook('owner', 'acme', 'alice')).toEqual({ outcome: 'offline' });

		fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));
		expect(await activateWebhookSetup('owner', 'acme', 'alice', 'r', 's')).toEqual({
			outcome: 'aborted',
		});
	});

	it('classifies an abort from the signal even when it carries a custom reason', async () => {
		// `AbortController.abort(reason)` rejects with that reason, not a DOMException, so a name
		// check alone would misreport a deliberate abort as a network failure.
		const controller = new AbortController();
		fetchMock.mockImplementation(() => {
			controller.abort(new Error('stopped watching'));
			return Promise.reject(new Error('stopped watching'));
		});
		expect(
			await activateWebhookSetup('owner', 'acme', 'alice', 'r', 's', controller.signal),
		).toEqual({ outcome: 'aborted' });
	});

	it('rejects a slot whose shape does not match the contract', async () => {
		fetchMock.mockResolvedValue(json({ revision: 7 }));
		expect(await readWebhook('owner', 'acme', 'alice')).toEqual({ outcome: 'unavailable' });
	});

	it('normalizes omitted optional slot members to null', async () => {
		fetchMock.mockResolvedValue(json({ revision: 'whrev_01' }));
		expect(await readWebhook('owner', 'acme', 'alice')).toEqual({
			outcome: 'ok',
			value: { revision: 'whrev_01', registration: null, pendingSetup: null },
		});
	});

	it('reads the public capability registry without a session', async () => {
		fetchMock.mockResolvedValue(
			json({
				capabilities: [
					{ name: 'draws', status: 'available', selectable: true },
					{ name: 'doubling', status: 'reserved', selectable: false },
				],
			}),
		);
		const result = await fetchWebhookCapabilityCatalog();
		expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/bot/webhook/capabilities');
		expect(result).toEqual({
			outcome: 'ok',
			value: [
				{ name: 'draws', status: 'available', selectable: true },
				{ name: 'doubling', status: 'reserved', selectable: false },
			],
		});
	});

	it('is unavailable, never a request, when no play-api base is configured', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', '');
		expect(await readWebhook('owner', 'acme', 'alice')).toEqual({ outcome: 'unavailable' });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

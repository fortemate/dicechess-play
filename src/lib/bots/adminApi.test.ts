import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	closeAdminToHumans,
	fetchAdminBots,
	openAdminToHumans,
	rotateAdminToken,
	setAdminCapacity,
	setAdminDescription,
	setAdminLadder,
	type AdminBot,
} from './adminApi';

const bot: AdminBot = {
	team: 'acme',
	name: 'alice',
	rating: 1720,
	rd: 85,
	provisional: false,
	onLadder: true,
	openToHumans: false,
	description: null,
	maxConcurrentGames: 4,
	ladderAllowance: 3,
	activeGames: 1,
	owned: false,
	webhook: {
		url: 'https://bot.example.com/webhook',
		verifiedAt: '2026-08-01T12:00:00Z',
		capabilities: ['draws'],
		lastFailure: null,
	},
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

function textResponse(status: number, body: string): Response {
	return new Response(body, { status });
}

describe('adminApi', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('reads the complete inventory with the session cookie, including non-public state, capacity, and webhook', async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { bots: [bot] }));
		expect(await fetchAdminBots()).toEqual({ outcome: 'ok', bots: [bot] });
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/admin/bots', {
			credentials: 'include',
		});
	});

	it('keeps server-side 403 separate from a missing session', async () => {
		fetchMock.mockResolvedValueOnce(textResponse(403, 'admin only'));
		expect(await fetchAdminBots()).toEqual({ outcome: 'forbidden' });
		fetchMock.mockResolvedValueOnce(textResponse(401, 'Not signed in'));
		expect(await fetchAdminBots()).toEqual({ outcome: 'signed-out' });
	});

	it('reports an unreachable server and malformed inventory as unavailable', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('network down'));
		expect(await fetchAdminBots()).toEqual({ outcome: 'unavailable' });
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { bots: [{ team: 'acme' }] }));
		expect(await fetchAdminBots()).toEqual({ outcome: 'unavailable' });
	});

	it('uses the audited admin endpoints with encoded names and the intended methods', async () => {
		fetchMock
			.mockResolvedValueOnce(jsonResponse(200, { onLadder: true }))
			.mockResolvedValueOnce(jsonResponse(200, { openToHumans: true, description: 'calm' }))
			.mockResolvedValueOnce(jsonResponse(200, { openToHumans: false, description: 'calm' }))
			.mockResolvedValueOnce(jsonResponse(200, { openToHumans: false, description: 'retired' }))
			.mockResolvedValueOnce(
				jsonResponse(200, {
					maxConcurrentGames: 8,
					openToHumans: false,
					ladderAllowance: 8,
					activeGames: 2,
				}),
			);

		await setAdminLadder('team / one', 'name?', true);
		await openAdminToHumans('team / one', 'name?', ' calm ');
		await closeAdminToHumans('team / one', 'name?');
		await setAdminDescription('team / one', 'name?', ' retired ');
		const capacityResult = await setAdminCapacity('team / one', 'name?', 8);

		const base = 'http://localhost:8080/admin/bots/team%20%2F%20one/name%3F';
		expect(fetchMock).toHaveBeenNthCalledWith(1, `${base}/ladder/join`, {
			method: 'POST',
			credentials: 'include',
		});
		expect(fetchMock).toHaveBeenNthCalledWith(2, `${base}/open-to-humans`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ description: 'calm' }),
		});
		expect(fetchMock).toHaveBeenNthCalledWith(3, `${base}/open-to-humans/leave`, {
			method: 'POST',
			credentials: 'include',
		});
		expect(fetchMock).toHaveBeenNthCalledWith(4, `${base}/description`, {
			method: 'PUT',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ description: 'retired' }),
		});
		expect(fetchMock).toHaveBeenNthCalledWith(5, `${base}/capacity`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ maxConcurrentGames: 8 }),
		});
		expect(capacityResult).toEqual({
			outcome: 'ok',
			capacity: {
				maxConcurrentGames: 8,
				openToHumans: false,
				ladderAllowance: 8,
				activeGames: 2,
			},
		});
	});

	it('returns a rotated token only after the echoed name request succeeds', async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { token: 'fresh-secret' }));
		expect(await rotateAdminToken('acme', 'alice', 'alice')).toEqual({
			outcome: 'rotated',
			token: 'fresh-secret',
		});
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/admin/bots/acme/alice/token', {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ confirm: 'alice' }),
		});
	});

	it('renders a bad rotation echo as a retryable mismatch', async () => {
		fetchMock.mockResolvedValue(textResponse(400, "confirm must be the bot's name"));
		expect(await rotateAdminToken('acme', 'alice', 'wrong')).toEqual({
			outcome: 'mismatch',
			reason: "confirm must be the bot's name",
		});
	});

	it('handles capacity validation failure', async () => {
		fetchMock.mockResolvedValue(textResponse(400, 'maxConcurrentGames must be between 1 and 32'));
		expect(await setAdminCapacity('acme', 'alice', 50)).toEqual({
			outcome: 'invalid',
			reason: 'maxConcurrentGames must be between 1 and 32',
		});
	});

	it('keeps a missing bot distinct on mutations but not on the inventory read', async () => {
		fetchMock.mockResolvedValueOnce(textResponse(404, 'no such bot'));
		expect(await setAdminLadder('acme', 'ghost', true)).toEqual({ outcome: 'no-such-bot' });
		fetchMock.mockResolvedValueOnce(textResponse(404, 'no such bot'));
		expect(await fetchAdminBots()).toEqual({ outcome: 'unavailable' });
	});
});

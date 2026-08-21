import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	claimBot,
	closeToHumans,
	fetchCapacity,
	fetchMyBots,
	openToHumans,
	releaseBot,
	rotateToken,
	setCapacity,
	setLadder,
} from './ownerApi';

const bot = {
	team: 'acme',
	name: 'alice',
	rating: 1720.5,
	rd: 85,
	onLadder: true,
	openToHumans: false,
};

const capacity = {
	maxConcurrentGames: 4,
	openToHumans: false,
	ladderAllowance: 4,
	activeGames: 1,
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

describe('ownerApi', () => {
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

	it('does not attempt a session route when play-api is not configured', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', '');
		expect(await fetchMyBots()).toEqual({ outcome: 'unavailable' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('fetches the owned list with the session cookie and distinguishes signed-out', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { bots: [bot] }));
		expect(await fetchMyBots()).toEqual({ outcome: 'ok', bots: [bot] });
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/me/bots', {
			credentials: 'include',
		});

		fetchMock.mockResolvedValueOnce(textResponse(401, 'Not signed in'));
		expect(await fetchMyBots()).toEqual({ outcome: 'signed-out' });
	});

	it('claims with both credentials, placing the transient bot token only in Authorization', async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { bots: [bot] }));
		expect(await claimBot('once-secret')).toEqual({ outcome: 'claimed', bots: [bot] });
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/me/bots/claim', {
			method: 'POST',
			credentials: 'include',
			headers: { authorization: 'Bearer once-secret' },
		});
	});

	it('distinguishes claim failures rather than folding an ownership conflict into a bad token', async () => {
		fetchMock
			.mockResolvedValueOnce(textResponse(401, 'bot token required'))
			.mockResolvedValueOnce(textResponse(401, 'Not signed in'))
			.mockResolvedValueOnce(textResponse(409, 'that bot already belongs to another account'))
			.mockResolvedValueOnce(textResponse(404, 'only a registered bot can be owned'));

		expect(await claimBot('wrong')).toEqual({ outcome: 'bad-token' });
		expect(await claimBot('right')).toEqual({ outcome: 'signed-out' });
		expect(await claimBot('right')).toEqual({ outcome: 'taken' });
		expect(await claimBot('right')).toEqual({ outcome: 'not-registered' });
	});

	it('uses the mirrored ladder and catalog routes, with description as the only JSON body', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
		await setLadder('team / one', 'name?', true);
		await openToHumans('team / one', 'name?', '  Plays humans  ');
		await closeToHumans('team / one', 'name?');

		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			'http://localhost:8080/me/bots/team%20%2F%20one/name%3F/ladder/join',
			{ method: 'POST', credentials: 'include' },
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'http://localhost:8080/me/bots/team%20%2F%20one/name%3F/open-to-humans',
			{
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ description: 'Plays humans' }),
			},
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			3,
			'http://localhost:8080/me/bots/team%20%2F%20one/name%3F/open-to-humans/leave',
			{ method: 'POST', credentials: 'include' },
		);
	});

	it('keeps not-yours, no-such-bot, and validation outcomes distinguishable', async () => {
		fetchMock
			.mockResolvedValueOnce(textResponse(403, 'you do not own that bot'))
			.mockResolvedValueOnce(textResponse(404, 'no such bot'))
			.mockResolvedValueOnce(textResponse(400, 'maxConcurrentGames must be between 1 and 32'));

		expect(await setLadder('acme', 'alice', true)).toEqual({ outcome: 'not-yours' });
		expect(await closeToHumans('acme', 'alice')).toEqual({ outcome: 'no-such-bot' });
		expect(await setCapacity('acme', 'alice', 99)).toEqual({
			outcome: 'invalid',
			reason: 'maxConcurrentGames must be between 1 and 32',
		});
	});

	it('reads and sets capacity with its live occupancy response', async () => {
		fetchMock
			.mockResolvedValueOnce(jsonResponse(200, capacity))
			.mockResolvedValueOnce(jsonResponse(200, { ...capacity, maxConcurrentGames: 7 }));

		expect(await fetchCapacity('acme', 'alice')).toEqual({ outcome: 'ok', capacity });
		expect(await setCapacity('acme', 'alice', 7)).toEqual({
			outcome: 'ok',
			capacity: { ...capacity, maxConcurrentGames: 7 },
		});
		expect(fetchMock).toHaveBeenLastCalledWith(
			'http://localhost:8080/me/bots/acme/alice/capacity',
			{
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ maxConcurrentGames: 7 }),
			},
		);
	});

	it('returns the plaintext only from a successful rotation, and does not persist it', async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { token: 'fresh-secret' }));
		expect(await rotateToken('acme', 'alice', 'ALICE')).toEqual({
			outcome: 'rotated',
			token: 'fresh-secret',
		});
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/me/bots/acme/alice/token', {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ confirm: 'ALICE' }),
		});
	});

	it('treats rotation confirmation mismatch as a dedicated, actionable error', async () => {
		fetchMock.mockResolvedValue(textResponse(400, 'confirm must be the bot’s name'));
		expect(await rotateToken('acme', 'alice', 'wrong')).toEqual({
			outcome: 'mismatch',
			reason: 'confirm must be the bot’s name',
		});
	});

	it('releases through the session route and returns the server’s new owned list', async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { bots: [] }));
		expect(await releaseBot('acme', 'alice')).toEqual({ outcome: 'released', bots: [] });
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/me/bots/acme/alice', {
			method: 'DELETE',
			credentials: 'include',
		});
	});
});

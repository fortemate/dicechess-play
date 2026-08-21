import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postGame } from './ingestClient';
import type { GameIngestWire } from './types';

// The classify table below is a cross-repo contract with play-api's IngestRoutes: the
// outbox decides synced/quarantined/retry from these outcomes, so a drift here silently
// changes what happens to a visitor's game record.

const payload = { id: 'uuid', source: 'playsite' } as unknown as GameIngestWire;

function stubFetch(status: number, body: unknown = {}) {
	const fetchMock = vi.fn().mockResolvedValue({ status, json: async () => body });
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('ingestClient', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('POSTs the payload to play-api /ingest/games without an Authorization header', async () => {
		const fetchMock = stubFetch(201);
		await postGame(payload);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/ingest/games',
			expect.objectContaining({ method: 'POST' }),
		);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
		expect(JSON.parse(init.body as string)).toEqual(payload);
	});

	it('strips a trailing slash from the configured base', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080/');
		const fetchMock = stubFetch(201);
		await postGame(payload);
		expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/ingest/games');
	});

	it.each([
		[201, 'created'],
		[200, 'exists'],
		[400, 'rejected'],
		[422, 'rejected'],
		[429, 'error'],
		[413, 'error'],
		[502, 'error'],
	] as const)('classifies %i as %s', async (status, outcome) => {
		stubFetch(status);
		const res = await postGame(payload);
		expect(res.outcome).toBe(outcome);
		expect(res.status).toBe(status);
	});

	it('resolves to error (never throws) on a transport failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
		const res = await postGame(payload);
		expect(res).toMatchObject({ outcome: 'error', status: 0 });
	});

	it('bounds the request with a timeout signal, and an abort classifies as error', async () => {
		const fetchMock = stubFetch(201);
		await postGame(payload);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(init.signal).toBeInstanceOf(AbortSignal);

		vi.stubGlobal(
			'fetch',
			vi.fn().mockRejectedValue(new DOMException('signal timed out', 'TimeoutError')),
		);
		const res = await postGame(payload);
		expect(res).toMatchObject({ outcome: 'error', status: 0 });
	});

	it('resolves to error with status 0 when no base URL is configured', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', '');
		const fetchMock = stubFetch(201);
		const res = await postGame(payload);
		expect(res).toMatchObject({ outcome: 'error', status: 0 });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

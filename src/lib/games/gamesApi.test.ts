import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchMyGames, fetchMyOpponents, fetchPlayerGames, fetchPlayerOpponents } from './gamesApi';

describe('gamesApi', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

	it('fetchPlayerGames GETs the URL-encoded guest id and returns the page (games + hasMore)', async () => {
		const games = [
			{
				gameId: 'g-1',
				seat: 'White',
				opponent: { kind: 'Bot', name: 'acme alice' },
				result: 'win',
				rated: false,
				termination: 'resign',
				timeControl: 'Fischer(300,3)',
				finishedAt: '2026-07-16T12:00:00Z',
			},
		];
		const fetchMock = okJson({ games, hasMore: true });
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchPlayerGames('11111111-1111-1111-1111-111111111111')).toEqual({
			games,
			hasMore: true,
		});
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/players/11111111-1111-1111-1111-111111111111/games',
		);
	});

	it('URL-encodes a guest id that needs it', async () => {
		const fetchMock = okJson({ games: [], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		await fetchPlayerGames('weird id/with?chars');
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/players/weird%20id%2Fwith%3Fchars/games',
		);
	});

	it('throws with the status on a non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
		await expect(fetchPlayerGames('not-a-uuid')).rejects.toThrow('fetchPlayerGames failed: 400');
	});

	it('sends no query string when no filters are given', async () => {
		const fetchMock = okJson({ games: [], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		await fetchPlayerGames('11111111-1111-1111-1111-111111111111');

		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/players/11111111-1111-1111-1111-111111111111/games',
		);
	});

	it('forwards vs and result as query params', async () => {
		const fetchMock = okJson({ games: [], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		await fetchPlayerGames('11111111-1111-1111-1111-111111111111', {
			vs: 'acme/alice',
			result: 'win',
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/players/11111111-1111-1111-1111-111111111111/games?vs=acme%2Falice&result=win',
		);
	});

	it('forwards only the filter that is given', async () => {
		const fetchMock = okJson({ games: [], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		await fetchPlayerGames('11111111-1111-1111-1111-111111111111', { vs: 'human' });

		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/players/11111111-1111-1111-1111-111111111111/games?vs=human',
		);
	});

	it('forwards before as a query param', async () => {
		const fetchMock = okJson({ games: [], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		await fetchPlayerGames('11111111-1111-1111-1111-111111111111', {
			before: '2026-07-16T12:00:00Z',
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/players/11111111-1111-1111-1111-111111111111/games?before=2026-07-16T12%3A00%3A00Z',
		);
	});

	it('composes vs, result, and before together', async () => {
		const fetchMock = okJson({ games: [], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		await fetchPlayerGames('11111111-1111-1111-1111-111111111111', {
			vs: 'acme/alice',
			result: 'win',
			before: '2026-07-16T12:00:00Z',
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/players/11111111-1111-1111-1111-111111111111/games?vs=acme%2Falice&result=win&before=2026-07-16T12%3A00%3A00Z',
		);
	});

	it('fetchPlayerOpponents GETs the URL-encoded guest id and returns the opponents array', async () => {
		const opponents = [
			{
				opponent: { kind: 'Bot', name: 'acme alice' },
				team: 'acme',
				botName: 'alice',
				games: 30,
				wins: 12,
				draws: 3,
				losses: 15,
				lastPlayedAt: '2026-07-16T12:00:00Z',
			},
			{
				opponent: { kind: 'Human', name: null },
				team: null,
				botName: null,
				games: 5,
				wins: 2,
				draws: 0,
				losses: 3,
				lastPlayedAt: '2026-07-16T12:00:00Z',
			},
		];
		const fetchMock = okJson({ opponents });
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchPlayerOpponents('11111111-1111-1111-1111-111111111111')).toEqual(opponents);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/players/11111111-1111-1111-1111-111111111111/opponents',
		);
	});

	it('fetchPlayerOpponents throws with the status on a non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
		await expect(fetchPlayerOpponents('not-a-uuid')).rejects.toThrow(
			'fetchPlayerOpponents failed: 400',
		);
	});

	it('fetchMyGames GETs /me/games WITH the session cookie, forwarding the filters', async () => {
		const fetchMock = okJson({ games: [], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		expect(
			await fetchMyGames({ vs: 'acme/alice', result: 'win', before: '2026-07-16T12:00:00Z' }),
		).toEqual({ games: [], hasMore: false });
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/me/games?vs=acme%2Falice&result=win&before=2026-07-16T12%3A00%3A00Z',
			{ credentials: 'include' },
		);
	});

	it('fetchMyGames omits the query entirely when no filters are set', async () => {
		const fetchMock = okJson({ games: [], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		await fetchMyGames();

		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/me/games', {
			credentials: 'include',
		});
	});

	it('fetchMyGames throws with the status on a non-OK response (401 = guest asked)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
		await expect(fetchMyGames()).rejects.toThrow('fetchMyGames failed: 401');
	});

	it('fetchMyOpponents GETs /me/opponents WITH the session cookie and returns the union', async () => {
		const opponents = [
			{
				opponent: { kind: 'Bot', name: 'acme alice' },
				team: 'acme',
				botName: 'alice',
				games: 42,
				wins: 20,
				draws: 2,
				losses: 20,
				lastPlayedAt: '2026-08-09T12:00:00Z',
			},
		];
		const fetchMock = okJson({ opponents });
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchMyOpponents()).toEqual(opponents);
		// `credentials: 'include'` is the whole point: /me/* is session-scoped (authApi.ts's rule).
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/me/opponents', {
			credentials: 'include',
		});
	});

	it('fetchMyOpponents throws with the status on a non-OK response (401 = guest asked)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
		await expect(fetchMyOpponents()).rejects.toThrow('fetchMyOpponents failed: 401');
	});
});

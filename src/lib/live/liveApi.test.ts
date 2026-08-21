import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGame, getState, isLiveEnabled, wsUrl } from './liveApi';

describe('liveApi', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('isLiveEnabled reflects the configured base', () => {
		expect(isLiveEnabled()).toBe(true);
	});

	it('createGame POSTs white/black and returns the response', async () => {
		const body = {
			gameId: 'g1',
			commit: 'abc',
			tokens: [
				{ seat: 'White', token: 'tw' },
				{ seat: 'Black', token: 'tb' },
			],
		};
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
		vi.stubGlobal('fetch', fetchMock);

		const res = await createGame('alice', 'bob');
		expect(res).toEqual(body);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/games',
			expect.objectContaining({ method: 'POST' }),
		);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(JSON.parse(init.body as string)).toEqual({ white: 'alice', black: 'bob' });
	});

	it('createGame includes the time control when given', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ gameId: 'g', commit: 'c', tokens: [] }),
		});
		vi.stubGlobal('fetch', fetchMock);

		await createGame('a', 'b', { Fischer: { initialSeconds: 300, incrementSeconds: 3 } });
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(JSON.parse(init.body as string)).toEqual({
			white: 'a',
			black: 'b',
			timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
		});
	});

	it('createGame omits the time control when null (unlimited)', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ gameId: 'g', commit: 'c', tokens: [] }),
		});
		vi.stubGlobal('fetch', fetchMock);

		await createGame('a', 'b', null);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(JSON.parse(init.body as string)).toEqual({ white: 'a', black: 'b' });
	});

	it('getState throws on a non-ok response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(getState('nope')).rejects.toThrow('404');
	});

	it('wsUrl converts the http base to ws and adds the token', () => {
		expect(wsUrl('g1', 'tok')).toBe('ws://localhost:8080/games/g1/ws?token=tok');
		expect(wsUrl('g1', null)).toBe('ws://localhost:8080/games/g1/ws');
	});

	/** play-api #285: the guest id is how a friend-by-link game gets a second player on the record —
	 * both its seats start held by the creator's id, since a friend is authorized by possessing a seat
	 * token rather than by being named.
	 */
	it('wsUrl carries the guest id alongside a seat token, and never without one', () => {
		expect(wsUrl('g1', 'tok', 'guest-uuid')).toBe(
			'ws://localhost:8080/games/g1/ws?token=tok&guest=guest-uuid',
		);
		// A spectator claims no seat, so there is nothing to identify and nothing to send.
		expect(wsUrl('g1', null, 'guest-uuid')).toBe('ws://localhost:8080/games/g1/ws');
		expect(wsUrl('g1', 'tok', null)).toBe('ws://localhost:8080/games/g1/ws?token=tok');
	});

	/** Pins the escaping too: adding `guest` must not change how `token` was already encoded (a space
	 * stays `%20`, which is what switching to URLSearchParams would have silently turned into `+`).
	 */
	it('wsUrl escapes both parameters', () => {
		expect(wsUrl('g1', 'a b&c', 'x=y')).toBe(
			'ws://localhost:8080/games/g1/ws?token=a%20b%26c&guest=x%3Dy',
		);
	});

	/** #194 step 4: every game-start path must carry the session, or a signed-in player is seated as a guest
	 * and their games never reach their account (`games: 0` in production before this).
	 */
	it('createGame sends the session cookie', async () => {
		const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ gameId: 'g1' }) });
		vi.stubGlobal('fetch', f);
		await createGame('guest:a', 'bot:team:acme:alice');
		expect(f.mock.calls[0][1].credentials).toBe('include');
	});
});

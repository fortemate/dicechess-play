import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCatalog, wakeBot, playBot, PlayBotError } from './catalogApi';

describe('catalogApi', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

	it('fetchCatalog GETs the catalog', async () => {
		const catalog = {
			bots: [
				{
					team: 'acme',
					name: 'alice',
					rating: 1720.5,
					rd: 85.0,
					provisional: false,
					description: 'aggressive + book',
					available: true,
				},
			],
		};
		const fetchMock = okJson(catalog);
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchCatalog()).toEqual(catalog);
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/lobby/bots');
	});

	it('wakeBot POSTs to the URL-encoded team/name segments', async () => {
		const fetchMock = okJson({ alive: true, busy: false });
		vi.stubGlobal('fetch', fetchMock);
		expect(await wakeBot('acme', 'alice')).toEqual({ alive: true, busy: false });
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/lobby/bots/acme/alice/wake', {
			method: 'POST',
		});
	});

	it('playBot POSTs the request body and resolves the match', async () => {
		const match = { gameId: 'g-1', token: 'seat-secret', seat: 'White' };
		const fetchMock = okJson(match);
		vi.stubGlobal('fetch', fetchMock);
		const req = {
			guestId: '11111111-1111-1111-1111-111111111111',
			team: 'acme',
			name: 'alice',
			timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 5 } },
		};
		expect(await playBot(req)).toEqual(match);
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/lobby/play-bot', {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(req),
		});
	});

	it('fetchCatalog and wakeBot throw with the status on a non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(fetchCatalog()).rejects.toThrow('fetchCatalog failed: 404');
		await expect(wakeBot('acme', 'ghost')).rejects.toThrow('wakeBot failed: 404');
	});

	it('playBot throws a typed PlayBotError carrying the status, so callers can branch on it', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => 'busy' }),
		);
		const req = {
			guestId: '11111111-1111-1111-1111-111111111111',
			team: 'acme',
			name: 'alice',
			timeControl: { SuddenDeath: { initialSeconds: 300 } },
		};
		await expect(playBot(req)).rejects.toThrow(PlayBotError);
		await expect(playBot(req)).rejects.toMatchObject({ status: 409 });
	});

	it('playBot carries the server’s own 409 body, so callers can tell its two causes apart (#189)', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 409,
			text: async () =>
				'that bot is busy — it is at its concurrent-game limit; try another or retry soon',
		});
		vi.stubGlobal('fetch', fetchMock);
		const req = {
			guestId: '11111111-1111-1111-1111-111111111111',
			team: 'acme',
			name: 'alice',
			timeControl: { SuddenDeath: { initialSeconds: 300 } },
		};
		await expect(playBot(req)).rejects.toMatchObject({
			status: 409,
			body: 'that bot is busy — it is at its concurrent-game limit; try another or retry soon',
		});
	});

	/** The load-bearing half of #194 step 4: without the cookie play-api sees no session, seats the account
	 * as a guest, and the game lands under `guest:<uuid>` — the account's history stays empty and its rating
	 * never moves. Production showed exactly that (`games: 0` for an account that had played).
	 */
	it('playBot sends the session cookie, so a signed-in player is seated as their account', async () => {
		const f = okJson({ gameId: 'g1', seat: 'White', token: 't' });
		vi.stubGlobal('fetch', f);
		await playBot({
			team: 'acme',
			name: 'alice',
			guestId: 'g-uuid',
			timeControl: { Unlimited: {} },
		});
		expect(f.mock.calls[0][1].credentials).toBe('include');
	});
});

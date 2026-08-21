import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	listSeeks,
	createSeek,
	seekStatus,
	acceptSeek,
	cancelSeek,
	SeekAcceptError,
} from './lobbyApi';

describe('lobbyApi', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

	it('listSeeks GETs the open seeks', async () => {
		const seeks = [{ id: 'seek-1', timeControl: { Unlimited: {} } }];
		const fetchMock = okJson(seeks);
		vi.stubGlobal('fetch', fetchMock);
		expect(await listSeeks()).toEqual(seeks);
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/lobby/seeks');
	});

	it('createSeek includes the time control when given', async () => {
		const fetchMock = okJson({ seekId: 's1', secret: 'x' });
		vi.stubGlobal('fetch', fetchMock);
		await createSeek('alice', { Fischer: { initialSeconds: 300, incrementSeconds: 3 } }, false);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/lobby/seeks');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body as string)).toEqual({
			creator: 'alice',
			rated: false,
			timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
		});
	});

	// Omitting the field is still the wire behaviour for a null preset — what it *means* changed
	// server-side: the server now fills in its own timed default rather than Unlimited.
	it('createSeek omits the time control field entirely when null', async () => {
		const fetchMock = okJson({ seekId: 's1', secret: 'x' });
		vi.stubGlobal('fetch', fetchMock);
		await createSeek('alice', null, false);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(JSON.parse(init.body as string)).toEqual({ creator: 'alice', rated: false });
	});

	// Unlike timeControl, `rated` is always stated (#279): false is a real choice, not an absence the
	// server fills in, and sending it explicitly is what makes a casual seek casual on purpose.
	it('createSeek sends the rated flag when the creator asked for a rated table', async () => {
		const fetchMock = okJson({ seekId: 's1', secret: 'x' });
		vi.stubGlobal('fetch', fetchMock);
		await createSeek('alice', null, true);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(JSON.parse(init.body as string)).toEqual({ creator: 'alice', rated: true });
	});

	it('seekStatus polls with the url-encoded secret', async () => {
		const fetchMock = okJson({ matched: false, gameId: null, token: null });
		vi.stubGlobal('fetch', fetchMock);
		const s = await seekStatus('s1', 'sec ret');
		expect(s.matched).toBe(false);
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/lobby/seeks/s1?secret=sec%20ret');
	});

	it('acceptSeek posts the accepter and returns the match', async () => {
		const fetchMock = okJson({ gameId: 'g1', token: 't' });
		vi.stubGlobal('fetch', fetchMock);
		const m = await acceptSeek('s1', 'bob');
		expect(m).toEqual({ gameId: 'g1', token: 't' });
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/lobby/seeks/s1/accept');
		expect(JSON.parse(init.body as string)).toEqual({ accepter: 'bob' });
	});

	it('acceptSeek throws when the seek was taken/expired', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));
		await expect(acceptSeek('s1', 'bob')).rejects.toThrow('409');
	});

	// The status has to survive the throw: the lobby presents a 403 (rated seek, anonymous visitor —
	// #279) as "sign in", and everything else as "that table was just taken". Losing the status would
	// tell a visitor the table is gone while it is still sitting in the list refusing them.
	it('acceptSeek carries the status so a rated refusal is distinguishable from a lost race', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
		const err = await acceptSeek('s1', 'bob').catch((e: unknown) => e);
		expect(err).toBeInstanceOf(SeekAcceptError);
		expect((err as SeekAcceptError).status).toBe(403);
	});

	it('cancelSeek DELETEs with the secret', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal('fetch', fetchMock);
		await cancelSeek('s1', 'sec');
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/lobby/seeks/s1?secret=sec', {
			method: 'DELETE',
		});
	});

	/** Both seek paths are session-aware server-side (#235); see `liveApi.createGame`'s test for why the
	 * cookie is load-bearing rather than cosmetic.
	 */
	it('createSeek sends the session cookie', async () => {
		const f = okJson({ seek: { id: 'seek-1' }, secret: 's' });
		vi.stubGlobal('fetch', f);
		await createSeek('guest:a', null, false);
		expect(f.mock.calls[0][1].credentials).toBe('include');
	});

	it('acceptSeek sends the session cookie', async () => {
		const f = okJson({ gameId: 'g1', seat: 'Black', token: 't' });
		vi.stubGlobal('fetch', f);
		await acceptSeek('seek-1', 'guest:b');
		expect(f.mock.calls[0][1].credentials).toBe('include');
	});
});

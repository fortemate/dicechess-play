import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	claimGuest,
	deleteAccount,
	fetchClaimedGuests,
	fetchMe,
	isAuthEnabled,
	loginUrl,
	logout,
	updateNickname,
} from './authApi';

const ME = {
	id: 'a-uuid',
	nickname: 'BraveDie',
	rating: 1500,
	rd: 350,
	provisional: true,
	admin: false,
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

describe('authApi', () => {
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

	describe('configuration', () => {
		it('reports auth unavailable when no play-api base URL is configured', () => {
			vi.stubEnv('VITE_PLAY_API_URL', '');
			expect(isAuthEnabled()).toBe(false);
		});

		it('builds the login URL on the play-api base, since login is a full-page navigation', () => {
			expect(loginUrl()).toBe('http://localhost:8080/auth/login');
		});

		it('never issues a request when auth is unavailable', async () => {
			vi.stubEnv('VITE_PLAY_API_URL', '');
			expect(await fetchMe()).toEqual({ outcome: 'unavailable' });
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});

	describe('fetchMe', () => {
		it('sends the session cookie, because the SPA never holds a token', async () => {
			fetchMock.mockResolvedValue(jsonResponse(200, ME));
			await fetchMe();
			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toBe('http://localhost:8080/auth/me');
			expect(init.credentials).toBe('include');
		});

		it('returns the account when signed in', async () => {
			fetchMock.mockResolvedValue(jsonResponse(200, ME));
			expect(await fetchMe()).toEqual({ outcome: 'signed-in', me: ME });
		});

		it('carries the server-derived administrator flag without deriving it from the nickname', async () => {
			fetchMock.mockResolvedValue(jsonResponse(200, { ...ME, admin: true }));
			expect(await fetchMe()).toEqual({ outcome: 'signed-in', me: { ...ME, admin: true } });
		});

		it('treats 401 as signed-out rather than an error, since most visitors are anonymous', async () => {
			fetchMock.mockResolvedValue(textResponse(401, 'Not signed in'));
			expect(await fetchMe()).toEqual({ outcome: 'signed-out' });
		});

		it('distinguishes a failed request from a signed-out answer', async () => {
			fetchMock.mockRejectedValue(new TypeError('network down'));
			expect(await fetchMe()).toEqual({ outcome: 'unavailable' });
		});

		it('reports unavailable when auth is not configured on the deployment (404)', async () => {
			fetchMock.mockResolvedValue(textResponse(404, 'Not found'));
			expect(await fetchMe()).toEqual({ outcome: 'unavailable' });
		});
	});

	describe('updateNickname', () => {
		it('returns the updated account on success', async () => {
			const renamed = { ...ME, nickname: 'Rabestro' };
			fetchMock.mockResolvedValue(jsonResponse(200, renamed));
			expect(await updateNickname('Rabestro')).toEqual({ outcome: 'updated', me: renamed });
			const [, init] = fetchMock.mock.calls[0];
			expect(init.method).toBe('PATCH');
			expect(JSON.parse(init.body)).toEqual({ nickname: 'Rabestro' });
		});

		it('reports a taken nickname as its own outcome, not as an error', async () => {
			fetchMock.mockResolvedValue(textResponse(409, 'nickname already taken'));
			expect(await updateNickname('Rabestro')).toEqual({ outcome: 'taken' });
		});

		it("surfaces play-api's own 400 text so the reason can be shown inline", async () => {
			fetchMock.mockResolvedValue(textResponse(400, 'nickname must be 3-20 characters'));
			expect(await updateNickname('x')).toEqual({
				outcome: 'invalid',
				reason: 'nickname must be 3-20 characters',
			});
		});

		it('falls back to a generic reason when the 400 body is empty', async () => {
			fetchMock.mockResolvedValue(textResponse(400, ''));
			expect(await updateNickname('x')).toEqual({ outcome: 'invalid', reason: 'invalid nickname' });
		});
	});

	describe('claimGuest', () => {
		it('posts the BARE uuid, because play-api prepends the guest: prefix itself', async () => {
			fetchMock.mockResolvedValue(jsonResponse(200, { guests: ['guest-uuid'] }));
			await claimGuest('guest-uuid');
			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toBe('http://localhost:8080/auth/me/guests');
			expect(JSON.parse(init.body)).toEqual({ guestId: 'guest-uuid' });
		});

		it('returns the full claim set after linking', async () => {
			fetchMock.mockResolvedValue(jsonResponse(200, { guests: ['one', 'two'] }));
			expect(await claimGuest('two')).toEqual({ outcome: 'linked', guests: ['one', 'two'] });
		});

		it('reports a guest already owned by another account as terminal, not retryable', async () => {
			fetchMock.mockResolvedValue(textResponse(409, 'that guest id belongs to another account'));
			expect(await claimGuest('taken')).toEqual({ outcome: 'claimed-by-another' });
		});
	});

	describe('fetchClaimedGuests', () => {
		it('returns the claim set for the owner', async () => {
			fetchMock.mockResolvedValue(jsonResponse(200, { guests: ['one'] }));
			expect(await fetchClaimedGuests()).toEqual({ outcome: 'ok', guests: ['one'] });
		});

		it('reports signed-out on 401', async () => {
			fetchMock.mockResolvedValue(textResponse(401, 'Not signed in'));
			expect(await fetchClaimedGuests()).toEqual({ outcome: 'signed-out' });
		});
	});

	describe('deleteAccount', () => {
		it('sends the typed confirmation and reports deletion on 204', async () => {
			fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
			expect(await deleteAccount('BraveDie')).toEqual({ outcome: 'deleted' });
			const [, init] = fetchMock.mock.calls[0];
			expect(init.method).toBe('DELETE');
			expect(JSON.parse(init.body)).toEqual({ confirm: 'BraveDie' });
		});

		it('surfaces a mismatched confirmation as an inline reason', async () => {
			fetchMock.mockResolvedValue(textResponse(400, 'confirm must be your current nickname'));
			expect(await deleteAccount('wrong')).toEqual({
				outcome: 'invalid',
				reason: 'confirm must be your current nickname',
			});
		});
	});

	describe('logout', () => {
		it('never throws, so a failed request cannot leave the UI stuck as signed in', async () => {
			fetchMock.mockRejectedValue(new TypeError('network down'));
			await expect(logout()).resolves.toBeUndefined();
		});
	});
});

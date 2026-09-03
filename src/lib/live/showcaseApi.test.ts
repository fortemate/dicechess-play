import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	getShowcase,
	claimShowcase,
	ShowcaseProblemError,
	type ShowcaseView,
	type ShowcaseClaimed,
	type ShowcaseSpectating,
	type ShowcaseProblem,
} from './showcaseApi';

describe('showcaseApi', () => {
	const mockApiBase = 'http://play.test';

	beforeEach(() => {
		vi.stubEnv('VITE_PLAY_API_URL', mockApiBase);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	describe('getShowcase', () => {
		it('returns disabled/unavailable fallback when VITE_PLAY_API_URL is empty', async () => {
			vi.stubEnv('VITE_PLAY_API_URL', '');
			const fetchSpy = vi.spyOn(globalThis, 'fetch');

			const res = await getShowcase();
			expect(res.notModified).toBe(false);
			expect(res.view?.status).toBe('unavailable');
			expect(res.view?.reason).toBe('disabled');
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('fetches and returns 200 ShowcaseView with etag', async () => {
			const mockView: ShowcaseView = {
				status: 'open',
				featuredBot: { team: 'rpi3', name: 'hunter', displayName: 'rpi3 hunter' },
				timeControl: { initialSeconds: 300, incrementSeconds: 3, display: '5+3' },
				nextHumanColor: 'White',
				currentGame: null,
				spectator: null,
				reason: null,
			};

			vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response(JSON.stringify(mockView), {
					status: 200,
					headers: { etag: 'W/"weak-123"' },
				}),
			);

			const res = await getShowcase();
			expect(res.notModified).toBe(false);
			expect(res.view).toEqual(mockView);
			expect(res.etag).toBe('W/"weak-123"');
		});

		it('handles 304 Not Modified when matching If-None-Match tag', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response(null, {
					status: 304,
					headers: { etag: 'W/"weak-123"' },
				}),
			);

			const res = await getShowcase('W/"weak-123"');
			expect(res.notModified).toBe(true);
			expect(res.etag).toBe('W/"weak-123"');
			expect(fetchSpy).toHaveBeenCalledWith(
				'http://play.test/showcase',
				expect.objectContaining({
					headers: { 'If-None-Match': 'W/"weak-123"' },
				}),
			);
		});

		it('throws on non-ok HTTP status', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response('Server Error', { status: 500 }),
			);

			await expect(getShowcase()).rejects.toThrow('getShowcase failed: 500');
		});
	});

	describe('claimShowcase', () => {
		it('throws ShowcaseProblemError with 503 when API URL is empty', async () => {
			vi.stubEnv('VITE_PLAY_API_URL', '');
			await expect(claimShowcase()).rejects.toThrow(ShowcaseProblemError);
			try {
				await claimShowcase();
			} catch (e) {
				const err = e as ShowcaseProblemError;
				expect(err.status).toBe(503);
				expect(err.code).toBe('showcase_unavailable');
			}
		});

		it('submits claim with Idempotency-Key and CSRF header, returning ShowcaseClaimed for winner', async () => {
			const claimedResult: ShowcaseClaimed = {
				outcome: 'claimed',
				gameId: 'game-123',
				seat: 'White',
				seatToken: 'secret-token-abc',
				wsUrl: '/games/game-123/ws?token=secret-token-abc',
			};

			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response(JSON.stringify(claimedResult), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			);

			const res = await claimShowcase({
				idempotencyKey: '77777777-7777-7777-7777-777777777777',
				guestId: '11111111-1111-1111-1111-111111111111',
				clientEntropy: 'deadbeef',
			});

			expect(res).toEqual(claimedResult);
			expect(fetchSpy).toHaveBeenCalledWith(
				'http://play.test/showcase/claim',
				expect.objectContaining({
					method: 'POST',
					credentials: 'include',
					headers: {
						'content-type': 'application/json',
						'Idempotency-Key': '77777777-7777-7777-7777-777777777777',
						'X-DiceChess-CSRF': '1',
					},
					body: JSON.stringify({
						guestId: '11111111-1111-1111-1111-111111111111',
						clientEntropy: 'deadbeef',
					}),
				}),
			);
		});

		it('returns ShowcaseSpectating for race loser', async () => {
			const spectatingResult: ShowcaseSpectating = {
				outcome: 'spectating',
				reason: 'already_claimed',
				gameId: 'game-456',
				spectatorWsUrl: '/games/game-456/ws',
			};

			vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response(JSON.stringify(spectatingResult), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			);

			const res = await claimShowcase();
			expect(res).toEqual(spectatingResult);
			expect((res as ShowcaseSpectating).reason).toBe('already_claimed');
		});

		function mockProblemFetch(status: number, code: string, retryAfter?: string, detail?: string) {
			const body: ShowcaseProblem = {
				status,
				code,
				title: code,
				detail: detail ?? `Error ${status}`,
				instance: '/showcase/claim',
			};
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response(JSON.stringify(body), {
					status,
					headers: {
						'content-type': 'application/problem+json',
						...(retryAfter !== undefined ? { 'retry-after': retryAfter } : {}),
					},
				}),
			);
		}

		it('parses RFC 7807 problem details with Retry-After header', async () => {
			mockProblemFetch(
				503,
				'showcase_unavailable',
				'5',
				'The showcase table is not accepting claims right now (bot_unavailable).',
			);

			await expect(claimShowcase()).rejects.toMatchObject({
				status: 503,
				code: 'showcase_unavailable',
				retryAfterSeconds: 5,
			});
		});

		it('parses 429 rate limit problem with Retry-After', async () => {
			mockProblemFetch(429, 'rate_limited', '42', 'Claim rate limit exceeded — retry later.');

			await expect(claimShowcase()).rejects.toMatchObject({
				status: 429,
				code: 'rate_limited',
				retryAfterSeconds: 42,
			});
		});

		it('returns null retryAfterSeconds when Retry-After is malformed or non-numeric', async () => {
			mockProblemFetch(
				429,
				'rate_limited',
				'42seconds',
				'Claim rate limit exceeded — retry later.',
			);

			await expect(claimShowcase()).rejects.toMatchObject({
				status: 429,
				code: 'rate_limited',
				retryAfterSeconds: null,
			});
		});

		it('parses 409 idempotency conflict problem', async () => {
			mockProblemFetch(409, 'idempotency_conflict');

			await expect(claimShowcase()).rejects.toMatchObject({
				status: 409,
				code: 'idempotency_conflict',
				retryAfterSeconds: null,
			});
		});

		it('handles non-JSON error responses gracefully', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }),
			);

			try {
				await claimShowcase();
				expect.unreachable();
			} catch (e) {
				const err = e as ShowcaseProblemError;
				expect(err.status).toBe(502);
				expect(err.code).toBe('unknown_error');
			}
		});
	});
});

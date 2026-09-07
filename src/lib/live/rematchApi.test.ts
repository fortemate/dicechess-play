import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getRematch, postRematch, RematchApiError } from './rematchApi';
import type { PrivateRematch } from './rematchTypes';

const FROZEN_PRIVATE_OFFERED: PrivateRematch = {
	sourceGameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	serverNow: '2026-09-07T12:00:20Z',
	myConsent: true,
	allowedActions: ['cancel'],
	settings: {
		timeControl: {
			Fischer: {
				initialSeconds: 300,
				incrementSeconds: 3,
			},
		},
		rated: false,
		mode: 'classic',
	},
	phase: 'offered',
	deadlineAt: '2026-09-07T12:00:29Z',
};

const FROZEN_PRIVATE_MATCHED_BLACK: PrivateRematch = {
	sourceGameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	serverNow: '2026-09-07T12:00:20Z',
	myConsent: true,
	allowedActions: [],
	settings: {
		timeControl: {
			Fischer: {
				initialSeconds: 300,
				incrementSeconds: 3,
			},
		},
		rated: false,
		mode: 'classic',
	},
	phase: 'matched',
	nextGameId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
	joinDeadlineAt: '2026-09-07T12:00:35Z',
	join: {
		seat: 'Black',
		token: 'example-black-capability',
	},
};

describe('rematchApi', () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.unstubAllEnvs();
	});

	describe('getRematch', () => {
		it('fetches rematch state with credentials and seat token header', async () => {
			let capturedUrl = '';
			let capturedInit: RequestInit | undefined;

			globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
				capturedUrl = String(url);
				capturedInit = init;
				return new Response(JSON.stringify(FROZEN_PRIVATE_OFFERED), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			const res = await getRematch('game-123', 'tok-abc');

			expect(capturedUrl).toBe('http://localhost:8080/games/game-123/rematch');
			expect(capturedInit?.method).toBe('GET');
			expect(capturedInit?.credentials).toBe('include');
			expect(capturedInit?.signal).toBeDefined();
			expect((capturedInit?.headers as Record<string, string>)?.['X-Rematch-Seat-Token']).toBe(
				'tok-abc',
			);
			expect(res).toEqual(FROZEN_PRIVATE_OFFERED);
		});

		it('omits seat token header when null or undefined', async () => {
			let capturedInit: RequestInit | undefined;

			globalThis.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
				capturedInit = init;
				return new Response(JSON.stringify(FROZEN_PRIVATE_OFFERED), { status: 200 });
			});

			await getRematch('game-123', null);
			expect(
				(capturedInit?.headers as Record<string, string>)?.['X-Rematch-Seat-Token'],
			).toBeUndefined();
		});

		it('throws RematchApiError with code on 401/403/404', async () => {
			globalThis.fetch = vi.fn(async () => {
				return new Response(JSON.stringify({ error: { code: 'not_participant' } }), {
					status: 403,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			await expect(getRematch('game-123')).rejects.toThrow(RematchApiError);
			try {
				await getRematch('game-123');
			} catch (e) {
				const err = e as RematchApiError;
				expect(err.status).toBe(403);
				expect(err.code).toBe('not_participant');
			}
		});
	});

	describe('postRematch', () => {
		it('submits action with CSRF header, seat token, and JSON payload', async () => {
			let capturedUrl = '';
			let capturedInit: RequestInit | undefined;

			globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
				capturedUrl = String(url);
				capturedInit = init;
				return new Response(JSON.stringify(FROZEN_PRIVATE_MATCHED_BLACK), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			const res = await postRematch('game-123', 'accept', 'req-uuid-456', 'tok-abc');

			expect(capturedUrl).toBe('http://localhost:8080/games/game-123/rematch');
			expect(capturedInit?.method).toBe('POST');
			expect(capturedInit?.credentials).toBe('include');
			expect(capturedInit?.signal).toBeDefined();
			const headers = capturedInit?.headers as Record<string, string>;
			expect(headers['Content-Type']).toBe('application/json');
			expect(headers['X-DiceChess-CSRF']).toBe('1');
			expect(headers['X-Rematch-Seat-Token']).toBe('tok-abc');
			expect(JSON.parse(capturedInit?.body as string)).toEqual({
				requestId: 'req-uuid-456',
				action: 'accept',
			});
			expect(res).toEqual(FROZEN_PRIVATE_MATCHED_BLACK);
		});

		it('attaches state when 409 conflict returns canonical state', async () => {
			globalThis.fetch = vi.fn(async () => {
				return new Response(
					JSON.stringify({
						error: { code: 'request_id_conflict' },
						state: FROZEN_PRIVATE_OFFERED,
					}),
					{ status: 409, headers: { 'Content-Type': 'application/json' } },
				);
			});

			try {
				await postRematch('game-123', 'propose', 'req-1');
				expect.unreachable('Should have thrown');
			} catch (e) {
				const err = e as RematchApiError;
				expect(err.status).toBe(409);
				expect(err.code).toBe('request_id_conflict');
				expect(err.state).toEqual(FROZEN_PRIVATE_OFFERED);
			}
		});

		it('handles 410 rematch_closed and 503 temporarily_unavailable', async () => {
			globalThis.fetch = vi.fn(async () => {
				return new Response(JSON.stringify({ error: { code: 'rematch_closed' } }), {
					status: 410,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			await expect(postRematch('game-123', 'propose', 'req-1')).rejects.toThrow(RematchApiError);
		});
	});
});

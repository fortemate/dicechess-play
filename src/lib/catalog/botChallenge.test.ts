import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	GENERIC_START_FAILURE,
	describeStartFailure,
	presentableConflictMessage,
	startBotGame,
} from './botChallenge';
import { PlayBotError } from './catalogApi';

describe('presentableConflictMessage', () => {
	it("shows the server's own 409 text, capitalized and punctuated", () => {
		expect(presentableConflictMessage('that bot is busy right now')).toBe(
			'That bot is busy right now.',
		);
	});

	it('leaves existing terminal punctuation alone', () => {
		expect(presentableConflictMessage('already playing!')).toBe('Already playing!');
	});

	it('falls back to the generic message for an empty body', () => {
		expect(presentableConflictMessage('   ')).toBe(GENERIC_START_FAILURE);
	});
});

describe('describeStartFailure', () => {
	it("surfaces the server's text for a 409 — only it knows which of the two causes applies", () => {
		const error = new PlayBotError(409, 'you already have an active game');

		expect(describeStartFailure(error)).toBe('You already have an active game.');
	});

	it('collapses every other status to one honest message', () => {
		expect(describeStartFailure(new PlayBotError(500, 'boom'))).toBe(GENERIC_START_FAILURE);
		expect(describeStartFailure(new TypeError('offline'))).toBe(GENERIC_START_FAILURE);
	});
});

describe('startBotGame', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('starts the game and builds the seat URL from the seat the server actually dealt', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ gameId: 'g-1', token: 'tok', seat: 'Black' }),
			}),
		);

		const { match, url } = await startBotGame(
			{
				guestId: 'guest-uuid',
				team: 'acme',
				name: 'alice',
				timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
				rated: false,
			},
			'https://play.example',
		);

		expect(match.gameId).toBe('g-1');
		expect(url).toBe('https://play.example/live/g-1?seat=tok&as=black');
	});

	it('propagates a PlayBotError so the caller can describe it', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => 'bot is busy' }),
		);

		await expect(
			startBotGame(
				{
					guestId: 'guest-uuid',
					team: 'acme',
					name: 'alice',
					timeControl: { Unlimited: {} },
					rated: false,
				},
				'https://play.example',
			),
		).rejects.toBeInstanceOf(PlayBotError);
	});
});

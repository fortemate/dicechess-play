import { describe, expect, it } from 'vitest';
import { LaboratoryApi, LaboratoryError } from './api';
import { LaboratoryRecordsApi, parseLaboratoryRematch, parseLaboratoryTranscript } from './records';

const gameId = 'a12b3456-7890-4abc-def0-1234567890ab';
const token = 'seat_secret-token_123';
const rulesVersion = '0.18.2';
const commit = 'ab'.repeat(32);
const provenance = {
	rulesVersion,
	diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1',
};
const variant = { id: 'choice-2x2d6', revision: 1 };
const timeControl = { Fischer: { initialSeconds: 600, incrementSeconds: 10 } };
const activeTranscript = () => ({
	schemaVersion: 1,
	variant,
	provenance,
	timeControl,
	initialDfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
	status: { Active: {} },
	completeness: 'incomplete',
	turns: [],
	currentTurn: { phase: 'AwaitingFirstRoll', offers: [], selectedPairIndex: null },
	fairness: null,
});
const endedTranscript = () => ({
	...activeTranscript(),
	status: { Ended: { over: { result: { Draw: {} }, termination: 'Draw' } } },
	completeness: 'complete',
	currentTurn: { phase: 'Ended', offers: [], selectedPairIndex: null },
	fairness: {
		commit,
		serverSeed: 'cd'.repeat(32),
		clientSeeds: { white: '12'.repeat(16), black: '34'.repeat(16) },
	},
});
const response = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const makeApi = (fetcher: typeof fetch) =>
	new LaboratoryRecordsApi(new LaboratoryApi('https://lab.example', rulesVersion), fetcher);

describe('laboratory records API', () => {
	it('fetches a strict public transcript from the configured origin without ambient credentials', async () => {
		const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
		const api = makeApi(async (input, init) => {
			requests.push({ input, init });
			return response(endedTranscript());
		});

		const transcript = await api.transcript(gameId.toUpperCase());

		expect(transcript.variant).toEqual(variant);
		expect(transcript.fairness?.serverSeed).toBe('cd'.repeat(32));
		expect(String(requests[0].input)).toBe(`https://lab.example/games/${gameId}/transcript`);
		expect(requests[0].init).toMatchObject({
			method: 'GET',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			cache: 'no-store',
		});
	});

	it('posts rematch consent with the source seat capability only in the required header', async () => {
		let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
		const api = makeApi(async (input, init) => {
			request = { input, init };
			return response({ phase: 'created', gameId, seat: 'Black', token: 'next-seat-token' });
		});

		const result = await api.rematch(gameId, token, true);

		expect(result).toEqual({ phase: 'created', gameId, seat: 'Black', token: 'next-seat-token' });
		expect(String(request?.input)).toBe(`https://lab.example/games/${gameId}/rematch`);
		expect(request?.init).toMatchObject({
			method: 'POST',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			cache: 'no-store',
			headers: { 'Content-Type': 'application/json', 'X-Laboratory-Seat-Token': token },
			body: JSON.stringify({ consent: true }),
		});
		expect(String(request?.input)).not.toContain(token);
	});

	it('rejects unknown transcript fields, including hidden credentials and unrevealed active fairness', () => {
		const hiddenAtTop = { ...activeTranscript(), seatToken: token };
		const hiddenInTurn = {
			...activeTranscript(),
			currentTurn: { ...activeTranscript().currentTurn, serverSeed: 'cd'.repeat(32) },
		};
		const hiddenInFairness = {
			...endedTranscript(),
			fairness: { ...endedTranscript().fairness, seatToken: token },
		};
		const activeFairness = {
			...activeTranscript(),
			fairness: endedTranscript().fairness,
		};
		const fallbackClientSeeds = {
			...endedTranscript(),
			fairness: {
				...endedTranscript().fairness,
				clientSeeds: { white: 'guest:a12b3456-7890-4abc-def0-1234567890ab', black: 'account-id' },
			},
		};

		for (const value of [hiddenAtTop, hiddenInTurn, hiddenInFairness, activeFairness]) {
			expect(() => parseLaboratoryTranscript(value, rulesVersion)).toThrowError(LaboratoryError);
		}
		expect(
			parseLaboratoryTranscript(fallbackClientSeeds, rulesVersion).fairness?.clientSeeds.white,
		).toBe('guest:a12b3456-7890-4abc-def0-1234567890ab');
	});

	it('checks turn offers, selected dice, schema provenance and rematch capabilities', () => {
		const invalidTurn = {
			...endedTranscript(),
			turns: [
				{
					turnNumber: 0,
					activeColor: 'w',
					offers: [
						[1, 2],
						[3, 4],
					],
					selectedPairIndex: 1,
					dice: [1, 2],
					moves: ['e2e4'],
					fenAfter: 'fen',
				},
			],
		};
		expect(() => parseLaboratoryTranscript(invalidTurn, rulesVersion)).toThrowError(
			LaboratoryError,
		);
		expect(() => parseLaboratoryTranscript(endedTranscript(), '0.18.1')).toThrowError(
			LaboratoryError,
		);
		expect(parseLaboratoryRematch({ phase: 'awaiting_consent' })).toEqual({
			phase: 'awaiting_consent',
		});
		expect(() => parseLaboratoryRematch({ phase: 'created', gameId, seat: 'White' })).toThrowError(
			LaboratoryError,
		);
		expect(() =>
			parseLaboratoryRematch({
				phase: 'created',
				gameId,
				seat: 'White',
				token,
				otherToken: 'hidden',
			}),
		).toThrowError(LaboratoryError);
	});
});

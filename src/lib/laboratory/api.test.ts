import { describe, expect, it, vi } from 'vitest';
import {
	LaboratoryApi,
	LaboratoryError,
	parseGameState,
	parseLabState,
	timeControlKey,
	validTimeControl,
} from './api';
import type { CreationResponse, PublicState } from './protocol';

const rulesVersion = '0.18.2';
const gameId = 'a12b3456-7890-4abc-def0-1234567890ab';
const guestId = 'b12b3456-7890-4abc-def0-1234567890ab';
const commit = 'ab'.repeat(32);
const timeControl = { Fischer: { initialSeconds: 600, incrementSeconds: 10 } } as const;
const provenance = {
	rulesVersion,
	diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1',
} as const;
const variant = { id: 'choice-2x2d6', revision: 1 } as const;
const creation = (): CreationResponse => ({
	gameId,
	commit,
	tokens: [
		{ seat: 'White', token: 'white_dummy-token_1' },
		{ seat: 'Black', token: 'black_dummy-token_2' },
	],
	variant,
	labProtocolVersion: 1,
	provenance,
});

type TurnPhase = PublicState['turn']['phase'];
const turnFor = (phase: TurnPhase): PublicState['turn'] => {
	switch (phase) {
		case 'AwaitingPlayers':
		case 'AwaitingFirstRoll':
			return { phase, offers: [], selectedPairIndex: null };
		case 'AwaitingSecondRoll':
			return { phase, offers: [[1, 6]], selectedPairIndex: null };
		case 'AwaitingPairChoice':
			return {
				phase,
				offers: [
					[1, 6],
					[2, 5],
				],
				selectedPairIndex: null,
			};
		case 'PlayingSelectedPair':
			return {
				phase,
				offers: [
					[1, 6],
					[2, 5],
				],
				selectedPairIndex: 1,
			};
		case 'Ended':
			return { phase, offers: [], selectedPairIndex: null };
	}
};

const labState = (phase: TurnPhase = 'AwaitingPlayers'): PublicState => ({
	variant,
	protocolVersion: 1,
	provenance,
	turn: turnFor(phase),
});

const gameState = (phase: TurnPhase = 'AwaitingPlayers') => ({
	version: 1,
	dfen: 'valid-dfen',
	activeSeat: 'White',
	dicePending: false,
	status:
		phase === 'Ended'
			? { Ended: { over: { result: { Draw: {} }, termination: 'Draw' } } }
			: { Active: {} },
	clocks: { white: 600_000, black: 600_000 },
	players: {
		white: { kind: 'Human', name: null },
		black: { kind: 'Human', name: null },
	},
	rated: false,
	ratingDomain: 'casual',
	timeControl,
	commit,
	lab: labState(phase),
});

const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const createFetcher = (...responses: Response[]) => {
	const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const fetcher: typeof fetch = async (input, init) => {
		requests.push({ input, init });
		const next = responses.shift();
		if (!next) throw new Error('unexpected fetch');
		return next;
	};
	return { fetcher, requests };
};

function expectCode(promise: Promise<unknown>, code: string) {
	return expect(promise).rejects.toMatchObject({ name: 'LaboratoryError', code });
}

describe('laboratory API boundary', () => {
	it('posts the exact opt-in request and verifies the returned state using only the configured origin', async () => {
		const { fetcher, requests } = createFetcher(
			jsonResponse(creation()),
			jsonResponse(gameState()),
		);
		const api = new LaboratoryApi('https://lab.example', rulesVersion, fetcher);
		const result = await api.create(guestId, timeControl);
		expect(result.creation).toEqual(creation());
		expect(result.state.commit).toBe(commit);
		expect(requests).toHaveLength(2);
		expect(requests.map(({ input }) => new URL(String(input)).href)).toEqual([
			'https://lab.example/games',
			`https://lab.example/games/${gameId}`,
		]);
		const post = requests[0].init!;
		expect(post.method).toBe('POST');
		expect(post.headers).toEqual({ 'Content-Type': 'application/json' });
		expect(JSON.parse(String(post.body))).toEqual({
			white: guestId,
			black: guestId,
			timeControl,
			variant,
			labProtocolVersion: 1,
			rated: false,
		});
		for (const { init } of requests) {
			expect(init?.credentials).toBe('omit');
			expect(init?.referrerPolicy).toBe('no-referrer');
			expect(init?.cache).toBe('no-store');
		}
	});

	it('rejects bad creation contracts before making the state request or returning capabilities', async () => {
		const missingVariant = { ...creation(), variant: undefined };
		const missingProvenance = { ...creation(), provenance: undefined };
		const missingProtocol = { ...creation(), labProtocolVersion: undefined };
		const invalidCreations = [
			missingVariant,
			missingProvenance,
			missingProtocol,
			{ ...creation(), variant: { id: 'classic-3d6', revision: 1 } },
			{ ...creation(), variant: { id: 'future-variant', revision: 1 } },
			{ ...creation(), labProtocolVersion: 2 },
			{ ...creation(), provenance: { ...provenance, rulesVersion: '0.18.1' } },
			{ ...creation(), provenance: { ...provenance, diceAlgorithm: 'classic' } },
			{
				...creation(),
				tokens: [
					{ seat: 'White', token: 'one' },
					{ seat: 'White', token: 'two' },
				],
			},
			{
				...creation(),
				tokens: [
					{ seat: 'White', token: 'same' },
					{ seat: 'Black', token: 'same' },
				],
			},
			{ ...creation(), commit: 'not-a-commit' },
		];
		for (const payload of invalidCreations) {
			const { fetcher, requests } = createFetcher(jsonResponse(payload), jsonResponse(gameState()));
			const api = new LaboratoryApi('https://lab.example', rulesVersion, fetcher);
			const rejected = api.create(guestId, timeControl);
			await expectCode(rejected, 'incompatible');
			expect(requests).toHaveLength(1);
		}
		const badToken = 'private-capability';
		const { fetcher } = createFetcher(
			jsonResponse({
				...creation(),
				tokens: [
					{ seat: 'White', token: badToken },
					{ seat: 'Black', token: 'bad token' },
				],
			}),
		);
		const error = await new LaboratoryApi('https://lab.example', rulesVersion, fetcher)
			.create(guestId, timeControl)
			.catch((cause) => cause as Error);
		expect(error).toBeInstanceOf(LaboratoryError);
		if (!(error instanceof LaboratoryError)) throw new Error('Expected incompatible creation');
		expect(error.message).not.toContain(badToken);
	});

	it('rejects an unverified or mismatched GET state after creation', async () => {
		const wrongCommit = { ...gameState(), commit: 'cd'.repeat(32) };
		const wrongTime = {
			...gameState(),
			timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 5 } },
		};
		for (const state of [wrongCommit, wrongTime]) {
			const { fetcher, requests } = createFetcher(jsonResponse(creation()), jsonResponse(state));
			await expectCode(
				new LaboratoryApi('https://lab.example', rulesVersion, fetcher).create(
					guestId,
					timeControl,
				),
				'incompatible',
			);
			expect(requests).toHaveLength(2);
		}
	});

	it('accepts all valid turn stages and ended state while rejecting malformed state contracts', () => {
		for (const phase of [
			'AwaitingPlayers',
			'AwaitingFirstRoll',
			'AwaitingSecondRoll',
			'AwaitingPairChoice',
			'PlayingSelectedPair',
			'Ended',
		] as const) {
			expect(parseGameState(gameState(phase), rulesVersion).lab.turn.phase).toBe(phase);
		}
		const malformed = [
			{
				...gameState(),
				lab: {
					...labState(),
					turn: { phase: 'AwaitingSecondRoll', offers: [], selectedPairIndex: null },
				},
			},
			{
				...gameState(),
				lab: {
					...labState(),
					turn: { phase: 'AwaitingFirstRoll', offers: [[8, 2]], selectedPairIndex: null },
				},
			},
			{ ...gameState(), lab: { ...labState(), variant: { id: 'classic-3d6', revision: 1 } } },
			{ ...gameState(), lab: { ...labState(), protocolVersion: 2 } },
			{
				...gameState(),
				lab: { ...labState(), provenance: { ...provenance, rulesVersion: '0.17.0' } },
			},
			{ ...gameState(), version: -1 },
			{ ...gameState(), rated: true },
			{ ...gameState(), ratingDomain: 'competitive' },
			{
				...gameState(),
				players: { white: { kind: 'Bot', name: 'bot' }, black: { kind: 'Human', name: null } },
			},
			{
				...gameState(),
				status: { Ended: { over: { result: { Draw: {} }, termination: 'Draw' } } },
			},
		];
		for (const payload of malformed) {
			expect(() => parseGameState(payload, rulesVersion)).toThrowError(LaboratoryError);
		}
		expect(() =>
			parseLabState(
				{ ...labState(), provenance: { ...provenance, rulesVersion: 'unknown' } },
				rulesVersion,
			),
		).toThrowError(LaboratoryError);
	});

	it('validates time controls and formats stable keys', () => {
		expect(validTimeControl(timeControl)).toBe(true);
		expect(validTimeControl({ Unlimited: {} })).toBe(true);
		expect(validTimeControl({ Fischer: { initialSeconds: 0, incrementSeconds: 1 } })).toBe(false);
		expect(validTimeControl({ Fischer: { initialSeconds: 1, incrementSeconds: -1 } })).toBe(false);
		expect(
			validTimeControl({ Fischer: { initialSeconds: 1, incrementSeconds: 0 }, Unlimited: {} }),
		).toBe(false);
		expect(timeControlKey(timeControl)).toBe('fischer:600:10');
	});

	it('maps HTTP, connection, and malformed JSON errors to safe typed errors', async () => {
		for (const status of [404, 410]) {
			const { fetcher } = createFetcher(new Response(null, { status }));
			await expectCode(
				new LaboratoryApi('https://lab.example', rulesVersion, fetcher).state(gameId),
				'expired',
			);
		}
		for (const status of [400, 403]) {
			const { fetcher } = createFetcher(new Response(null, { status }));
			await expectCode(
				new LaboratoryApi('https://lab.example', rulesVersion, fetcher).state(gameId),
				'unavailable',
			);
		}
		const network = vi.fn<typeof fetch>(async () => {
			throw new Error(`failure ${guestId}`);
		});
		await expectCode(
			new LaboratoryApi('https://lab.example', rulesVersion, network).state(gameId),
			'connection',
		);
		const malformedJson: typeof fetch = async () => new Response('{', { status: 200 });
		const error = await new LaboratoryApi('https://lab.example', rulesVersion, malformedJson)
			.state(gameId)
			.catch((e) => e);
		expect(error).toMatchObject({ name: 'LaboratoryError', code: 'incompatible' });
		expect(error.message).not.toContain(guestId);
	});

	it('rejects invalid origins and IDs without exposing raw credentials', async () => {
		for (const origin of [
			'https://user:pass@lab.example',
			'https://lab.example/path',
			'http://LAB.example',
			'ftp://lab.example',
		]) {
			expect(() => new LaboratoryApi(origin, rulesVersion, vi.fn())).toThrowError(LaboratoryError);
		}
		const fetcher = vi.fn<typeof fetch>();
		const api = new LaboratoryApi('https://lab.example', rulesVersion, fetcher);
		await expectCode(api.state('private-token'), 'incompatible');
		await expectCode(api.create('private-token', timeControl), 'incompatible');
		expect(fetcher).not.toHaveBeenCalled();
		const badOriginError = (() => {
			try {
				new LaboratoryApi('https://user:private-password@lab.example', rulesVersion, fetcher);
			} catch (error) {
				return error as Error;
			}
			throw new Error('expected constructor to reject');
		})();
		expect(badOriginError.message).not.toContain('private-password');
	});
});

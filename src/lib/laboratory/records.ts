/**
 * Public laboratory transcript and private rematch HTTP boundary. Transcript parsing is an allowlist:
 * these public records must never carry seat capabilities, private receipts, or unrevealed dice data.
 */
import type { GameStatusWire, Seat, Termination, TimeControl } from '../live/liveTypes';
import { isRecord, isSeat, LaboratoryError, type LaboratoryApi } from './api';
import { parseLabState } from './api';
import type { LabVariant, Provenance, PublicTurn, RematchView } from './protocol';

export interface LaboratoryTranscriptTurn {
	turnNumber: number;
	activeColor: 'w' | 'b';
	offers: readonly [readonly [number, number], readonly [number, number]];
	selectedPairIndex: 0 | 1;
	dice: readonly [number, number];
	moves: readonly string[];
	fenAfter: string;
}

export interface LaboratoryFairness {
	commit: string;
	serverSeed: string;
	clientSeeds: { white: string; black: string };
}

export interface LaboratoryTranscript {
	schemaVersion: 1;
	variant: LabVariant;
	provenance: Provenance;
	timeControl: TimeControl;
	initialDfen: string;
	status: GameStatusWire;
	completeness: 'complete' | 'incomplete';
	turns: readonly LaboratoryTranscriptTurn[];
	currentTurn: PublicTurn;
	fairness: LaboratoryFairness | null;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{1,256}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const TOP_LEVEL = [
	'schemaVersion',
	'variant',
	'provenance',
	'timeControl',
	'initialDfen',
	'status',
	'completeness',
	'turns',
	'currentTurn',
	'fairness',
];

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
	return (
		isRecord(value) &&
		Object.keys(value).length === keys.length &&
		keys.every((key) => key in value)
	);
}

function fail(): never {
	throw new LaboratoryError('incompatible');
}

function parseStatus(value: unknown): GameStatusWire {
	if (!isRecord(value) || Object.keys(value).length !== 1) return fail();
	if (hasExactKeys(value.Active, [])) return { Active: {} };
	if (!hasExactKeys(value.Ended, ['over']) || !isRecord(value.Ended.over)) return fail();
	const over = value.Ended.over;
	if (!hasExactKeys(over, ['result', 'termination']) || typeof over.termination !== 'string')
		return fail();
	if (!isRecord(over.result) || Object.keys(over.result).length !== 1) return fail();
	if (hasExactKeys(over.result.Draw, []))
		return {
			Ended: { over: { result: { Draw: {} }, termination: over.termination as Termination } },
		};
	if (hasExactKeys(over.result.Win, ['side']) && isSeat(over.result.Win.side)) {
		return {
			Ended: {
				over: {
					result: { Win: { side: over.result.Win.side } },
					termination: over.termination as Termination,
				},
			},
		};
	}
	return fail();
}

function parseTurn(value: unknown): LaboratoryTranscriptTurn {
	if (
		!hasExactKeys(value, [
			'turnNumber',
			'activeColor',
			'offers',
			'selectedPairIndex',
			'dice',
			'moves',
			'fenAfter',
		]) ||
		!Number.isSafeInteger(value.turnNumber) ||
		Number(value.turnNumber) < 0 ||
		(value.activeColor !== 'w' && value.activeColor !== 'b') ||
		!Array.isArray(value.offers) ||
		value.offers.length !== 2 ||
		!value.offers.every(
			(pair) =>
				Array.isArray(pair) &&
				pair.length === 2 &&
				pair.every((die) => Number.isInteger(die) && die >= 1 && die <= 6),
		) ||
		(value.selectedPairIndex !== 0 && value.selectedPairIndex !== 1) ||
		!Array.isArray(value.dice) ||
		value.dice.length !== 2 ||
		!value.dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6) ||
		!Array.isArray(value.moves) ||
		value.moves.length > 2 ||
		!value.moves.every((move) => typeof move === 'string' && UCI.test(move)) ||
		typeof value.fenAfter !== 'string' ||
		value.fenAfter.length === 0 ||
		value.fenAfter.length > 512
	)
		return fail();
	const selected = value.offers[value.selectedPairIndex];
	if (value.dice[0] !== selected[0] || value.dice[1] !== selected[1]) return fail();
	return value as unknown as LaboratoryTranscriptTurn;
}

function parseFairness(value: unknown): LaboratoryFairness | null {
	if (value === null) return null;
	if (
		!hasExactKeys(value, ['commit', 'serverSeed', 'clientSeeds']) ||
		typeof value.commit !== 'string' ||
		!HEX_64.test(value.commit) ||
		typeof value.serverSeed !== 'string' ||
		!HEX_64.test(value.serverSeed) ||
		!hasExactKeys(value.clientSeeds, ['white', 'black']) ||
		typeof value.clientSeeds.white !== 'string' ||
		value.clientSeeds.white.length === 0 ||
		typeof value.clientSeeds.black !== 'string' ||
		value.clientSeeds.black.length === 0
	)
		return fail();
	return value as unknown as LaboratoryFairness;
}

function parseTimeControl(value: unknown): TimeControl {
	if (!isRecord(value) || Object.keys(value).length !== 1) return fail();
	if (hasExactKeys(value.Unlimited, [])) return { Unlimited: {} };
	for (const [kind, field] of [
		['Fischer', 'initialSeconds'],
		['SuddenDeath', 'initialSeconds'],
		['PerMove', 'secondsPerMove'],
	] as const) {
		const body = value[kind];
		if (!isRecord(body)) continue;
		const expected = kind === 'Fischer' ? ['initialSeconds', 'incrementSeconds'] : [field];
		if (!hasExactKeys(body, expected)) return fail();
		if (
			!Number.isSafeInteger(body[field]) ||
			Number(body[field]) <= 0 ||
			Number(body[field]) > 2147483647
		)
			return fail();
		if (
			kind === 'Fischer' &&
			(!Number.isSafeInteger(body.incrementSeconds) || Number(body.incrementSeconds) < 0)
		)
			return fail();
		return value as unknown as TimeControl;
	}
	return fail();
}

/** Parse the exact public schema-1 export and reject extra fields at every credential-bearing boundary. */
export function parseLaboratoryTranscript(
	value: unknown,
	rulesVersion: string,
): LaboratoryTranscript {
	if (
		!hasExactKeys(value, TOP_LEVEL) ||
		value.schemaVersion !== 1 ||
		(value.completeness !== 'complete' && value.completeness !== 'incomplete') ||
		typeof value.initialDfen !== 'string' ||
		value.initialDfen.length === 0 ||
		value.initialDfen.length > 512 ||
		!Array.isArray(value.turns)
	)
		return fail();
	const lab = parseLabState(
		{
			variant: value.variant,
			protocolVersion: 1,
			provenance: value.provenance,
			turn: value.currentTurn,
		},
		rulesVersion,
	);
	if (
		!hasExactKeys(value.variant, ['id', 'revision']) ||
		!hasExactKeys(value.provenance, ['rulesVersion', 'diceAlgorithm']) ||
		!hasExactKeys(value.currentTurn, ['phase', 'offers', 'selectedPairIndex'])
	)
		return fail();
	const status = parseStatus(value.status);
	const turns = value.turns.map(parseTurn);
	const fairness = parseFairness(value.fairness);
	const ended = 'Ended' in status;
	const sportingEnd = ended && status.Ended.over.termination !== 'Aborted';
	if (
		ended !== (lab.turn.phase === 'Ended') ||
		(fairness !== null && !ended) ||
		(value.completeness === 'complete' && (!sportingEnd || fairness === null))
	)
		return fail();
	return {
		schemaVersion: 1,
		variant: lab.variant,
		provenance: lab.provenance,
		timeControl: parseTimeControl(value.timeControl),
		initialDfen: value.initialDfen,
		status,
		completeness: value.completeness,
		turns,
		currentTurn: lab.turn,
		fairness,
	};
}

export function parseLaboratoryRematch(value: unknown): RematchView {
	if (!isRecord(value) || typeof value.phase !== 'string') return fail();
	if (value.phase === 'awaiting_consent') {
		if (!hasExactKeys(value, ['phase'])) return fail();
		return { phase: 'awaiting_consent' };
	}
	if (
		value.phase !== 'created' ||
		!hasExactKeys(value, ['phase', 'gameId', 'seat', 'token']) ||
		typeof value.gameId !== 'string' ||
		!UUID.test(value.gameId) ||
		!isSeat(value.seat) ||
		typeof value.token !== 'string' ||
		!TOKEN.test(value.token)
	)
		return fail();
	return {
		phase: 'created',
		gameId: value.gameId.toLowerCase(),
		seat: value.seat as Seat,
		token: value.token,
	};
}

/** Reads public transcripts and manages a caller's consent using only the configured lab origin. */
export class LaboratoryRecordsApi {
	constructor(
		private readonly api: LaboratoryApi,
		private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
	) {}

	private async request(path: string, init: RequestInit): Promise<unknown> {
		let response: Response;
		try {
			response = await this.fetcher(new URL(path, this.api.origin), {
				...init,
				signal: AbortSignal.timeout(10000),
				credentials: 'omit',
				referrerPolicy: 'no-referrer',
				cache: 'no-store',
			});
		} catch {
			throw new LaboratoryError('connection');
		}
		if (response.status === 404 || response.status === 410) throw new LaboratoryError('expired');
		if (!response.ok) throw new LaboratoryError('unavailable');
		try {
			return await response.json();
		} catch {
			throw new LaboratoryError('incompatible');
		}
	}

	async transcript(gameId: string): Promise<LaboratoryTranscript> {
		if (!UUID.test(gameId)) throw new LaboratoryError('incompatible');
		const value = await this.request(`/games/${gameId.toLowerCase()}/transcript`, {
			method: 'GET',
		});
		return parseLaboratoryTranscript(value, this.api.rulesVersion);
	}

	async rematch(gameId: string, token: string, consent: boolean): Promise<RematchView> {
		if (
			!UUID.test(gameId) ||
			typeof token !== 'string' ||
			!TOKEN.test(token) ||
			typeof consent !== 'boolean'
		)
			throw new LaboratoryError('incompatible');
		const value = await this.request(`/games/${gameId.toLowerCase()}/rematch`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Laboratory-Seat-Token': token,
			},
			body: JSON.stringify({ consent }),
		});
		return parseLaboratoryRematch(value);
	}
}

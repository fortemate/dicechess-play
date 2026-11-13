/**
 * Revision-1 laboratory HTTP boundary. Every response is checked before a capability is stored or
 * shared: an old/classic server must never turn a laboratory invitation into an ordinary game.
 * Uses only the explicitly supplied laboratory origin, anonymous identity and cookie-free requests.
 */
import type {
	GameStatusWire,
	PublicGameState,
	Seat,
	TimeControl,
	GameMoves,
} from '../live/liveTypes';
import type { MoveTree } from '../moveTreeWalker';
import type { CreationRequest, CreationResponse, PublicState, PublicTurn } from './protocol';

export const LAB_VARIANT = { id: 'choice-2x2d6', revision: 1 } as const;
export const LAB_DICE_ALGORITHM = 'choice-2x2d6-hmac-sha256-v1';
export type LabErrorCode = 'unavailable' | 'expired' | 'incompatible' | 'connection';

export class LaboratoryError extends Error {
	constructor(readonly code: LabErrorCode) {
		super(`Laboratory ${code}`);
		this.name = 'LaboratoryError';
	}
}

export interface LaboratoryGameState extends PublicGameState {
	timeControl: TimeControl;
	commit: string;
	lab: PublicState;
	rated: false;
	ratingDomain: 'casual';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A two-die turn has at most two micro-moves. Invalid trees never enable the board. */
export function validMoveTree(value: unknown, depth = 0): value is MoveTree {
	return (
		isRecord(value) &&
		Object.entries(value).every(
			([move, child]) =>
				depth < 2 && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) && validMoveTree(child, depth + 1),
		)
	);
}

const integer = (value: unknown): value is number =>
	Number.isSafeInteger(value) && Number(value) >= 0;
const positive = (value: unknown): value is number =>
	integer(value) && value > 0 && value <= 2147483647;
export const isSeat = (value: unknown): value is Seat => value === 'White' || value === 'Black';
const isToken = (value: unknown): value is string =>
	typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const isCommit = (value: unknown): value is string =>
	typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isGameId = (value: unknown): value is string =>
	typeof value === 'string' &&
	/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export function laboratoryOrigin(value: string): string {
	try {
		const url = new URL(value);
		if (
			(url.protocol === 'https:' || url.protocol === 'http:') &&
			url.origin === value &&
			!url.username &&
			!url.password &&
			url.pathname === '/' &&
			!url.search &&
			!url.hash
		)
			return url.origin;
	} catch {
		/* Configuration errors never echo a possibly credential-bearing URL. */
	}
	throw new LaboratoryError('incompatible');
}

function validIdentity(value: unknown): boolean {
	return isRecord(value) && value.id === LAB_VARIANT.id && value.revision === LAB_VARIANT.revision;
}

function validProvenance(value: unknown, rulesVersion: string): boolean {
	return (
		isRecord(value) &&
		value.rulesVersion === rulesVersion &&
		value.diceAlgorithm === LAB_DICE_ALGORITHM
	);
}

export function validTimeControl(value: unknown): value is TimeControl {
	if (!isRecord(value) || Object.keys(value).length !== 1) return false;
	if (isRecord(value.Unlimited)) return Object.keys(value.Unlimited).length === 0;
	if (isRecord(value.Fischer))
		return positive(value.Fischer.initialSeconds) && integer(value.Fischer.incrementSeconds);
	if (isRecord(value.SuddenDeath)) return positive(value.SuddenDeath.initialSeconds);
	return isRecord(value.PerMove) && positive(value.PerMove.secondsPerMove);
}

export function timeControlKey(value: TimeControl): string {
	if ('Unlimited' in value) return 'unlimited';
	if ('Fischer' in value)
		return `fischer:${value.Fischer.initialSeconds}:${value.Fischer.incrementSeconds}`;
	if ('SuddenDeath' in value) return `sudden:${value.SuddenDeath.initialSeconds}`;
	return `per-move:${value.PerMove.secondsPerMove}`;
}

function validTurn(value: unknown): value is PublicTurn {
	if (!isRecord(value) || !Array.isArray(value.offers)) return false;
	const offers = value.offers;
	if (
		!offers.every(
			(pair) =>
				Array.isArray(pair) &&
				pair.length === 2 &&
				pair.every((die) => integer(die) && die >= 1 && die <= 6),
		)
	)
		return false;
	const selected = value.selectedPairIndex;
	if (selected !== null && (offers.length !== 2 || (selected !== 0 && selected !== 1)))
		return false;
	switch (value.phase) {
		case 'AwaitingPlayers':
		case 'AwaitingFirstRoll':
			return offers.length === 0 && selected === null;
		case 'AwaitingSecondRoll':
			return offers.length === 1 && selected === null;
		case 'AwaitingPairChoice':
			return offers.length === 2 && selected === null;
		case 'PlayingSelectedPair':
			return offers.length === 2 && selected !== null;
		case 'Ended':
			return offers.length <= 2;
		default:
			return false;
	}
}

export function parseLabState(value: unknown, rulesVersion: string): PublicState {
	if (
		!isRecord(value) ||
		!validIdentity(value.variant) ||
		value.protocolVersion !== 1 ||
		!validProvenance(value.provenance, rulesVersion) ||
		!validTurn(value.turn)
	) {
		throw new LaboratoryError('incompatible');
	}
	return value as unknown as PublicState;
}

function validStatus(value: unknown): value is GameStatusWire {
	if (!isRecord(value) || Object.keys(value).length !== 1) return false;
	if (isRecord(value.Active)) return Object.keys(value.Active).length === 0;
	if (!isRecord(value.Ended) || !isRecord(value.Ended.over)) return false;
	const over = value.Ended.over;
	if (typeof over.termination !== 'string' || !isRecord(over.result)) return false;
	return isRecord(over.result.Draw) || (isRecord(over.result.Win) && isSeat(over.result.Win.side));
}

export function parseGameState(value: unknown, rulesVersion: string): LaboratoryGameState {
	if (
		!isRecord(value) ||
		!integer(value.version) ||
		typeof value.dfen !== 'string' ||
		value.dfen.length === 0 ||
		value.dfen.length > 512 ||
		!isSeat(value.activeSeat) ||
		typeof value.dicePending !== 'boolean' ||
		!validStatus(value.status) ||
		!validTimeControl(value.timeControl) ||
		!isCommit(value.commit) ||
		value.rated !== false ||
		value.ratingDomain !== 'casual' ||
		!isRecord(value.players) ||
		!isRecord(value.players.white) ||
		!isRecord(value.players.black) ||
		value.players.white.kind !== 'Human' ||
		value.players.black.kind !== 'Human' ||
		(value.clocks !== null &&
			(!isRecord(value.clocks) || !integer(value.clocks.white) || !integer(value.clocks.black)))
	) {
		throw new LaboratoryError('incompatible');
	}
	const lab = parseLabState(value.lab, rulesVersion);
	if ('Ended' in value.status !== (lab.turn.phase === 'Ended'))
		throw new LaboratoryError('incompatible');
	return { ...value, lab } as unknown as LaboratoryGameState;
}

export function parseCreation(value: unknown, rulesVersion: string): CreationResponse {
	if (
		!isRecord(value) ||
		!isGameId(value.gameId) ||
		!isCommit(value.commit) ||
		!validIdentity(value.variant) ||
		value.labProtocolVersion !== 1 ||
		!validProvenance(value.provenance, rulesVersion) ||
		!Array.isArray(value.tokens) ||
		value.tokens.length !== 2 ||
		!value.tokens.every((token) => isRecord(token) && isSeat(token.seat) && isToken(token.token)) ||
		new Set(value.tokens.map((token) => token.seat)).size !== 2 ||
		new Set(value.tokens.map((token) => token.token)).size !== 2
	)
		throw new LaboratoryError('incompatible');
	return { ...value, gameId: value.gameId.toLowerCase() } as unknown as CreationResponse;
}

export class LaboratoryApi {
	readonly origin: string;
	constructor(
		origin: string,
		readonly rulesVersion: string,
		private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
	) {
		this.origin = laboratoryOrigin(origin);
		if (!/^\d+\.\d+\.\d+$/.test(rulesVersion)) throw new LaboratoryError('incompatible');
	}

	private async request(path: string, init: RequestInit): Promise<unknown> {
		let response: Response;
		try {
			response = await this.fetcher(new URL(path, this.origin), {
				...init,
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

	async state(gameId: string, signal?: AbortSignal): Promise<LaboratoryGameState> {
		if (!isGameId(gameId)) throw new LaboratoryError('incompatible');
		return parseGameState(await this.request(`/games/${gameId}`, { signal }), this.rulesVersion);
	}

	async moves(gameId: string): Promise<GameMoves> {
		if (!isGameId(gameId)) throw new LaboratoryError('incompatible');
		const value = await this.request(`/games/${gameId}/moves`, {
			signal: AbortSignal.timeout(5000),
		});
		if (
			!isRecord(value) ||
			!integer(value.version) ||
			typeof value.dfen !== 'string' ||
			typeof value.dicePending !== 'boolean' ||
			(value.legalMoves !== null && !validMoveTree(value.legalMoves))
		)
			throw new LaboratoryError('incompatible');
		return value as unknown as GameMoves;
	}

	async create(
		guestId: string,
		timeControl: TimeControl,
	): Promise<{ creation: CreationResponse; state: LaboratoryGameState }> {
		if (!isGameId(guestId) || !validTimeControl(timeControl))
			throw new LaboratoryError('incompatible');
		const body: CreationRequest<TimeControl> = {
			white: guestId,
			black: guestId,
			timeControl,
			variant: LAB_VARIANT,
			labProtocolVersion: 1,
			rated: false,
		};
		const creation = parseCreation(
			await this.request('/games', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			}),
			this.rulesVersion,
		);
		const state = await this.state(creation.gameId);
		if (
			state.commit !== creation.commit ||
			timeControlKey(state.timeControl) !== timeControlKey(timeControl)
		) {
			throw new LaboratoryError('incompatible');
		}
		return { creation, state };
	}
}

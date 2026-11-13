import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
	instances: [] as Array<{
		url: string;
		event: ((value: unknown) => void) | null;
		status: ((value: 'connecting' | 'open' | 'closed') => void) | null;
		connect: ReturnType<typeof vi.fn>;
		close: ReturnType<typeof vi.fn>;
		send: ReturnType<typeof vi.fn>;
		fireEvent(value: unknown): void;
		fireStatus(value: 'connecting' | 'open' | 'closed'): void;
	}>,
	seed: vi.fn(() => '0123456789abcdef0123456789abcdef'),
}));

vi.mock('../live/liveClient', () => ({
	randomClientSeed: transport.seed,
	LiveClient: class {
		url: string;
		event: ((value: unknown) => void) | null = null;
		status: ((value: 'connecting' | 'open' | 'closed') => void) | null = null;
		connect = vi.fn();
		close = vi.fn();
		send = vi.fn();
		constructor(url: string) {
			this.url = url;
			transport.instances.push(this);
		}
		onEvent(callback: (value: unknown) => void) {
			this.event = callback;
		}
		onStatus(callback: (value: 'connecting' | 'open' | 'closed') => void) {
			this.status = callback;
		}
		fireEvent(value: unknown) {
			this.event?.(value);
		}
		fireStatus(value: 'connecting' | 'open' | 'closed') {
			this.status?.(value);
		}
	},
}));

import { LaboratoryError, type LaboratoryApi, type LaboratoryGameState } from './api';
import { laboratoryGuest, LABORATORY_GUEST_KEY, openRoomConnection } from './connection';
import type { SeatAccess } from './seatLinks';

const gameId = 'a12b3456-7890-4abc-def0-1234567890ab';
const guest = 'b12b3456-7890-4abc-8ef0-1234567890ab';
const commit = 'a'.repeat(64);
const rulesVersion = '1.2.3';
const access: SeatAccess = { gameId, seat: 'White', token: 'seat_capability' };

function state(version = 3, overrides: Partial<LaboratoryGameState> = {}): LaboratoryGameState {
	return {
		version,
		dfen: '8/8/8/8/8/8/8/8 w - - 0 1',
		activeSeat: 'White',
		dicePending: true,
		status: { Active: {} },
		clocks: null,
		players: { white: { kind: 'Human', name: null }, black: { kind: 'Human', name: null } },
		timeControl: { Unlimited: {} },
		commit,
		rated: false,
		ratingDomain: 'casual',
		lab: {
			variant: { id: 'choice-2x2d6', revision: 1 },
			protocolVersion: 1,
			provenance: { rulesVersion, diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1' },
			turn: { phase: 'AwaitingPlayers', offers: [], selectedPairIndex: null },
		},
		...overrides,
	};
}

class MemoryStorage {
	private readonly values = new Map<string, string>();
	blockedRead = false;
	blockedWrite = false;
	getItem(key: string) {
		if (this.blockedRead) throw new Error('storage unavailable');
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		if (this.blockedWrite) throw new Error('storage unavailable');
		this.values.set(key, value);
	}
	removeItem(key: string) {
		this.values.delete(key);
	}
	clear() {
		this.values.clear();
	}
	key(index: number) {
		return [...this.values.keys()][index] ?? null;
	}
	get length() {
		return this.values.size;
	}
}

const asStorage = (storage: MemoryStorage) => storage as unknown as Storage;

type StateFetcher = (gameId: string, signal?: AbortSignal) => Promise<LaboratoryGameState>;

function apiWith(stateFn: StateFetcher = vi.fn(async () => state())) {
	return {
		api: {
			origin: 'https://lab.example',
			rulesVersion,
			state: stateFn,
		} as unknown as LaboratoryApi,
		stateFn,
	};
}

function callbacks() {
	return { onState: vi.fn(), onStatus: vi.fn(), onError: vi.fn() };
}

function open(storage: Storage | null = asStorage(new MemoryStorage()), stateFn?: StateFetcher) {
	const { api } = apiWith(stateFn);
	const handlers = callbacks();
	const connection = openRoomConnection(api, access, guest, state(), handlers, storage);
	return { connection, handlers, client: transport.instances.at(-1), api };
}

describe('laboratory room connection', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		transport.instances.length = 0;
		transport.seed.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('builds the socket URL from the configured laboratory origin and sends only the stable seed', () => {
		const storage = new MemoryStorage();
		const first = open(asStorage(storage));
		const url = new URL(first.client!.url);
		expect(url.origin).toBe('wss://lab.example');
		expect(url.pathname).toBe(`/games/${gameId}/ws`);
		expect([...url.searchParams.keys()].sort()).toEqual(['guest', 'token']);
		expect(url.searchParams.get('token')).toBe(access.token);
		expect(url.searchParams.get('guest')).toBe(guest);
		expect(first.client!.connect).toHaveBeenCalledWith({
			SubmitSeed: { seed: '0123456789abcdef0123456789abcdef' },
		});
		expect(first.client!.send).not.toHaveBeenCalled();
		first.connection.close();

		const second = open(asStorage(storage));
		expect(second.client!.connect).toHaveBeenCalledWith(first.client!.connect.mock.calls[0][0]);
		expect(transport.seed).toHaveBeenCalledTimes(1);
		second.connection.close();
	});

	it('accepts parsed snapshots, ignores stale versions, and refreshes for public room events', async () => {
		const stateFn = vi.fn(async () => state(5));
		const current = open(asStorage(new MemoryStorage()), stateFn);
		current.client!.fireEvent({ Snapshot: { v: 4, state: state(4) } });
		expect(current.handlers.onState).toHaveBeenCalledWith(expect.objectContaining({ version: 4 }));
		current.client!.fireEvent({ Snapshot: { v: 3, state: state(3) } });
		expect(current.handlers.onState).toHaveBeenCalledTimes(1);
		current.client!.fireEvent({ LabTurnChanged: { v: 5, seat: 'White' } });
		await Promise.resolve();
		await Promise.resolve();
		expect(stateFn).toHaveBeenCalledTimes(1);
		expect(current.handlers.onState).toHaveBeenLastCalledWith(
			expect.objectContaining({ version: 5 }),
		);
		current.connection.close();
	});

	it('closes transport and polling after accepting an ended snapshot', () => {
		const current = open();
		const ended = state(4, {
			status: { Ended: { over: { result: { Draw: {} }, termination: 'Draw' } } },
			lab: {
				...state().lab,
				turn: { phase: 'Ended', offers: [], selectedPairIndex: null },
			},
		});
		current.client!.fireEvent({ Snapshot: { v: 4, state: ended } });
		expect(current.handlers.onState).toHaveBeenCalledWith(expect.objectContaining({ version: 4 }));
		expect(current.client!.close).toHaveBeenCalledTimes(1);
		expect(current.handlers.onError).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('rejects mismatched snapshot versions, commits, time controls, and laboratory provenance', () => {
		const mismatchVersion = open();
		mismatchVersion.client!.fireEvent({ Snapshot: { v: 4, state: state(3) } });
		expect(mismatchVersion.handlers.onError).toHaveBeenCalledWith('incompatible');
		expect(mismatchVersion.client!.close).toHaveBeenCalledTimes(1);

		const mismatchCommit = open();
		mismatchCommit.client!.fireEvent({
			Snapshot: { v: 3, state: state(3, { commit: 'b'.repeat(64) }) },
		});
		expect(mismatchCommit.handlers.onError).toHaveBeenCalledWith('incompatible');

		const mismatchControl = open();
		mismatchControl.client!.fireEvent({
			Snapshot: {
				v: 3,
				state: state(3, { timeControl: { Fischer: { initialSeconds: 60, incrementSeconds: 0 } } }),
			},
		});
		expect(mismatchControl.handlers.onError).toHaveBeenCalledWith('incompatible');

		const mismatchRules = open();
		const invalidState = state(3);
		invalidState.lab.provenance.rulesVersion = '9.9.9';
		mismatchRules.client!.fireEvent({ Snapshot: { v: 3, state: invalidState } });
		expect(mismatchRules.handlers.onError).toHaveBeenCalledWith('incompatible');
	});

	it('ignores private receipt frames and polls public state every two seconds', async () => {
		const stateFn = vi.fn(async () => state(4));
		const current = open(asStorage(new MemoryStorage()), stateFn);
		current.client!.fireEvent({ DrawOfferArmed: { armed: true } });
		current.client!.fireEvent({ LabCommandApplied: { commandId: 'x', appliedVersion: 4 } });
		expect(stateFn).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(2000);
		expect(stateFn).toHaveBeenCalledTimes(1);
		expect(current.handlers.onState).toHaveBeenCalledWith(expect.objectContaining({ version: 4 }));
		current.connection.close();
	});

	it('coalesces overlapping refreshes and never applies a regressive API response', async () => {
		let resolveState!: (value: LaboratoryGameState) => void;
		const stateFn = vi.fn(
			() =>
				new Promise<LaboratoryGameState>((resolve) => {
					resolveState = resolve;
				}),
		);
		const current = open(asStorage(new MemoryStorage()), stateFn);
		current.client!.fireEvent({ TurnPlayed: { v: 5 } });
		current.client!.fireEvent({ GameEnded: { v: 6 } });
		expect(stateFn).toHaveBeenCalledTimes(1);
		resolveState(state(2));
		await vi.advanceTimersByTimeAsync(0);
		expect(current.handlers.onState).not.toHaveBeenCalled();
		expect(stateFn).toHaveBeenCalledTimes(2);
		current.connection.close();
	});

	it('reports exhausted socket retries while preserving the seat capability', () => {
		const current = open();
		current.client!.fireStatus('connecting');
		current.client!.fireStatus('closed');
		expect(current.handlers.onStatus).toHaveBeenCalledWith('closed');
		expect(current.handlers.onError).toHaveBeenCalledWith('connection');
		expect(current.client!.url).toContain(encodeURIComponent(access.token));
		current.connection.close();
	});

	it('aborts pending work, ignores late completions, and closes idempotently', async () => {
		let resolveState!: (value: LaboratoryGameState) => void;
		let observedSignal: AbortSignal | undefined;
		const stateFn = vi.fn((_gameId: string, signal?: AbortSignal) => {
			observedSignal = signal;
			return new Promise<LaboratoryGameState>((resolve) => {
				resolveState = resolve;
			});
		});
		const current = open(asStorage(new MemoryStorage()), stateFn);
		current.client!.fireEvent({ DiceRolled: { v: 4 } });
		current.connection.close();
		current.connection.close();
		expect(observedSignal?.aborted).toBe(true);
		resolveState(state(4));
		await Promise.resolve();
		await Promise.resolve();
		expect(current.handlers.onState).not.toHaveBeenCalled();
		expect(current.client!.close).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('stops polling and closes on expired state; transient failures retain the connection', async () => {
		const expiredApi = open(
			asStorage(new MemoryStorage()),
			vi.fn(async () => {
				throw new LaboratoryError('expired');
			}),
		);
		await vi.advanceTimersByTimeAsync(2000);
		expect(expiredApi.handlers.onError).toHaveBeenCalledWith('expired');
		expect(expiredApi.client!.close).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);

		const transient = open(
			asStorage(new MemoryStorage()),
			vi.fn(async () => {
				throw new LaboratoryError('unavailable');
			}),
		);
		await vi.advanceTimersByTimeAsync(2000);
		expect(transient.handlers.onError).toHaveBeenCalledWith('connection');
		expect(transient.client!.close).not.toHaveBeenCalled();
		transient.connection.close();
	});

	it('restores and persists only a valid laboratory guest id, with a stable blocked-storage fallback', () => {
		const storage = new MemoryStorage();
		storage.setItem('dicechess-theme', 'dark');
		storage.setItem(LABORATORY_GUEST_KEY, guest);
		expect(laboratoryGuest(asStorage(storage))).toBe(guest);
		expect(storage.getItem('dicechess-theme')).toBe('dark');
		storage.setItem(LABORATORY_GUEST_KEY, 'invalid');
		const generated = laboratoryGuest(asStorage(storage));
		expect(generated).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
		expect(storage.getItem(LABORATORY_GUEST_KEY)).toBe(generated);
		storage.blockedRead = true;
		storage.blockedWrite = true;
		expect(laboratoryGuest(asStorage(storage))).toBe(generated);
	});
});

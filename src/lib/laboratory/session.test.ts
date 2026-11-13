/**
 * Locks down the laboratory window's create, invite, join, and navigation journey. The API remains
 * real while HTTP and WebSocket boundaries are spied or mocked, so these tests pin capability-seat
 * ownership and lifecycle behavior without opening a network connection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connectionMocks = vi.hoisted(() => ({
	open: vi.fn(),
	guest: vi.fn(() => 'b12b3456-7890-4abc-def0-1234567890ab'),
}));

vi.mock('./connection', () => ({
	laboratoryGuest: connectionMocks.guest,
	openRoomConnection: connectionMocks.open,
}));

import { LaboratoryApi, LaboratoryError, type LaboratoryGameState } from './api';
import { LaboratorySession, type LaboratoryWindow } from './session.svelte';
import { loadRoomAccess, saveRoomAccess, type SeatAccess } from './seatLinks';
import type { CreationResponse, PublicState } from './protocol';
import type { TimeControl } from '../live/liveTypes';

const rulesVersion = '0.18.2';
const gameId = 'a12b3456-7890-4abc-def0-1234567890ab';
const commit = 'ab'.repeat(32);
const timeControl: TimeControl = { Fischer: { initialSeconds: 600, incrementSeconds: 10 } };
const variant = { id: 'choice-2x2d6', revision: 1 } as const;
const provenance = { rulesVersion, diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1' } as const;
const white: SeatAccess = { gameId, seat: 'White', token: 'white_dummy-token_1' };
const black: SeatAccess = { gameId, seat: 'Black', token: 'black_dummy-token_2' };

const labState = (): PublicState => ({
	variant,
	protocolVersion: 1,
	provenance,
	turn: { phase: 'AwaitingPlayers', offers: [], selectedPairIndex: null },
});

const gameState = (version = 1): LaboratoryGameState => ({
	version,
	dfen: 'valid-dfen',
	activeSeat: 'White',
	dicePending: false,
	status: { Active: {} },
	clocks: { white: 600_000, black: 600_000 },
	players: { white: { kind: 'Human', name: null }, black: { kind: 'Human', name: null } },
	rated: false,
	ratingDomain: 'casual',
	timeControl,
	commit,
	lab: labState(),
});

const endedGameState = (version: number): LaboratoryGameState => ({
	...gameState(version),
	status: { Ended: { over: { result: { Draw: {} }, termination: 'Draw' } } },
	lab: {
		...labState(),
		turn: { phase: 'Ended', offers: [], selectedPairIndex: null },
	},
});

const creation = (): CreationResponse => ({
	gameId,
	commit,
	tokens: [white, black].map(({ seat, token }) => ({ seat, token })),
	variant,
	labProtocolVersion: 1,
	provenance,
});

class MemoryStorage {
	private readonly values = new Map<string, string>();
	getItem(key: string) {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string) {
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

function makeWindow(initialUrl = 'https://lab.example/') {
	let currentUrl = new URL(initialUrl);
	const navigations: Array<{ url: string; replace: boolean }> = [];
	const storage = new MemoryStorage();
	const identityStorage = new MemoryStorage();
	const environment: LaboratoryWindow = {
		origin: 'https://lab.example',
		url: () => new URL(currentUrl),
		navigate: (value, replace) => {
			currentUrl = new URL(value);
			navigations.push({ url: value, replace });
		},
		storage: storage as unknown as Storage,
		identityStorage: identityStorage as unknown as Storage,
	};
	return {
		environment,
		storage,
		identityStorage,
		navigations,
		currentUrl: () => new URL(currentUrl),
	};
}

function makeApi(initialState = gameState()) {
	const api = new LaboratoryApi('https://lab.example', rulesVersion);
	const stateSpy = vi.spyOn(api, 'state').mockResolvedValue(initialState);
	const createSpy = vi
		.spyOn(api, 'create')
		.mockResolvedValue({ creation: creation(), state: gameState() });
	return { api, stateSpy, createSpy };
}

function connectionCallbacks(index = 0) {
	return connectionMocks.open.mock.calls[index]?.[4] as {
		onState(value: LaboratoryGameState): void;
		onStatus(value: 'connecting' | 'open' | 'closed'): void;
		onError(value: string): void;
	};
}

describe('laboratory session', () => {
	beforeEach(() => {
		connectionMocks.open.mockReset();
		connectionMocks.guest.mockClear();
		connectionMocks.open.mockImplementation(() => ({ close: vi.fn() }));
	});

	afterEach(() => vi.restoreAllMocks());

	it('splits creator seats and puts only the opponent capability in each invitation URL', async () => {
		for (const [seat, mine, opponent] of [
			['White', white, black],
			['Black', black, white],
		] as const) {
			const callsBefore = connectionMocks.open.mock.calls.length;
			const window = makeWindow();
			const { api } = makeApi();
			const session = new LaboratorySession(api, window.environment);
			await session.create(timeControl, seat);
			expect(session.access?.mine).toEqual(mine);
			expect(session.access?.invitation).toEqual(opponent);
			expect(session.invitationUrl).toContain(encodeURIComponent(opponent.token));
			expect(session.invitationUrl).not.toContain(mine.token);
			expect(session.invitationUrl).toContain(`/invite/${gameId}#`);
			expect(connectionMocks.open).toHaveBeenCalledTimes(callsBefore + 1);
			session.destroy();
		}
	});

	it('coalesces create double-clicks while the first API request is pending', async () => {
		const window = makeWindow();
		const { api, createSpy } = makeApi();
		let finish!: (value: { creation: CreationResponse; state: LaboratoryGameState }) => void;
		createSpy.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const session = new LaboratorySession(api, window.environment);
		const first = session.create(timeControl, 'White');
		const second = session.create(timeControl, 'Black');
		expect(session.pending).toBe(true);
		expect(createSpy).toHaveBeenCalledTimes(1);
		finish({ creation: creation(), state: gameState() });
		await Promise.all([first, second]);
		expect(session.access?.mine).toEqual(white);
		expect(session.pending).toBe(false);
		session.destroy();
	});

	it('restores a creator invitation from storage and reconnects with the creator seat', async () => {
		const window = makeWindow(`https://lab.example/invite/${gameId}`);
		saveRoomAccess(window.storage as unknown as Storage, { mine: white, invitation: black });
		const { api } = makeApi();
		const session = new LaboratorySession(api, window.environment);
		await session.open();
		expect(session.access).toEqual({ mine: white, invitation: black });
		expect(connectionMocks.open).toHaveBeenCalledTimes(1);
		expect(connectionMocks.open.mock.calls[0][1]).toEqual(white);
		expect(session.candidate).toBeNull();
		session.destroy();
	});

	it('fetches invitation settings before join, then persists the visitor seat only after socket open', async () => {
		const window = makeWindow(`https://lab.example/invite/${gameId}#token=${black.token}&as=black`);
		const { api, stateSpy } = makeApi();
		const visitor = new LaboratorySession(api, window.environment);
		await visitor.open();
		expect(stateSpy).toHaveBeenCalledWith(gameId);
		expect(visitor.state?.timeControl).toEqual(timeControl);
		expect(visitor.candidate).toEqual(black);
		expect(connectionMocks.open).not.toHaveBeenCalled();
		expect(loadRoomAccess(window.storage as unknown as Storage, gameId)).toBeNull();

		visitor.join();
		expect(connectionMocks.open).toHaveBeenCalledTimes(1);
		expect(connectionMocks.open.mock.calls[0][1]).toEqual(black);
		expect(loadRoomAccess(window.storage as unknown as Storage, gameId)).toBeNull();
		connectionCallbacks().onStatus('open');
		expect(loadRoomAccess(window.storage as unknown as Storage, gameId)).toEqual({ mine: black });
		visitor.destroy();
	});

	it('rejects an incoming opposite seat without replacing the already stored capability', async () => {
		const window = makeWindow(`https://lab.example/invite/${gameId}#token=${black.token}&as=black`);
		saveRoomAccess(window.storage as unknown as Storage, { mine: white });
		const { api, stateSpy } = makeApi();
		const session = new LaboratorySession(api, window.environment);
		await session.open();
		expect(session.error).toBe('occupied');
		expect(stateSpy).not.toHaveBeenCalled();
		expect(connectionMocks.open).not.toHaveBeenCalled();
		expect(loadRoomAccess(window.storage as unknown as Storage, gameId)).toEqual({ mine: white });
	});

	it('returns from an occupied cold invite to the stored seat and loads its board state', async () => {
		const window = makeWindow(`https://lab.example/invite/${gameId}#token=${black.token}&as=black`);
		saveRoomAccess(window.storage as unknown as Storage, { mine: white });
		const { api, stateSpy } = makeApi();
		let finishState!: (value: LaboratoryGameState) => void;
		stateSpy.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishState = resolve;
				}),
		);
		const session = new LaboratorySession(api, window.environment);

		await session.open();
		expect(session.error).toBe('occupied');
		expect(stateSpy).not.toHaveBeenCalled();
		expect(connectionMocks.open).not.toHaveBeenCalled();

		session.showBoard();
		expect(window.currentUrl().pathname).toBe(`/game/${gameId}`);
		expect(stateSpy).toHaveBeenCalledWith(gameId);
		finishState(gameState(5));
		await vi.waitFor(() => expect(session.state?.version).toBe(5));

		expect(session.error).toBeNull();
		expect(session.route).toMatchObject({ kind: 'board', gameId });
		expect(connectionMocks.open).toHaveBeenCalledTimes(1);
		expect(connectionMocks.open.mock.calls[0][1]).toEqual(white);
		expect(loadRoomAccess(window.storage as unknown as Storage, gameId)).toEqual({ mine: white });
		session.destroy();
	});

	it('keeps an occupied error when a previous socket reports open late', async () => {
		const window = makeWindow(`https://lab.example/game/${gameId}#token=${white.token}&as=white`);
		const { api } = makeApi();
		const session = new LaboratorySession(api, window.environment);
		await session.open();
		expect(connectionMocks.open).toHaveBeenCalledTimes(1);
		const priorCallbacks = connectionCallbacks();
		priorCallbacks.onStatus('open');

		window.environment.navigate(
			`https://lab.example/invite/${gameId}#token=${black.token}&as=black`,
			false,
		);
		await session.open();
		expect(session.error).toBe('occupied');
		priorCallbacks.onStatus('open');
		expect(session.error).toBe('occupied');
		session.destroy();
	});

	it('does not connect for invalid, missing, or expired invitations', async () => {
		const invalidWindow = makeWindow('https://lab.example/game/not-a-uuid#token=x&as=white');
		const invalid = new LaboratorySession(makeApi().api, invalidWindow.environment);
		await invalid.open();
		expect(invalid.error).toBe('invalid');
		expect(connectionMocks.open).not.toHaveBeenCalled();

		const missingWindow = makeWindow(`https://lab.example/invite/${gameId}`);
		const missingApi = makeApi();
		const missing = new LaboratorySession(missingApi.api, missingWindow.environment);
		await missing.open();
		expect(missing.error).toBe('invalid');
		expect(missingApi.stateSpy).not.toHaveBeenCalled();

		const expiredWindow = makeWindow(
			`https://lab.example/invite/${gameId}#token=${black.token}&as=black`,
		);
		const expiredApi = makeApi();
		expiredApi.stateSpy.mockRejectedValue(new LaboratoryError('expired'));
		const expired = new LaboratorySession(expiredApi.api, expiredWindow.environment);
		await expired.open();
		expect(expired.error).toBe('expired');
		expect(connectionMocks.open).not.toHaveBeenCalled();
	});

	it('preserves the same-game connection across board navigation and reload-style open', async () => {
		const window = makeWindow();
		const { api } = makeApi();
		const session = new LaboratorySession(api, window.environment);
		await session.create(timeControl, 'White');
		const connection = connectionMocks.open.mock.results[0].value as {
			close: ReturnType<typeof vi.fn>;
		};
		connectionCallbacks().onStatus('open');
		session.showBoard();
		const board = window.currentUrl();
		expect(board.pathname).toBe(`/game/${gameId}`);
		expect(board.hash).toBe('');
		await session.open(board);
		expect(connectionMocks.open).toHaveBeenCalledTimes(1);
		expect(connection.close).not.toHaveBeenCalled();
		expect(
			window.navigations.some(
				(navigation) => new URL(navigation.url).pathname === `/game/${gameId}`,
			),
		).toBe(true);
		session.destroy();
	});

	it('ignores stale HTTP results and socket callbacks after destroy', async () => {
		const staleWindow = makeWindow(
			`https://lab.example/game/${gameId}#token=${white.token}&as=white`,
		);
		const staleApi = makeApi();
		let finishLoad!: (value: LaboratoryGameState) => void;
		staleApi.stateSpy.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishLoad = resolve;
				}),
		);
		const stale = new LaboratorySession(staleApi.api, staleWindow.environment);
		const loading = stale.open();
		stale.destroy();
		finishLoad(gameState(9));
		await loading;
		expect(stale.state).toBeNull();
		expect(connectionMocks.open).not.toHaveBeenCalled();

		const activeWindow = makeWindow(
			`https://lab.example/game/${gameId}#token=${white.token}&as=white`,
		);
		const active = new LaboratorySession(makeApi().api, activeWindow.environment);
		await active.open();
		const callbacks = connectionCallbacks();
		active.destroy();
		callbacks.onState(gameState(20));
		callbacks.onStatus('open');
		expect(active.state?.version).toBe(1);
	});

	it('keeps the newer HTTP snapshot when the connection delivers a regressive version', async () => {
		const window = makeWindow(`https://lab.example/game/${gameId}#token=${white.token}&as=white`);
		const { api } = makeApi(gameState(5));
		const session = new LaboratorySession(api, window.environment);
		await session.open();
		expect(session.state?.version).toBe(5);
		connectionCallbacks().onState(gameState(4));
		expect(session.state?.version).toBe(5);
		session.destroy();
	});

	it('expires an owned invitation when its connected room ends', async () => {
		const window = makeWindow(`https://lab.example/invite/${gameId}`);
		saveRoomAccess(window.storage as unknown as Storage, { mine: white, invitation: black });
		const { api } = makeApi(gameState(5));
		const session = new LaboratorySession(api, window.environment);
		await session.open();
		expect(session.error).toBeNull();
		connectionCallbacks().onState(endedGameState(6));
		expect(session.state?.version).toBe(6);
		expect(session.ended).toBe(true);
		expect(session.error).toBe('expired');
		session.destroy();
	});

	it('surfaces typed server incompatibility and closes navigation resources idempotently', async () => {
		const incompatibleWindow = makeWindow(
			`https://lab.example/game/${gameId}#token=${white.token}&as=white`,
		);
		const incompatibleApi = makeApi();
		incompatibleApi.stateSpy.mockRejectedValue(new LaboratoryError('incompatible'));
		const incompatible = new LaboratorySession(incompatibleApi.api, incompatibleWindow.environment);
		await incompatible.open();
		expect(incompatible.error).toBe('incompatible');
		expect(connectionMocks.open).not.toHaveBeenCalled();

		const window = makeWindow();
		const session = new LaboratorySession(makeApi().api, window.environment);
		await session.create(timeControl, 'White');
		const connection = connectionMocks.open.mock.results.at(-1)!.value as {
			close: ReturnType<typeof vi.fn>;
		};
		session.home();
		session.destroy();
		session.destroy();
		expect(window.navigations.some(({ url }) => new URL(url).pathname === '/')).toBe(true);
		expect(connection.close).toHaveBeenCalledTimes(1);
	});
});

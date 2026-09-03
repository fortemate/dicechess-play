import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShowcaseStore } from './showcaseStore.svelte';
import { LiveGameStore } from './liveGameStore.svelte';
import type {
	GetShowcaseResult,
	ShowcaseClaimOutcome,
	ShowcaseProblemError,
	ShowcaseView,
} from './showcaseApi';

// Mock audio and toasts
vi.mock('../sound', () => ({
	playDiceSound: vi.fn(),
	playDrawOfferSound: vi.fn(),
	preloadSounds: vi.fn(),
}));

vi.mock('../toastStore.svelte', () => ({
	toastStore: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

// Mock WebSocket
class MockWebSocket {
	static readonly OPEN = 1;
	static last: MockWebSocket | null = null;
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	readyState = MockWebSocket.OPEN;
	sent: string[] = [];
	constructor(public url: string) {
		MockWebSocket.last = this;
	}
	send(data: string) {
		this.sent.push(data);
	}
	close() {
		this.onclose?.();
	}
}

describe('ShowcaseStore', () => {
	let store: ShowcaseStore;
	let liveGameStore: LiveGameStore;
	let mockGetShowcase: ReturnType<
		typeof vi.fn<(ifNoneMatch?: string) => Promise<GetShowcaseResult>>
	>;
	let mockClaimShowcase: ReturnType<typeof vi.fn<() => Promise<ShowcaseClaimOutcome>>>;

	beforeEach(() => {
		vi.stubGlobal('WebSocket', MockWebSocket);
		vi.useFakeTimers();

		liveGameStore = new LiveGameStore();
		mockGetShowcase = vi.fn<(ifNoneMatch?: string) => Promise<GetShowcaseResult>>();
		mockClaimShowcase = vi.fn<() => Promise<ShowcaseClaimOutcome>>();

		store = new ShowcaseStore({
			live: liveGameStore,
			getShowcaseFn: mockGetShowcase,
			claimShowcaseFn: mockClaimShowcase,
		});
	});

	afterEach(() => {
		store.destroy();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	async function openTable(s: ShowcaseStore, color: 'White' | 'Black' = 'White') {
		mockGetShowcase.mockResolvedValue({
			notModified: false,
			view: {
				status: 'open',
				featuredBot: { team: 'rpi3', name: 'hunter', displayName: 'rpi3 hunter' },
				timeControl: { initialSeconds: 300, incrementSeconds: 3, display: '5+3' },
				nextHumanColor: color,
				currentGame: null,
				spectator: null,
				reason: null,
			},
		});
		await s.pollDiscovery();
	}

	describe('Discovery on load (DoD #1, #2)', () => {
		it('starts in loading/unavailable state before first resolution (no dead clickable seat)', () => {
			expect(store.currentPhase).toBe('unavailable');
			const state = store.state;
			expect(state.kind).toBe('unavailable');
			expect(state.clocks).toEqual({ topMs: 300000, bottomMs: 300000 });
			expect(state.boardFen).toContain('rnbqkbnr');
		});

		it('resolves open state with server-provided next color and fixed 5+3', async () => {
			await openTable(store, 'White');

			expect(store.currentPhase).toBe('open');
			const state = store.state;
			expect(state.kind).toBe('open');
			if (state.kind === 'open') {
				expect(state.assignedColor).toBe('w');
				expect(state.timeControl).toBe('5+3');
				expect(state.topPlayer.name).toBe('rpi3 hunter');
				expect(state.topPlayer.sub).toBe('Open seat');
				expect(state.bottomPlayer.name).toBe('You (Guest)');
			}
		});

		it('resolves Black seat assignment when server says nextHumanColor is Black', async () => {
			await openTable(store, 'Black');

			expect(store.currentPhase).toBe('open');
			const state = store.state;
			expect(state.kind).toBe('open');
			if (state.kind === 'open') {
				expect(state.assignedColor).toBe('b');
			}
		});

		it('resolves occupied table directly into tokenless spectator state', async () => {
			const liveView: ShowcaseView = {
				status: 'live',
				featuredBot: { team: 'rpi3', name: 'hunter', displayName: 'rpi3 hunter' },
				timeControl: { initialSeconds: 300, incrementSeconds: 3, display: '5+3' },
				nextHumanColor: 'Black',
				currentGame: {
					gameId: 'game-occupied-123',
					players: null,
					humanSeat: 'White',
					activeSeat: 'White',
					dicePending: false,
					clocks: null,
					version: 1,
					dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
					status: { Active: {} },
				},
				spectator: { wsUrl: '/games/game-occupied-123/ws' },
				reason: null,
			};

			mockGetShowcase.mockResolvedValue({ notModified: false, view: liveView });

			await store.pollDiscovery();

			expect(store.currentPhase).toBe('live-spectator');
			expect(store.hasSeatToken).toBe(false);
			expect(liveGameStore.spectator).toBe(true);
			expect(MockWebSocket.last?.url).toContain('/games/game-occupied-123/ws');
			// Token must not be in spectator URL
			expect(MockWebSocket.last?.url).not.toContain('token=');
		});

		it('resolves unavailable state when server reports bot_unavailable or maintenance', async () => {
			const unavailView: ShowcaseView = {
				status: 'unavailable',
				featuredBot: null,
				timeControl: { initialSeconds: 300, incrementSeconds: 3, display: '5+3' },
				nextHumanColor: null,
				currentGame: null,
				spectator: null,
				reason: 'bot_unavailable',
			};

			mockGetShowcase.mockResolvedValue({ notModified: false, view: unavailView });

			await store.pollDiscovery();

			expect(store.currentPhase).toBe('unavailable');
			const state = store.state;
			expect(state.kind).toBe('unavailable');
			if (state.kind === 'unavailable') {
				expect(state.reason).toBe('bot_unavailable');
			}
		});
	});

	describe('Claim flow, locking, and winner/loser convergence (DoD #3, #4, #7, #8)', () => {
		beforeEach(async () => {
			await openTable(store, 'White');
			expect(store.currentPhase).toBe('open');
		});

		it('emits single claim and prevents accidental double submission while pending', async () => {
			let resolveClaim!: (outcome: ShowcaseClaimOutcome) => void;
			mockClaimShowcase.mockReturnValue(
				new Promise<ShowcaseClaimOutcome>((resolve) => {
					resolveClaim = resolve;
				}),
			);

			// First click
			const claimPromise = store.handleIntent({ type: 'claim' });
			expect(store.currentPhase).toBe('claiming');

			// Second click while pending
			await store.handleIntent({ type: 'claim' });
			expect(mockClaimShowcase).toHaveBeenCalledTimes(1);

			// Complete claim
			resolveClaim({
				outcome: 'claimed',
				gameId: 'game-won-1',
				seat: 'White',
				seatToken: 'secret-seat-token-xyz',
				wsUrl: '/games/game-won-1/ws?token=secret-seat-token-xyz',
			});

			await claimPromise;
			expect(store.currentPhase).toBe('live-player');
		});

		it('successful claimant connects with credential in memory only (DoD #4, #8)', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-won-1',
				seat: 'White',
				seatToken: 'secret-seat-token-xyz',
				wsUrl: '/games/game-won-1/ws?token=secret-seat-token-xyz',
			});

			await store.handleIntent({ type: 'claim' });

			expect(store.currentPhase).toBe('live-player');
			expect(store.hasSeatToken).toBe(true);

			// Socket connected with token
			expect(MockWebSocket.last?.url).toContain('token=secret-seat-token-xyz');
			expect(liveGameStore.spectator).toBe(false);

			// Credential isolation: seatToken is NOT leaked into ShowcaseState
			const stateJson = JSON.stringify(store.state);
			expect(stateJson).not.toContain('secret-seat-token-xyz');
		});

		it('concurrent race loser transitions directly to tokenless spectator (DoD #4)', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'spectating',
				reason: 'already_claimed',
				gameId: 'game-lost-1',
				spectatorWsUrl: '/games/game-lost-1/ws',
			});

			await store.handleIntent({ type: 'claim' });

			expect(store.currentPhase).toBe('live-spectator');
			expect(store.hasSeatToken).toBe(false);
			expect(liveGameStore.spectator).toBe(true);

			// Socket connected without token
			expect(MockWebSocket.last?.url).toContain('/games/game-lost-1/ws');
			expect(MockWebSocket.last?.url).not.toContain('token=');
		});

		it('spectator cannot emit moves or resign (DoD #7)', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'spectating',
				reason: 'already_claimed',
				gameId: 'game-spectate-1',
				spectatorWsUrl: '/games/game-spectate-1/ws',
			});

			await store.handleIntent({ type: 'claim' });
			expect(store.currentPhase).toBe('live-spectator');

			const resignSpy = vi.spyOn(liveGameStore, 'resign');
			const moveSpy = vi.spyOn(liveGameStore, 'handleBoardMove');

			await store.handleIntent({ type: 'resign' });
			await store.handleIntent({ type: 'move', orig: 'e2', dest: 'e4' });

			expect(resignSpy).not.toHaveBeenCalled();
			expect(moveSpy).not.toHaveBeenCalled();
		});

		it('failed claim with 503 transitions to unavailable state without dead clickable seat (DoD #12)', async () => {
			const err: Partial<ShowcaseProblemError> = {
				status: 503,
				code: 'showcase_unavailable',
				detail: 'Bot offline',
			};
			mockClaimShowcase.mockRejectedValue(err);

			await store.handleIntent({ type: 'claim' });

			expect(store.currentPhase).toBe('unavailable');
			expect(store.state.kind).toBe('unavailable');
		});
	});

	describe('Finishing, Reset countdown and Polled Reopening (DoD #10)', () => {
		beforeEach(async () => {
			await openTable(store, 'White');
		});

		it('transitions through finishing and converges back to open table on server release', async () => {
			// Connect as player
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-finishing-1',
				seat: 'White',
				seatToken: 'token-finish-1',
				wsUrl: '/games/game-finishing-1/ws?token=token-finish-1',
			});

			await store.handleIntent({ type: 'claim' });
			expect(store.currentPhase).toBe('live-player');

			// Server reports finishing while dwell timer runs
			mockGetShowcase.mockResolvedValue({
				notModified: false,
				view: {
					status: 'finishing',
					featuredBot: { team: 'rpi3', name: 'hunter', displayName: 'rpi3 hunter' },
					timeControl: { initialSeconds: 300, incrementSeconds: 3, display: '5+3' },
					nextHumanColor: 'Black',
					currentGame: {
						gameId: 'game-finishing-1',
						players: null,
						humanSeat: 'White',
						activeSeat: 'Black',
						dicePending: false,
						clocks: null,
						version: 2,
						dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
						status: {
							Ended: { over: { termination: 'KingCaptured', result: { Win: { side: 'White' } } } },
						},
					},
					spectator: null,
					reason: null,
				},
			});

			// Trigger game end via LiveGameStore callback
			liveGameStore.onEnd?.({
				termination: 'KingCaptured',
				result: { Win: { side: 'White' } },
			});

			expect(store.currentPhase).toBe('finishing');
			const finishingState = store.state;
			expect(finishingState.kind).toBe('finishing');
			if (finishingState.kind === 'finishing') {
				expect(finishingState.winner).toBe('w');
				expect(finishingState.reason).toBe('mate');
				expect(finishingState.countdownSeconds).toBe(15);
			}

			// Advance countdown to 0 -> transitions to reset
			await vi.advanceTimersByTimeAsync(15000);
			expect(store.currentPhase).toBe('reset');

			// Server releases and GET /showcase poll returns open
			mockGetShowcase.mockResolvedValue({
				notModified: false,
				view: {
					status: 'open',
					featuredBot: { team: 'rpi3', name: 'hunter', displayName: 'rpi3 hunter' },
					timeControl: { initialSeconds: 300, incrementSeconds: 3, display: '5+3' },
					nextHumanColor: 'Black',
					currentGame: null,
					spectator: null,
					reason: null,
				},
			});

			// Advance timer to trigger reset poll
			await vi.advanceTimersByTimeAsync(1500);

			expect(store.currentPhase).toBe('open');
			expect(store.hasSeatToken).toBe(false); // Credential cleared!
			if (store.state.kind === 'open') {
				expect(store.state.assignedColor).toBe('b');
			}
		});

		it('reset-now intent advances directly to reset state and forces discovery poll', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-finishing-2',
				seat: 'White',
				seatToken: 'token-finish-2',
				wsUrl: '/games/game-finishing-2/ws?token=token-finish-2',
			});

			await store.handleIntent({ type: 'claim' });
			liveGameStore.onEnd?.({
				termination: 'Resign',
				result: { Win: { side: 'Black' } },
			});

			expect(store.currentPhase).toBe('finishing');

			mockGetShowcase.mockResolvedValue({
				notModified: false,
				view: {
					status: 'open',
					featuredBot: { team: 'rpi3', name: 'hunter', displayName: 'rpi3 hunter' },
					timeControl: { initialSeconds: 300, incrementSeconds: 3, display: '5+3' },
					nextHumanColor: 'White',
					currentGame: null,
					spectator: null,
					reason: null,
				},
			});

			await store.handleIntent({ type: 'reset-now' });

			expect(store.currentPhase).toBe('open');
			expect(store.hasSeatToken).toBe(false);
		});
	});

	describe('Connection drop and recovery (DoD #12)', () => {
		beforeEach(async () => {
			await openTable(store, 'White');
		});

		it('reflects reconnecting state when socket drops mid-game', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-drop-1',
				seat: 'White',
				seatToken: 'token-drop-1',
				wsUrl: '/games/game-drop-1/ws?token=token-drop-1',
			});

			await store.handleIntent({ type: 'claim' });
			expect(store.currentPhase).toBe('live-player');

			// Drop socket
			liveGameStore.onConnectionStatus?.('closed');

			const state = store.state;
			expect(state.kind).toBe('reconnecting');
			if (state.kind === 'reconnecting') {
				expect(state.attempt).toBe(1);
				expect(state.playerColor).toBe('w');
			}

			// Socket reconnects
			liveGameStore.onConnectionStatus?.('open');
			expect(store.state.kind).toBe('live-player');
		});

		it('dispatches retry after connection drop and reconnects with seat token', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-drop-retry-1',
				seat: 'White',
				seatToken: 'token-retry-1',
				wsUrl: '/games/game-drop-retry-1/ws?token=token-retry-1',
			});

			await store.handleIntent({ type: 'claim' });
			expect(store.currentPhase).toBe('live-player');

			// Drop socket
			liveGameStore.onConnectionStatus?.('closed');
			expect(store.state.kind).toBe('reconnecting');

			const connectSpy = vi.spyOn(liveGameStore, 'connect');
			await store.handleIntent({ type: 'retry' });

			expect(connectSpy).toHaveBeenCalledWith('game-drop-retry-1', 'token-retry-1', 'white');
			if (store.state.kind === 'reconnecting') {
				expect(store.state.attempt).toBe(2);
			}
		});
	});
});

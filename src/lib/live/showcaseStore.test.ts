import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShowcaseStore, type ShowcaseAuthView } from './showcaseStore.svelte';
import { LiveGameStore } from './liveGameStore.svelte';
import { memorySeatStore, type SeatStore } from './showcaseSeat';
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
	toastStore: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
	},
}));

class ShowcaseTestSocket {
	static readonly OPEN = 1;
	static latest: ShowcaseTestSocket | null = null;
	readonly readyState = 1;
	readonly sent: string[] = [];
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;

	constructor(public readonly url: string) {
		ShowcaseTestSocket.latest = this;
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
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
	let seatStore: SeatStore;

	beforeEach(() => {
		ShowcaseTestSocket.latest = null;
		vi.stubGlobal('WebSocket', ShowcaseTestSocket);
		vi.useFakeTimers();

		liveGameStore = new LiveGameStore();
		mockGetShowcase = vi.fn<(ifNoneMatch?: string) => Promise<GetShowcaseResult>>();
		mockClaimShowcase = vi.fn<() => Promise<ShowcaseClaimOutcome>>();
		seatStore = memorySeatStore();

		store = new ShowcaseStore({
			live: liveGameStore,
			getShowcaseFn: mockGetShowcase,
			claimShowcaseFn: mockClaimShowcase,
			seatStore,
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
				expect(state.bottomPlayer.name).toBe('You');
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
			expect(ShowcaseTestSocket.latest?.url).toContain('/games/game-occupied-123/ws');
			// Token must not be in spectator URL
			expect(ShowcaseTestSocket.latest?.url).not.toContain('token=');
		});

		it('mirrors the live roll presentation into the spectator state', async () => {
			mockGetShowcase.mockResolvedValue({
				notModified: false,
				view: {
					status: 'live',
					featuredBot: { team: 'rpi3', name: 'hunter', displayName: 'rpi3 hunter' },
					timeControl: { initialSeconds: 300, incrementSeconds: 3, display: '5+3' },
					nextHumanColor: 'Black',
					currentGame: {
						gameId: 'game-rolling-spec',
						players: null,
						humanSeat: 'White',
						activeSeat: 'White',
						dicePending: true,
						clocks: null,
						version: 1,
						dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 N',
						status: { Active: {} },
					},
					spectator: { wsUrl: '/games/game-rolling-spec/ws' },
					reason: null,
				},
			});
			await store.pollDiscovery();
			liveGameStore.onConnectionStatus?.('open');
			expect(store.state.kind).toBe('live-spectator');

			liveGameStore.isAnimatingRoll = true;
			expect(store.state.kind === 'live-spectator' && store.state.rolling).toBe(true);
			liveGameStore.isAnimatingRoll = false;
			expect(store.state.kind === 'live-spectator' && store.state.rolling).toBe(false);
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
			expect(ShowcaseTestSocket.latest?.url).toContain('token=secret-seat-token-xyz');
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
			expect(ShowcaseTestSocket.latest?.url).toContain('/games/game-lost-1/ws');
			expect(ShowcaseTestSocket.latest?.url).not.toContain('token=');
		});

		it('mirrors the live roll presentation into the seated player state', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-rolling-1',
				seat: 'White',
				seatToken: 'token-rolling-1',
				wsUrl: '/games/game-rolling-1/ws?token=token-rolling-1',
			});
			await store.handleIntent({ type: 'claim' });
			liveGameStore.onConnectionStatus?.('open');
			expect(store.state.kind).toBe('live-player');

			liveGameStore.isAnimatingRoll = true;
			expect(store.state.kind === 'live-player' && store.state.rolling).toBe(true);
			liveGameStore.isAnimatingRoll = false;
			expect(store.state.kind === 'live-player' && store.state.rolling).toBe(false);
		});

		it('mirrors a pending promotion into the seated player state and routes the choice back', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-promo-1',
				seat: 'White',
				seatToken: 'token-promo-1',
				wsUrl: '/games/game-promo-1/ws?token=token-promo-1',
			});
			await store.handleIntent({ type: 'claim' });
			liveGameStore.onConnectionStatus?.('open');
			expect(store.state.kind).toBe('live-player');
			expect(store.state.kind === 'live-player' && store.state.pendingPromotion).toBeUndefined();

			liveGameStore.pendingPromotion = {
				orig: 'b7',
				dest: 'b8',
				color: 'w',
				availablePieces: ['q', 'n'],
				dieIndex: 0,
			};
			expect(store.state.kind === 'live-player' && store.state.pendingPromotion).toEqual({
				color: 'w',
				availablePieces: ['q', 'n'],
			});

			const complete = vi.spyOn(liveGameStore, 'completePromotion').mockImplementation(() => {});
			const cancel = vi.spyOn(liveGameStore, 'cancelPromotion').mockImplementation(() => {});
			await store.handleIntent({ type: 'promote', piece: 'q' });
			expect(complete).toHaveBeenCalledWith('q');
			await store.handleIntent({ type: 'cancel-promotion' });
			expect(cancel).toHaveBeenCalledTimes(1);
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

		it('keeps the final position for the whole countdown even though the server reopens the table at once', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-dwell-1',
				seat: 'White',
				seatToken: 'token-dwell-1',
				wsUrl: '/games/game-dwell-1/ws?token=token-dwell-1',
			});
			await store.handleIntent({ type: 'claim' });

			// In production the table reads `open` again ~200 ms after the game ends: the server's
			// `finishing` is a persistence transaction, not a display state.
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
			liveGameStore.onEnd?.({ termination: 'Resign', result: { Win: { side: 'Black' } } });
			expect(store.currentPhase).toBe('finishing');

			// Several reset polls come and go; the final position stays up and the countdown keeps running.
			await vi.advanceTimersByTimeAsync(6000);
			expect(store.currentPhase).toBe('finishing');
			expect(store.state.kind === 'finishing' && store.state.countdownSeconds).toBe(9);

			await vi.advanceTimersByTimeAsync(8000);
			expect(store.currentPhase).toBe('finishing');
			expect(store.state.kind === 'finishing' && store.state.countdownSeconds).toBe(1);

			// The countdown lapses, and only then the next poll reopens the table with the server's colour.
			await vi.advanceTimersByTimeAsync(2500);
			expect(store.currentPhase).toBe('open');
			expect(store.state.kind === 'open' && store.state.assignedColor).toBe('b');
		});

		it('"Reset table now" during the countdown reopens the table on the next poll', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-dwell-2',
				seat: 'White',
				seatToken: 'token-dwell-2',
				wsUrl: '/games/game-dwell-2/ws?token=token-dwell-2',
			});
			await store.handleIntent({ type: 'claim' });
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
			liveGameStore.onEnd?.({ termination: 'KingCaptured', result: { Win: { side: 'White' } } });
			await vi.advanceTimersByTimeAsync(3000);
			expect(store.currentPhase).toBe('finishing');

			await store.handleIntent({ type: 'reset-now' });
			expect(store.currentPhase).toBe('open');
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

		it('reopens the table when countdown lapses even if polls return 304 Not Modified', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-dwell-etag-1',
				seat: 'White',
				seatToken: 'token-dwell-etag-1',
				wsUrl: '/games/game-dwell-etag-1/ws?token=token-dwell-etag-1',
			});
			await store.handleIntent({ type: 'claim' });

			// First poll after end returns 200 with open view and ETag
			mockGetShowcase.mockResolvedValueOnce({
				notModified: false,
				etag: 'W/"open-etag-1"',
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
			// All subsequent polls return 304 Not Modified
			mockGetShowcase.mockResolvedValue({
				notModified: true,
				etag: 'W/"open-etag-1"',
			});

			liveGameStore.onEnd?.({ termination: 'Resign', result: { Win: { side: 'Black' } } });
			expect(store.currentPhase).toBe('finishing');

			// First poll happens at 1.5s
			await vi.advanceTimersByTimeAsync(1500);
			expect(store.currentPhase).toBe('finishing');

			// Countdown completes (15s total)
			await vi.advanceTimersByTimeAsync(14000);
			expect(store.currentPhase).toBe('open');
			expect(store.state.kind).toBe('open');
			if (store.state.kind === 'open') {
				expect(store.state.assignedColor).toBe('b');
			}
		});

		it('"Reset table now" reopens the table immediately even when server returns 304 Not Modified', async () => {
			mockClaimShowcase.mockResolvedValue({
				outcome: 'claimed',
				gameId: 'game-dwell-etag-2',
				seat: 'White',
				seatToken: 'token-dwell-etag-2',
				wsUrl: '/games/game-dwell-etag-2/ws?token=token-dwell-etag-2',
			});
			await store.handleIntent({ type: 'claim' });

			mockGetShowcase.mockResolvedValueOnce({
				notModified: false,
				etag: 'W/"open-etag-2"',
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
			mockGetShowcase.mockResolvedValue({
				notModified: true,
				etag: 'W/"open-etag-2"',
			});

			liveGameStore.onEnd?.({ termination: 'KingCaptured', result: { Win: { side: 'White' } } });
			await vi.advanceTimersByTimeAsync(1500);
			expect(store.currentPhase).toBe('finishing');

			await store.handleIntent({ type: 'reset-now' });
			expect(store.currentPhase).toBe('open');
			expect(store.state.kind).toBe('open');
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
	describe('Seat resilience: a discovery poll racing the claim, and a reload (2026-09-05 report)', () => {
		const bot = { team: 'rpi3', name: 'hunter', displayName: 'rpi3 hunter' };
		const timeControl = { initialSeconds: 300, incrementSeconds: 3, display: '5+3' };
		const openView: ShowcaseView = {
			status: 'open',
			featuredBot: bot,
			timeControl,
			nextHumanColor: 'White',
			currentGame: null,
			spectator: null,
			reason: null,
		};
		const liveView = (gameId: string): ShowcaseView => ({
			status: 'live',
			featuredBot: bot,
			timeControl,
			nextHumanColor: 'Black',
			currentGame: {
				gameId,
				players: null,
				humanSeat: 'White',
				activeSeat: 'White',
				dicePending: false,
				clocks: null,
				version: 1,
				dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
				status: { Active: {} },
			},
			spectator: { wsUrl: `/games/${gameId}/ws` },
			reason: null,
		});
		const claimed = (gameId: string): ShowcaseClaimOutcome => ({
			outcome: 'claimed',
			gameId,
			seat: 'White',
			seatToken: `token-${gameId}`,
			wsUrl: `/games/${gameId}/ws?token=token-${gameId}`,
		});
		function deferred<T>() {
			let resolve!: (value: T) => void;
			const promise = new Promise<T>((r) => {
				resolve = r;
			});
			return { promise, resolve };
		}

		it('discards a discovery poll that was in flight when the seat was claimed', async () => {
			await openTable(store);

			// A poll leaves just before the click and is still in flight…
			const inFlight = deferred<GetShowcaseResult>();
			mockGetShowcase.mockReturnValueOnce(inFlight.promise);
			const polling = store.pollDiscovery();

			// …the visitor claims and is seated.
			mockClaimShowcase.mockResolvedValue(claimed('game-race-1'));
			await store.handleIntent({ type: 'claim' });
			liveGameStore.onConnectionStatus?.('open');
			expect(store.currentPhase).toBe('live-player');
			const seatSocket = ShowcaseTestSocket.latest!;
			const closeSpy = vi.spyOn(seatSocket, 'close');

			// The old poll now answers with the table as it was before the claim. Applying it used to
			// null the token, close the seat's socket and show the open table again.
			inFlight.resolve({ notModified: false, view: openView });
			await polling;

			expect(store.currentPhase).toBe('live-player');
			expect(store.hasSeatToken).toBe(true);
			expect(closeSpy).not.toHaveBeenCalled();
			expect(seatStore.load()?.gameId).toBe('game-race-1');
		});

		it('discards a discovery poll that resolves while the claim is still pending', async () => {
			await openTable(store);

			const inFlight = deferred<GetShowcaseResult>();
			mockGetShowcase.mockReturnValueOnce(inFlight.promise);
			const polling = store.pollDiscovery();

			const claim = deferred<ShowcaseClaimOutcome>();
			mockClaimShowcase.mockReturnValue(claim.promise);
			const claiming = store.handleIntent({ type: 'claim' });
			expect(store.currentPhase).toBe('claiming');

			// The server already lists the game we are about to be handed. Connecting as a spectator
			// here would be a detour at best.
			inFlight.resolve({ notModified: false, view: liveView('game-race-2') });
			await polling;
			expect(store.currentPhase).toBe('claiming');
			expect(ShowcaseTestSocket.latest).toBeNull();

			claim.resolve(claimed('game-race-2'));
			await claiming;
			expect(store.currentPhase).toBe('live-player');
			expect(ShowcaseTestSocket.latest?.url).toContain('token=token-game-race-2');
		});

		it('stores the seat for this tab on claim and rejoins it after a reload', async () => {
			await openTable(store);
			mockClaimShowcase.mockResolvedValue(claimed('game-reload-1'));
			await store.handleIntent({ type: 'claim' });
			expect(seatStore.load()).toEqual({
				gameId: 'game-reload-1',
				seatToken: 'token-game-reload-1',
				seat: 'White',
			});

			// A reload: a fresh store over the same tab storage discovers the game still live.
			store.destroy();
			const reloadedLive = new LiveGameStore();
			const reloaded = new ShowcaseStore({
				live: reloadedLive,
				getShowcaseFn: mockGetShowcase,
				claimShowcaseFn: mockClaimShowcase,
				seatStore,
			});
			mockGetShowcase.mockResolvedValue({ notModified: false, view: liveView('game-reload-1') });
			await reloaded.pollDiscovery();
			reloadedLive.onConnectionStatus?.('open');

			expect(reloaded.currentPhase).toBe('live-player');
			expect(reloaded.hasSeatToken).toBe(true);
			expect(ShowcaseTestSocket.latest?.url).toContain('token=token-game-reload-1');
			expect(reloaded.state.kind === 'live-player' && reloaded.state.playerColor).toBe('w');
			reloaded.destroy();
		});

		it('keeps the stored seat when the page is left, so a quick return can rejoin', async () => {
			await openTable(store);
			mockClaimShowcase.mockResolvedValue(claimed('game-away-1'));
			await store.handleIntent({ type: 'claim' });

			store.stop(); // navigating away from the home page
			expect(store.hasSeatToken).toBe(false);
			expect(seatStore.load()?.gameId).toBe('game-away-1');
		});

		it('drops a stored seat that belongs to another game and spectates', async () => {
			const own = memorySeatStore({ gameId: 'game-old', seatToken: 'token-old', seat: 'Black' });
			const stale = new ShowcaseStore({
				live: new LiveGameStore(),
				getShowcaseFn: mockGetShowcase,
				claimShowcaseFn: mockClaimShowcase,
				seatStore: own,
			});
			mockGetShowcase.mockResolvedValue({ notModified: false, view: liveView('game-new') });
			await stale.pollDiscovery();

			expect(stale.currentPhase).toBe('live-spectator');
			expect(stale.hasSeatToken).toBe(false);
			expect(ShowcaseTestSocket.latest?.url).not.toContain('token=');
			expect(own.load()).toBeNull();
			stale.destroy();
		});

		it('forgets the stored seat when the game ends and when the table reopens', async () => {
			await openTable(store);
			mockClaimShowcase.mockResolvedValue(claimed('game-end-1'));
			await store.handleIntent({ type: 'claim' });
			expect(seatStore.load()).not.toBeNull();

			liveGameStore.onEnd?.({ termination: 'Resign', result: { Win: { side: 'Black' } } });
			expect(store.currentPhase).toBe('finishing');
			expect(seatStore.load()).toBeNull();

			// A stored seat left over from before (say, the reload never came) goes with the table once
			// the final-position dwell is over and the open view is applied for real.
			seatStore.save({ gameId: 'game-end-1', seatToken: 'token-game-end-1', seat: 'White' });
			mockGetShowcase.mockResolvedValue({ notModified: false, view: openView });
			await store.handleIntent({ type: 'reset-now' });
			expect(store.currentPhase).toBe('open');
			expect(seatStore.load()).toBeNull();
		});
	});

	describe('seated player identity (authenticated vs guest)', () => {
		const claimedOutcome: ShowcaseClaimOutcome = {
			outcome: 'claimed',
			gameId: 'game-auth-1',
			seat: 'White',
			seatToken: 'token-auth-1',
			wsUrl: '/games/game-auth-1/ws?token=token-auth-1',
		};

		it('shows registered nickname and rating for authenticated player in live-player', async () => {
			await openTable(store);
			mockClaimShowcase.mockResolvedValue(claimedOutcome);
			await store.handleIntent({ type: 'claim' });
			liveGameStore.onConnectionStatus?.('open');

			liveGameStore.players = {
				white: { kind: 'Human', name: 'RollingDice', rating: 1862 },
				black: { kind: 'Bot', name: 'rpi3 hunter', rating: 2196 },
			};

			expect(store.state.kind).toBe('live-player');
			expect(store.state.bottomPlayer.name).toBe('RollingDice');
			expect(store.state.bottomPlayer.rating).toBe(1862);
			expect(store.state.topPlayer.name).toBe('rpi3 hunter');
			expect(store.state.topPlayer.rating).toBe(2196);
		});

		it('falls back to "You (White)" or "You (Black)" for an anonymous guest in live-player', async () => {
			await openTable(store);
			mockClaimShowcase.mockResolvedValue(claimedOutcome);
			await store.handleIntent({ type: 'claim' });
			liveGameStore.onConnectionStatus?.('open');

			liveGameStore.players = {
				white: { kind: 'Human', name: null },
				black: { kind: 'Bot', name: 'rpi3 hunter' },
			};

			expect(store.state.kind).toBe('live-player');
			expect(store.state.bottomPlayer.name).toBe('You (White)');
			expect(store.state.bottomPlayer.rating).toBeUndefined();
		});

		it('preserves registered nickname during reconnecting state', async () => {
			await openTable(store);
			mockClaimShowcase.mockResolvedValue(claimedOutcome);
			await store.handleIntent({ type: 'claim' });
			liveGameStore.onConnectionStatus?.('open');

			liveGameStore.players = {
				white: { kind: 'Human', name: 'RollingDice', rating: 1862 },
				black: { kind: 'Bot', name: 'rpi3 hunter' },
			};

			// Connection drops
			liveGameStore.onConnectionStatus?.('closed');

			expect(store.state.kind).toBe('reconnecting');
			expect(store.state.bottomPlayer.name).toBe('RollingDice');
			expect(store.state.bottomPlayer.rating).toBe(1862);
		});

		it('shows registered nickname and profile href in finishing state', async () => {
			await openTable(store);
			mockClaimShowcase.mockResolvedValue(claimedOutcome);
			await store.handleIntent({ type: 'claim' });
			liveGameStore.onConnectionStatus?.('open');

			liveGameStore.players = {
				white: { kind: 'Human', name: 'RollingDice', rating: 1862 },
				black: { kind: 'Bot', name: 'rpi3 hunter' },
			};

			liveGameStore.onEnd?.({ termination: 'Resign', result: { Win: { side: 'White' } } });

			expect(store.state.kind).toBe('finishing');
			expect(store.state.bottomPlayer.name).toBe('RollingDice');
			expect(store.state.bottomPlayer.href).toBe('/players/RollingDice');
			expect(store.state.topPlayer.href).toBeUndefined(); // bot has no profile
		});

		it('keeps guest fallback in finishing state without profile href', async () => {
			await openTable(store);
			mockClaimShowcase.mockResolvedValue(claimedOutcome);
			await store.handleIntent({ type: 'claim' });
			liveGameStore.onConnectionStatus?.('open');

			liveGameStore.players = {
				white: { kind: 'Human', name: null },
				black: { kind: 'Bot', name: 'rpi3 hunter' },
			};

			liveGameStore.onEnd?.({ termination: 'Resign', result: { Win: { side: 'White' } } });

			expect(store.state.kind).toBe('finishing');
			expect(store.state.bottomPlayer.name).toBe('You (White)');
			expect(store.state.bottomPlayer.href).toBeUndefined();
		});

		it('shows authenticated nickname and rating in open state', async () => {
			const authMock: ShowcaseAuthView = {
				isAuthenticated: true,
				nickname: 'RollingDice',
				account: { rating: 1862 },
			};
			const authStoreInstance = new ShowcaseStore({
				live: liveGameStore,
				getShowcaseFn: mockGetShowcase,
				claimShowcaseFn: mockClaimShowcase,
				seatStore,
				auth: authMock,
			});

			await openTable(authStoreInstance);

			expect(authStoreInstance.state.kind).toBe('open');
			expect(authStoreInstance.state.bottomPlayer.name).toBe('RollingDice');
			expect(authStoreInstance.state.bottomPlayer.rating).toBe(1862);
			expect(authStoreInstance.state.bottomPlayer.sub).toBe('Assigned color · Claimable');

			authStoreInstance.destroy();
		});

		it('shows "You" with undefined rating for anonymous guest in open state', async () => {
			const authMock: ShowcaseAuthView = {
				isAuthenticated: false,
				nickname: null,
				account: null,
			};
			const guestStore = new ShowcaseStore({
				live: liveGameStore,
				getShowcaseFn: mockGetShowcase,
				claimShowcaseFn: mockClaimShowcase,
				seatStore,
				auth: authMock,
			});

			await openTable(guestStore);

			expect(guestStore.state.kind).toBe('open');
			expect(guestStore.state.bottomPlayer.name).toBe('You');
			expect(guestStore.state.bottomPlayer.rating).toBeUndefined();
			expect(guestStore.state.bottomPlayer.sub).toBe('Assigned color · Claimable');

			guestStore.destroy();
		});

		it('shows authenticated nickname and rating in claiming state', async () => {
			const authMock: ShowcaseAuthView = {
				isAuthenticated: true,
				nickname: 'RollingDice',
				account: { rating: 1862 },
			};
			let resolveClaim!: (outcome: ShowcaseClaimOutcome) => void;
			mockClaimShowcase.mockImplementation(
				() =>
					new Promise((res) => {
						resolveClaim = res;
					}),
			);
			const authStoreInstance = new ShowcaseStore({
				live: liveGameStore,
				getShowcaseFn: mockGetShowcase,
				claimShowcaseFn: mockClaimShowcase,
				seatStore,
				auth: authMock,
			});

			await openTable(authStoreInstance);
			void authStoreInstance.handleIntent({ type: 'claim' });

			expect(authStoreInstance.state.kind).toBe('claiming');
			expect(authStoreInstance.state.bottomPlayer.name).toBe('RollingDice');
			expect(authStoreInstance.state.bottomPlayer.rating).toBe(1862);
			expect(authStoreInstance.state.bottomPlayer.sub).toBe('Reserving seat…');

			resolveClaim(claimedOutcome);
			authStoreInstance.destroy();
		});

		it('shows authenticated nickname and rating in unavailable state', () => {
			const authMock: ShowcaseAuthView = {
				isAuthenticated: true,
				nickname: 'RollingDice',
				account: { rating: 1862 },
			};
			const authStoreInstance = new ShowcaseStore({
				live: liveGameStore,
				getShowcaseFn: mockGetShowcase,
				claimShowcaseFn: mockClaimShowcase,
				seatStore,
				auth: authMock,
			});

			expect(authStoreInstance.state.kind).toBe('unavailable');
			expect(authStoreInstance.state.bottomPlayer.name).toBe('RollingDice');
			expect(authStoreInstance.state.bottomPlayer.rating).toBe(1862);
			expect(authStoreInstance.state.bottomPlayer.sub).toBe('Unavailable');

			authStoreInstance.destroy();
		});
	});
});

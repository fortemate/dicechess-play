/**
 * Reactive store for the singleton showcase table on the homepage (Issue #61).
 *
 * Coordinates:
 * 1. Discovery polling: fetches GET /showcase, handling weak ETag 304s and transitioning
 *    between open, live (spectator), finishing, and unavailable states.
 * 2. Atomic claim: linearizes claims, prevents double submission while pending, and connects
 *    as a player with the returned credential on win, or tokenless spectator on race loss.
 * 3. Live session integration: binds to LiveGameStore for real-time moves, dice, clocks,
 *    and outcomes, cleanly mapping them into ShowcaseState without move-history surfaces.
 * 4. Zero-CLS geometry & Credential isolation: keeps board and grid mounted stably; keeps the
 *    seat token in memory and in this tab's sessionStorage (showcaseSeat.ts) so a reload rejoins
 *    the seat, and clears both the moment the game ends or the table changes.
 */

import { LiveGameStore } from './liveGameStore.svelte';
import {
	getShowcase,
	claimShowcase,
	type ShowcaseBotView,
	type ShowcaseProblemError,
	type GetShowcaseResult,
	type ShowcaseClaimOutcome,
} from './showcaseApi';
import type {
	ShowcaseColor,
	ShowcaseIntent,
	ShowcaseState,
	ShowcaseStateKind,
} from '../../components/showcase/types';
import type { Over, Seat } from './liveTypes';
import {
	publicPlayer,
	seatDisplayName,
	seatProfileHref,
	seatRating,
	showcaseBottomPlayerName,
} from './playerLabel';
import { toastStore } from '../toastStore.svelte';
import { createSeatStore, type SeatStore } from './showcaseSeat';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DEFAULT_TIME_CONTROL = '5 + 3 Blitz';
const DISCOVERY_POLL_MS = 3000;
const RESET_POLL_MS = 1500;
const UNAVAILABLE_POLL_MS = 5000;
const FINISHING_COUNTDOWN_SECONDS = 15;

type ShowcaseServerView = NonNullable<GetShowcaseResult['view']>;

export interface ShowcaseStoreDeps {
	live?: LiveGameStore;
	getShowcaseFn?: (ifNoneMatch?: string) => Promise<GetShowcaseResult>;
	claimShowcaseFn?: () => Promise<ShowcaseClaimOutcome>;
	/** Where this tab keeps its seat across reloads; tests pass an in-memory one. */
	seatStore?: SeatStore;
}

export class ShowcaseStore {
	private readonly live: LiveGameStore;
	private readonly getShowcaseFn: (ifNoneMatch?: string) => Promise<GetShowcaseResult>;
	private readonly claimShowcaseFn: () => Promise<ShowcaseClaimOutcome>;
	private readonly seatStore: SeatStore;

	// Internal phase
	private phase = $state<ShowcaseStateKind>('unavailable');
	private unavailableReason = $state<string>('loading');
	private assignedColor = $state<ShowcaseColor>('w');
	private timeControl = $state<string>(DEFAULT_TIME_CONTROL);
	private featuredBot = $state<ShowcaseBotView | null>(null);

	// Pending claim state
	private isClaimPending = $state<boolean>(false);

	// Credential: the seat token, never logged or exposed. Mirrored to this tab's storage
	// (seatStore, see showcaseSeat.ts) so a reload can rejoin the seat within play-api's grace.
	private seatToken: string | null = null;
	private currentGameId = $state<string | null>(null);

	// Finishing & Reset countdown
	private countdownSeconds = $state<number>(FINISHING_COUNTDOWN_SECONDS);
	private lastOver = $state<Over | null>(null);

	// Reconnection tracking
	private isReconnecting = $state<boolean>(false);
	private reconnectAttempt = $state<number>(1);
	private readonly maxReconnectAttempts = 5;

	// Polling timers
	private pollTimer: ReturnType<typeof setTimeout> | null = null;
	private countdownTimer: ReturnType<typeof setInterval> | null = null;
	private lastEtag: string | undefined = undefined;
	private isDestroyed = false;
	// Bumped by every claim, connection and stop. A discovery request that was in flight across one
	// of those describes a table that no longer exists for us and is discarded when it resolves
	// (pollDiscovery). Applying such a stale `open` is how a seated player was demoted to spectator
	// of their own game: the token nulled, the seat's socket closed, the seat forfeited (2026-09-05).
	private pollEpoch = 0;

	constructor(deps?: ShowcaseStoreDeps) {
		this.live = deps?.live ?? new LiveGameStore();
		this.getShowcaseFn = deps?.getShowcaseFn ?? getShowcase;
		this.claimShowcaseFn = deps?.claimShowcaseFn ?? claimShowcase;
		this.seatStore = deps?.seatStore ?? createSeatStore();

		// Listen to game lifecycle events from LiveGameStore
		this.live.onEnd = (over) => {
			this.handleGameEnded(over);
		};
		this.live.onConnectionStatus = (status) => {
			if (this.phase === 'live-player' || this.phase === 'live-spectator') {
				this.isReconnecting = status !== 'open';
			}
		};
	}

	// ── Public Accessors ────────────────────────────────────────────────────────

	get currentPhase(): ShowcaseStateKind {
		return this.phase;
	}

	get hasSeatToken(): boolean {
		return this.seatToken !== null;
	}

	get liveStore(): LiveGameStore {
		return this.live;
	}

	// ── Derived ShowcaseState ───────────────────────────────────────────────────

	state = $derived.by<ShowcaseState>(() => {
		// If WebSocket dropped mid-game, render reconnecting state
		if (this.isReconnecting && (this.phase === 'live-player' || this.phase === 'live-spectator')) {
			return this.buildReconnectingState();
		}

		switch (this.phase) {
			case 'unavailable':
				return this.buildUnavailableState();
			case 'open':
				return this.buildOpenState();
			case 'claiming':
				return this.buildClaimingState();
			case 'live-player':
				return this.buildLivePlayerState();
			case 'live-spectator':
				return this.buildLiveSpectatorState();
			case 'reconnecting':
				return this.buildReconnectingState();
			case 'finishing':
				return this.buildFinishingState();
			case 'reset':
				return this.buildResetState();
		}
	});

	// ── State Builders ──────────────────────────────────────────────────────────

	private getSeatClockMs(seat: Seat, fallbackMs: number = 300000): number {
		if (!this.live.hasClocks) return fallbackMs;
		return seat === 'White' ? this.live.whiteClockMs : this.live.blackClockMs;
	}

	private buildUnavailableState(): ShowcaseState {
		return {
			kind: 'unavailable',
			reason: this.unavailableReason,
			timeControl: this.timeControl,
			boardFen: START_FEN,
			clocks: { topMs: 300000, bottomMs: 300000 },
			topPlayer: {
				name: this.featuredBot?.displayName ?? 'Showcase Table',
				sub: 'Unavailable',
				bot: true,
			},
			bottomPlayer: {
				name: 'You (Guest)',
				sub: 'Unavailable',
			},
		};
	}

	private buildOpenState(): ShowcaseState {
		return {
			kind: 'open',
			assignedColor: this.assignedColor,
			timeControl: this.timeControl,
			boardFen: START_FEN,
			clocks: { topMs: 300000, bottomMs: 300000 },
			topPlayer: {
				name: this.featuredBot?.displayName ?? 'Waiting for challenger',
				sub: 'Open seat',
				bot: true,
			},
			bottomPlayer: {
				name: 'You (Guest)',
				sub: 'Assigned color · Claimable',
			},
		};
	}

	private buildClaimingState(): ShowcaseState {
		return {
			kind: 'claiming',
			assignedColor: this.assignedColor,
			timeControl: this.timeControl,
			boardFen: START_FEN,
			clocks: { topMs: 300000, bottomMs: 300000 },
			topPlayer: {
				name: this.featuredBot?.displayName ?? 'Waiting for challenger',
				sub: 'Connecting…',
				bot: true,
			},
			bottomPlayer: {
				name: 'You (Guest)',
				sub: 'Reserving seat…',
			},
		};
	}

	private buildLivePlayerState(): ShowcaseState {
		const bottomSeat: Seat = this.live.playerColor === 'b' ? 'Black' : 'White';
		const topSeat: Seat = bottomSeat === 'White' ? 'Black' : 'White';
		const topClock = this.getSeatClockMs(topSeat);
		const bottomClock = this.getSeatClockMs(bottomSeat);

		const isMyTurn = this.live.activeColor === this.live.playerColor;
		const topSub = isMyTurn ? 'Opponent thinking' : `Playing as ${topSeat}`;

		return {
			kind: 'live-player',
			playerColor: this.live.playerColor,
			activeColor: this.live.activeColor,
			topPlayer: {
				name: seatDisplayName(this.live.players, topSeat, bottomSeat, false),
				sub: topSub,
				bot: publicPlayer(this.live.players, topSeat)?.kind === 'Bot',
				rating: seatRating(this.live.players, topSeat),
				active: !isMyTurn,
				thinking: !isMyTurn,
				clockMs: topClock,
			},
			bottomPlayer: {
				name: showcaseBottomPlayerName(this.live.players, bottomSeat),
				sub: isMyTurn ? 'Your turn to move' : 'Opponent thinking',
				rating: seatRating(this.live.players, bottomSeat),
				active: isMyTurn,
				clockMs: bottomClock,
			},
			boardFen: this.live.currentBoardFen,
			clocks: { topMs: topClock, bottomMs: bottomClock },
			dice: this.live.currentDice,
			rolling: this.live.isAnimatingRoll,
			legalMovesDests: this.live.legalMovesDests,
			lastMove: this.live.lastMove,
			pendingPromotion: this.live.pendingPromotion
				? {
						color: this.live.pendingPromotion.color,
						availablePieces: this.live.pendingPromotion.availablePieces,
					}
				: undefined,
		};
	}

	private buildLiveSpectatorState(): ShowcaseState {
		// Standard broadcast perspective: White at bottom, Black at top
		const topClock = this.live.hasClocks ? this.live.blackClockMs : 300000;
		const bottomClock = this.live.hasClocks ? this.live.whiteClockMs : 300000;
		const isBlackTurn = this.live.activeColor === 'b';

		return {
			kind: 'live-spectator',
			activeColor: this.live.activeColor,
			topPlayer: {
				name: seatDisplayName(this.live.players, 'Black', 'White', true),
				sub: 'Black Seat',
				bot: publicPlayer(this.live.players, 'Black')?.kind === 'Bot',
				rating: seatRating(this.live.players, 'Black'),
				active: isBlackTurn,
				thinking: isBlackTurn,
				clockMs: topClock,
			},
			bottomPlayer: {
				name: seatDisplayName(this.live.players, 'White', 'White', true),
				sub: 'White Seat',
				bot: publicPlayer(this.live.players, 'White')?.kind === 'Bot',
				rating: seatRating(this.live.players, 'White'),
				active: !isBlackTurn,
				thinking: !isBlackTurn,
				clockMs: bottomClock,
			},
			boardFen: this.live.currentBoardFen,
			clocks: { topMs: topClock, bottomMs: bottomClock },
			dice: this.live.currentDice,
			rolling: this.live.isAnimatingRoll,
			lastMove: this.live.lastMove,
		};
	}

	private buildReconnectingState(): ShowcaseState {
		const isPlayer = this.seatToken !== null;
		const playerColor = isPlayer ? this.live.playerColor : undefined;
		const bottomSeat: Seat = isPlayer && this.live.playerColor === 'b' ? 'Black' : 'White';
		const topSeat: Seat = bottomSeat === 'White' ? 'Black' : 'White';
		const topClock = this.getSeatClockMs(topSeat);
		const bottomClock = this.getSeatClockMs(bottomSeat);

		let bottomName: string;
		if (isPlayer) {
			bottomName = showcaseBottomPlayerName(this.live.players, bottomSeat);
		} else {
			bottomName = seatDisplayName(this.live.players, bottomSeat, bottomSeat, true);
		}

		return {
			kind: 'reconnecting',
			attempt: this.reconnectAttempt,
			maxAttempts: this.maxReconnectAttempts,
			playerColor,
			topPlayer: {
				name: seatDisplayName(this.live.players, topSeat, bottomSeat, !isPlayer),
				sub: 'Disconnected',
				bot: publicPlayer(this.live.players, topSeat)?.kind === 'Bot',
				rating: seatRating(this.live.players, topSeat),
				clockMs: topClock,
			},
			bottomPlayer: {
				name: bottomName,
				sub: 'Disconnected',
				rating: seatRating(this.live.players, bottomSeat),
				clockMs: bottomClock,
			},
			boardFen: this.live.currentBoardFen,
			clocks: { topMs: topClock, bottomMs: bottomClock },
			dice: this.live.currentDice,
			lastMove: this.live.lastMove,
		};
	}

	private resolveFinishingWinner(): ShowcaseColor | 'draw' | undefined {
		const winSide =
			this.live.winner ??
			(this.lastOver && 'Win' in this.lastOver.result ? this.lastOver.result.Win.side : null);

		if (winSide === 'White') return 'w';
		if (winSide === 'Black') return 'b';
		if (
			this.live.outcome === 'draw' ||
			this.live.termination === 'Draw' ||
			(this.lastOver && 'Draw' in this.lastOver.result)
		) {
			return 'draw';
		}
		return undefined;
	}

	private resolveFinishingReason(): string {
		const term = this.live.termination ?? this.lastOver?.termination ?? 'KingCaptured';
		switch (term) {
			case 'KingCaptured':
				return 'mate';
			case 'Resign':
				return 'resign';
			case 'Timeout':
				return 'timeout';
			case 'Draw':
				return 'draw';
			default:
				return term.toLowerCase();
		}
	}

	private resolveFinishingWinnerName(
		winner: ShowcaseColor | 'draw' | undefined,
		bottomSeat: Seat,
		isSpectator: boolean,
	): string | undefined {
		if (winner === 'w') {
			return seatDisplayName(this.live.players, 'White', bottomSeat, isSpectator);
		}
		if (winner === 'b') {
			return seatDisplayName(this.live.players, 'Black', bottomSeat, isSpectator);
		}
		return undefined;
	}

	private resolveSeatOutcomeSub(seat: Seat): string {
		if (!this.live.winner) return 'Drawn';
		return this.live.winner === seat ? 'Victor' : 'Defeated';
	}

	private buildFinishingState(): ShowcaseState {
		const isPlayer = this.seatToken !== null;
		const bottomSeat: Seat = isPlayer && this.live.playerColor === 'b' ? 'Black' : 'White';
		const topSeat: Seat = bottomSeat === 'White' ? 'Black' : 'White';
		const topClock = this.getSeatClockMs(topSeat, 0);
		const bottomClock = this.getSeatClockMs(bottomSeat, 0);

		const winner = this.resolveFinishingWinner();
		const reason = this.resolveFinishingReason();
		const winnerName = this.resolveFinishingWinnerName(winner, bottomSeat, !isPlayer);

		const bottomName = isPlayer
			? showcaseBottomPlayerName(this.live.players, bottomSeat)
			: seatDisplayName(this.live.players, bottomSeat, bottomSeat, true);

		return {
			kind: 'finishing',
			winner,
			winnerName,
			reason,
			countdownSeconds: this.countdownSeconds,
			playerColor: isPlayer ? this.live.playerColor : undefined,
			topPlayer: {
				name: seatDisplayName(this.live.players, topSeat, bottomSeat, !isPlayer),
				sub: this.resolveSeatOutcomeSub(topSeat),
				bot: publicPlayer(this.live.players, topSeat)?.kind === 'Bot',
				rating: seatRating(this.live.players, topSeat),
				href: seatProfileHref(this.live.players, topSeat),
				clockMs: topClock,
			},
			bottomPlayer: {
				name: bottomName,
				sub: this.resolveSeatOutcomeSub(bottomSeat),
				rating: seatRating(this.live.players, bottomSeat),
				href: seatProfileHref(this.live.players, bottomSeat),
				clockMs: bottomClock,
			},
			boardFen: this.live.currentBoardFen,
			clocks: { topMs: topClock, bottomMs: bottomClock },
			dice: this.live.currentDice,
			lastMove: this.live.lastMove,
		};
	}

	private buildResetState(): ShowcaseState {
		return {
			kind: 'reset',
			countdownSeconds: Math.max(0, this.countdownSeconds),
			topPlayer: {
				name: 'Resetting table…',
				sub: 'Alternating seat',
			},
			bottomPlayer: {
				name: 'Next game',
				sub: 'Readying pieces',
			},
			boardFen: START_FEN,
			clocks: { topMs: 300000, bottomMs: 300000 },
		};
	}

	// ── Lifecycle & Polling ─────────────────────────────────────────────────────

	start(): void {
		if (this.isDestroyed) return;
		void this.pollDiscovery();
	}

	stop(): void {
		this.pollEpoch += 1; // a poll still in flight must not act on a page we have left
		this.clearPollTimer();
		this.stopCountdownTimer();
		this.live.dispose();
		this.seatToken = null;
		// The stored seat is deliberately kept: leaving the page is exactly the case it exists for —
		// coming back within play-api's disconnect grace rejoins the game (applyServerView, `live`).
	}

	destroy(): void {
		this.isDestroyed = true;
		this.stop();
	}

	private clearPollTimer(): void {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
	}

	private schedulePoll(ms: number): void {
		this.clearPollTimer();
		if (this.isDestroyed) return;
		this.pollTimer = setTimeout(() => {
			void this.pollDiscovery();
		}, ms);
	}

	private stopCountdownTimer(): void {
		if (this.countdownTimer) {
			clearInterval(this.countdownTimer);
			this.countdownTimer = null;
		}
	}

	/** Authoritative discovery poller via GET /showcase. */
	async pollDiscovery(): Promise<void> {
		if (this.isDestroyed) return;

		const epoch = this.pollEpoch;
		try {
			const res = await this.getShowcaseFn(this.lastEtag);
			if (this.isDestroyed || epoch !== this.pollEpoch) return; // stale: see pollEpoch

			if (res.etag) {
				this.lastEtag = res.etag;
			}

			if (res.notModified) {
				// State is unchanged on server
				this.scheduleNextPoll();
				return;
			}

			const view = res.view;
			if (!view) {
				this.scheduleNextPoll();
				return;
			}

			this.applyServerView(view);
		} catch {
			if (this.isDestroyed || epoch !== this.pollEpoch) return;
			// Network failure or 500 error
			if (this.phase === 'unavailable' || this.phase === 'open') {
				this.phase = 'unavailable';
				this.unavailableReason = 'disabled';
			}
			this.schedulePoll(UNAVAILABLE_POLL_MS);
		}
	}

	private applyServerView(view: ShowcaseServerView): void {
		// While a claim is pending its own response decides where we go, and while we hold a seat the
		// WebSocket is the source of truth. A table view reaching us in either state is a poll that
		// raced the claim (pollEpoch catches the known cases; this is the belt to its braces).
		if (this.phase === 'claiming') return;
		if (this.phase === 'live-player' && (view.status === 'open' || view.status === 'live')) return;

		if (view.featuredBot) this.featuredBot = view.featuredBot;
		if (view.timeControl) this.timeControl = view.timeControl.display;

		// The server's `finishing` is a persistence transaction that lasts a fraction of a second; the
		// table reads `open` again long before our countdown is over. The dwell on the final position
		// is ours to keep: while it runs, an `open` view only records the next seat colour and keeps
		// the reset poll going, and the table reopens when the countdown ends or the visitor presses
		// "Reset table now" (either sets phase `reset`, and the next poll applies `open` for real).
		if (this.phase === 'finishing' && view.status === 'open') {
			this.assignedColor = view.nextHumanColor === 'Black' ? 'b' : 'w';
			this.schedulePoll(RESET_POLL_MS);
			return;
		}

		switch (view.status) {
			case 'unavailable':
				this.applyUnavailableView(view);
				break;
			case 'open':
				this.applyOpenView(view);
				break;
			case 'live':
				this.applyLiveView(view);
				break;
			case 'finishing':
				this.applyFinishingView(view);
				break;
		}
	}

	private applyUnavailableView(view: ShowcaseServerView): void {
		this.seatToken = null;
		this.seatStore.clear();
		this.currentGameId = null;
		this.lastOver = null;
		this.phase = 'unavailable';
		this.unavailableReason = view.reason ?? 'disabled';
		this.schedulePoll(UNAVAILABLE_POLL_MS);
	}

	/** Back to an open table: clear the credential, dispose any finished live game. */
	private applyOpenView(view: ShowcaseServerView): void {
		this.stopCountdownTimer();
		this.seatToken = null;
		this.seatStore.clear();
		this.currentGameId = null;
		this.lastOver = null;
		this.isReconnecting = false;
		this.live.dispose();

		this.assignedColor = view.nextHumanColor === 'Black' ? 'b' : 'w';
		this.phase = 'open';
		this.schedulePoll(DISCOVERY_POLL_MS);
	}

	private applyLiveView(view: ShowcaseServerView): void {
		const gameId = view.currentGame?.gameId;
		if (!gameId) {
			this.schedulePoll(DISCOVERY_POLL_MS);
			return;
		}

		// Already on this game (as player or spectator): keep the live connection.
		if (
			this.currentGameId === gameId &&
			(this.phase === 'live-player' || this.phase === 'live-spectator')
		) {
			return;
		}

		// Our own seat from before a reload (or a quick trip to another page): rejoin it.
		// play-api keeps a disconnected seat for its disconnect grace, so the game goes on.
		const stored = this.seatStore.load();
		if (stored?.gameId === gameId) {
			this.connectAsPlayer(gameId, stored.seatToken, stored.seat);
		} else {
			// Someone else's game (or a seat of ours that is long gone): spectate.
			this.connectAsSpectator(gameId);
		}
		this.clearPollTimer(); // WebSocket drives updates during active game
	}

	private applyFinishingView(view: ShowcaseServerView): void {
		const gameId = view.currentGame?.gameId;
		this.seatStore.clear(); // whichever game it is, it is over: a stored seat has no future
		if (gameId && this.currentGameId !== gameId) {
			// Discovered a game that is already finishing
			this.seatToken = null;
			this.currentGameId = gameId;
			this.phase = 'finishing';
			this.startFinishingCountdown();
			this.live.connect(gameId, null, null);
		} else if (this.phase !== 'finishing' && this.phase !== 'reset') {
			this.phase = 'finishing';
			this.startFinishingCountdown();
		}
		this.schedulePoll(RESET_POLL_MS);
	}

	private scheduleNextPoll(): void {
		if (this.phase === 'open') {
			this.schedulePoll(DISCOVERY_POLL_MS);
		} else if (this.phase === 'finishing' || this.phase === 'reset') {
			this.schedulePoll(RESET_POLL_MS);
		} else if (this.phase === 'unavailable') {
			this.schedulePoll(UNAVAILABLE_POLL_MS);
		}
	}

	// ── Intent Handling ─────────────────────────────────────────────────────────

	async handleIntent(intent: ShowcaseIntent): Promise<void> {
		switch (intent.type) {
			case 'claim':
				await this.executeClaim();
				break;
			case 'resign':
				if (this.phase === 'live-player') {
					this.live.resign();
				}
				break;
			case 'move':
				if (this.phase === 'live-player') {
					this.live.handleBoardMove(intent.orig, intent.dest);
				}
				break;
			case 'promote':
				if (this.phase === 'live-player') {
					this.live.completePromotion(intent.piece);
				}
				break;
			case 'cancel-promotion':
				if (this.phase === 'live-player') {
					this.live.cancelPromotion();
				}
				break;
			case 'retry':
				await this.executeRetry();
				break;
			case 'reset-now':
				this.phase = 'reset';
				await this.pollDiscovery();
				break;
			case 'navigate-play':
				// UI navigation handled by standard anchor links
				break;
		}
	}

	private async executeClaim(): Promise<void> {
		if (this.phase !== 'open' || this.isClaimPending) return;

		this.isClaimPending = true;
		this.phase = 'claiming';
		this.pollEpoch += 1; // a discovery poll still in flight must not outvote the claim
		this.clearPollTimer();

		try {
			const outcome = await this.claimShowcaseFn();
			this.isClaimPending = false;

			if (outcome.outcome === 'claimed') {
				// Winner: take the seat (token in memory and in this tab's storage) and connect
				this.connectAsPlayer(outcome.gameId, outcome.seatToken, outcome.seat);
			} else {
				// Race lost: transition directly to spectator
				this.seatToken = null;
				this.seatStore.clear();
				if (outcome.gameId) {
					this.connectAsSpectator(outcome.gameId);
				} else {
					this.phase = 'open';
					void this.pollDiscovery();
				}
			}
		} catch (error) {
			this.isClaimPending = false;
			const problem = error as ShowcaseProblemError;

			if (problem?.status === 503) {
				this.phase = 'unavailable';
				this.unavailableReason = 'bot_unavailable';
				this.schedulePoll(UNAVAILABLE_POLL_MS);
			} else if (problem?.status === 429) {
				toastStore.error(problem.detail || 'Claim limit exceeded — please wait a moment.');
				this.phase = 'open';
				this.schedulePoll(DISCOVERY_POLL_MS);
			} else {
				toastStore.error(problem?.detail || 'Could not claim seat.');
				this.phase = 'open';
				void this.pollDiscovery();
			}
		}
	}

	/** Take (or retake) a seat: credential in memory and in this tab's storage, then connect. */
	private connectAsPlayer(gameId: string, seatToken: string, seat: Seat): void {
		this.pollEpoch += 1;
		this.seatToken = seatToken;
		this.currentGameId = gameId;
		this.phase = 'live-player';
		this.isReconnecting = false;
		this.seatStore.save({ gameId, seatToken, seat });
		this.live.connect(gameId, seatToken, seat === 'Black' ? 'black' : 'white');
	}

	/** Watch a game we hold no seat in — and forget any stored seat, it is not for this game. */
	private connectAsSpectator(gameId: string): void {
		this.pollEpoch += 1;
		this.seatToken = null;
		this.seatStore.clear();
		this.currentGameId = gameId;
		this.phase = 'live-spectator';
		this.isReconnecting = false;
		this.live.connect(gameId, null, null);
	}

	private async executeRetry(): Promise<void> {
		if (this.isReconnecting) {
			if (this.reconnectAttempt < this.maxReconnectAttempts) {
				this.reconnectAttempt += 1;
			}
			if (this.currentGameId) {
				let color: 'white' | 'black' | null = null;
				if (this.seatToken) {
					color = this.live.playerColor === 'b' ? 'black' : 'white';
				}
				this.live.connect(this.currentGameId, this.seatToken, color);
			} else {
				await this.pollDiscovery();
			}
		} else {
			await this.pollDiscovery();
		}
	}

	private handleGameEnded(over?: Over): void {
		if (over) this.lastOver = over;
		this.seatStore.clear(); // the game is over; a reload must not try to rejoin it
		if (this.phase === 'finishing' || this.phase === 'reset') return;
		this.phase = 'finishing';
		this.startFinishingCountdown();
		// Poll server frequently to catch the transition to 'open'
		this.schedulePoll(RESET_POLL_MS);
	}

	private startFinishingCountdown(): void {
		this.stopCountdownTimer();
		this.countdownSeconds = FINISHING_COUNTDOWN_SECONDS;

		this.countdownTimer = setInterval(() => {
			if (this.countdownSeconds > 0) {
				this.countdownSeconds -= 1;
			}
			if (this.countdownSeconds <= 0) {
				this.stopCountdownTimer();
				if (this.phase === 'finishing') {
					this.phase = 'reset';
				}
			}
		}, 1000);
	}
}

export const showcaseStore = new ShowcaseStore();

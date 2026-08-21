import type { Key } from '@lichess-org/chessground/types';
import {
	getPieceFromFen,
	deriveChessgroundDests,
	buildDfen,
	getDieValue,
} from '../../utils/fenUtils';
import type { DieState } from '../playWithBot/playWithBotDice.svelte';
import { LiveClient, randomClientSeed, type ConnStatus } from './liveClient';
import { wsUrl } from './liveApi';
import { getGuestUuid } from '../ingest/guestIdentity';
import { splitDfen, stripDfen } from './dfenUtils';
import { dieStateFromValue, expandTurn } from './turnReplay';
import type {
	ClientCommand,
	Clocks,
	DrawOffer,
	Over,
	Players,
	PublicGameState,
	Seat,
	ServerEvent,
	SnapshotTurn,
} from './liveTypes';
import * as DiceChessEngine from '@fortemate/dicechess-engine';
import { buildTurnBlocks } from '../playWithBot/turnBlocks';
import type { BotMoveHistoryState } from '../playWithBot/playWithBotHistory.svelte';
import type { TurnBlock } from '../types';
import { playDiceSound, playDrawOfferSound } from '../sound';
import { ROLL_ANIMATION_MS, MOVE_STEP_MS, PASS_DWELL_MS, GAME_END_SUSPENSE_MS } from '../timings';
import { lastMoveKeys } from '../lastMove';
import { toastStore } from '../toastStore.svelte';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DiceChess = (DiceChessEngine as any).DiceChess;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type LiveStatus = 'connecting' | 'waiting' | 'playing' | 'over';
export type LiveOutcome = 'won' | 'lost' | 'draw';

/**
 * Server-authoritative human-vs-human game state. The server owns the truth: this store applies its
 * versioned events (Snapshot/DiceRolled/TurnPlayed/GameEnded/Rejected), and the local engine is used
 * only to show legal dice-moves and apply moves optimistically for instant feedback. A completed turn
 * is sent as SubmitTurn; the server's TurnPlayed confirms it (Rejected rolls the optimistic move back).
 *
 * It exposes the same read-surface Board consumes (see BoardStore), so Board is reused unchanged.
 */
export class LiveGameStore {
	// ── Board read-surface ───────────────────────────────────────────────────
	// `currentBoardFen`/`activeColor`/`currentDice` below are read-only getters, derived from either
	// the live fields (liveFen/liveActiveColor/liveDice) or a historyMap entry, depending on whether
	// the user is browsing history (see `viewedIndex`). Game logic must read the private live fields
	// directly — never the public getters — so scrubbing history can never affect move validation.
	private liveFen = $state<string>(START_FEN);
	private liveActiveColor = $state<'w' | 'b'>('w');
	playerColor = $state<'w' | 'b'>('w');
	gameStatus = $state<LiveStatus>('connecting');

	// ── Live UI state ────────────────────────────────────────────────────────
	private liveDice = $state<DieState[]>([]);
	isAnimatingRoll = $state<boolean>(false); // true while a roll's spin is presenting — either side's (see presentLoop)
	// The seat whose no-legal-moves pass is currently dwelling on screen (drives the dice-panel
	// notice, see presentLoop); null when no pass is presenting.
	passNoticeSeat = $state<Seat | null>(null);
	pendingPromotion = $state<{
		orig: string;
		dest: string;
		color: 'w' | 'b';
		availablePieces: string[];
		dieIndex: number;
	} | null>(null);
	connection = $state<ConnStatus>('connecting');
	outcome = $state<LiveOutcome | null>(null); // from this player's POV (null for spectators)
	winner = $state<Seat | null>(null); // the winning side, for spectator display
	termination = $state<string | null>(null);
	players = $state<Players | null>(null); // both seats' public faces (bots by name), from the snapshot
	// Whether this game counts toward rating (play-api #290). `undefined` means the server didn't
	// say (older server) — callers must treat that the same as `false`, never assume rated.
	rated = $state<boolean | undefined>(undefined);

	// ── Draw offers (play-api #327, this repo #253) ─────────────────────────
	drawOffer = $state<DrawOffer | null>(null);
	drawOfferedBy = $state<Seat | null>(null);
	mayOfferDraw = $state<boolean | null>(null);
	isDrawOfferArmed = $state<boolean>(false);

	// ── Move History ─────────────────────────────────────────────────────────
	historyMap = $state<Record<string, BotMoveHistoryState>>({});
	maxMoveIndex = $state<number>(0);
	// null = showing the live position; otherwise the historyMap index currently displayed.
	private viewedIndex = $state<number | null>(null);
	// How far the paced reveal (see `presentLoop`) has progressed through historyMap; lags behind
	// `maxMoveIndex` while an opponent's roll/moves are still animating in.
	private presentedIndex = $state<number>(0);
	// Bumped by reset() to invalidate any in-flight presentLoop from a previous game/reconnect.
	private epoch = 0;
	// Which epoch, if any, currently has a presentLoop actively draining historyMap.
	private pumpingEpoch: number | null = null;
	// Set when GameEnded arrives: the result is announced only after the reveal drains
	// to live plus a suspense beat (see scheduleGameEnd/finalizeEnd).
	private pendingOver: Over | null = null;

	historyBlocks = $derived.by<TurnBlock[]>(() =>
		buildTurnBlocks(this.historyMap, this.maxMoveIndex),
	);

	currentBoardFen = $derived.by<string>(() => {
		if (this.viewedIndex !== null)
			return this.historyMap[String(this.viewedIndex)]?.fen ?? this.liveFen;
		if (this.presentedIndex < this.maxMoveIndex)
			return this.historyMap[String(this.presentedIndex)]?.fen ?? this.liveFen;
		return this.liveFen;
	});

	activeColor = $derived.by<'w' | 'b'>(() => {
		if (this.viewedIndex !== null)
			return this.historyMap[String(this.viewedIndex)]?.active_color ?? this.liveActiveColor;
		if (this.presentedIndex < this.maxMoveIndex)
			return this.historyMap[String(this.presentedIndex)]?.active_color ?? this.liveActiveColor;
		return this.liveActiveColor;
	});

	currentDice = $derived.by<DieState[]>(() => {
		let source = this.liveDice;
		if (this.viewedIndex !== null) {
			source = this.historyMap[String(this.viewedIndex)]?.dices ?? this.liveDice;
		} else if (this.presentedIndex < this.maxMoveIndex) {
			source = this.historyMap[String(this.presentedIndex)]?.dices ?? this.liveDice;
		}
		return source.map((d) => ({ ...d }));
	});

	/** [from, to] to highlight on the board — same index as currentBoardFen, except live: an own
	 * move applies to liveFen optimistically before the server's TurnPlayed lands it in historyMap
	 * (see completeMove/recordTurn), so pendingMoves (not yet confirmed) takes priority there. */
	lastMove = $derived.by<Key[] | undefined>(() => {
		if (this.viewedIndex !== null) return lastMoveKeys(this.historyMap[String(this.viewedIndex)]);
		if (this.presentedIndex < this.maxMoveIndex)
			return lastMoveKeys(this.historyMap[String(this.presentedIndex)]);
		if (this.pendingMoves.length > 0) {
			const uci = this.pendingMoves[this.pendingMoves.length - 1];
			return [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];
		}
		return lastMoveKeys(this.historyMap[String(this.maxMoveIndex)]);
	});

	/** True while the user is browsing a past position, or the paced reveal hasn't caught up to live. */
	isViewingHistory = $derived(this.viewedIndex !== null || this.presentedIndex < this.maxMoveIndex);

	/** True only for a deliberate manual scrub — never during ordinary catch-up pacing. Drives the
	 * "Return to live" banner, which must not appear just because playback is still catching up. */
	isManuallyBrowsing = $derived(this.viewedIndex !== null);

	currentMoveIndex = $derived(this.viewedIndex ?? this.maxMoveIndex);

	// Reactive: `spectator`/`canResign` (and through them the Spectating badge and the resign button) must re-render
	// when `connect()` assigns the seat after the first paint — a plain field would freeze their first evaluation.
	private mySeat = $state<Seat | null>(null);
	private client: LiveClient | null = null;
	private version = -1;
	private pendingMoves = $state<string[]>([]); // optimistic UCI buffer for the turn in progress
	private confirmedFen = START_FEN; // last server-confirmed position, for rollback
	private confirmedDice: DieState[] = [];

	// ── clocks ─────────────────────────────────────────────────────────────────
	private tick = $state(0); // bumped by a timer so the ticking clock re-renders between server events
	private clockBaseMs = $state<Clocks | null>(null); // remaining per side as of `clockSince`; null = unlimited
	private clockSince = 0; // Date.now() when clockBaseMs was captured
	private tickingSeat = $state<Seat | null>(null); // the side running down now (none between turns / when over)
	private clockTimer: ReturnType<typeof setInterval> | null = null;

	/** True while a player (not a spectator) is in a live game. */
	get canResign(): boolean {
		return this.mySeat !== null && this.gameStatus !== 'over';
	}

	/** True while an offer is active and awaiting the responder's decision. */
	get isDrawOfferPending(): boolean {
		return this.drawOffer?.pending === true;
	}

	/** True when the active player can arm a draw offer to accompany their turn. */
	get canArmDrawOffer(): boolean {
		return (
			!this.spectator &&
			this.gameStatus === 'playing' &&
			this.liveActiveColor === this.playerColor &&
			this.liveDice.length > 0 &&
			this.mayOfferDraw !== false &&
			!this.isDrawOfferPending
		);
	}

	/** True when the pre-roll gate is active: a draw offer is pending and dice have not yet rolled. */
	get isPreRollGateActive(): boolean {
		return this.isDrawOfferPending && this.liveDice.length === 0 && this.gameStatus !== 'over';
	}

	/** True when the local player is the responder facing a pre-roll draw decision. */
	get isPreRollResponder(): boolean {
		return this.isPreRollGateActive && !this.spectator && this.liveActiveColor === this.playerColor;
	}

	get availableDiceValues(): number[] {
		return this.liveDice.filter((d) => d.allowed && !d.used).map((d) => getDieValue(d));
	}

	/** True for a timed game (clocks present); false for an unlimited one. */
	get hasClocks(): boolean {
		return this.clockBaseMs !== null;
	}

	/** True when watching rather than playing. */
	get spectator(): boolean {
		return this.mySeat === null;
	}

	/** The side whose clock is currently running down, or null when paused (between turns / over / unlimited). */
	get tickingClockSeat(): Seat | null {
		return this.tickingSeat;
	}

	get whiteClockMs(): number {
		return this.liveMs('White');
	}

	get blackClockMs(): number {
		return this.liveMs('Black');
	}

	/** Remaining ms for `seat`, counting the active side down locally between server updates. */
	private liveMs(seat: Seat): number {
		if (!this.clockBaseMs) return 0;
		const base = seat === 'White' ? this.clockBaseMs.white : this.clockBaseMs.black;
		if (this.tickingSeat === seat && this.gameStatus !== 'over') {
			void this.tick; // re-read each tick so the countdown stays reactive
			return Math.max(0, base - (Date.now() - this.clockSince));
		}
		return Math.max(0, base);
	}

	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	legalMovesDests = $derived.by<Map<Key, Key[]>>(() => {
		if (this.isViewingHistory) return new Map();
		if (this.isAnimatingRoll) return new Map(); // own roll: no moves until the spin lands
		if (this.gameStatus !== 'playing' || this.liveActiveColor !== this.playerColor)
			return new Map();
		const dice = this.availableDiceValues;
		if (dice.length === 0) return new Map();
		try {
			const uci = DiceChess.getLegalUciMoves(buildDfen(this.liveFen, dice)) || [];
			return deriveChessgroundDests(uci);
		} catch {
			return new Map();
		}
	});

	// ── lifecycle ─────────────────────────────────────────────────────────────
	connect(id: string, token: string | null, as: 'white' | 'black' | null): void {
		this.dispose(); // close any prior socket so a re-connect can't leak it
		this.reset(); // clear stale state when the instance is reused for a different game/seat
		this.playerColor = as === 'black' ? 'b' : 'w';
		this.mySeat = as === 'white' ? 'White' : as === 'black' ? 'Black' : null;
		// Our guest id rides along on a seated connection so the server can bind the seat to us
		// (play-api #285) — without it, a friend-by-link game stays recorded as the creator playing
		// themselves and neither side finds it in their history. A signed-in visitor's session wins
		// over it server-side; spectators send nothing to claim.
		const client = new LiveClient(wsUrl(id, token, token ? getGuestUuid() : null));
		this.client = client;
		client.onStatus((s) => (this.connection = s));
		client.onEvent((ev) => this.applyEvent(ev));
		// A seated player contributes post-commit dice entropy so the server's opening-roll gate opens
		// promptly; spectators send nothing. LiveClient re-announces it on each reconnect (the server
		// ignores a duplicate or post-roll seed).
		const hello: ClientCommand | null =
			this.mySeat !== null ? { SubmitSeed: { seed: randomClientSeed() } } : null;
		client.connect(hello);
	}

	/** Clear per-game state (the same instance is reused across /live/[id] navigations). */
	private reset(): void {
		this.version = -1;
		this.liveFen = START_FEN;
		this.liveActiveColor = 'w';
		this.liveDice = [];
		this.isAnimatingRoll = false;
		this.passNoticeSeat = null;
		this.pendingOver = null;
		this.pendingPromotion = null;
		this.pendingMoves = [];
		this.confirmedFen = START_FEN;
		this.confirmedDice = [];
		this.outcome = null;
		this.winner = null;
		this.termination = null;
		this.players = null;
		this.rated = undefined;
		this.drawOffer = null;
		this.drawOfferedBy = null;
		this.mayOfferDraw = null;
		this.isDrawOfferArmed = false;
		this.gameStatus = 'connecting';
		// The connection status must restart too: the store is reused across /live/[id] navigations, and the previous
		// game's 'open' would otherwise show through until the new socket actually connects.
		this.connection = 'connecting';
		this.clockBaseMs = null;
		this.clockSince = 0;
		this.tickingSeat = null;
		this.historyMap = {};
		this.viewedIndex = null;
		this.maxMoveIndex = 0;
		this.presentedIndex = 0;
		this.epoch += 1; // invalidates any in-flight presentLoop from the previous game
	}

	dispose(): void {
		this.stopClockTimer();
		this.client?.close();
		this.client = null;
		// Invalidate any in-flight presentLoop: without this, leaving the page mid-reveal lets the
		// loop keep waking (and playing roll sounds) against a store nothing renders anymore.
		this.epoch += 1;
	}

	resign(): void {
		this.client?.send({ Resign: {} });
	}

	toggleArmDrawOffer(): void {
		if (this.canArmDrawOffer) {
			this.isDrawOfferArmed = !this.isDrawOfferArmed;
		}
	}

	setArmDrawOffer(armed: boolean): void {
		if (!armed || this.canArmDrawOffer) {
			this.isDrawOfferArmed = armed;
		}
	}

	respondDraw(accept: boolean): void {
		if (!this.isPreRollResponder) return;
		this.client?.send({ RespondDraw: { accept } });
	}

	// ── server events ──────────────────────────────────────────────────────────
	private applyEvent(ev: ServerEvent): void {
		if ('Snapshot' in ev) {
			this.version = ev.Snapshot.v;
			this.syncState(ev.Snapshot.state, ev.Snapshot.history);
			return;
		}
		if ('DiceRolled' in ev) {
			if (ev.DiceRolled.v <= this.version) return;
			this.version = ev.DiceRolled.v;
			this.drawOffer = null;
			this.drawOfferedBy = null;
			const { fen6, dice } = splitDfen(ev.DiceRolled.dfen);
			const color: 'w' | 'b' = ev.DiceRolled.seat === 'White' ? 'w' : 'b';
			this.recordRoll(fen6, color, dice);
			this.syncTurn(ev.DiceRolled.dfen, ev.DiceRolled.seat);
			this.setClocks(ev.DiceRolled.clocks, ev.DiceRolled.seat);
			// No sound here: every roll — the player's own included — sounds in presentLoop,
			// in sync with its visible spin (which may lag this event during catch-up).
			return;
		}
		if ('TurnPlayed' in ev) {
			if (ev.TurnPlayed.v <= this.version) return;
			this.version = ev.TurnPlayed.v;
			this.isDrawOfferArmed = false;
			this.recordTurn(ev.TurnPlayed.moves, ev.TurnPlayed.seat);
			this.confirmedFen = stripDfen(ev.TurnPlayed.fenAfter);
			this.liveFen = this.confirmedFen;
			this.pendingMoves = [];
			this.liveDice = [];
			this.gameStatus = 'waiting';
			this.freezeClocks(); // hold the clocks until the next DiceRolled brings authoritative values
			return;
		}
		if ('DrawOffered' in ev) {
			if (ev.DrawOffered.v <= this.version) return;
			this.version = ev.DrawOffered.v;
			this.drawOffer = { pending: true };
			this.drawOfferedBy = ev.DrawOffered.by;
			const responderSeat: Seat = ev.DrawOffered.by === 'White' ? 'Black' : 'White';
			this.liveActiveColor = responderSeat === 'White' ? 'w' : 'b';
			this.setClocks(this.clockBaseMs, responderSeat);
			if (this.mySeat === responderSeat) {
				this.gameStatus = 'playing';
				playDrawOfferSound();
			} else {
				this.gameStatus = 'waiting';
			}
			return;
		}
		if ('DrawDeclined' in ev) {
			if (ev.DrawDeclined.v <= this.version) return;
			this.version = ev.DrawDeclined.v;
			this.drawOffer = null;
			this.drawOfferedBy = null;
			return;
		}
		if ('GameEnded' in ev) {
			if (ev.GameEnded.v <= this.version) return;
			this.version = ev.GameEnded.v;
			// Freeze the clocks at their server-final values and stop reconnecting right away,
			// but let an in-flight reveal finish (the winning move should land on the board) and
			// hold a short suspense beat before announcing the result.
			this.settleClocks(ev.GameEnded.over.termination);
			this.client?.close();
			this.pendingOver = ev.GameEnded.over;
			this.scheduleGameEnd(this.epoch);
			return;
		}
		if ('Rejected' in ev) {
			if (ev.Rejected.v <= this.version) return;
			this.version = ev.Rejected.v;
			if (ev.Rejected.seat === this.mySeat) {
				this.rollback();
				toastStore.error("Move rejected — reverted to the board's last confirmed position.");
			}
			return;
		}
	}

	private syncState(state: PublicGameState, history?: SnapshotTurn[]): void {
		this.players = state.players ?? null;
		this.rated = state.rated;
		this.drawOffer = state.drawOffer ?? null;
		this.mayOfferDraw = state.mayOfferDraw ?? null;
		if (this.drawOffer?.pending) {
			this.drawOfferedBy = state.activeSeat === 'White' ? 'Black' : 'White';
		} else {
			this.drawOfferedBy = null;
		}

		// Every Snapshot — a fresh join or a reconnect's resync alike — carries the server's full
		// authoritative turn history, so always rebuild historyMap from it rather than appending.
		// LiveClient reattaches a dropped connection transparently, without the page re-running
		// connect()/reset() (see liveClient.ts), so the store's historyMap from before the drop is
		// still there when a resync Snapshot arrives — appending onto it would duplicate every turn.
		if (history !== undefined) this.rebuildHistory(history);

		if ('Ended' in state.status) {
			this.liveFen = stripDfen(state.dfen);
			// The server's final clocks are already settled in the snapshot; adopt them without re-zeroing.
			this.setClocks(state.clocks, null);
			// Joining/refreshing into a finished game announces immediately — no suspense.
			this.finalizeEnd(state.status.Ended.over);
			return;
		}

		this.syncTurn(state.dfen, state.activeSeat, state.dicePending);
		// The current pending roll isn't part of `history` (the server only lists completed turns) —
		// append it as the next entry. The historyMap-empty fallback covers a pre-history server that
		// sent no `history` field at all on a fresh connect.
		if (history !== undefined || Object.keys(this.historyMap).length === 0) {
			this.appendRollEntry(this.liveFen, this.liveActiveColor, this.liveDice);
		}
		const clockTicking = state.dicePending || Boolean(state.drawOffer?.pending);
		this.setClocks(state.clocks, clockTicking ? state.activeSeat : null);
		// The replayed backlog (plus the current roll) is already known — present it as caught up
		// immediately; only events from here on animate.
		this.presentedIndex = this.maxMoveIndex;
	}

	/** Rebuilds historyMap from scratch using a Snapshot's authoritative `history` — every completed
	 * turn so far. Called on every Snapshot (never just when historyMap is empty), so a reconnect's
	 * resync can never duplicate turns onto what's already there (#132 follow-up). */
	private rebuildHistory(history: SnapshotTurn[]): void {
		this.historyMap = {};
		this.maxMoveIndex = 0;
		if (history.length > 0) this.replayHistory(history);
	}

	/** Adopt the authoritative position + dice for the side to move. */
	private syncTurn(dfen: string, activeSeat: Seat, dicePending = true): void {
		const { fen6, dice } = splitDfen(dfen);
		this.confirmedFen = fen6;
		this.liveFen = fen6;
		this.liveActiveColor = activeSeat === 'White' ? 'w' : 'b';
		this.pendingMoves = [];
		this.liveDice = dicePending ? dice.map((value) => ({ value, allowed: true, used: false })) : [];
		this.confirmedDice = this.liveDice.map((d) => ({ ...d }));
		const canAct = (dicePending || Boolean(this.drawOffer?.pending)) && activeSeat === this.mySeat;
		this.gameStatus = canAct ? 'playing' : 'waiting';
	}

	/** Runs once the reveal has drained to live: one suspense beat, then the announcement.
	 * Epoch-guarded so a reset/dispose (or a newer game) mid-beat cancels it. */
	private scheduleGameEnd(epoch: number): void {
		// Mid-reveal: presentLoop re-invokes this once it has drained to live.
		if (this.presentedIndex < this.maxMoveIndex) return;
		void this.finishGameEnd(epoch);
	}

	private async finishGameEnd(epoch: number): Promise<void> {
		await this.sleep(GAME_END_SUSPENSE_MS);
		if (epoch !== this.epoch || this.pendingOver === null) return;
		this.finalizeEnd(this.pendingOver);
	}

	private finalizeEnd(over: Over): void {
		this.pendingOver = null;
		this.gameStatus = 'over';
		this.termination = over.termination;
		this.liveDice = [];
		this.drawOffer = null;
		this.drawOfferedBy = null;
		this.isDrawOfferArmed = false;
		this.isAnimatingRoll = false; // clears a roll-reveal that was mid-flight when the game ended
		this.passNoticeSeat = null; // likewise a pass notice mid-dwell
		this.pendingMoves = [];
		this.pendingPromotion = null;
		// Always land on the final position: on the event path the reveal has already finished
		// (see scheduleGameEnd); this snap covers the snapshot path and a user who was browsing
		// history when the announcement fired.
		this.viewedIndex = null;
		this.presentedIndex = this.maxMoveIndex;
		this.epoch += 1;
		this.settleClocks(over.termination);
		// The game is terminal and the room is about to be evicted: stop reconnecting (a no-op otherwise
		// retries against a gone game). The outcome shows via gameStatus, not the connection status.
		this.client?.close();
		if ('Draw' in over.result) {
			this.outcome = 'draw';
			this.winner = null;
		} else {
			this.winner = over.result.Win.side;
			this.outcome = this.mySeat === null ? null : this.winner === this.mySeat ? 'won' : 'lost';
		}
	}

	private rollback(): void {
		this.liveFen = this.confirmedFen;
		this.liveDice = this.confirmedDice.map((d) => ({ ...d }));
		this.pendingMoves = [];
		this.gameStatus = this.liveActiveColor === this.playerColor ? 'playing' : 'waiting';
	}

	// ── clocks ──────────────────────────────────────────────────────────────────
	/** Adopt authoritative per-side clocks from an event and tick `ticking` down (or no side). */
	private setClocks(clocks: Clocks | null, ticking: Seat | null): void {
		this.clockBaseMs = clocks;
		this.clockSince = Date.now();
		this.tickingSeat = clocks ? ticking : null;
		// Only run the timer while a side is actually counting down; idle/frozen needs no ticks.
		if (this.tickingSeat && this.gameStatus !== 'over') this.startClockTimer();
		else this.stopClockTimer();
	}

	/** Pin both clocks to their current live values and stop ticking — between a completed turn and the next roll. */
	private freezeClocks(): void {
		if (!this.clockBaseMs) return;
		this.clockBaseMs = { white: this.whiteClockMs, black: this.blackClockMs };
		this.clockSince = Date.now();
		this.tickingSeat = null;
		this.stopClockTimer();
	}

	/** Settle clocks at game end: on a flag-fall zero the side that ran out, otherwise pin the live values. */
	private settleClocks(termination: string): void {
		this.stopClockTimer();
		if (!this.clockBaseMs || !this.tickingSeat) return;
		const key = this.tickingSeat === 'White' ? 'white' : 'black';
		const settled = { ...this.clockBaseMs };
		settled[key] =
			termination === 'Timeout'
				? 0
				: Math.max(0, this.clockBaseMs[key] - (Date.now() - this.clockSince));
		this.clockBaseMs = settled;
		this.tickingSeat = null;
	}

	private startClockTimer(): void {
		if (this.clockTimer !== null) return;
		// 100ms so the sub-10s tenths display counts down smoothly.
		this.clockTimer = setInterval(() => (this.tick += 1), 100);
	}

	private stopClockTimer(): void {
		if (this.clockTimer === null) return;
		clearInterval(this.clockTimer);
		this.clockTimer = null;
	}

	// ── move handling (mirrors the vs-bot store, but submits the turn to the server) ──
	handleBoardMove(orig: string, dest: string): void {
		if (this.isViewingHistory) return;
		if (this.isAnimatingRoll) return; // own roll: no moves until the spin lands
		if (this.gameStatus !== 'playing' || this.liveActiveColor !== this.playerColor) return;
		// Don't move optimistically while disconnected — the SubmitTurn would be dropped and the
		// local board would diverge from the server.
		if (this.connection !== 'open') {
			// 'closed' means reconnect attempts are exhausted (see LiveClient.handleDrop) — nothing
			// will bring the move through without a manual reload, unlike a still-retrying 'connecting'.
			toastStore.error(
				this.connection === 'closed'
					? 'Disconnected — reload the page to reconnect.'
					: 'Reconnecting… your move will go through once back online.',
			);
			return;
		}
		const piece = getPieceFromFen(this.liveFen, orig);
		if (!piece) return;

		const dieVal = getDieValue(piece);
		const dieIndex = this.liveDice.findIndex(
			(d) => d.allowed && !d.used && getDieValue(d) === dieVal,
		);
		if (dieIndex === -1) return;
		this.liveDice[dieIndex].used = true;

		const isPromotion = piece.toLowerCase() === 'p' && (dest[1] === '8' || dest[1] === '1');
		if (isPromotion) {
			// Capturing the king on the last rank is NOT a promotion: the game ends there, so the
			// engine emits a plain capture and no promotion variants exist. Submitting a suffix
			// anyway costs the whole turn — `applyMove` ignores it locally, but the server's
			// legal-turn index is keyed on the engine's own UCI and rejects `c7d8q` (#177).
			const target = getPieceFromFen(this.liveFen, dest);
			if (target && target.toLowerCase() === 'k') {
				this.completeMove(orig, dest, undefined, dieIndex);
				return;
			}
			this.pendingPromotion = {
				orig,
				dest,
				color: this.playerColor,
				availablePieces: this.promotionPieces(orig, dest, dieIndex),
				dieIndex,
			};
			return;
		}
		this.completeMove(orig, dest, undefined, dieIndex);
	}

	completePromotion(piece: string): void {
		if (!this.pendingPromotion) return;
		const { orig, dest, dieIndex } = this.pendingPromotion;
		this.pendingPromotion = null;
		this.completeMove(orig, dest, piece, dieIndex);
	}

	cancelPromotion(): void {
		if (!this.pendingPromotion) return;
		this.liveDice[this.pendingPromotion.dieIndex].used = false;
		this.pendingPromotion = null;
		// Snap the piece back by briefly clearing the FEN (same trick as the vs-bot board).
		const fen = this.liveFen;
		this.liveFen = '';
		setTimeout(() => (this.liveFen = fen), 0);
	}

	private promotionPieces(orig: string, dest: string, dieIndex: number): string[] {
		const dice = this.liveDice
			.filter((d, i) => d.allowed && (!d.used || i === dieIndex))
			.map((d) => getDieValue(d));
		try {
			const legal: string[] = DiceChess.getLegalUciMoves(buildDfen(this.liveFen, dice)) || [];
			const promos = legal
				.filter((m) => m.startsWith(orig + dest) && m.length === 5)
				.map((m) => m[4].toLowerCase());
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			if (promos.length > 0) return Array.from(new Set(promos));
		} catch {
			/* fall through to the default set */
		}
		return ['q', 'r', 'b', 'n'];
	}

	private completeMove(
		orig: string,
		dest: string,
		promo: string | undefined,
		dieIndex: number,
	): void {
		const oldFen = this.liveFen;
		const dice = this.liveDice
			.filter((d, i) => d.allowed && (!d.used || i === dieIndex))
			.map((d) => getDieValue(d));
		const nextRaw = DiceChess.applyMove(buildDfen(oldFen, dice), orig, dest, promo);
		if (!nextRaw) {
			this.liveDice[dieIndex].used = false; // engine rejected; free the die
			return;
		}
		this.liveFen = stripDfen(nextRaw);
		this.consumeCastlingDie(orig, dest, getPieceFromFen(oldFen, orig));
		this.pendingMoves.push(orig + dest + (promo ?? ''));

		const capturedKing = getPieceFromFen(oldFen, dest)?.toLowerCase() === 'k';
		const turnComplete = capturedKing || this.legalMovesDests.size === 0;
		if (turnComplete) this.submitTurn();
	}

	private consumeCastlingDie(orig: string, dest: string, piece: string | null): void {
		if (piece?.toLowerCase() !== 'k') return;
		if (Math.abs(orig.charCodeAt(0) - dest.charCodeAt(0)) !== 2) return;
		const rookDie = getDieValue('r');
		const i = this.liveDice.findIndex((d) => d.allowed && !d.used && getDieValue(d) === rookDie);
		if (i !== -1) this.liveDice[i].used = true;
	}

	private submitTurn(): void {
		this.gameStatus = 'waiting'; // optimistic: turn sent, await the server's TurnPlayed / Rejected
		const offer = this.isDrawOfferArmed;
		this.isDrawOfferArmed = false;
		this.client?.send({
			SubmitTurn: {
				moves: [...this.pendingMoves],
				...(offer ? { offerDraw: true } : {}),
			},
		});
	}

	setMoveIndex(index: number): void {
		if (index < 0 || index > this.maxMoveIndex) return;
		// Prevent history navigation during an active turn — a pending promotion is already an
		// in-progress live move (its die is consumed before pendingMoves is populated).
		if (this.pendingMoves.length > 0 || this.pendingPromotion !== null) return;
		// Scrubbing during in-flight catch-up pacing (presentedIndex < maxMoveIndex) is intentionally
		// unguarded: it snaps straight to the requested historyMap entry and shows the manual-browsing
		// "Return to live" banner, interrupting the paced reveal. Matches the equivalent, already-
		// accepted gap in the offline bot mode's own scrub-vs-timer interaction.
		this.viewedIndex = index === this.maxMoveIndex ? null : index;
	}

	/** Appends a ROLL entry (`gameMoveHistoryMove: null`) at the next index — index 0 when historyMap
	 * is still empty (a brand-new game's opening roll), otherwise right after the last recorded turn
	 * (a joining client's current pending roll, appended once `replayHistory` has caught historyMap
	 * up to it). */
	private appendRollEntry(fen: string, color: 'w' | 'b', dice: DieState[]): void {
		const nextIndex = Object.keys(this.historyMap).length === 0 ? 0 : this.maxMoveIndex + 1;
		this.historyMap[String(nextIndex)] = {
			fen,
			active_color: color,
			dices: dice.map((d) => ({ ...d })),
			gameMoveHistoryMove: null,
		};
		this.maxMoveIndex = nextIndex;
	}

	/** Reconstructs every completed turn from a joining Snapshot's `history` into historyMap, starting
	 * at index 0 from the game's known opening position. Each SnapshotTurn is a roll plus the moves
	 * played on it (or none, for a forced pass) — the same shape `recordRoll`/`recordTurn` build
	 * incrementally as DiceRolled/TurnPlayed events arrive live, but replayed here without pacing
	 * (schedulePresentation), since a joining client shouldn't animate a backlog it never saw roll in. */
	private replayHistory(history: SnapshotTurn[]): void {
		let fen = START_FEN;
		for (const turn of history) {
			const color: 'w' | 'b' = turn.seat === 'White' ? 'w' : 'b';
			const diceState = turn.dice.map((value) => dieStateFromValue(value, color));
			this.appendRollEntry(fen, color, diceState);
			this.appendTurnEntries(fen, color, diceState, turn.moves);
			// Chain from the server's authoritative post-turn position (not the local replay's
			// derived fen) so per-turn engine differences can't compound across a long backlog.
			fen = stripDfen(turn.fenAfter);
		}
	}

	private recordRoll(fen: string, color: 'w' | 'b', dice: string[]): void {
		if (Object.keys(this.historyMap).length === 0) return;
		const nextIndex = this.maxMoveIndex + 1;
		this.historyMap[String(nextIndex)] = {
			fen,
			active_color: color,
			dices: dice.map((value) => ({ value, allowed: true, used: false })),
			gameMoveHistoryMove: null,
		};
		this.maxMoveIndex = nextIndex;
		this.schedulePresentation();
	}

	private recordTurn(moves: string[], seat: Seat): void {
		if (Object.keys(this.historyMap).length === 0) return;
		const color: 'w' | 'b' = seat === 'White' ? 'w' : 'b';
		this.appendTurnEntries(this.confirmedFen, color, this.confirmedDice, moves);
		this.schedulePresentation();
	}

	/** Applies a turn's UCI micro-moves onto `boardFen`/`dice`, pushing one historyMap entry per move
	 * (or one PASS entry if `moves` is empty) starting at `this.maxMoveIndex + 1`. Shared by the live
	 * incremental path (`recordTurn`, replaying on top of the current confirmed position/dice) and
	 * `replayHistory` (replaying a joining client's backlog, turn by turn from the opening position).
	 * Returns the resulting board fen, so a caller chaining multiple turns can feed it back in.
	 *
	 * The engine walk itself is `expandTurn` (`./turnReplay`) — this method only owns the
	 * historyMap-index bookkeeping, shared with `reconstructServerHistory`'s archived-game replay
	 * (#163), which needs the same per-move engine walk but has no `historyMap` of its own to push
	 * into.
	 */
	private appendTurnEntries(
		boardFen: string,
		color: 'w' | 'b',
		dice: DieState[],
		moves: string[],
	): string {
		const { entries, resultFen } = expandTurn(boardFen, color, dice, moves);
		for (const entry of entries) {
			const nextIndex = this.maxMoveIndex + 1;
			this.historyMap[String(nextIndex)] = {
				fen: entry.fen,
				active_color: color,
				dices: entry.dices,
				gameMoveHistoryMove: entry.move,
			};
			this.maxMoveIndex = nextIndex;
		}
		return resultFen;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private schedulePresentation(): void {
		if (this.pumpingEpoch === this.epoch) return; // a loop for the current epoch is already draining
		this.pumpingEpoch = this.epoch;
		void this.presentLoop(this.epoch);
	}

	/** Reveals new historyMap entries one at a time: a roll gets a spin (with sound), a move
	 * pauses on the old position first, and a no-legal-moves PASS dwells with a notice up
	 * (passNoticeSeat drives the dice-panel banner) while the passed roll's dice stay on screen.
	 * Every ROLL and PASS is paced — the player's own included, matching the offline bot mode
	 * (interaction is gated during the spin via the isAnimatingRoll checks in
	 * legalMovesDests/handleBoardMove). Only the player's own MOVES are skipped: their own turn
	 * already applied live and interactively as they played it (see syncTurn), so there's nothing
	 * left to "catch up" for them; the opponent's entries (or, for a spectator, either side's)
	 * get animated in full.
	 *
	 * Note: if the player's own roll arrives while an opponent's earlier multi-move turn is still
	 * being revealed, it queues behind it — legalMovesDests/handleBoardMove stay blocked (via
	 * isViewingHistory) until the opponent's moves finish animating in order, and the roll's
	 * spin+sound then fire when it actually presents. This is intentional: the player sees the
	 * opponent's whole turn land before the board becomes theirs to act on. */
	private async presentLoop(epoch: number): Promise<void> {
		try {
			while (this.presentedIndex < this.maxMoveIndex) {
				if (epoch !== this.epoch) return;

				const nextIndex = this.presentedIndex + 1;
				const entry = this.historyMap[String(nextIndex)];
				if (!entry) return;

				const isRoll = entry.gameMoveHistoryMove === null;
				// PASS convention from recordTurn: a turn entry whose move has empty squares.
				const isPass = !isRoll && entry.gameMoveHistoryMove?.from === '';
				const alreadySeenLive = !this.spectator && entry.active_color === this.playerColor;

				// Own moves were played live by the player; own ROLLS and PASSES present like anyone's.
				if (alreadySeenLive && !isRoll && !isPass) {
					this.presentedIndex = nextIndex;
					continue;
				}

				if (isRoll) {
					this.presentedIndex = nextIndex; // dice values visible immediately, spin plays on top
					this.isAnimatingRoll = true;
					playDiceSound();
					await this.sleep(ROLL_ANIMATION_MS);
					if (epoch !== this.epoch) return;
					this.isAnimatingRoll = false;
				} else if (isPass) {
					// The passed roll's entry is still on display, dice visible — hold it with the
					// notice up, then move on.
					this.passNoticeSeat = entry.active_color === 'w' ? 'White' : 'Black';
					await this.sleep(PASS_DWELL_MS);
					if (epoch !== this.epoch) return; // reset()/endGame already cleared the notice
					this.passNoticeSeat = null;
					this.presentedIndex = nextIndex;
				} else {
					await this.sleep(MOVE_STEP_MS); // pause on the OLD position, then reveal
					if (epoch !== this.epoch) return;
					this.presentedIndex = nextIndex;
				}
			}
			// Fully caught up: if the game already ended on the wire, the final move has now
			// landed — run the suspense beat and announce.
			if (this.pendingOver !== null) void this.finishGameEnd(epoch);
		} finally {
			// Cleared synchronously on the same tick the loop exits (rather than in a .finally()
			// chained by the caller), so a new schedulePresentation() call can never observe a stale
			// pumpingEpoch from a loop that has already finished but not yet "reported back".
			if (this.pumpingEpoch === epoch) this.pumpingEpoch = null;
		}
	}
}

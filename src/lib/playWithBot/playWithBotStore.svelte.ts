// src/lib/playWithBot/playWithBotStore.svelte.ts

import { logger } from '../utils/logger';
import { getPieceFromFen, deriveChessgroundDests, buildDfen } from '../../utils/fenUtils';
import * as DiceChessEngine from '@fortemate/dicechess-engine';
import type { Key } from '@lichess-org/chessground/types';
import { getDieValue } from '../../utils/fenUtils';
import { toastStore } from '../toastStore.svelte';
import {
	PlayWithBotBot,
	setBotDiceChessInstance,
	resetBotDiceChessInstance,
} from './playWithBotBot';
import { authStore } from '../authStore.svelte';
import { playDiceSound } from '../sound';
import { ROLL_ANIMATION_MS, PASS_DWELL_MS } from '../timings';
import { lastMoveKeys } from '../lastMove';

let DiceChess = (DiceChessEngine as any).DiceChess;

// Method to inject DiceChess instance for testing (exported for test use)
export function setDiceChessInstance(instance: any) {
	if (typeof window !== 'undefined') {
		(window as any)['__DiceChessInstance__'] = instance;
	}
	// Update the local reference
	DiceChess = instance;
	setBotDiceChessInstance(instance);
}

// Method to reset DiceChess instance for test isolation
export function resetDiceChessInstance() {
	if (typeof window !== 'undefined') {
		const win = window as any;
		if (win['__DiceChessOriginal__']) {
			// Restore original instance if available
			DiceChess = win['__DiceChessOriginal__'];
			win['__DiceChessInstance__'] = DiceChess;
		} else {
			// Fallback to fresh instance from engine
			DiceChess = (DiceChessEngine as any).DiceChess;
			win['__DiceChessInstance__'] = DiceChess;
		}
	}
	// Reset function doesn't need instance parameter
	// DiceChess is already set above
	resetBotDiceChessInstance();
}

import { botStatsStore } from '../botStatsStore.svelte';
import { preferencesStore } from '../preferencesStore.svelte';
import {
	saveLocalGame,
	type DiceChessTurnHistory,
	type GameEndReason,
	type LocalGameRecord,
} from '../localGamesDB';
import { PlayWithBotHistory, type BotMoveHistoryState } from './playWithBotHistory.svelte';
import { PlayWithBotDice, type DieState } from './playWithBotDice.svelte';

export type GameStatus =
	'idle' | 'rolling' | 'playing' | 'bot_thinking' | 'victory' | 'defeat' | 'draw';

export class PlayWithBotStore {
	gameStatus = $state<GameStatus>('idle');
	gameEndReason = $state<GameEndReason | null>(null);
	// `currentBoardFen`/`activeColor`/`currentDice` are read-only getters (defined further down, once
	// the `history`/`dice` sub-objects exist), derived from either these live fields or a historyMap
	// entry depending on whether the user is browsing history (see `viewedIndex`). Game logic must
	// read the private live fields (or `this.dice.currentDice`) directly — never the public getters —
	// so scrubbing history can never affect move validation or feed the bot a stale position mid-turn.
	private liveBoardFen = $state<string>('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
	private liveActiveColor = $state<'w' | 'b'>('w');
	// null = tracking live; otherwise the historyMap index currently displayed.
	private viewedIndex = $state<number | null>(null);
	playerColor = $state<'w' | 'b'>('w');
	botAlgorithm = $state<string>('greedy');
	botColor = $derived((this.playerColor === 'w' ? 'b' : 'w') as 'w' | 'b');
	pendingPromotion = $state<{
		orig: string;
		dest: string;
		color: 'w' | 'b';
		availablePieces: string[];
		dieIndex: number;
	} | null>(null);

	// Draw & Resign States
	playerCanOfferDraw = $state<boolean>(true);
	botCanOfferDraw = $state<boolean>(true);
	activeDrawOffer = $state<'player' | 'bot' | null>(null);

	// Time Control States
	timeLimit = $state<number | null>(null);
	// The human seat's external id, snapshotted when the game starts and deliberately NOT reactive.
	// `authStore.externalId` can change mid-game — the boot `refresh()` resolves asynchronously, so a
	// game begun while the session is still `loading` starts as `guest:<uuid>` and would silently
	// become `user:<uuid>` once the account arrives. Re-reading it per snapshot would leave one
	// persisted record carrying timer maps keyed by two different identities.
	private humanExternalId = '';
	timeBonus = $state<number | null>(0);
	whiteTimeLeft = $state<number>(0);
	blackTimeLeft = $state<number>(0);
	playerTimeLeft = $derived(this.playerColor === 'w' ? this.whiteTimeLeft : this.blackTimeLeft);
	botTimeLeft = $derived(this.playerColor === 'w' ? this.blackTimeLeft : this.whiteTimeLeft);

	// Game Bet and Mode States
	bet = $state<number>(0);
	baseBet = $state<number>(0);
	mode = $state<'classic' | 'x2'>('classic');
	cubeOwner = $state<'w' | 'b' | null>(null);
	activeDoubleOffer = $state<'player' | 'bot' | null>(null);
	insufficientFundsForfeit = $state<boolean>(false);
	doubleDeclined = $state<boolean>(false);

	// Training overrides
	customDfen = $state<string>('');
	parsedDfen = $derived.by(() => {
		const dfen = this.customDfen.trim();
		if (!dfen) return { fen: '', dice: '' };
		const parts = dfen.split(/\s+/);
		const lastPart = parts[parts.length - 1];
		if (parts.length >= 5 && /^[pnbrqkPNBRQK]{1,3}$/.test(lastPart)) {
			return {
				fen: parts.slice(0, parts.length - 1).join(' '),
				dice: lastPart,
			};
		}
		if (parts.length >= 7) {
			return {
				fen: parts.slice(0, 6).join(' '),
				dice: parts[6],
			};
		}
		return {
			fen: dfen,
			dice: '',
		};
	});

	private timerIntervalId: any = null;
	private lastTickTimestamp: number = 0;

	// Composed History Engine
	history = new PlayWithBotHistory();

	// Composed Dice Engine
	dice = new PlayWithBotDice();

	// Composed Bot Engine
	bot = new PlayWithBotBot();

	currentBoardFen = $derived.by<string>(() => {
		if (this.viewedIndex !== null)
			return this.historyMap[String(this.viewedIndex)]?.fen ?? this.liveBoardFen;
		return this.liveBoardFen;
	});

	activeColor = $derived.by<'w' | 'b'>(() => {
		if (this.viewedIndex !== null)
			return this.historyMap[String(this.viewedIndex)]?.active_color ?? this.liveActiveColor;
		return this.liveActiveColor;
	});

	currentDice = $derived.by<DieState[]>(() => {
		const source =
			this.viewedIndex !== null
				? (this.historyMap[String(this.viewedIndex)]?.dices ?? this.dice.currentDice)
				: this.dice.currentDice;
		return source.map((d) => ({ ...d }));
	});

	/** [from, to] to highlight on the board — every move (own or bot's) writes its historyMap
	 * entry synchronously (see completeMoveLogic), so unlike the live store there's no separate
	 * "pending, not yet confirmed" state to prefer. */
	lastMove = $derived.by<Key[] | undefined>(() => {
		const entry =
			this.viewedIndex !== null
				? this.historyMap[String(this.viewedIndex)]
				: this.historyMap[String(this.maxMoveIndex)];
		return lastMoveKeys(entry);
	});

	isViewingHistory = $derived(this.viewedIndex !== null);

	currentMoveIndex = $derived(this.viewedIndex ?? this.maxMoveIndex);

	get maxMoveIndex() {
		return this.history.maxMoveIndex;
	}
	set maxMoveIndex(v) {
		this.history.maxMoveIndex = v;
	}

	get historyMap() {
		return this.history.historyMap;
	}
	set historyMap(v) {
		this.history.historyMap = v;
	}

	get turnHistory() {
		return this.history.turnHistory;
	}
	set turnHistory(v) {
		this.history.turnHistory = v;
	}

	get currentTurnRecord() {
		return this.history.currentTurnRecord;
	}
	set currentTurnRecord(v) {
		this.history.currentTurnRecord = v;
	}

	get historyBlocks() {
		return this.history.historyBlocks;
	}

	get isAnimatingRoll() {
		return this.dice.isAnimatingRoll;
	}
	set isAnimatingRoll(v) {
		this.dice.isAnimatingRoll = v;
	}

	get availableDiceValues() {
		return this.dice.availableDiceValues;
	}

	startTime = $state<string>('');

	private readonly initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

	constructor() {
		this.bot.initializeWorker();
	}

	/** Start a new local game against the bot */
	startNewGame(colorPref: 'white' | 'black' | 'random' = 'white', algo: string = 'greedy') {
		this.botAlgorithm = algo;
		this.gameEndReason = null;
		this.stopTimer();

		// Reset draw & resign states
		this.playerCanOfferDraw = true;
		this.botCanOfferDraw = true;
		this.activeDrawOffer = null;
		this.activeDoubleOffer = null;
		this.cubeOwner = null;
		this.insufficientFundsForfeit = false;
		this.doubleDeclined = false;

		if (colorPref === 'random') {
			this.playerColor = Math.random() < 0.5 ? 'w' : 'b';
		} else {
			this.playerColor = colorPref === 'white' ? 'w' : 'b';
		}

		this.viewedIndex = null;
		const startFen = this.parsedDfen.fen || this.initialFen;
		this.liveBoardFen = startFen;
		const activeColorToken = startFen.split(/\s+/)[1];
		this.liveActiveColor = activeColorToken === 'b' ? 'b' : 'w';
		this.dice.currentDice = [];
		this.startTime = new Date().toISOString();

		// Initialize the history engine
		this.history.initializeNewGame(startFen);

		// Setup Time Limits
		this.timeLimit = preferencesStore.timeLimit;
		this.timeBonus = preferencesStore.timeBonus;
		// Fix the human identity for the whole game — see the field's declaration for why.
		this.humanExternalId = authStore.externalId;
		// For now in dicechess-play, games are played without stakes (always 0 bet).
		// In the future, stakes might be introduced for registered users.
		this.bet = 0;
		this.baseBet = 0;
		this.mode = 'classic';

		if (this.bet > 0) {
			if (authStore.user && authStore.user.balance < this.bet) {
				toastStore.error(
					'Insufficient balance! Your balance is 🪙 ' +
						authStore.user.balance +
						', but this bet requires 🪙 ' +
						this.bet +
						'.',
				);
				this.gameStatus = 'idle';
				return;
			}
			authStore.adjustBalance(-this.bet);
		}

		if (this.timeLimit !== null) {
			this.whiteTimeLeft = this.timeLimit * 60 * 1000;
			this.blackTimeLeft = this.timeLimit * 60 * 1000;
			this.startTimer();
		} else {
			this.whiteTimeLeft = 0;
			this.blackTimeLeft = 0;
		}

		if (this.liveActiveColor === this.botColor) {
			this.gameStatus = 'bot_thinking';
			setTimeout(() => {
				this.botTurn();
			}, 500);
		} else {
			this.gameStatus = 'rolling';
			this.tryAutoRoll();
		}
	}

	private tryAutoRoll() {
		if (preferencesStore.autoRollDice && this.mode !== 'x2') {
			setTimeout(() => {
				if (preferencesStore.autoRollDice && this.mode !== 'x2' && this.canUserRoll) {
					this.rollDice();
				}
			}, 500);
		}
	}

	startTimer() {
		if (this.timeLimit === null) return;
		this.stopTimer();
		this.lastTickTimestamp = Date.now();
		this.timerIntervalId = setInterval(() => {
			// Pause timers if choice overlays are open
			if (this.pendingPromotion !== null || this.activeDrawOffer !== null) {
				this.lastTickTimestamp = Date.now();
				return;
			}

			const now = Date.now();
			const delta = now - this.lastTickTimestamp;
			this.lastTickTimestamp = now;

			if (this.liveActiveColor === 'w') {
				this.whiteTimeLeft = Math.max(0, this.whiteTimeLeft - delta);
				if (this.whiteTimeLeft === 0) {
					this.handleTimeout('w');
				}
			} else {
				this.blackTimeLeft = Math.max(0, this.blackTimeLeft - delta);
				if (this.blackTimeLeft === 0) {
					this.handleTimeout('b');
				}
			}
		}, 100);
	}

	stopTimer() {
		if (this.timerIntervalId) {
			clearInterval(this.timerIntervalId);
			this.timerIntervalId = null;
		}
	}

	private checkTimeout(): boolean {
		if (this.timeLimit === null) return false;

		const currentTime = this.liveActiveColor === 'w' ? this.whiteTimeLeft : this.blackTimeLeft;
		if (currentTime <= 0) {
			this.handleTimeout(this.liveActiveColor);
			return true;
		}
		return false;
	}

	private handleTimeout(color: 'w' | 'b') {
		// Guard clause: prevent double invocation if already in terminal state
		if (['victory', 'defeat', 'draw'].includes(this.gameStatus)) {
			return;
		}

		this.stopTimer();

		this.gameEndReason = 'timeout';
		// If the timed out color is the player's color, player loses
		// If the timed out color is the bot's color, player wins
		const playerTimedOut = color === this.playerColor;

		if (playerTimedOut) {
			this.gameStatus = 'defeat';
			botStatsStore.recordResult(this.botAlgorithm, 'loss');
			toastStore.error('Defeat! You ran out of time.');
		} else {
			this.gameStatus = 'victory';
			botStatsStore.recordResult(this.botAlgorithm, 'win');
			toastStore.success('Victory! Bot ran out of time!');
		}

		if (this.currentTurnRecord) {
			this.currentTurnRecord.end_dfen = this.liveBoardFen;
			this.turnHistory.push(this.currentTurnRecord as DiceChessTurnHistory);
			this.currentTurnRecord = null;
		}

		this.saveGameRecord(playerTimedOut ? -1 : 1);
	}

	private getInitialDice(activeColor: 'w' | 'b'): DieState[] {
		const diceChars = this.parsedDfen.dice
			.toUpperCase()
			.replace(/[^PNBRQK]/g, '')
			.slice(0, 3);
		const rolled: DieState[] = diceChars.split('').map((char) => {
			let val = char.toLowerCase();
			if (activeColor === 'w') {
				val = val.toUpperCase();
			}
			return {
				value: val,
				allowed: true,
				used: false,
			};
		});
		const randomSource = this.dice.generateRandomDice(activeColor);
		let i = 0;
		while (rolled.length < 3) {
			rolled.push(randomSource[i++]);
		}
		return rolled;
	}

	endSession() {
		this.stopTimer();
		this.gameStatus = 'idle';
		this.dice.currentDice = [];
		this.liveBoardFen = this.initialFen;
		this.viewedIndex = null;
		this.history.clear();

		// Reset draw states on session end
		this.playerCanOfferDraw = true;
		this.botCanOfferDraw = true;
		this.activeDrawOffer = null;

		this.bot.terminateWorker();
	}

	/** Roll 3 random dice for Human */
	canUserRoll = $derived(
		this.gameStatus === 'rolling' &&
			this.liveActiveColor === this.playerColor &&
			!this.isAnimatingRoll &&
			this.activeDrawOffer === null &&
			this.activeDoubleOffer === null,
	);

	canUserDouble = $derived(
		this.mode === 'x2' &&
			this.gameStatus === 'rolling' &&
			this.liveActiveColor === this.playerColor &&
			!this.isAnimatingRoll &&
			(this.cubeOwner === null || this.cubeOwner === this.playerColor) &&
			this.bet < this.baseBet * 64 &&
			this.activeDrawOffer === null &&
			this.activeDoubleOffer === null &&
			authStore.user !== null &&
			authStore.user.balance >= this.bet,
	);

	/** Mirrors offerDraw()'s own guard, so the UI can disable/hide the button instead of letting
	 * a click silently no-op. */
	canUserOfferDraw = $derived(
		this.playerCanOfferDraw &&
			this.liveActiveColor === this.playerColor &&
			this.gameStatus === 'playing' &&
			this.activeDrawOffer === null,
	);

	async rollDice() {
		if (!this.canUserRoll) return;

		this.isAnimatingRoll = true;
		playDiceSound();

		let rolled: DieState[];
		if (this.parsedDfen.dice && this.history.maxMoveIndex === 0) {
			rolled = this.getInitialDice(this.liveActiveColor);
		} else {
			rolled = this.dice.generateRandomDice(this.liveActiveColor);
		}

		const gameId = this.startTime;
		this.dice.currentDice = rolled;
		await new Promise((resolve) => setTimeout(resolve, ROLL_ANIMATION_MS));
		if (this.startTime !== gameId) return;
		this.isAnimatingRoll = false;

		if (this.gameStatus !== 'rolling' || this.liveActiveColor !== this.playerColor) return;

		const allVals = rolled.map((d) => getDieValue(d));
		let hasAtLeastOneLegalMove = false;
		try {
			const uciMoves =
				DiceChess.getLegalUciMoves(buildDfen(this.liveBoardFen, allVals, this.liveActiveColor)) ||
				[];
			if (uciMoves.length > 0) {
				hasAtLeastOneLegalMove = true;
			}
		} catch (e) {
			logger.error('Error calculating legal moves for initial roll', e as Error);
		}

		this.dice.currentDice = rolled;

		this.currentTurnRecord = {
			turn_number: this.turnHistory.length + 1,
			active_color: this.playerColor === 'w' ? 'WHITE' : 'BLACK',
			start_dfen: buildDfen(this.liveBoardFen, allVals, this.playerColor),
			moves: [],
		};

		if (
			this.maxMoveIndex === 0 &&
			this.historyMap['0'] &&
			this.historyMap['0'].dices?.length === 0
		) {
			this.updateStateInHistory({
				dices: structuredClone(rolled),
			});
		} else {
			const rollIndex = this.maxMoveIndex + 1;
			const rollState: BotMoveHistoryState = {
				fen: this.liveBoardFen,
				active_color: this.playerColor,
				dices: structuredClone(rolled),
				gameMoveHistoryMove: null,
				leftTime: this.getLeftTimeMap(),
			};
			this.historyMap[String(rollIndex)] = rollState;
			this.maxMoveIndex = rollIndex;
		}

		if (!hasAtLeastOneLegalMove) {
			toastStore.info('No legal moves available. Turn forfeited!');
			this.gameStatus = 'bot_thinking';
			if (this.toggleActiveColorInFen()) {
				this.updateStateInHistory({ fen: this.liveBoardFen });
				setTimeout(() => {
					if (this.startTime !== gameId) return; // session ended/restarted during the dwell
					this.liveActiveColor = this.botColor;
					this.botTurn();
				}, PASS_DWELL_MS);
			} else {
				toastStore.error('System error: Turn transition failed.');
				this.endSession();
			}
		} else {
			this.gameStatus = 'playing';
		}
	}

	/** Cached legal moves for Chessground board — recomputed eagerly after state mutations */
	legalMovesDests = $derived.by<Map<Key, Key[]>>(() => {
		if (this.isViewingHistory) return new Map();
		if (
			this.gameStatus !== 'playing' ||
			this.liveActiveColor !== this.playerColor ||
			this.activeDrawOffer !== null
		) {
			return new Map();
		}

		const availableDice = this.availableDiceValues;

		if (availableDice.length === 0) {
			return new Map();
		}

		try {
			const fullFen = this.liveBoardFen;
			const uciMoves =
				DiceChess.getLegalUciMoves(buildDfen(fullFen, availableDice, this.liveActiveColor)) || [];
			return deriveChessgroundDests(uciMoves);
		} catch (e) {
			logger.error('Error calculating legal moves', e as Error);
			return new Map();
		}
	});

	/** Human Move Handler */
	handleBoardMove(orig: string, dest: string, _fenAfterMove?: string) {
		if (this.isViewingHistory) return;
		if (this.gameStatus !== 'playing' || this.liveActiveColor !== this.playerColor) return;

		const piece = getPieceFromFen(this.liveBoardFen, orig);
		if (!piece) return;

		const dieVal = getDieValue(piece);
		const dieIndex = this.dice.currentDice.findIndex(
			(d) => d.allowed && !d.used && getDieValue(d) === dieVal,
		);

		if (dieIndex === -1) {
			logger.error(`Could not find a valid matching die for piece ${piece}`);
			return;
		}

		this.dice.markUsed(dieIndex);

		// Handle Pawn Promotion
		const isPawn = piece.toLowerCase() === 'p';
		const isPromotion = isPawn && (dest[1] === '8' || dest[1] === '1');

		if (isPromotion) {
			// Capturing the King on the last rank is NOT a promotion: the game ends immediately, so
			// the engine emits a plain capture with no promotion variants — no popup, and no suffix
			// on the recorded UCI. A suffix here survives locally (`applyMove` ignores it) but makes
			// the analytics replay reject the whole game, which quarantines it forever (#177).
			const targetPiece = getPieceFromFen(this.liveBoardFen, dest);
			if (targetPiece && targetPiece.toLowerCase() === 'k') {
				this.completeMoveLogic(orig, dest, undefined, dieIndex);
				return;
			}

			const availableDice = this.dice.currentDice
				.filter((d, i) => d.allowed && (!d.used || i === dieIndex))
				.map((d) => getDieValue(d));

			let availablePieces = ['q', 'r', 'b', 'n'];
			try {
				if (typeof DiceChess.getLegalUciMoves === 'function') {
					const legalMoves: string[] =
						DiceChess.getLegalUciMoves(
							buildDfen(this.liveBoardFen, availableDice, this.liveActiveColor),
						) || [];
					const movePrefix = orig + dest;
					const apiPromos = legalMoves
						.filter((m) => m.startsWith(movePrefix) && m.length === 5)
						.map((m) => m[4].toLowerCase());

					if (apiPromos.length > 0) {
						// eslint-disable-next-line svelte/prefer-svelte-reactivity
						availablePieces = Array.from(new Set(apiPromos));
					}
				}
			} catch (e) {
				logger.error('Error getting promotions from legal moves', e as Error);
			}

			this.pendingPromotion = { orig, dest, color: this.playerColor, availablePieces, dieIndex };
			return;
		}

		this.completeMoveLogic(orig, dest, undefined, dieIndex);
	}

	cancelPromotion() {
		if (!this.pendingPromotion) return;
		this.dice.revertUse(this.pendingPromotion.dieIndex);
		this.pendingPromotion = null;

		// Force a board redraw by slightly mutating the FEN or relying on a redraw signal
		// to snap the piece back to its original square.
		const currentFen = this.liveBoardFen;
		this.liveBoardFen = '';
		setTimeout(() => {
			this.liveBoardFen = currentFen;
		}, 0);
	}

	/**
	 * Handle castling die consumption after a successful move.
	 * Marks the rook die as used when castling occurs.
	 */
	private handleCastlingDieConsumption(orig: string, dest: string, piece: string): void {
		// Check if this is a castling move (king moves 2 squares horizontally)
		if (
			piece.toLowerCase() === 'k' &&
			orig &&
			dest &&
			Math.abs(orig.charCodeAt(0) - dest.charCodeAt(0)) === 2
		) {
			const rookDieVal = getDieValue('r'); // Rook die value
			const rookDieIndex = this.dice.currentDice.findIndex(
				(d) => d.allowed && !d.used && getDieValue(d) === rookDieVal,
			);
			if (rookDieIndex !== -1) {
				this.dice.markUsed(rookDieIndex);
			}
		}
	}

	completePromotion(piece: string) {
		if (!this.pendingPromotion) return;
		const { orig, dest, dieIndex } = this.pendingPromotion;
		this.pendingPromotion = null;
		this.completeMoveLogic(orig, dest, piece, dieIndex);
	}

	private completeMoveLogic(
		orig: string,
		dest: string,
		promotionStr: string | undefined,
		dieIndex: number,
	) {
		const oldBoardFen = this.liveBoardFen;
		const availableDice = this.dice.currentDice
			.filter((d, i) => d.allowed && (!d.used || i === dieIndex))
			.map((d) => getDieValue(d));
		const nextBoardFenRaw = DiceChess.applyMove(
			buildDfen(this.liveBoardFen, availableDice, this.liveActiveColor),
			orig,
			dest,
			promotionStr,
		);
		if (!nextBoardFenRaw) {
			logger.error(`Engine rejected move ${orig}-${dest}`);
			this.dice.revertUse(dieIndex); // Revert die usage
			return;
		}

		// The engine's applyMove now naturally preserves the active color and fullmove.
		// We just drop the 7th field (dice pool) if it exists, as the UI tracks dice independently.
		const nextBoardFen = nextBoardFenRaw.split(/\s+/).slice(0, 6).join(' ');

		this.liveBoardFen = nextBoardFen;

		// Handle castling die consumption after successful move validation
		const pieceChar = getPieceFromFen(oldBoardFen, orig);
		if (pieceChar) {
			this.handleCastlingDieConsumption(orig, dest, pieceChar);
		}

		if (this.currentTurnRecord) {
			const isCapture = getPieceFromFen(oldBoardFen, dest) !== null;
			this.currentTurnRecord.moves?.push({
				uci: orig + dest + (promotionStr || ''),
				piece: pieceChar?.toUpperCase() || '',
				is_capture: isCapture,
				fen_after: nextBoardFen,
			});
		}

		const destPiece = getPieceFromFen(oldBoardFen, dest);
		const isVictory = destPiece?.toLowerCase() === 'k';

		const moveIndex = this.maxMoveIndex + 1;

		const newState: BotMoveHistoryState = {
			fen: nextBoardFen,
			active_color: this.playerColor,
			dices: $state.snapshot(this.dice.currentDice),
			gameMoveHistoryMove: {
				from: orig,
				to: dest,
				promotion: 'NONE',
			},
			leftTime: this.getLeftTimeMap(),
		};

		this.historyMap[String(moveIndex)] = newState;

		this.maxMoveIndex = moveIndex;

		if (isVictory) {
			this.stopTimer();
			this.gameEndReason = 'mate';
			if (this.currentTurnRecord) {
				this.currentTurnRecord.end_dfen = this.liveBoardFen;
				this.turnHistory.push(this.currentTurnRecord as DiceChessTurnHistory);
				this.currentTurnRecord = null;
			}
			setTimeout(() => {
				this.gameStatus = 'victory';
				botStatsStore.recordResult(this.botAlgorithm, 'win');
				toastStore.success('Victory! You captured the opponent king!');
				this.saveGameRecord(this.playerColor === 'w' ? 1 : -1);
			}, 800);
			return;
		}

		const hasRemainingMoves = this.legalMovesDests.size > 0;

		if (!hasRemainingMoves) {
			this.gameStatus = 'bot_thinking';
			if (this.toggleActiveColorInFen()) {
				this.updateStateInHistory({ fen: this.liveBoardFen });

				setTimeout(() => {
					this.liveActiveColor = this.botColor;
					this.botTurn();
				}, 800);
			} else {
				toastStore.error('System error: Turn transition failed.');
				this.endSession();
			}
		}
	}

	/** Greedy Bot Turn logic */
	async botTurn(bypassDoubleCheck = false) {
		if (this.gameStatus !== 'bot_thinking' || this.liveActiveColor === this.playerColor) return;

		// Bot Doubling Check
		if (
			!bypassDoubleCheck &&
			this.mode === 'x2' &&
			(this.cubeOwner === null || this.cubeOwner === this.botColor) &&
			this.bet < this.baseBet * 64
		) {
			const currentDfen = buildDfen(this.liveBoardFen, [], this.botColor);
			let botWantsToDouble = false;
			try {
				if (typeof DiceChess?.shouldBotOfferDouble === 'function') {
					botWantsToDouble = DiceChess.shouldBotOfferDouble(currentDfen, this.bet, {
						algorithm: this.botAlgorithm,
					});
				}
			} catch (e) {
				logger.error('Error checking bot offer double', e as Error);
			}

			if (botWantsToDouble) {
				if (authStore.user && authStore.user.balance < this.bet) {
					this.triggerInsufficientFundsForfeit();
					return;
				} else {
					this.activeDoubleOffer = 'bot';
					this.stopTimer();
					return;
				}
			}
		}

		// Check if bot wants to offer a draw before making its moves
		if (this.botCanOfferDraw) {
			const currentDfen = buildDfen(this.liveBoardFen, [], this.botColor);
			try {
				const wantsDraw =
					typeof DiceChess?.shouldBotOfferDraw === 'function'
						? DiceChess.shouldBotOfferDraw(currentDfen, { algorithm: this.botAlgorithm })
						: false;
				if (wantsDraw) {
					this.botCanOfferDraw = false;
					this.activeDrawOffer = 'bot';
					this.stopTimer();
					toastStore.info('The bot offers a draw!');
					return;
				}
			} catch (e) {
				logger.error('Error checking bot draw offer', e as Error);
			}
		}

		playDiceSound();

		this.isAnimatingRoll = true;

		let rolled: DieState[];
		if (this.parsedDfen.dice && this.history.maxMoveIndex === 0) {
			rolled = this.getInitialDice(this.liveActiveColor);
		} else {
			rolled = this.dice.generateRandomDice(this.liveActiveColor);
		}

		const gameId = this.startTime;
		this.dice.currentDice = rolled;
		await new Promise((resolve) => setTimeout(resolve, ROLL_ANIMATION_MS));
		if (this.startTime !== gameId) return;
		this.isAnimatingRoll = false;

		// Ensure timer is running after dice animation
		this.startTimer();

		if (this.liveActiveColor === this.playerColor) return;

		const allVals = rolled.map((d) => getDieValue(d));
		let botHasMoves = false;
		try {
			const uciMoves =
				DiceChess.getLegalUciMoves(buildDfen(this.liveBoardFen, allVals, this.liveActiveColor)) ||
				[];
			if (uciMoves.length > 0) {
				botHasMoves = true;
			}
		} catch (e) {
			logger.error('Error calculating Bot legal moves for initial roll', e as Error);
		}

		this.dice.currentDice = rolled;

		this.currentTurnRecord = {
			turn_number: this.turnHistory.length + 1,
			active_color: this.botColor === 'w' ? 'WHITE' : 'BLACK',
			start_dfen: buildDfen(this.liveBoardFen, allVals, this.botColor),
			moves: [],
		};

		const rollIndex = this.maxMoveIndex + 1;
		const rollState: BotMoveHistoryState = {
			fen: this.liveBoardFen,
			active_color: this.botColor,
			dices: structuredClone(rolled),
			gameMoveHistoryMove: null,
			leftTime: this.getLeftTimeMap(),
		};

		this.historyMap[String(rollIndex)] = rollState;
		this.maxMoveIndex = rollIndex;

		if (!botHasMoves) {
			toastStore.info('Bot has no legal moves. Turn forfeited!');
			await new Promise((resolve) => setTimeout(resolve, PASS_DWELL_MS));
			if (this.startTime !== gameId) return; // session ended/restarted during the dwell
			this.gameStatus = 'rolling';
			if (this.toggleActiveColorInFen()) {
				this.liveActiveColor = this.playerColor;
				this.updateStateInHistory({ fen: this.liveBoardFen });
				this.dice.currentDice = [];
				this.tryAutoRoll();
			} else {
				toastStore.error('System error: Turn transition failed.');
				this.endSession();
			}
			return;
		}

		const availableDice = this.availableDiceValues;

		if (availableDice.length === 0) return;

		// Race bot thinking against timeout using Promise.race
		// Check timeout every 500ms during bot thinking
		const clock =
			this.timeLimit !== null
				? { remainingMs: this.botTimeLeft, incrementMs: (this.timeBonus ?? 0) * 1000 }
				: undefined;
		const botMovePromise = this.bot.selectBestMove(
			this.liveBoardFen,
			availableDice,
			this.botAlgorithm,
			clock,
		);

		let checkInterval: ReturnType<typeof setInterval> | null = null;
		let statusCheckInterval: ReturnType<typeof setInterval> | null = null;

		const timeoutCheckPromise = new Promise<never>((_, reject) => {
			checkInterval = setInterval(() => {
				if (this.checkTimeout()) {
					if (checkInterval) clearInterval(checkInterval);
					if (statusCheckInterval) clearInterval(statusCheckInterval);
					reject(new Error('Timeout during bot thinking'));
				}
			}, 500);

			// Also reject if game status changes
			statusCheckInterval = setInterval(() => {
				if (this.gameStatus !== 'bot_thinking') {
					if (checkInterval) clearInterval(checkInterval);
					if (statusCheckInterval) clearInterval(statusCheckInterval);
					reject(new Error('Game status changed'));
				}
			}, 100);
		});

		let botMoves;
		try {
			botMoves = await Promise.race([botMovePromise, timeoutCheckPromise]);
		} catch (e) {
			// Timeout or game status changed - abort bot turn
			logger.info('Bot turn aborted:', (e as Error).message);
			if (checkInterval) clearInterval(checkInterval);
			if (statusCheckInterval) clearInterval(statusCheckInterval);
			return;
		} finally {
			if (checkInterval) clearInterval(checkInterval);
			if (statusCheckInterval) clearInterval(statusCheckInterval);
		}

		for (const move of botMoves) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			if (
				(this.gameStatus as GameStatus) === 'defeat' ||
				(this.gameStatus as GameStatus) === 'victory'
			)
				return;

			// Check for timeout during bot move execution
			if (this.checkTimeout()) return;

			const movingPiece = getPieceFromFen(this.liveBoardFen, move.from);
			if (!movingPiece) continue;

			const dieVal = getDieValue(movingPiece);
			const botDieIndex = this.dice.currentDice.findIndex(
				(d) => d.allowed && !d.used && getDieValue(d) === dieVal,
			);

			if (botDieIndex !== -1) {
				this.dice.markUsed(botDieIndex);
			}

			const prevBoard = this.liveBoardFen;
			const dfenBefore = buildDfen(
				this.liveBoardFen,
				this.dice.currentDice
					.filter((d, i) => d.allowed && (!d.used || i === botDieIndex))
					.map((d) => getDieValue(d)),
				this.liveActiveColor,
			);
			const nextBoardFenRaw = DiceChess.applyMove(
				dfenBefore,
				move.from,
				move.to,
				move.promotion || undefined,
			);
			if (!nextBoardFenRaw) {
				logger.error(`Engine rejected bot move ${move.from}-${move.to}`);
				if (botDieIndex !== -1) {
					this.dice.revertUse(botDieIndex); // Revert die usage
				}
				break; // Terminate bot move loop on error
			}

			// The engine's applyMove now naturally preserves the active color and fullmove.
			// We just drop the 7th field (dice pool) if it exists, as the UI tracks dice independently.
			const nextBoardFen = nextBoardFenRaw.split(/\s+/).slice(0, 6).join(' ');

			this.liveBoardFen = nextBoardFen;

			// Handle castling die consumption for bot moves
			this.handleCastlingDieConsumption(move.from, move.to, movingPiece);

			if (this.currentTurnRecord) {
				const pieceChar = movingPiece;
				const isCapture = getPieceFromFen(prevBoard, move.to) !== null;
				this.currentTurnRecord.moves?.push({
					uci: move.from + move.to + (move.promotion || ''),
					piece: pieceChar?.toUpperCase() || '',
					is_capture: isCapture,
					fen_after: nextBoardFen,
				});
			}

			const destPiece = getPieceFromFen(prevBoard, move.to);
			const isKingCaptured = destPiece?.toLowerCase() === 'k';

			const moveIndex = this.maxMoveIndex + 1;

			const newState: BotMoveHistoryState = {
				fen: nextBoardFen,
				active_color: this.botColor,
				dices: $state.snapshot(this.dice.currentDice),
				gameMoveHistoryMove: {
					from: move.from,
					to: move.to,
					promotion: move.promotion || 'NONE',
				},
				leftTime: this.getLeftTimeMap(),
			};

			this.historyMap[String(moveIndex)] = newState;
			this.maxMoveIndex = moveIndex;

			if (isKingCaptured) {
				this.stopTimer();
				this.gameEndReason = 'mate';
				if (this.currentTurnRecord) {
					this.currentTurnRecord.end_dfen = this.liveBoardFen;
					this.turnHistory.push(this.currentTurnRecord as DiceChessTurnHistory);
					this.currentTurnRecord = null;
				}
				await new Promise((resolve) => setTimeout(resolve, 800));
				this.gameStatus = 'defeat';
				botStatsStore.recordResult(this.botAlgorithm, 'loss');
				toastStore.error('Defeat! The bot captured your king.');
				this.saveGameRecord(this.playerColor === 'w' ? -1 : 1);
				return;
			}
		}

		this.gameStatus = 'rolling';
		if (this.toggleActiveColorInFen()) {
			this.liveActiveColor = this.playerColor;
			this.updateStateInHistory({ fen: this.liveBoardFen });
			this.dice.currentDice = [];
			this.tryAutoRoll();
		} else {
			toastStore.error('System error: Turn transition failed.');
			this.endSession();
		}
	}

	setMoveIndex(index: number) {
		if (index < 0 || index > this.maxMoveIndex) return;
		// A pending promotion is an in-progress move — its die is already consumed and its
		// orig/dest are fixed, so there's nothing to gain from seeing the live board before it
		// resolves. Mirrors liveGameStore's equivalent guard. Deliberately NOT extended to
		// activeDrawOffer/activeDoubleOffer: offerDraw/offerDouble already read the private
		// liveBoardFen directly (a scrub can't affect their AI decision either way), and blocking
		// navigation there would trap the user in a historical view exactly when they'd want to
		// check the live position before accepting or declining.
		if (this.pendingPromotion !== null) return;
		this.viewedIndex = index === this.maxMoveIndex ? null : index;
	}

	resignGame() {
		if (this.gameStatus === 'idle' || ['victory', 'defeat', 'draw'].includes(this.gameStatus))
			return;
		this.stopTimer();
		this.gameEndReason = 'resign';
		this.gameStatus = 'defeat';
		botStatsStore.recordResult(this.botAlgorithm, 'loss');
		toastStore.info('You resigned from this game.');
		if (this.currentTurnRecord) {
			this.currentTurnRecord.end_dfen = this.liveBoardFen;
			this.turnHistory.push(this.currentTurnRecord as DiceChessTurnHistory);
			this.currentTurnRecord = null;
		}
		this.saveGameRecord(this.playerColor === 'w' ? -1 : 1);
	}

	async offerDraw() {
		if (
			!this.playerCanOfferDraw ||
			this.liveActiveColor !== this.playerColor ||
			this.gameStatus !== 'playing'
		) {
			return;
		}

		const gameId = this.startTime;
		this.playerCanOfferDraw = false;
		this.activeDrawOffer = 'player';
		toastStore.info('Offering a draw...');

		// Simulate bot thinking time
		await new Promise((resolve) => setTimeout(resolve, 1200));

		// If game session changed, abort silently without modifying new game state
		if (this.startTime !== gameId) {
			return;
		}

		// If game state changed during delay (e.g. user resigned)
		if (this.gameStatus !== 'playing') {
			this.activeDrawOffer = null;
			return;
		}

		const currentDfen = buildDfen(this.liveBoardFen, this.availableDiceValues, this.playerColor);
		let botAccepts = false;
		try {
			if (typeof DiceChess?.shouldBotAcceptDraw === 'function') {
				botAccepts = DiceChess.shouldBotAcceptDraw(currentDfen, { algorithm: this.botAlgorithm });
			}
		} catch (e) {
			logger.error('Error checking bot accept draw', e as Error);
		}

		this.activeDrawOffer = null;

		if (botAccepts) {
			toastStore.success('The bot accepted the draw offer! 🤝');
			this.triggerDrawEnd();
		} else {
			toastStore.error('The bot declined the draw offer.');
		}
	}

	acceptBotDraw() {
		if (this.activeDrawOffer !== 'bot') return;
		toastStore.success('You accepted the draw offer.');
		this.activeDrawOffer = null;
		this.triggerDrawEnd();
	}

	declineBotDraw() {
		if (this.activeDrawOffer !== 'bot') return;
		toastStore.info('You declined the draw offer.');
		this.activeDrawOffer = null;
		this.playerCanOfferDraw = true; // Player regains ability to offer draw

		// Resume the timer and bot's turn
		this.startTimer();
		this.botTurn();
	}

	async offerDouble() {
		if (!this.canUserDouble) return;

		const gameId = this.startTime;
		this.stopTimer();
		this.activeDoubleOffer = 'player';
		toastStore.info('Offering double to bot...');

		await new Promise((resolve) => setTimeout(resolve, 1200));

		if (this.startTime !== gameId) {
			return;
		}

		if (
			this.gameStatus !== 'rolling' ||
			this.liveActiveColor !== this.playerColor ||
			this.activeDoubleOffer !== 'player'
		) {
			this.activeDoubleOffer = null;
			this.startTimer();
			return;
		}

		const proposedBet = 2 * this.bet;
		const currentDfen = buildDfen(this.liveBoardFen, [], this.playerColor);
		let botAccepts = false;
		try {
			if (typeof DiceChess?.shouldBotAcceptDouble === 'function') {
				botAccepts = DiceChess.shouldBotAcceptDouble(currentDfen, proposedBet, {
					algorithm: this.botAlgorithm,
				});
			}
		} catch (e) {
			logger.error('Error checking bot accept double', e as Error);
		}

		this.activeDoubleOffer = null;

		if (botAccepts) {
			toastStore.success('The bot accepted the double! 🎲');
			const increment = this.bet;
			this.bet = proposedBet;
			authStore.adjustBalance(-increment);
			this.cubeOwner = this.botColor;
			this.startTimer();
		} else {
			toastStore.info('The bot declined the double and resigned.');
			this.triggerDoubleDeclinedVictory();
		}
	}

	acceptBotDouble() {
		if (this.activeDoubleOffer !== 'bot') return;
		toastStore.success('You accepted the double! 🎲');
		const increment = this.bet;
		this.bet = 2 * this.bet;
		authStore.adjustBalance(-increment);
		this.cubeOwner = this.playerColor;
		this.activeDoubleOffer = null;
		this.startTimer();
		this.botTurn(true);
	}

	declineBotDouble() {
		if (this.activeDoubleOffer !== 'bot') return;
		toastStore.info('You declined the double and resigned.');
		this.activeDoubleOffer = null;
		this.doubleDeclined = true;
		this.triggerDoubleDeclinedDefeat();
	}

	private triggerDoubleDeclinedVictory() {
		this.stopTimer();
		this.gameEndReason = 'resign';
		this.gameStatus = 'victory';
		botStatsStore.recordResult(this.botAlgorithm, 'win');

		if (this.currentTurnRecord) {
			this.currentTurnRecord.end_dfen = this.liveBoardFen;
			this.turnHistory.push(this.currentTurnRecord as DiceChessTurnHistory);
			this.currentTurnRecord = null;
		}

		this.saveGameRecord(this.playerColor === 'w' ? 1 : -1);
	}

	private triggerDoubleDeclinedDefeat() {
		this.stopTimer();
		this.gameEndReason = 'resign';
		this.gameStatus = 'defeat';
		botStatsStore.recordResult(this.botAlgorithm, 'loss');

		if (this.currentTurnRecord) {
			this.currentTurnRecord.end_dfen = this.liveBoardFen;
			this.turnHistory.push(this.currentTurnRecord as DiceChessTurnHistory);
			this.currentTurnRecord = null;
		}

		this.saveGameRecord(this.playerColor === 'w' ? -1 : 1);
	}

	private triggerInsufficientFundsForfeit() {
		this.stopTimer();
		this.insufficientFundsForfeit = true;
		this.gameEndReason = 'resign';
		this.gameStatus = 'defeat';
		botStatsStore.recordResult(this.botAlgorithm, 'loss');
		toastStore.error(
			'The bot offered a double, but you have insufficient funds to accept. Automatic forfeit!',
		);

		if (this.currentTurnRecord) {
			this.currentTurnRecord.end_dfen = this.liveBoardFen;
			this.turnHistory.push(this.currentTurnRecord as DiceChessTurnHistory);
			this.currentTurnRecord = null;
		}

		this.saveGameRecord(this.playerColor === 'w' ? -1 : 1);
	}

	private triggerDrawEnd() {
		this.stopTimer();
		this.gameStatus = 'draw';
		this.gameEndReason = 'agreement';

		if (this.currentTurnRecord) {
			this.currentTurnRecord.end_dfen = this.liveBoardFen;
			this.turnHistory.push(this.currentTurnRecord as DiceChessTurnHistory);
			this.currentTurnRecord = null;
		}

		this.saveGameRecord(0);
	}

	private getLeftTimeMap(): { [playerId: string]: number } {
		if (this.timeLimit === null) return {};
		// The identity fixed at game start, in play-api's vocabulary — `guest:<uuid>` or `user:<uuid>`.
		// This used to build `user:${authStore.user.id}`, which produced `user:guest` for every
		// anonymous game because the store was a stub whose id was the literal string "guest". The
		// fallback covers a timer map requested before any game started; it cannot happen today
		// (`timeLimit === null` returns above) but leaves nothing keyed by an empty string if it ever
		// does.
		const humanId = this.humanExternalId || authStore.externalId;
		const whiteId = this.playerColor === 'w' ? humanId : `bot:${this.botAlgorithm}`;
		const blackId = this.playerColor === 'b' ? humanId : `bot:${this.botAlgorithm}`;
		return {
			[whiteId]: this.whiteTimeLeft,
			[blackId]: this.blackTimeLeft,
		};
	}

	private toggleActiveColorInFen(): boolean {
		const nextFen = DiceChess.endTurn(this.liveBoardFen);
		if (nextFen) {
			if (this.timeBonus && this.timeLimit !== null) {
				if (this.liveActiveColor === 'w') {
					this.whiteTimeLeft += this.timeBonus * 1000;
				} else {
					this.blackTimeLeft += this.timeBonus * 1000;
				}
			}
			this.liveBoardFen = nextFen.split(/\s+/).slice(0, 6).join(' ');
			this.liveActiveColor = this.liveActiveColor === 'w' ? 'b' : 'w';

			if (this.currentTurnRecord) {
				this.currentTurnRecord.end_dfen = this.liveBoardFen;
				this.turnHistory.push(this.currentTurnRecord as DiceChessTurnHistory);
				this.currentTurnRecord = null;
			}
			return true;
		} else {
			logger.error('Failed to end turn via DiceChess.endTurn');
			return false;
		}
	}

	private updateStateInHistory(update: Partial<BotMoveHistoryState>) {
		const state = this.historyMap[String(this.maxMoveIndex)];
		if (state) {
			Object.assign(state, update);
		}
	}

	private async saveGameRecord(result: number) {
		try {
			const gameRecord: LocalGameRecord = {
				id:
					typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
						? crypto.randomUUID()
						: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
				bot_id: `bot:${this.botAlgorithm}`,
				player_color: this.playerColor === 'w' ? 'WHITE' : 'BLACK',
				result,
				start_time: this.startTime,
				sync_status: 'pending',
				moves_history: $state.snapshot(this.turnHistory),
				end_reason: this.gameEndReason,
				time_limit: this.timeLimit,
				time_bonus: this.timeBonus,
				bet: this.bet,
				mode: this.mode,
			};
			await saveLocalGame(gameRecord);
			logger.info('Game successfully saved to IndexedDB');

			// Adjust player balance based on result if there is a bet
			if (this.bet > 0) {
				const playerWon =
					(this.playerColor === 'w' && result === 1) || (this.playerColor === 'b' && result === -1);
				if (playerWon) {
					authStore.adjustBalance(2 * this.bet);
				} else if (result === 0) {
					authStore.adjustBalance(this.bet);
				}
			}
		} catch (e) {
			logger.error('Failed to save local game record', e as Error);
		}
	}
}

export const playWithBotStore = new PlayWithBotStore();

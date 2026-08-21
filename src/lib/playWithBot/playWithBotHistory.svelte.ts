// src/lib/playWithBot/playWithBotHistory.svelte.ts

import type { TurnBlock } from '../types';
import type { DiceChessTurnHistory } from '../localGamesDB';
import { buildTurnBlocks } from './turnBlocks';

/**
 * State representing a single move position in the bot-play history map.
 */
export interface BotMoveHistoryState {
	fen: string;
	active_color: 'w' | 'b';
	dices: { value: string; allowed: boolean; used: boolean }[];
	gameMoveHistoryMove: { from: string; to: string; promotion: string } | null;
	leftTime?: { [playerId: string]: number };
}

/**
 * PlayWithBotHistory manages full offline game history, navigability, and
 * turn grouping logs, isolated from UI and coordinating controllers.
 */
export class PlayWithBotHistory {
	/** The reactive map correlating move indices with their corresponding board and dice states. */
	historyMap = $state<Record<string, BotMoveHistoryState>>({});

	/** The highest move index reached in the active game. */
	maxMoveIndex = $state<number>(0);

	/** A log of finished turns registered during this game session. */
	turnHistory = $state<DiceChessTurnHistory[]>([]);

	/** The active, partially completed turn record. */
	currentTurnRecord = $state<Partial<DiceChessTurnHistory> | null>(null);

	/**
	 * Initializes state and sets up starting position for a new local game.
	 * @param initialFen The starting FEN position.
	 */
	initializeNewGame(initialFen: string) {
		this.maxMoveIndex = 0;
		this.turnHistory = [];
		this.currentTurnRecord = null;
		this.historyMap = {
			'0': {
				fen: initialFen,
				active_color: 'w',
				dices: [],
				gameMoveHistoryMove: null,
			},
		};
	}

	/**
	 * Resets all history registers.
	 */
	clear() {
		this.historyMap = {};
		this.maxMoveIndex = 0;
		this.turnHistory = [];
		this.currentTurnRecord = null;
	}

	/**
	 * A derived reactive getter that groups micro-move history records
	 * into clean, multi-move visual blocks for Svelte components.
	 */
	historyBlocks = $derived.by<TurnBlock[]>(() =>
		buildTurnBlocks(this.historyMap, this.maxMoveIndex),
	);
}

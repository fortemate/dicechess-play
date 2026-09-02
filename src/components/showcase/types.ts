import type { Key } from '@lichess-org/chessground/types';
import type { DieState } from '$lib/playWithBot/playWithBotDice.svelte';

export type ShowcaseColor = 'w' | 'b';

export interface ShowcasePlayerInfo {
	name: string;
	sub: string;
	bot?: boolean;
	active?: boolean;
	thinking?: boolean;
	clockMs?: number;
	rating?: number;
	href?: string;
}

export type ShowcaseStateKind =
	'open' | 'claiming' | 'live-player' | 'live-spectator' | 'reconnecting' | 'finishing' | 'reset';

export interface ShowcaseStateOpen {
	kind: 'open';
	assignedColor: ShowcaseColor;
	timeControl?: string;
	topPlayer: ShowcasePlayerInfo;
	bottomPlayer: ShowcasePlayerInfo;
	boardFen: string;
	clocks: { topMs: number; bottomMs: number };
}

export interface ShowcaseStateClaiming {
	kind: 'claiming';
	assignedColor: ShowcaseColor;
	timeControl?: string;
	topPlayer: ShowcasePlayerInfo;
	bottomPlayer: ShowcasePlayerInfo;
	boardFen: string;
	clocks: { topMs: number; bottomMs: number };
}

export interface ShowcaseStateLivePlayer {
	kind: 'live-player';
	playerColor: ShowcaseColor;
	activeColor: ShowcaseColor;
	topPlayer: ShowcasePlayerInfo;
	bottomPlayer: ShowcasePlayerInfo;
	boardFen: string;
	clocks: { topMs: number; bottomMs: number };
	dice: DieState[];
	legalMovesDests?: Map<Key, Key[]>;
	lastMove?: Key[];
}

export interface ShowcaseStateLiveSpectator {
	kind: 'live-spectator';
	activeColor: ShowcaseColor;
	topPlayer: ShowcasePlayerInfo;
	bottomPlayer: ShowcasePlayerInfo;
	boardFen: string;
	clocks: { topMs: number; bottomMs: number };
	dice: DieState[];
	lastMove?: Key[];
}

export interface ShowcaseStateReconnecting {
	kind: 'reconnecting';
	attempt: number;
	maxAttempts: number;
	topPlayer: ShowcasePlayerInfo;
	bottomPlayer: ShowcasePlayerInfo;
	boardFen: string;
	clocks: { topMs: number; bottomMs: number };
	playerColor?: ShowcaseColor;
	dice?: DieState[];
	lastMove?: Key[];
}

export interface ShowcaseStateFinishing {
	kind: 'finishing';
	winner?: ShowcaseColor | 'draw';
	reason?: 'mate' | 'resign' | 'timeout' | 'draw' | string;
	winnerName?: string;
	topPlayer: ShowcasePlayerInfo;
	bottomPlayer: ShowcasePlayerInfo;
	boardFen: string;
	clocks: { topMs: number; bottomMs: number };
	playerColor?: ShowcaseColor;
	dice?: DieState[];
	lastMove?: Key[];
	countdownSeconds: number;
}

export interface ShowcaseStateReset {
	kind: 'reset';
	countdownSeconds: number;
	topPlayer: ShowcasePlayerInfo;
	bottomPlayer: ShowcasePlayerInfo;
	boardFen: string;
	clocks: { topMs: number; bottomMs: number };
}

export type ShowcaseState =
	| ShowcaseStateOpen
	| ShowcaseStateClaiming
	| ShowcaseStateLivePlayer
	| ShowcaseStateLiveSpectator
	| ShowcaseStateReconnecting
	| ShowcaseStateFinishing
	| ShowcaseStateReset;

export type ShowcaseIntent =
	| { type: 'claim'; color: ShowcaseColor }
	| { type: 'resign' }
	| { type: 'retry' }
	| { type: 'reset-now' }
	| { type: 'move'; orig: string; dest: string }
	| { type: 'navigate-play' };

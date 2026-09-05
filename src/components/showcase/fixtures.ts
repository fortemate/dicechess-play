import type {
	ShowcaseStateUnavailable,
	ShowcaseStateOpen,
	ShowcaseStateClaiming,
	ShowcaseStateLivePlayer,
	ShowcaseStateLiveSpectator,
	ShowcaseStateReconnecting,
	ShowcaseStateFinishing,
	ShowcaseStateReset,
	ShowcaseState,
} from './types';

export const INITIAL_BOARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const MIDGAME_BOARD_FEN =
	'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 5';
export const CHECKMATE_BOARD_FEN = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

export const fixtureOpenWhite: ShowcaseStateOpen = {
	kind: 'open',
	assignedColor: 'w',
	timeControl: '5 + 3 Blitz',
	topPlayer: {
		name: 'DeepDiceBot',
		sub: 'Open seat',
		bot: true,
	},
	bottomPlayer: {
		name: 'You (Guest)',
		sub: 'Assigned color · Claimable',
	},
	boardFen: INITIAL_BOARD_FEN,
	clocks: { topMs: 300000, bottomMs: 300000 },
};

export const fixtureOpenBlack: ShowcaseStateOpen = {
	kind: 'open',
	assignedColor: 'b',
	timeControl: '5 + 3 Blitz',
	topPlayer: {
		name: 'DeepDiceBot',
		sub: 'Open seat',
		bot: true,
	},
	bottomPlayer: {
		name: 'You (Guest)',
		sub: 'Assigned color · Claimable',
	},
	boardFen: INITIAL_BOARD_FEN,
	clocks: { topMs: 300000, bottomMs: 300000 },
};

export const fixtureClaiming: ShowcaseStateClaiming = {
	kind: 'claiming',
	assignedColor: 'w',
	timeControl: '5 + 3 Blitz',
	topPlayer: {
		name: 'Waiting for challenger',
		sub: 'Connecting…',
		bot: true,
	},
	bottomPlayer: {
		name: 'You (Guest)',
		sub: 'Reserving seat…',
	},
	boardFen: INITIAL_BOARD_FEN,
	clocks: { topMs: 300000, bottomMs: 300000 },
};

export const fixtureLivePlayerWhiteTurn: ShowcaseStateLivePlayer = {
	kind: 'live-player',
	playerColor: 'w',
	activeColor: 'w',
	topPlayer: {
		name: 'DeepDiceBot',
		sub: 'Playing as Black',
		bot: true,
		rating: 1850,
		active: false,
	},
	bottomPlayer: {
		name: 'You (White)',
		sub: 'Your turn to move',
		rating: 1720,
		active: true,
	},
	boardFen: MIDGAME_BOARD_FEN,
	clocks: { topMs: 285000, bottomMs: 290000 },
	dice: [
		{ value: 'N', allowed: true, used: false },
		{ value: 'B', allowed: true, used: false },
		{ value: 'P', allowed: true, used: true },
	],
	lastMove: ['g1', 'f3'],
};

export const fixtureLivePlayerBlackTurn: ShowcaseStateLivePlayer = {
	kind: 'live-player',
	playerColor: 'w',
	activeColor: 'b',
	topPlayer: {
		name: 'DeepDiceBot',
		sub: 'Opponent thinking',
		bot: true,
		rating: 1850,
		active: true,
		thinking: true,
	},
	bottomPlayer: {
		name: 'You (White)',
		sub: 'Opponent thinking',
		rating: 1720,
		active: false,
	},
	boardFen: MIDGAME_BOARD_FEN,
	clocks: { topMs: 270000, bottomMs: 290000 },
	dice: [
		{ value: 'R', allowed: true, used: false },
		{ value: 'Q', allowed: true, used: false },
		{ value: 'P', allowed: true, used: false },
	],
	lastMove: ['d2', 'd4'],
};

/** Same seat as the White-turn fixture, captured mid-roll: mounts with the dice tumbling. */
export const fixtureLivePlayerRolling: ShowcaseStateLivePlayer = {
	...fixtureLivePlayerWhiteTurn,
	rolling: true,
	dice: [
		{ value: 'N', allowed: true, used: false },
		{ value: 'B', allowed: true, used: false },
		{ value: 'P', allowed: true, used: false },
	],
};

export const fixtureLiveSpectator: ShowcaseStateLiveSpectator = {
	kind: 'live-spectator',
	activeColor: 'w',
	topPlayer: {
		name: 'GrandmasterDice',
		sub: 'Black Seat',
		rating: 2100,
		active: false,
	},
	bottomPlayer: {
		name: 'DiceTactician',
		sub: 'White Seat',
		rating: 2050,
		active: true,
	},
	boardFen: MIDGAME_BOARD_FEN,
	clocks: { topMs: 180000, bottomMs: 210000 },
	dice: [
		{ value: 'K', allowed: true, used: false },
		{ value: 'B', allowed: true, used: true },
		{ value: 'P', allowed: true, used: false },
	],
	lastMove: ['c8', 'e6'],
};

export const fixtureReconnecting: ShowcaseStateReconnecting = {
	kind: 'reconnecting',
	attempt: 2,
	maxAttempts: 5,
	playerColor: 'w',
	topPlayer: {
		name: 'DeepDiceBot',
		sub: 'Disconnected',
		bot: true,
		rating: 1850,
	},
	bottomPlayer: {
		name: 'You (White)',
		sub: 'Disconnected',
		rating: 1720,
	},
	boardFen: MIDGAME_BOARD_FEN,
	clocks: { topMs: 240000, bottomMs: 210000 },
	dice: [
		{ value: 'N', allowed: true, used: false },
		{ value: 'B', allowed: true, used: false },
		{ value: 'P', allowed: true, used: false },
	],
};

export const fixtureFinishingMate: ShowcaseStateFinishing = {
	kind: 'finishing',
	winner: 'b',
	winnerName: 'Black',
	reason: 'mate',
	playerColor: 'w',
	topPlayer: {
		name: 'DeepDiceBot',
		sub: 'Victor',
		bot: true,
		rating: 1865,
	},
	bottomPlayer: {
		name: 'You (White)',
		sub: 'Checkmated',
		rating: 1705,
	},
	boardFen: CHECKMATE_BOARD_FEN,
	clocks: { topMs: 140000, bottomMs: 195000 },
	dice: [
		{ value: 'Q', allowed: true, used: true },
		{ value: 'R', allowed: true, used: true },
		{ value: 'B', allowed: true, used: false },
	],
	lastMove: ['d8', 'h4'],
	countdownSeconds: 12,
};

export const fixtureFinishingDraw: ShowcaseStateFinishing = {
	kind: 'finishing',
	winner: 'draw',
	reason: 'draw',
	playerColor: 'w',
	topPlayer: {
		name: 'DeepDiceBot',
		sub: 'Drawn',
		bot: true,
		rating: 1850,
	},
	bottomPlayer: {
		name: 'You (White)',
		sub: 'Drawn',
		rating: 1720,
	},
	boardFen: MIDGAME_BOARD_FEN,
	clocks: { topMs: 80000, bottomMs: 95000 },
	dice: [
		{ value: 'N', allowed: true, used: true },
		{ value: 'K', allowed: true, used: true },
		{ value: 'P', allowed: true, used: false },
	],
	countdownSeconds: 8,
};

export const fixtureReset: ShowcaseStateReset = {
	kind: 'reset',
	countdownSeconds: 5,
	topPlayer: {
		name: 'Resetting table…',
		sub: 'Alternating seat',
	},
	bottomPlayer: {
		name: 'Next game',
		sub: 'Readying pieces',
	},
	boardFen: INITIAL_BOARD_FEN,
	clocks: { topMs: 300000, bottomMs: 300000 },
};

export const fixtureUnavailable: ShowcaseStateUnavailable = {
	kind: 'unavailable',
	reason: 'bot_unavailable',
	timeControl: '5 + 3 Blitz',
	topPlayer: {
		name: 'DeepDiceBot',
		sub: 'Unavailable',
		bot: true,
	},
	bottomPlayer: {
		name: 'You (Guest)',
		sub: 'Unavailable',
	},
	boardFen: INITIAL_BOARD_FEN,
	clocks: { topMs: 300000, bottomMs: 300000 },
};

export const allFixtures: Record<string, ShowcaseState> = {
	unavailable: fixtureUnavailable,
	'open-white': fixtureOpenWhite,
	'open-black': fixtureOpenBlack,
	claiming: fixtureClaiming,
	'live-player-white-turn': fixtureLivePlayerWhiteTurn,
	'live-player-black-turn': fixtureLivePlayerBlackTurn,
	'live-player-rolling': fixtureLivePlayerRolling,
	'live-spectator': fixtureLiveSpectator,
	reconnecting: fixtureReconnecting,
	'finishing-mate': fixtureFinishingMate,
	'finishing-draw': fixtureFinishingDraw,
	reset: fixtureReset,
};

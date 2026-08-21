// Wire types for the play-api live protocol — a frozen mirror of the server's JSON
// (dicechess-play-api). Do not "clean these up": they must match the server's codecs exactly.

export type Seat = 'White' | 'Black';

export type Termination = 'KingCaptured' | 'Resign' | 'Draw' | 'Aborted' | 'Timeout';

export type GameResultWire = { Win: { side: Seat } } | { Draw: Record<string, never> };

export interface Over {
	result: GameResultWire;
	termination: Termination;
}

export type GameStatusWire = { Active: Record<string, never> } | { Ended: { over: Over } };

// Remaining time per side, in milliseconds, as of the carrying event. `null` for an unlimited game.
export interface Clocks {
	white: number;
	black: number;
}

// A game's time control, chosen at creation (mirrors the server's TimeControl ADT). Omitting it on
// create no longer means Unlimited: on every path a human can be seated (POST /lobby/seeks,
// /bot/seeks, /games) the server fills in Fischer 600+10, so a clockless public game can only happen
// by asking for `Unlimited` by name (play-api#185, this repo's #99).
export type TimeControl =
	| { Unlimited: Record<string, never> }
	| { SuddenDeath: { initialSeconds: number } }
	| { Fischer: { initialSeconds: number; incrementSeconds: number } }
	| { PerMove: { secondsPerMove: number } };

// Whether a participant is a human or a bot — the public taxonomy the lobby and boards render.
export type PlayerKind = 'Human' | 'Bot';

// The public face of a participant: bots carry their team-qualified display name; humans stay
// anonymous (guest ids are private and never on the wire).
export interface PublicPlayer {
	kind: PlayerKind;
	name: string | null;
	// The seat's settled rating as of game start (play-api #290), frozen for the game's duration
	// like the name. Optional for wire evolution AND because it never rides on an anonymous face —
	// absent means "the server does not say" (no persistence, a guest, or an unrated participant),
	// never "unrated" or "zero". Same rule as Seek.rated below: only badge/display an explicit value.
	rating?: number;
}

// Both seats' public faces, carried on the game state.
export interface Players {
	white: PublicPlayer;
	black: PublicPlayer;
}

// Pending draw offer state on the public game state (play-api #327).
export interface DrawOffer {
	pending: boolean;
}

export interface PublicGameState {
	version: number;
	dfen: string;
	activeSeat: Seat;
	dicePending: boolean;
	status: GameStatusWire;
	clocks: Clocks | null;
	// Optional so a pre-players server still parses; the current server always sends it.
	players?: Players | null;
	// Whether this game counts toward rating (play-api #290). Optional for wire evolution only:
	// every room emits it, but absence must mean "the server does not say", NEVER "casual" — same
	// rule as Seek.rated. No per-seat rating delta rides on GameEnded: rating application is an
	// asynchronous batch job, so the client refetches the profile after the game ends instead of
	// being handed a number the server would have to invent.
	rated?: boolean;
	// Turn-anchored draw offer state (play-api #327). `drawOffer` is present during the pre-roll gate
	// when an offer is pending for `activeSeat`. `mayOfferDraw` is false when the alternation rule
	// forbids `activeSeat` from offering (e.g. after having just offered a declined draw).
	drawOffer?: DrawOffer | null;
	mayOfferDraw?: boolean | null;
}

// One completed turn, replayed to a (re)joining client in a Snapshot so its move history starts at
// move 1 rather than at connect time. `dice` is the roll; `moves` are the UCI micro-moves played
// (empty for a forced pass); `fenAfter` is the resulting position (mirrors TurnPlayed.fenAfter).
export interface SnapshotTurn {
	seat: Seat;
	dice: number[];
	moves: string[];
	fenAfter: string;
}

// Server -> client events on the game WebSocket, discriminated by the (single) case-name key,
// each carrying a monotonic version `v`.
export type ServerEvent =
	// Optional so a pre-history server still parses; the current server always sends it.
	| { Snapshot: { v: number; state: PublicGameState; history?: SnapshotTurn[] } }
	| { DiceRolled: { v: number; seat: Seat; dice: number[]; dfen: string; clocks: Clocks | null } }
	| { TurnPlayed: { v: number; seat: Seat; moves: string[]; fenAfter: string } }
	| { DrawOffered: { v: number; by: Seat } }
	| { DrawDeclined: { v: number; by: Seat } }
	| { GameEnded: { v: number; over: Over } }
	| { Rejected: { v: number; seat: Seat; reason: string } };

// Client -> server commands.
export type ClientCommand =
	| { SubmitTurn: { moves: string[]; offerDraw?: boolean } }
	| { RespondDraw: { accept: boolean } }
	| { SubmitSeed: { seed: string } } // post-commit dice entropy, sent on join (see Provably-Fair Dice)
	| { Resign: Record<string, never> };

export interface SeatToken {
	seat: Seat;
	token: string;
}

export interface CreateGameResponse {
	gameId: string;
	commit: string;
	tokens: SeatToken[];
}

// ── Lobby / open seeks (mirror the play-api lobby DTOs) ───────────────────────

/** A public open seek in the lobby. `kind`/`name` say WHO is offering (bots by name, humans anonymous). */
export interface Seek {
	id: string;
	timeControl: TimeControl;
	// Optional so a pre-identity server still parses; the current server always sends them.
	kind?: PlayerKind;
	name?: string | null;
	// Whether sitting down here plays for rating (play-api #279). Optional because client and API
	// deploy independently: absent means "this server does not say", NOT "casual" — never branch on
	// `!seek.rated` for anything that matters (the `available?` post-mortem in catalogApi.ts is why).
	// The lobby only badges an explicit `true`, which is the safe direction for a missing field.
	rated?: boolean;
}

/** Posting a seek returns its id plus the creator's capability secret (to poll status / cancel). */
export interface CreatedSeek {
	seekId: string;
	secret: string;
}

/** A creator's status poll: `matched` is false while open; once matched it carries the game, the creator's seat
 * token, and the seat that token names (randomly assigned at accept time — never assume White).
 */
export interface SeekState {
	matched: boolean;
	gameId: string | null;
	token: string | null;
	seat: Seat | null;
}

/** The accept response: the seated game id, the accepter's seat token, and the seat it names (randomly assigned —
 * never assume Black).
 */
export interface SeekMatch {
	gameId: string;
	token: string;
	seat: Seat;
}

// ── Live games listing (mirror of play-api's GET /games) ─────────────────────

/** One live game in the public listing: who plays, how far along it is, and the position (`dfen`)
 * so the lobby can render mini-board tiles without per-game round trips. */
export interface LiveGame {
	gameId: string;
	players: Players | null;
	timeControl: TimeControl;
	activeSeat: Seat;
	dicePending: boolean;
	clocks: Clocks | null;
	version: number;
	// Optional so a pre-dfen server still parses (tiles render an empty board); current servers send it.
	dfen?: string;
}

/** The listing page (most action first, capped server-side) plus the uncapped total. */
export interface LiveGames {
	games: LiveGame[];
	total: number;
}

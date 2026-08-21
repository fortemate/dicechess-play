// Analytics ingest wire format (snake_case) — the POST /api/games contract.
//
// Verbatim copy of the shared contract. The AUTHORITATIVE source is the decoder in
// dicechess-analytics (`api/IngestProtocol.scala`, documented in its
// `docs/src/content/docs/ingestion.md`); dicechess-observer / dicechess-sync carry the
// same copy in their src/types.ts. Do NOT diverge: a payload either replays cleanly
// under the backend's pinned engine version or it is rejected with 422. This mirror
// carries EVERY contract field, including optional ones this repo's mapper never
// populates (money deltas, per-turn timing, event clocks) — a stale partial copy is
// exactly how pl#113's drift happened. See the wiki:
// "Data Acquisition / 07 Контракт ingest и валидация движком" and
// "08 Идентичность, источники и дедупликация".

export type Color = 'w' | 'b';

export type EventType =
	'DOUBLE_OFFER' | 'DOUBLE_ACCEPT' | 'DOUBLE_DECLINE' | 'DRAW_OFFER' | 'DRAW_ACCEPT';

export type Termination =
	'king_captured' | 'timeout' | 'resign' | 'draw_agreement' | 'double_declined' | 'unknown';

export interface PlayerInputWire {
	external_id: string;
	username?: string | null;
	player_type?: string | null;
	rating?: number | null;
}

export interface TurnInputWire {
	turn_number: number;
	active_color: Color;
	dice: number[]; // 1=pawn .. 6=king
	moves: string[]; // UCI micro-moves, e.g. "b1c3", "e7e8q"; [] for a pass
	thinking_time_ms?: number | null; // time spent on the turn (not tracked by this client)
	fen_after?: string | null; // position after the turn, informational cross-check
}

export interface GameEventInputWire {
	sequence_number: number;
	turn_number?: number | null;
	event_type: EventType;
	actor_color?: Color | null;
	clock_white_ms?: number | null; // clocks at the moment of the event
	clock_black_ms?: number | null;
	payload?: Record<string, unknown> | null;
}

export interface GameIngestWire {
	id: string; // UUID — deterministic UUIDv5 for playsite (idempotent re-sends)
	source: string; // 'playsite'
	mode: string; // 'classic' | 'x2'
	result?: number | null; // white-POV: 1 white win, -1 black win, 0 draw, null unknown
	termination?: string | null;
	started_at?: string | null;
	time_initial_sec?: number | null;
	time_increment_sec?: number | null;
	initial_stake_amount?: number | null; // NULL for free guest games
	final_stake_amount?: number | null;
	white_money_delta?: number | null; // per-player net change; not symmetric (the site takes a rake)
	black_money_delta?: number | null;
	stake_currency?: string | null;
	white_player?: PlayerInputWire | null;
	black_player?: PlayerInputWire | null;
	initial_fen: string;
	turns: TurnInputWire[];
	events: GameEventInputWire[];
}

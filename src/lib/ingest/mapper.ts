// Maps a finished local game (lab's per-turn history) directly to the analytics
// GameIngestWire contract. This is the ~150-line "direct mapper" from the phase-1 plan
// (wiki: "Play Site / 03 Фаза 1 — аноним vs бот + ингест"). It does NOT go through the
// observer/sync StateMap normalizer — a self-hosted game already has clean turns.
//
// Identity (ADR-0003): source='playsite'; game id = UUIDv5('playsite/game/<uuid>') for
// idempotent re-sends; human = guest:<uuidv7>, bot = bot:<algorithm> (shared with the
// extension, disambiguated by source). Free games keep all stake fields NULL.

import { v5 as uuidv5 } from 'uuid';
import type { LocalGameRecord, DiceChessTurnHistory, GameEndReason } from '$lib/localGamesDB';
import type { Color, GameIngestWire, PlayerInputWire, TurnInputWire } from './types';

// RFC 4122 URL namespace — same namespace beturanga uses for deterministic game ids.
const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Store end-reason → analytics `game_termination_enum` member.
const END_REASON_TO_TERMINATION: Record<GameEndReason, string> = {
	mate: 'king_captured',
	timeout: 'timeout',
	resign: 'resign',
	agreement: 'draw_agreement',
};

// Dice piece-letter (from the DFEN 7th field) → contract number (1=pawn .. 6=king).
const DICE_LETTER_TO_NUM: Record<string, number> = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };

function colorOf(playerColor: string): Color {
	return playerColor === 'WHITE' ? 'w' : 'b';
}

/** Decode the dice (1..6) from the 7th field of a DFEN, e.g. "...|PpN" → [1,1,2]. */
function decodeDice(dfen: string): number[] {
	const parts = dfen.trim().split(/\s+/);
	if (parts.length < 7) return [];
	return parts[6]
		.split('')
		.map((ch) => DICE_LETTER_TO_NUM[ch.toLowerCase()])
		.filter((n): n is number => typeof n === 'number');
}

function initialFen(turns: DiceChessTurnHistory[]): string {
	const first = turns[0]?.start_dfen;
	if (!first) return START_FEN;
	const parts = first.trim().split(/\s+/);
	return parts.length >= 6 ? parts.slice(0, 6).join(' ') : START_FEN;
}

function botUsername(botId: string): string {
	const algo = botId.replace(/^bot:/, '').replace(/[-_]/g, ' ');
	return algo.replace(/\b\w/g, (c) => c.toUpperCase()) + ' Bot';
}

function guestPlayer(externalId: string): PlayerInputWire {
	return { external_id: externalId, username: 'Guest', player_type: 'guest', rating: null };
}

function botPlayer(botId: string): PlayerInputWire {
	return { external_id: botId, username: botUsername(botId), player_type: 'bot', rating: null };
}

/**
 * Count kings in a FEN placement field. Used to detect a king-capture terminal.
 * Returns [whiteKings, blackKings].
 */
function countKings(fen: string): [number, number] {
	const placement = fen.trim().split(/\s+/)[0] ?? '';
	let white = 0;
	let black = 0;
	for (const ch of placement) {
		if (ch === 'K') white++;
		else if (ch === 'k') black++;
	}
	return [white, black];
}

/**
 * Best-effort termination for legacy records that predate `end_reason`.
 *
 * King capture is unambiguous from the board; timeout/draw/resign cannot be
 * distinguished from the final FEN alone. Records saved after the play store
 * started persisting `gameEndReason` use that instead (see toGameIngest).
 */
function deriveTermination(finalFen: string, result: number): string {
	const [wk, bk] = countKings(finalFen);
	if (wk === 0 || bk === 0) return 'king_captured';
	if (result === 0) return 'draw_agreement';
	return 'timeout';
}

/** Build the analytics ingest payload from a finished local game record. */
export function toGameIngest(record: LocalGameRecord, guestExternalId: string): GameIngestWire {
	const turns: TurnInputWire[] = record.moves_history.map((turn) => ({
		turn_number: turn.turn_number,
		active_color: colorOf(turn.active_color),
		dice: decodeDice(turn.start_dfen),
		moves: turn.moves.map((m) => m.uci),
	}));

	const finalFen = record.moves_history.at(-1)?.end_dfen ?? START_FEN;
	const guest = guestPlayer(guestExternalId);
	const bot = botPlayer(record.bot_id);
	const playerIsWhite = record.player_color === 'WHITE';

	return {
		id: uuidv5(`playsite/game/${record.id}`, URL_NAMESPACE),
		source: 'playsite',
		mode: record.mode ?? 'classic',
		result: record.result, // already white-POV (1/-1/0)
		// Trust end_reason when present and known; fall back to the board heuristic
		// for legacy records and any unexpected value from IndexedDB.
		termination:
			(record.end_reason && END_REASON_TO_TERMINATION[record.end_reason]) ??
			deriveTermination(finalFen, record.result),
		started_at: record.start_time,
		time_initial_sec: record.time_limit ?? null,
		time_increment_sec: record.time_bonus ?? null,
		// Free guest games: stake fields stay NULL so profit/stake analytics exclude them.
		initial_stake_amount: null,
		final_stake_amount: null,
		stake_currency: null,
		white_player: playerIsWhite ? guest : bot,
		black_player: playerIsWhite ? bot : guest,
		initial_fen: initialFen(record.moves_history),
		turns,
		events: [],
	};
}

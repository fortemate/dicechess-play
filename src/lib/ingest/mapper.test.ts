import { describe, it, expect } from 'vitest';
import { toGameIngest } from './mapper';
import type { LocalGameRecord } from '$lib/localGamesDB';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';
const E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b - - 0 1';
const NO_BLACK_KING = 'rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';
const GUEST = 'guest:0190a000-1111-7222-8333-444455556666';

function record(overrides: Partial<LocalGameRecord> = {}): LocalGameRecord {
	return {
		id: 'g1',
		bot_id: 'bot:greedy',
		player_color: 'WHITE',
		result: 1,
		start_time: '2026-06-26T00:00:00Z',
		sync_status: 'pending',
		moves_history: [
			{
				turn_number: 1,
				active_color: 'WHITE',
				start_dfen: `${START} PN`,
				moves: [{ uci: 'e2e4', piece: 'P', is_capture: false, fen_after: E4 }],
				end_dfen: E4,
			},
		],
		...overrides,
	};
}

describe('toGameIngest termination', () => {
	it('maps the stored end_reason to the analytics enum', () => {
		expect(toGameIngest(record({ end_reason: 'mate' }), GUEST).termination).toBe('king_captured');
		expect(toGameIngest(record({ end_reason: 'timeout' }), GUEST).termination).toBe('timeout');
		expect(toGameIngest(record({ end_reason: 'resign' }), GUEST).termination).toBe('resign');
		expect(toGameIngest(record({ end_reason: 'agreement' }), GUEST).termination).toBe(
			'draw_agreement',
		);
	});

	it('falls back to the board heuristic for legacy records without end_reason', () => {
		// Both kings present + drawn result → draw agreement.
		expect(toGameIngest(record({ result: 0 }), GUEST).termination).toBe('draw_agreement');

		// A king is missing from the final board → king captured.
		const captured = record();
		captured.moves_history[0].end_dfen = NO_BLACK_KING;
		expect(toGameIngest(captured, GUEST).termination).toBe('king_captured');
	});

	it('falls back to the heuristic for an unexpected end_reason from storage', () => {
		const corrupt = record({ result: 0 });
		(corrupt as { end_reason: unknown }).end_reason = 'bogus';
		expect(toGameIngest(corrupt as LocalGameRecord, GUEST).termination).toBe('draw_agreement');
	});
});

describe('toGameIngest basics', () => {
	it('emits the playsite source and a deterministic id', () => {
		const wire = toGameIngest(record(), GUEST);
		expect(wire.source).toBe('playsite');
		expect(wire.id).toMatch(/^[0-9a-f-]{36}$/i);
		expect(toGameIngest(record(), GUEST).id).toBe(wire.id);
	});

	it('slots the guest by colour and keeps stakes null', () => {
		const wire = toGameIngest(record({ player_color: 'WHITE' }), GUEST);
		expect(wire.white_player?.external_id).toBe(GUEST);
		expect(wire.black_player?.external_id).toBe('bot:greedy');
		expect(wire.initial_stake_amount).toBeNull();
	});
});

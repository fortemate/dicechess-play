import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import GameHistoryCard from './GameHistoryCard.svelte';
import type { DiceChessTurnHistory, LocalGameRecord } from '$lib/localGamesDB';

// The card links out via resolve(); stub it so the component renders without the SvelteKit runtime.
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

const TWO_KINGS = '4k3/8/8/8/8/8/8/4K3 w - - 0 1'; // 2 pieces
const START_PIECES = 32;

function turn(overrides: Partial<DiceChessTurnHistory> = {}): DiceChessTurnHistory {
	return {
		turn_number: 1,
		active_color: 'WHITE',
		start_dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		moves: [{ uci: 'e2e4', piece: 'P', is_capture: false }],
		end_dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		...overrides,
	};
}

function game(moves_history: DiceChessTurnHistory[]): LocalGameRecord {
	return {
		id: 'g1',
		bot_id: 'bot:greedy',
		player_color: 'WHITE',
		result: 1,
		start_time: '2026-07-19T10:00:00.000Z',
		sync_status: 'synced',
		moves_history,
	};
}

/** The thumbnail is a MiniBoard, which renders one <img> per piece; the piece count identifies
 * which position (hence which fallback branch) the card chose. */
const pieceCount = (container: HTMLElement) => container.querySelectorAll('img').length;

describe('GameHistoryCard final-position thumbnail', () => {
	it('previews the last turn end position for a played-out game', () => {
		const { container } = render(GameHistoryCard, {
			game: game([turn({ end_dfen: TWO_KINGS })]),
		});
		expect(pieceCount(container)).toBe(2);
	});

	it('falls back to the opening for a 0-turn record (e.g. an immediate forfeit)', () => {
		const { container } = render(GameHistoryCard, { game: game([]) });
		expect(pieceCount(container)).toBe(START_PIECES);
	});

	it("falls back to the turn's start position when the end position is missing (legacy record)", () => {
		const legacyTurn = turn({ start_dfen: TWO_KINGS, end_dfen: undefined as unknown as string });
		const { container } = render(GameHistoryCard, { game: game([legacyTurn]) });
		expect(pieceCount(container)).toBe(2);
	});
});

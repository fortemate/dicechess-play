import { describe, expect, it } from 'vitest';
import { finishedFromHistory, terminationFromArchive } from './finishedFromHistory';
import type { GameHistory } from './historyApi';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function history(overrides: Partial<GameHistory> = {}): GameHistory {
	return {
		gameId: 'game-1',
		players: {
			white: { kind: 'Human', name: null, rating: null },
			black: { kind: 'Human', name: null, rating: null },
		},
		rated: false,
		timeControl: { Fischer: { initialSeconds: 120, incrementSeconds: 0 } },
		result: 1,
		termination: 'resign',
		finishedAt: '2026-09-08T19:48:00Z',
		initialDfen: `${START} NBR`,
		turns: [],
		fairness: { commit: 'c0ffee', seed: null, clientSeeds: null },
		...overrides,
	} as GameHistory;
}

describe('finishedFromHistory', () => {
	it('signs the archive’s white-POV result into the live wire’s union', () => {
		expect(finishedFromHistory(history({ result: 1 })).result).toEqual({ Win: { side: 'White' } });
		expect(finishedFromHistory(history({ result: -1 })).result).toEqual({ Win: { side: 'Black' } });
		expect(finishedFromHistory(history({ result: 0 })).result).toEqual({ Draw: {} });
	});

	it('translates the terminations the live end screen knows by name', () => {
		expect(terminationFromArchive('king_captured')).toBe('KingCaptured');
		expect(terminationFromArchive('resign')).toBe('Resign');
		expect(terminationFromArchive('timeout')).toBe('Timeout');
		expect(terminationFromArchive('aborted')).toBe('Aborted');
		expect(terminationFromArchive('draw_agreement')).toBe('Draw');
		expect(terminationFromArchive('double_declined')).toBe('DoubleDeclined');
	});

	it('passes an unknown termination through instead of guessing at one', () => {
		// The end screen's switch has a neutral default, so a value this build has never heard of
		// renders as "Game over" — which is true — rather than being mislabelled as an abort.
		expect(terminationFromArchive('fifty_move')).toBe('fifty_move');
	});

	it('ends on the last turn’s position, with the dice field stripped', () => {
		const finished = finishedFromHistory(
			history({
				turns: [
					{
						turnNumber: 1,
						activeColor: 'White',
						dice: [1, 2, 3],
						moves: ['e2e4'],
						fenAfter: `${AFTER} pnb`,
					},
				],
			}),
		);
		expect(finished.finalFen).toBe(AFTER);
	});

	it('falls back to the initial position for a game that recorded no turns', () => {
		// A rematch aborted on the first-join gate is exactly this: committed, never played.
		const finished = finishedFromHistory(
			history({ result: -1, termination: 'timeout', turns: [] }),
		);
		expect(finished.finalFen).toBe(START);
		expect(finished.termination).toBe('Timeout');
		expect(finished.result).toEqual({ Win: { side: 'Black' } });
	});

	it('carries the archive’s own players and rated flag', () => {
		const finished = finishedFromHistory(
			history({
				rated: true,
				players: {
					white: { kind: 'Human', name: 'ada', rating: 1500 },
					black: { kind: 'Bot', name: 'greedy', rating: 1400 },
				},
			}),
		);
		expect(finished.rated).toBe(true);
		expect(finished.players.white.name).toBe('ada');
	});
});

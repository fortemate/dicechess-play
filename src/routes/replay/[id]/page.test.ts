import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import type { GameHistory } from '$lib/live/historyApi';
import type { PublicContinuation } from '$lib/live/rematchTypes';

/*
 * The archive's side of spectator continuation (#106). A replay URL is EXACT by contract: it shows
 * the game it names and never redirects to a rematch, however far the pair has played on. What it
 * owes the visitor is the explicit way forward, so this suite pins both halves — no navigation,
 * and a link that carries the spectator marker.
 *
 * Named `page.test.ts`, not `+page.test.ts`: a leading `+` marks a SvelteKit route file.
 */
vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: Record<string, string>) =>
		params ? path.replace('[id]', params.id) : path,
}));
const pageState = vi.hoisted(() => ({ params: { id: 'game-1' } as Record<string, string> }));
vi.mock('$app/state', () => ({ page: pageState }));
const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$lib/live/liveApi', () => ({ isLiveEnabled: () => true, apiBase: () => 'http://api' }));

const stub = vi.hoisted(() => async () => ({
	default: (await import('../../live/[id]/ChildStub.test.svelte')).default,
}));
vi.mock('../../../components/MoveHistory.svelte', stub);
vi.mock('../../../components/lib/Chessground.svelte', stub);

const historyApi = vi.hoisted(() => ({ fetchGameHistory: vi.fn() }));
vi.mock('$lib/live/historyApi', () => historyApi);
const continuation = vi.hoisted(() => ({ getContinuation: vi.fn() }));
vi.mock('$lib/live/continuationApi', () => continuation);

import ReplayPage from './+page.svelte';

const HISTORY: GameHistory = {
	gameId: 'game-1',
	players: {
		white: { kind: 'Human', name: 'Player 1' },
		black: { kind: 'Human', name: 'Player 2' },
	},
	rated: false,
	timeControl: { Unlimited: {} },
	result: 1,
	termination: 'king_captured',
	finishedAt: '2026-09-07T12:00:00Z',
	initialDfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 -',
	turns: [],
	fairness: { commit: 'c0ffee', seed: null, clientSeeds: null },
};

const publicState = (over: Partial<PublicContinuation>): PublicContinuation => ({
	sourceGameId: 'game-1',
	serverNow: '2026-09-07T12:00:00Z',
	phase: 'waiting',
	...over,
});

describe('replay page — archive entry stays exact', () => {
	beforeEach(() => {
		goto.mockReset();
		historyApi.fetchGameHistory.mockReset().mockResolvedValue(HISTORY);
		continuation.getContinuation.mockReset().mockResolvedValue(publicState({ phase: 'waiting' }));
	});

	afterEach(() => cleanup());

	it('offers the current game explicitly, in spectator mode, without navigating', async () => {
		continuation.getContinuation.mockImplementation(async (id: string) =>
			id === 'game-1'
				? publicState({ phase: 'matched', nextGameId: 'game-2' })
				: publicState({ sourceGameId: id, phase: 'waiting' }),
		);

		const { findByRole } = render(ReplayPage);

		const link = await findByRole('link', { name: /watch the current game/i });
		expect(link.getAttribute('href')).toBe('/live/game-2?spectate=1');
		expect(goto).not.toHaveBeenCalled();
	});

	it('walks the whole chain, so the offer points at the newest game', async () => {
		const chain: Record<string, PublicContinuation> = {
			'game-1': publicState({ phase: 'matched', nextGameId: 'game-2' }),
			'game-2': publicState({ sourceGameId: 'game-2', phase: 'matched', nextGameId: 'game-3' }),
			'game-3': publicState({ sourceGameId: 'game-3', phase: 'waiting' }),
		};
		continuation.getContinuation.mockImplementation(async (id: string) => chain[id]);

		const { findByRole } = render(ReplayPage);

		const link = await findByRole('link', { name: /watch the current game/i });
		expect(link.getAttribute('href')).toBe('/live/game-3?spectate=1');
	});

	it('offers nothing when the game never continued', async () => {
		const { queryByRole, findByText } = render(ReplayPage);

		await findByText(/king captured/i);
		await waitFor(() => expect(continuation.getContinuation).toHaveBeenCalledWith('game-1'));
		expect(queryByRole('link', { name: /watch the current game/i })).toBeNull();
	});

	it('stays silent when the continuation cannot be read — the replay is the point', async () => {
		continuation.getContinuation.mockRejectedValue(new Error('offline'));

		const { queryByRole, findByText } = render(ReplayPage);

		await findByText(/king captured/i);
		expect(queryByRole('link', { name: /watch the current game/i })).toBeNull();
	});
});

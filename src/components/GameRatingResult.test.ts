import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/svelte';
import GameRatingResult from './GameRatingResult.svelte';
import { fetchGameRatingChange, type GameRatingChange } from '#lib/live/ratingApi.js';

vi.mock('#lib/live/ratingApi.js', () => ({ fetchGameRatingChange: vi.fn() }));
const fetchRating = vi.mocked(fetchGameRatingChange);
const pending: GameRatingChange = {
	gameId: 'one',
	applied: false,
	white: null,
	black: null,
	outcome: 'pending',
	ratingDomain: 'training',
};
const settled: GameRatingChange = {
	...pending,
	applied: true,
	outcome: 'applied',
	white: { before: 1500, after: 1510 },
	black: { before: 1600, after: 1590 },
	trainingReference: {
		source: 'anchor',
		rating: 1462.754321,
		rd: 81.54321,
		anchorSetVersion: 'test-set',
		epoch: 7,
	},
};

async function flush() {
	await act(async () => {
		await Promise.resolve();
	});
}

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.resetAllMocks();
});

describe('GameRatingResult', () => {
	it('polls pending training and displays both recorded movements with one reference', async () => {
		vi.useFakeTimers();
		fetchRating.mockResolvedValueOnce(pending).mockResolvedValueOnce(settled);
		const onDomain = vi.fn();
		const { getAllByText, getByText, container } = render(GameRatingResult, {
			gameId: 'one',
			onDomain,
		});
		await flush();
		expect(getAllByText('Rating updating…')).toHaveLength(2);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5_000);
		});
		expect(getByText('White')).toBeTruthy();
		expect(getByText('Black')).toBeTruthy();
		expect(getByText('1500 → 1510')).toBeTruthy();
		expect(getByText('1600 → 1590')).toBeTruthy();
		expect(getAllByText('Training rating')).toHaveLength(1);
		expect(getAllByText(/rating 1,463, RD 82/)).toHaveLength(1);
		expect(getByText('Anchor set: test-set.')).toBeTruthy();
		expect(getByText('Reference epoch: 7.')).toBeTruthy();
		expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
		expect(onDomain).toHaveBeenLastCalledWith('training');
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000);
		});
		expect(fetchRating).toHaveBeenCalledTimes(2);
	});

	it('settles casual games without waiting for batch application', async () => {
		vi.useFakeTimers();
		fetchRating.mockResolvedValue({ ...pending, ratingDomain: 'casual', outcome: 'casual' });
		const { getByText, getAllByText, queryByText } = render(GameRatingResult, { gameId: 'casual' });
		await flush();
		expect(getAllByText('Rating unchanged.')).toHaveLength(2);
		expect(getByText('Casual games do not change competitive or training ratings.')).toBeTruthy();
		expect(queryByText('Rating updating…')).toBeNull();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000);
		});
		expect(fetchRating).toHaveBeenCalledTimes(1);
	});

	it('states when a public game has no available rating record', async () => {
		fetchRating.mockResolvedValue(null);
		const { getByText } = render(GameRatingResult, { gameId: 'missing' });
		await flush();
		expect(getByText('Rating details are unavailable for this game.')).toBeTruthy();
	});

	it('reports old absent movements as unrecorded rather than unchanged', async () => {
		fetchRating.mockResolvedValue({ gameId: 'old', applied: true, white: null, black: null });
		const { getAllByText, queryByText } = render(GameRatingResult, { gameId: 'old' });
		await flush();
		expect(getAllByText('Rating movement not recorded.')).toHaveLength(2);
		expect(queryByText('Rating unchanged.')).toBeNull();
	});

	it('retries transient failures and stops after 36 attempts', async () => {
		vi.useFakeTimers();
		fetchRating.mockRejectedValue(new Error('offline'));
		const { getByText } = render(GameRatingResult, { gameId: 'one' });
		await flush();
		expect(getByText('Could not load game ratings. Trying again…')).toBeTruthy();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(180_000);
		});
		expect(fetchRating).toHaveBeenCalledTimes(36);
		expect(
			getByText('Rating details are not ready. Open this game again later to check.'),
		).toBeTruthy();
	});

	it('stops polling after 36 pending responses', async () => {
		vi.useFakeTimers();
		fetchRating.mockResolvedValue(pending);
		const { getByText } = render(GameRatingResult, { gameId: 'one' });
		await flush();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(180_000);
		});
		expect(fetchRating).toHaveBeenCalledTimes(36);
		expect(
			getByText('Rating details are not ready. Open this game again later to check.'),
		).toBeTruthy();
	});

	it('ignores stale in-flight results when the requested game changes', async () => {
		let resolveOld!: (value: GameRatingChange) => void;
		fetchRating
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveOld = resolve;
					}),
			)
			.mockResolvedValueOnce({ ...pending, outcome: 'casual', ratingDomain: 'casual' });
		const onDomain = vi.fn();
		const { rerender, getByText, queryByText } = render(GameRatingResult, {
			gameId: 'old',
			onDomain,
		});
		await flush();
		await rerender({ gameId: 'new', onDomain });
		await flush();
		resolveOld(settled);
		await flush();
		expect(getByText('Casual game')).toBeTruthy();
		expect(queryByText('Training rating')).toBeNull();
		expect(onDomain).toHaveBeenLastCalledWith('casual');
	});

	it('cancels the previous game timer on game changes and unmount', async () => {
		vi.useFakeTimers();
		fetchRating.mockResolvedValue(pending);
		const { rerender, unmount } = render(GameRatingResult, { gameId: 'one' });
		await flush();
		await rerender({ gameId: 'two' });
		await flush();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5_000);
		});
		expect(fetchRating.mock.calls.map(([id]) => id)).toEqual(['one', 'two', 'two']);
		unmount();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000);
		});
		expect(fetchRating).toHaveBeenCalledTimes(3);
	});
});

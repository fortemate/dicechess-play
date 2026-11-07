// Profile counts are independent server reads: a concurrent rating update must not produce a false partition.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { PlayerProfile } from '#lib/leaderboard/leaderboardApi.js';

vi.mock('$app/state', () => ({ page: { params: { nickname: 'ExamplePlayer' } } }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('#lib/live/liveApi.js', () => ({ isLiveEnabled: () => true }));
const api = vi.hoisted(() => ({ fetchPlayerProfile: vi.fn() }));
vi.mock('#lib/leaderboard/leaderboardApi.js', () => api);
import PlayerPage from './+page.svelte';

const profile = (totalGames: number): PlayerProfile => ({
	nickname: 'ExamplePlayer',
	rating: 1600,
	rd: 50,
	provisional: false,
	games: 3,
	wins: 2,
	draws: 0,
	losses: 1,
	ratings: [
		{
			category: 'blitz',
			rating: 1600,
			rd: 50,
			provisional: false,
			games: 3,
			wins: 2,
			draws: 0,
			losses: 1,
		},
	],
	training: [],
	totalGames,
	opponents: [],
	recent: [],
});
beforeEach(() => api.fetchPlayerProfile.mockReset());
afterEach(cleanup);

describe('public profile count consistency', () => {
	it('keeps a consistent competitive/other/total summary', async () => {
		api.fetchPlayerProfile.mockResolvedValue(profile(5));
		const view = render(PlayerPage);
		expect(
			await view.findByText('3 competitive rating games · 2 other recorded games · 5 in total'),
		).toBeTruthy();
	});
	it('does not present racing counts as an additive partition', async () => {
		api.fetchPlayerProfile.mockResolvedValue(profile(2));
		const view = render(PlayerPage);
		expect(
			await view.findByText(
				'Competitive record: 3 games. Finished games reported: 2. These counts do not currently agree.',
			),
		).toBeTruthy();
		expect(view.queryByText(/other recorded games|in total/)).toBeNull();
	});
});

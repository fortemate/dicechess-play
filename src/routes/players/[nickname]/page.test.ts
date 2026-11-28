// A person's public profile: the route hands its nickname to the one profile template (#262).
// Profile counts are independent server reads: a concurrent rating update must not produce a
// false partition.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import type { PlayerProfile } from '#lib/leaderboard/leaderboardApi.js';

vi.mock('$app/state', () => ({ page: { params: { nickname: 'ExamplePlayer' } } }));
vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: Record<string, string>) =>
		Object.entries(params ?? {}).reduce(
			(out, [key, value]) => out.replace(`[${key}]`, value),
			path,
		),
}));
vi.mock('#lib/live/liveApi.js', () => ({ isLiveEnabled: () => true }));
const api = vi.hoisted(() => ({ fetchPlayerProfile: vi.fn(), fetchBotProfile: vi.fn() }));
vi.mock('#lib/leaderboard/leaderboardApi.js', () => api);
const lobby = vi.hoisted(() => ({ listGames: vi.fn() }));
vi.mock('#lib/live/lobbyApi.js', () => lobby);
import PlayerPage from './+page.svelte';

const profile = (totalGames: number, extra: Partial<PlayerProfile> = {}): PlayerProfile => ({
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
			rank: 14,
		},
	],
	training: [],
	totalGames,
	opponents: [],
	recent: [],
	...extra,
});
beforeEach(() => {
	api.fetchPlayerProfile.mockReset();
	api.fetchBotProfile.mockReset();
	lobby.listGames.mockReset();
});
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

describe("a person's profile", () => {
	it('reads the profile of the nickname in the address, and nothing a bot needs', async () => {
		api.fetchPlayerProfile.mockResolvedValue(profile(5));
		const view = render(PlayerPage);
		expect(await view.findByRole('heading', { level: 1, name: 'ExamplePlayer' })).toBeTruthy();
		expect(api.fetchPlayerProfile).toHaveBeenCalledWith('ExamplePlayer');
		expect(api.fetchBotProfile).not.toHaveBeenCalled();
		expect(lobby.listGames).not.toHaveBeenCalled();
		expect(view.getByText('Player')).toBeTruthy();
		expect(view.queryByRole('link', { name: 'Challenge this bot' })).toBeNull();
	});

	it('shows a tile per speed, with the place the server reports', async () => {
		api.fetchPlayerProfile.mockResolvedValue(profile(5));
		const view = render(PlayerPage);
		const tiles = within(
			await view.findByRole('region', { name: 'Competitive ratings' }),
		).getAllByRole('listitem');
		const text = tiles.map((tile) => tile.textContent?.replace(/\s+/g, ' ').trim());
		expect(text[0]).toBe('Bullet No rated games at this speed yet.');
		expect(text[1]).toBe('Blitz 1,600 Place 14 95% range 1,502 to 1,698 3 games');
		expect(text[2]).toBe('Rapid No rated games at this speed yet.');
	});

	it('switches to training estimates, which are never mixed with competitive ratings', async () => {
		api.fetchPlayerProfile.mockResolvedValue(
			profile(5, {
				training: [
					{
						category: 'rapid',
						rating: 1432,
						rd: 90,
						provisional: true,
						games: 7,
						wins: 3,
						draws: 0,
						losses: 4,
						ciLow: 1300,
						ciHigh: 1560,
						intervalCalculation: 'x',
						domain: 'training',
						algorithm: 'glicko2',
						algorithmVersion: '1',
						epoch: 1,
						cutoff: null,
						computedAt: null,
					},
				],
			}),
		);
		const view = render(PlayerPage);
		await view.findByRole('region', { name: 'Competitive ratings' });
		await fireEvent.click(view.getByRole('button', { name: 'Training' }));
		const tiles = within(view.getByRole('region', { name: 'Training estimates' })).getAllByRole(
			'listitem',
		);
		const text = tiles.map((tile) => tile.textContent?.replace(/\s+/g, ' ').trim());
		expect(text[1]).toBe('Blitz No training estimate at this speed.');
		expect(text[2]).toBe('Rapid 1,432 95% range 1,300 to 1,560 7 training games · provisional');
		expect(view.queryByText('1,600')).toBeNull();
	});

	it('tells an unknown nickname from a server that cannot be reached', async () => {
		api.fetchPlayerProfile.mockRejectedValue(new Error('fetchPlayerProfile failed: 404'));
		const missing = render(PlayerPage);
		expect(await missing.findByText('No player is named "ExamplePlayer".')).toBeTruthy();
		expect(missing.queryByRole('alert')).toBeNull();
		missing.unmount();
		api.fetchPlayerProfile.mockRejectedValue(new Error('fetchPlayerProfile failed: 503'));
		const down = render(PlayerPage);
		expect((await down.findByRole('alert')).textContent).toContain('unavailable right now');
	});
});

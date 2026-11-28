// A bot's public profile: the route hands its team and name to the one profile template (#262).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import type { PlayerOpponent } from '#lib/games/gamesApi.js';
import type { BotProfile, ProfileRecentGame } from '#lib/leaderboard/leaderboardApi.js';

vi.mock('$app/state', () => ({ page: { params: { team: 'grove', name: 'cedar-1' } } }));
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
import BotPage from './+page.svelte';

const versus = (i: number): PlayerOpponent => ({
	opponent: { kind: 'Bot', name: `grove larch-${i}` },
	team: 'grove',
	botName: `larch-${i}`,
	games: 100 - i,
	wins: 60 - i,
	draws: 1,
	losses: 39,
	lastPlayedAt: '2026-11-27T09:00:00Z',
});
const people: PlayerOpponent = {
	opponent: { kind: 'Human', name: null },
	team: null,
	botName: null,
	games: 44,
	wins: 29,
	draws: 0,
	losses: 15,
	lastPlayedAt: '2026-11-27T09:00:00Z',
};
const played = (i: number): ProfileRecentGame => ({
	gameId: `game-${i}`,
	seat: i % 2 ? 'White' : 'Black',
	opponent: { kind: 'Bot', name: `grove larch-${i}` },
	result: i % 3 === 0 ? 'loss' : 'win',
	rated: true,
	termination: 'king_captured',
	finishedAt: `2026-11-27T09:${String(10 + i).padStart(2, '0')}:00Z`,
});

const profile = (extra: Partial<BotProfile> = {}): BotProfile => ({
	team: 'grove',
	name: 'cedar-1',
	rating: 2337,
	rd: 45,
	provisional: false,
	onLadder: true,
	games: 3256,
	wins: 2335,
	draws: 1,
	losses: 920,
	ratings: [
		{
			category: 'blitz',
			rating: 2337,
			rd: 45,
			provisional: false,
			games: 3256,
			wins: 2335,
			draws: 1,
			losses: 920,
			rank: 1,
		},
	],
	opponents: [...Array.from({ length: 14 }, (_, i) => versus(i + 1)), people],
	recent: Array.from({ length: 20 }, (_, i) => played(i + 1)),
	...extra,
});

beforeEach(() => {
	api.fetchPlayerProfile.mockReset();
	api.fetchBotProfile.mockReset();
	lobby.listGames.mockReset();
	lobby.listGames.mockResolvedValue({ games: [], total: 0 });
});
afterEach(cleanup);

const lines = (items: HTMLElement[]) =>
	items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim());

describe("a bot's profile", () => {
	it('reads the profile of the bot in the address and shows who it is', async () => {
		api.fetchBotProfile.mockResolvedValue(profile());
		const view = render(BotPage);
		expect(await view.findByRole('heading', { level: 1, name: 'cedar-1' })).toBeTruthy();
		expect(api.fetchBotProfile).toHaveBeenCalledWith('grove', 'cedar-1');
		expect(api.fetchPlayerProfile).not.toHaveBeenCalled();
		expect(view.getByText('Team grove')).toBeTruthy();
		expect(view.getByText('Bot')).toBeTruthy();
		// A bot has one kind of rating: no switch to training.
		expect(view.queryByRole('group', { name: 'Ratings shown' })).toBeNull();
	});

	it('offers a challenge as a link that preselects the bot on Play', async () => {
		api.fetchBotProfile.mockResolvedValue(profile());
		const view = render(BotPage);
		const link = await view.findByRole('link', { name: 'Challenge this bot' });
		expect(link.getAttribute('href')).toBe('/play?bot=grove%2Fcedar-1');
	});

	it('offers to watch only while the bot is in a game', async () => {
		api.fetchBotProfile.mockResolvedValue(profile());
		const idle = render(BotPage);
		await idle.findByRole('link', { name: 'Challenge this bot' });
		expect(idle.queryByRole('link', { name: /watch/ })).toBeNull();
		idle.unmount();

		lobby.listGames.mockResolvedValue({
			games: [
				{
					gameId: 'live-7',
					version: 3,
					players: {
						white: { kind: 'Bot', name: 'grove cedar-1' },
						black: { kind: 'Human', name: null },
					},
				},
			],
			total: 1,
		});
		const playing = render(BotPage);
		const watch = await playing.findByRole('link', { name: 'Playing now · watch' });
		expect(watch.getAttribute('href')).toBe('/live/live-7');
	});

	it('shows the profile without the link when the list of live games cannot be read', async () => {
		api.fetchBotProfile.mockResolvedValue(profile());
		lobby.listGames.mockRejectedValue(new Error('down'));
		const view = render(BotPage);
		expect(await view.findByRole('link', { name: 'Challenge this bot' })).toBeTruthy();
		expect(view.queryByRole('alert')).toBeNull();
	});

	it('gives two records, each with its numbers, and says when a side was never played', async () => {
		api.fetchBotProfile.mockResolvedValue(profile());
		const view = render(BotPage);
		const bots = (await view.findByRole('heading', { name: 'Against bots' })).parentElement!;
		// 14 opponents: 1,295 games, 735 won, 14 drawn, 546 lost; 735 of 1,281 decided is 57%.
		expect(bots.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Against bots 57% wins in 1,295 games 735 W · 14 D · 546 L',
		);
		const humans = view.getByRole('heading', { name: 'Against people' }).parentElement!;
		expect(humans.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Against people 66% wins in 44 games 29 W · 0 D · 15 L',
		);
		view.unmount();

		api.fetchBotProfile.mockResolvedValue(profile({ opponents: [versus(1)] }));
		const lonely = render(BotPage);
		const none = (await lonely.findByRole('heading', { name: 'Against people' })).parentElement!;
		expect(none.textContent).toContain('No games yet.');
	});

	it('lists eight opponents with their numbers, and the rest on request', async () => {
		api.fetchBotProfile.mockResolvedValue(profile());
		const view = render(BotPage);
		const section = await view.findByRole('region', { name: 'Most played opponents' });
		const rows = () => within(section).getAllByRole('listitem');
		expect(rows()).toHaveLength(8);
		expect(lines(rows())[0]).toBe('grove larch-1 59 W · 1 D · 39 L · 60% 60%');
		expect(within(rows()[0]).getByRole('link').getAttribute('href')).toBe('/bots/grove/larch-1');
		await fireEvent.click(within(section).getByRole('button', { name: 'All 14 opponents' }));
		expect(rows()).toHaveLength(14);
		await fireEvent.click(within(section).getByRole('button', { name: 'Show fewer' }));
		expect(rows()).toHaveLength(8);
	});

	it('lists eight recent games with the result as a word, and the rest on request', async () => {
		api.fetchBotProfile.mockResolvedValue(profile());
		const view = render(BotPage);
		const section = await view.findByRole('region', { name: 'Recent games' });
		const rows = () => within(section).getAllByRole('listitem');
		expect(rows()).toHaveLength(8);
		expect(lines(rows())[0]).toMatch(/^Won vs grove larch-1 White · /);
		expect(lines(rows())[2]).toMatch(/^Lost vs grove larch-3 White · /);
		expect(within(rows()[0]).getByRole('link').getAttribute('href')).toBe('/replay/game-1');
		await fireEvent.click(
			within(section).getByRole('button', { name: 'Show all 20 recent games' }),
		);
		expect(rows()).toHaveLength(20);
	});

	it('lets a phone pick which of the two lists takes the one place they share', async () => {
		api.fetchBotProfile.mockResolvedValue(profile());
		const view = render(BotPage);
		const opponents = await view.findByRole('region', { name: 'Most played opponents' });
		const recent = view.getByRole('region', { name: 'Recent games' });
		// Hidden below the wide layout only: on a wide screen both lists are always shown.
		expect(opponents.className).not.toContain('max-lg:hidden');
		expect(recent.className).toContain('max-lg:hidden');
		await fireEvent.click(
			within(view.getByRole('group', { name: 'List shown' })).getByRole('button', {
				name: 'Recent games',
			}),
		);
		expect(opponents.className).toContain('max-lg:hidden');
		expect(recent.className).not.toContain('max-lg:hidden');
	});

	it('says a bot is outside automatic pairing without calling its rating frozen', async () => {
		api.fetchBotProfile.mockResolvedValue(profile({ onLadder: false }));
		const view = render(BotPage);
		expect(await view.findByText(/Automatic pairing is off/)).toBeTruthy();
	});

	it('renders what an older server sends, without the newer fields', async () => {
		const old = { ...profile(), opponents: undefined, ratings: undefined } as unknown as BotProfile;
		api.fetchBotProfile.mockResolvedValue(old);
		const view = render(BotPage);
		expect(await view.findByText('No games against bots yet.')).toBeTruthy();
		expect(view.getAllByText('No rated games at this speed yet.')).toHaveLength(3);
	});

	it('tells an unknown bot from a server that cannot be reached', async () => {
		api.fetchBotProfile.mockRejectedValue(new Error('fetchBotProfile failed: 404'));
		const missing = render(BotPage);
		expect(await missing.findByText('No bot is registered as "grove/cedar-1".')).toBeTruthy();
		missing.unmount();
		api.fetchBotProfile.mockRejectedValue(new Error('fetchBotProfile failed: 500'));
		const down = render(BotPage);
		expect((await down.findByRole('alert')).textContent).toContain('unavailable right now');
	});
});

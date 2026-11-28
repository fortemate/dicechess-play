import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import type { Leaderboard } from '#lib/leaderboard/leaderboardApi.js';

/*
 * The leaderboard page's own behaviour: which scope it asks for, and what it shows while a new one
 * is in flight. This is the first route-level test in the repo — routes are normally left to the
 * store suites, but the scope-switch state is only observable through the page, and rendering this
 * one needs nothing from the SvelteKit runtime beyond `resolve`.
 *
 * Named `page.test.ts`, not `+page.test.ts`: a leading `+` marks a SvelteKit route file.
 */
vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: Record<string, string>) =>
		params
			? path
					.replace('[team]', params.team)
					.replace('[name]', params.name)
					.replace('[nickname]', params.nickname)
			: path,
}));
vi.mock('#lib/live/liveApi.js', () => ({ isLiveEnabled: () => true }));
const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/leaderboard') }));
vi.mock('$app/state', () => ({ page: pageState }));
const auth = vi.hoisted(() => ({
	authStore: {
		nickname: null as string | null,
		status: 'loading' as string,
		canSignIn: true,
		signIn: vi.fn(),
	},
}));
vi.mock('#lib/authStore.svelte.js', () => auth);

const fetchLeaderboard = vi.hoisted(() => vi.fn());
const historyApi = vi.hoisted(() => ({ list: vi.fn(), item: vi.fn() }));
vi.mock('#lib/leaderboard/leaderboardApi.js', () => ({
	fetchLeaderboard,
	fetchRatingSnapshots: historyApi.list,
	fetchRatingSnapshot: historyApi.item,
}));

import LeaderboardPage from './+page.svelte';

const board = (name: string, kind: 'bot' | 'player'): Leaderboard => ({
	category: 'blitz',
	leaders: [
		{
			rank: 1,
			kind,
			team: kind === 'bot' ? 'acme' : null,
			name,
			rating: 1700,
			rd: 80,
			onLadder: kind === 'bot',
			games: 10,
			wins: 6,
			draws: 0,
			losses: 4,
		},
	],
});

describe('leaderboard page', () => {
	beforeEach(() => {
		fetchLeaderboard.mockReset();
		historyApi.list.mockReset();
		historyApi.item.mockReset();
		pageState.url = new URL('http://localhost/leaderboard');
		auth.authStore.status = 'loading';
		auth.authStore.nickname = null;
		auth.authStore.signIn.mockReset();
	});

	afterEach(() => {
		cleanup();
	});

	it('loads the current epoch on a direct immutable permalink and labels an earlier scale', async () => {
		const cutoff = '2026-01-02T03:04:05Z';
		pageState.url = new URL(
			`http://localhost/leaderboard?view=history&category=blitz&epoch=1&cutoff=${encodeURIComponent(cutoff)}`,
		);
		fetchLeaderboard.mockResolvedValue({ ...board('current-bot', 'bot'), epoch: 2 });
		const summary = {
			category: 'blitz',
			epoch: 1,
			cutoff,
			computedAt: cutoff,
			anchorSetVersion: 'synthetic',
			isCurrent: true,
			entryCount: 0,
		};
		historyApi.list.mockResolvedValue([summary]);
		historyApi.item.mockResolvedValue({ ...summary, leaders: [] });
		const view = render(LeaderboardPage);
		expect(await view.findByText(/earlier rating scale/)).toBeTruthy();
		expect(fetchLeaderboard).toHaveBeenCalledWith('bots', 'blitz');
		expect(view.queryByText('acme current-bot')).toBeNull();
		// The link of the snapshot on screen is the address it was opened by.
		const link = view.getByRole('link', { name: 'Link to this snapshot' });
		const params = new URL(link.getAttribute('href')!, 'http://localhost').searchParams;
		expect(Object.fromEntries(params)).toEqual({
			view: 'history',
			category: 'blitz',
			epoch: '1',
			cutoff,
		});
		expect(historyApi.item.mock.calls[0].slice(0, 3)).toEqual(['blitz', 1, cutoff]);
	});

	it('asks for the merged board on arrival, so people are visible without opting in', async () => {
		fetchLeaderboard.mockResolvedValue(board('alice', 'bot'));
		const { findByText } = render(LeaderboardPage);
		expect(await findByText('acme alice')).toBeTruthy();
		// Both axes explicit: the merged population, on the server's default speed (blitz) — but
		// stated, never left to the default (#206's lesson, now for `category` too).
		expect(fetchLeaderboard).toHaveBeenCalledWith('all', 'blitz');
	});

	/** The bug CodeRabbit caught on #208: without clearing `loaded`, switching scope kept the previous
	 * population on screen until the new response landed — click Players and bots stay visible, which
	 * reads as a filter that did not work.
	 */
	it('clears the previous population while a new scope is loading', async () => {
		fetchLeaderboard.mockResolvedValue(board('alice', 'bot'));
		const { findByText, getByRole, queryByText } = render(LeaderboardPage);
		await findByText('acme alice');

		// Never resolves: holds the page in the loading state so it can be inspected mid-flight.
		fetchLeaderboard.mockReturnValue(new Promise(() => {}));
		await fireEvent.click(getByRole('button', { name: 'Players' }));

		expect(fetchLeaderboard).toHaveBeenLastCalledWith('players', 'blitz');
		expect(queryByText('acme alice')).toBeNull();
		expect(queryByText('Loading the board…')).toBeTruthy();
	});

	it('switches speed without touching the population, and clears the stale board meanwhile', async () => {
		fetchLeaderboard.mockResolvedValue(board('alice', 'bot'));
		const { findByText, getByRole, queryByText } = render(LeaderboardPage);
		await findByText('acme alice');

		await fireEvent.click(getByRole('button', { name: 'Players' }));
		fetchLeaderboard.mockReturnValue(new Promise(() => {}));
		await fireEvent.click(getByRole('button', { name: 'Bullet' }));

		expect(fetchLeaderboard).toHaveBeenLastCalledWith('players', 'bullet');
		expect(queryByText('acme alice')).toBeNull();
	});

	it('names the speed in the empty state, so a sparse scale does not read as a bug', async () => {
		fetchLeaderboard.mockResolvedValue({ category: 'bullet', leaders: [] });
		const { findByText, getByRole } = render(LeaderboardPage);
		await fireEvent.click(getByRole('button', { name: 'Bullet' }));
		expect(await findByText(/bullet board/)).toBeTruthy();
	});

	it('clears a previous error when another scope is tried', async () => {
		fetchLeaderboard.mockRejectedValue(new Error('boom'));
		const { findByRole, getByRole, queryByRole } = render(LeaderboardPage);
		await findByRole('alert');

		fetchLeaderboard.mockReturnValue(new Promise(() => {}));
		await fireEvent.click(getByRole('button', { name: 'Bots' }));
		expect(queryByRole('alert')).toBeNull();
	});

	const many = (count: number): Leaderboard => ({
		category: 'blitz',
		computedAt: '2026-11-27T07:15:42.123456Z',
		leaders: Array.from({ length: count }, (_, i) => ({
			rank: i + 1,
			kind: 'bot' as const,
			team: 'acme',
			name: `bot-${String(i + 1).padStart(2, '0')}`,
			rating: 2300 - i * 10,
			rd: 45,
			onLadder: true,
			games: 100 + i,
			wins: 60,
			draws: 1,
			losses: 39 + i,
		})),
	});

	it('is two sections with addresses of their own, and keeps the speed in them', async () => {
		fetchLeaderboard.mockResolvedValue(board('alice', 'bot'));
		const view = render(LeaderboardPage);
		await view.findByText('acme alice');
		const links = within(view.getByRole('navigation', { name: 'Leaderboard sections' }))
			.getAllByRole('link')
			.map((a) => [a.textContent?.trim(), a.getAttribute('href'), a.getAttribute('aria-current')]);
		expect(links).toEqual([
			['Current standings', '/leaderboard', 'page'],
			['Published snapshots', '/leaderboard?view=history&category=blitz', null],
		]);
	});

	it('names the columns, with the ranking number first after the name', async () => {
		fetchLeaderboard.mockResolvedValue(many(3));
		const view = render(LeaderboardPage);
		const table = await view.findByRole('table', {
			name: 'Blitz ratings in the order the server ranked them',
		});
		const heads = within(table)
			.getAllByRole('columnheader')
			.map((th) => th.textContent?.replace(/\s+/g, ' ').trim());
		expect(heads[0]).toBe('#Place');
		expect(heads[1]).toBe('Name');
		expect(heads[2]).toMatch(/^Ranks at/);
		// The wide label, then the one a phone shows for the rating and its range together.
		expect(heads[3]).toBe('Rating Rating · range');
		expect(heads[4]).toMatch(/^95% range/);
		expect(heads.slice(5)).toEqual(['Games', 'W · D · L', 'Win']);
		expect(within(table).getAllByRole('img')).toHaveLength(3);
	});

	it('says in one line how much is shown and when the board was updated, to the minute', async () => {
		fetchLeaderboard.mockResolvedValue(many(30));
		const view = render(LeaderboardPage);
		const line = await view.findByText(/^Showing/);
		expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Showing 25 of 30 on the Blitz board · updated 27 Nov 2026, 07:15 UTC',
		);
		expect(view.queryByText(/not reported/i)).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: 'Show 5 more' }));
		expect(view.getByRole('status').textContent).toContain('Showing 30 of 30');
		expect(view.queryByRole('button', { name: /Show .* more/ })).toBeNull();
	});

	it('finds a participant by name and keeps the place the server gave', async () => {
		fetchLeaderboard.mockResolvedValue(many(30));
		const view = render(LeaderboardPage);
		await view.findByRole('table');
		await fireEvent.input(view.getByRole('searchbox', { name: 'Find a bot or player' }), {
			target: { value: ' BOT-27 ' },
		});
		const rows = within(view.getByRole('table')).getAllByRole('row').slice(1);
		expect(rows).toHaveLength(1);
		expect(rows[0].querySelector('td')?.textContent?.trim()).toBe('27');
		await fireEvent.input(view.getByRole('searchbox'), { target: { value: 'nobody' } });
		expect(view.getByText('No one on this board matches "nobody".')).toBeTruthy();
		expect(view.queryByRole('table')).toBeNull();
	});

	it('invites a visitor who is not signed in with one line, and nobody else', async () => {
		fetchLeaderboard.mockResolvedValue(board('alice', 'bot'));
		const waiting = render(LeaderboardPage);
		await waiting.findByText('acme alice');
		// Not known yet is not "signed out".
		expect(waiting.queryByText(/Sign in to earn a rating/)).toBeNull();
		waiting.unmount();

		auth.authStore.status = 'signed-out';
		const guest = render(LeaderboardPage);
		await guest.findByText('acme alice');
		expect(guest.getByText(/Sign in to earn a rating/)).toBeTruthy();
		await fireEvent.click(guest.getByRole('button', { name: 'Sign in' }));
		expect(auth.authStore.signIn).toHaveBeenCalledOnce();
		guest.unmount();

		auth.authStore.status = 'signed-in';
		const member = render(LeaderboardPage);
		await member.findByText('acme alice');
		expect(member.queryByText(/Sign in to earn a rating/)).toBeNull();
	});
});

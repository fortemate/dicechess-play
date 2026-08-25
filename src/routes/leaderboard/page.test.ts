import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import type { Leaderboard } from '$lib/leaderboard/leaderboardApi';

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
		params ? path.replace('[team]', params.team).replace('[name]', params.name) : path,
}));
vi.mock('$lib/live/liveApi', () => ({ isLiveEnabled: () => true }));
vi.mock('$lib/authStore.svelte', () => ({ authStore: { nickname: null } }));

const fetchLeaderboard = vi.hoisted(() => vi.fn());
vi.mock('$lib/leaderboard/leaderboardApi', () => ({ fetchLeaderboard }));

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
	});

	afterEach(() => {
		cleanup();
	});

	it('asks for the merged board on arrival, so people are visible without opting in', async () => {
		fetchLeaderboard.mockResolvedValue(board('alice', 'bot'));
		const { findByText, getByRole } = render(LeaderboardPage);
		expect(await findByText('acme alice')).toBeTruthy();
		expect(getByRole('link', { name: 'Bot strength' }).getAttribute('href')).toBe('/strength');
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
});

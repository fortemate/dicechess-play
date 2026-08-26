import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { Leaderboard } from '$lib/leaderboard/leaderboardApi';
import type { StrengthReport } from '$lib/strength/strengthApi';

vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: Record<string, string>) =>
		params ? path.replace('[team]', params.team).replace('[name]', params.name) : path,
}));
vi.mock('$lib/live/liveApi', () => ({ isLiveEnabled: () => true }));

const fetchStrengthReport = vi.hoisted(() => vi.fn());
const fetchLeaderboard = vi.hoisted(() => vi.fn());
vi.mock('$lib/strength/strengthApi', () => ({ fetchStrengthReport }));
vi.mock('$lib/leaderboard/leaderboardApi', () => ({ fetchLeaderboard }));

import StrengthPage from './+page.svelte';

const report: StrengthReport = {
	category: 'blitz',
	pairwise: [],
	ranking: [
		{ player: 'acme/alice', elo: 42, ciLow: 10, ciHigh: 74, losVsNext: 0.9 },
		{ player: 'lab/orphan', elo: -12, ciLow: -49, ciHigh: 8 },
	],
	completePairs: 16,
	singles: 3,
	excludedRows: 2,
};

const board: Leaderboard = {
	category: 'blitz',
	leaders: [
		{
			rank: 6,
			kind: 'bot',
			team: 'acme',
			name: 'alice',
			rating: 1720,
			rd: 85,
			onLadder: true,
			games: 42,
			wins: 30,
			draws: 2,
			losses: 10,
		},
	],
};

describe('strength page', () => {
	beforeEach(() => {
		fetchStrengthReport.mockReset();
		fetchLeaderboard.mockReset();
		fetchStrengthReport.mockResolvedValue(report);
		fetchLeaderboard.mockResolvedValue(board);
	});

	afterEach(cleanup);

	it('uses the report category for secondary bot-ladder context', async () => {
		const { findByRole } = render(StrengthPage);
		const table = await findByRole('table');
		expect(table.classList.contains('table-fixed')).toBe(true);
		expect(table.classList.contains('sm:table-auto')).toBe(true);
		expect(fetchStrengthReport).toHaveBeenCalledOnce();
		expect(fetchLeaderboard).toHaveBeenCalledWith('bots', 'blitz');
	});

	it('renders every strength row even when the leaderboard has no match', async () => {
		const { findByText, getByText, getByLabelText } = render(StrengthPage);
		expect(await findByText('acme/alice')).toBeTruthy();
		expect(getByText('lab/orphan')).toBeTruthy();
		expect(getByLabelText('No converged Glicko rating')).toBeTruthy();
		expect(getByText('95% CI -49 to +8')).toBeTruthy();
	});

	it('renders strength-only rows without waiting for the secondary leaderboard', async () => {
		fetchLeaderboard.mockReturnValue(new Promise<Leaderboard>(() => {}));
		const { findByText, getByText, getAllByLabelText, queryByText } = render(StrengthPage);

		expect(await findByText('acme/alice')).toBeTruthy();
		expect(getByText('lab/orphan')).toBeTruthy();
		expect(getAllByLabelText('No converged Glicko rating')).toHaveLength(2);
		expect(queryByText('Loading bot strength…')).toBeNull();
	});

	it('keeps the primary ranking when the secondary leaderboard request fails', async () => {
		fetchLeaderboard.mockRejectedValue(new Error('secondary down'));
		const { findByText, findByRole, queryByRole } = render(StrengthPage);
		expect(await findByText('acme/alice')).toBeTruthy();
		expect((await findByRole('status')).textContent).toMatch(/strength ranking is complete/);
		expect(queryByRole('alert')).toBeNull();
	});

	it('explains schedule adjustment and pool-relative confidence intervals', async () => {
		const { findByText, getByText } = render(StrengthPage);
		await findByText('acme/alice');
		expect(getByText(/adjust for who each bot faced/)).toBeTruthy();
		expect(getByText(/cannot be compared across different bot pools/)).toBeTruthy();
		expect(getByText(/both bounds are printed/)).toBeTruthy();
		expect(getByText(/likelihood that a bot is stronger than/)).toBeTruthy();
		expect(getByText(/raw win percentage depend on/)).toBeTruthy();
	});

	it('shows a route-level error when the primary strength report is unavailable', async () => {
		fetchStrengthReport.mockRejectedValue(new Error('cold cache'));
		const { findByRole } = render(StrengthPage);
		expect((await findByRole('alert')).textContent).toMatch(/strength report is unavailable/);
		expect(fetchLeaderboard).not.toHaveBeenCalled();
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { BotStrengthRow } from '$lib/stats/botStrength';

vi.mock('$app/paths', () => ({
	resolve: (path: string, params: Record<string, string>) =>
		path.replace('[team]', params.team).replace('[name]', params.name),
}));

import StrengthRow from './StrengthRow.svelte';

const row = (ladder: BotStrengthRow['ladder']): BotStrengthRow => ({
	rank: 2,
	player: 'acme/alice',
	identity: { team: 'acme', name: 'alice' },
	elo: 42.4,
	ciLow: 9.6,
	ciHigh: 81.7,
	losVsNext: 0.91,
	ladder,
});

describe('StrengthRow', () => {
	afterEach(cleanup);

	it('makes relative Elo and both asymmetric 95% bounds the primary result', () => {
		const { getByRole, getByText } = render(StrengthRow, {
			row: row({
				rank: 9,
				kind: 'bot',
				team: 'acme',
				name: 'alice',
				rating: 1720.4,
				rd: 85.2,
				onLadder: true,
				games: 42,
				wins: 30,
				draws: 2,
				losses: 10,
			}),
		});

		expect(getByRole('link', { name: 'acme/alice' }).getAttribute('href')).toBe('/bots/acme/alice');
		expect(getByText('+42')).toBeTruthy();
		expect(getByText('95% CI +10 to +82')).toBeTruthy();
		expect(getByText('LOS vs next 91%')).toBeTruthy();
		expect(getByText('1,720')).toBeTruthy();
		expect(getByText('30')).toBeTruthy();
		expect(getByText('42 games · 71% wins')).toBeTruthy();
		expect(getByText('on ladder')).toBeTruthy();
	});

	it('keeps the strength row honest when no Glicko leaderboard row can be joined', () => {
		const { getByText, getByLabelText } = render(StrengthRow, {
			row: { ...row(null), losVsNext: null },
		});
		expect(getByText('acme/alice')).toBeTruthy();
		expect(getByText('+42')).toBeTruthy();
		expect(getByLabelText('No next-ranked bot')).toBeTruthy();
		expect(getByLabelText('No converged Glicko rating')).toBeTruthy();
		expect(getByLabelText('No rating-board record')).toBeTruthy();
	});
});

/* Training profiles preserve sparse category identity, uncertainty metadata and their own record.
 * These synthetic fixtures deliberately carry different metadata and results at each speed. */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, within } from '@testing-library/svelte';
import type { TrainingCategoryRating } from '#lib/leaderboard/leaderboardApi.js';
import TrainingRatings from './TrainingRatings.svelte';

const blitz: TrainingCategoryRating = {
	category: 'blitz',
	rating: 1234.5,
	rd: 60,
	provisional: false,
	ciLow: 1101,
	ciHigh: 1368,
	intervalCalculation: 'synthetic-interval',
	domain: 'training',
	algorithm: 'glicko2',
	algorithmVersion: 'synthetic-v1',
	epoch: 7,
	cutoff: '2026-01-02T03:04:05Z',
	computedAt: '2026-01-02T04:05:06Z',
	games: 9,
	wins: 5,
	draws: 1,
	losses: 3,
};

const bullet: TrainingCategoryRating = {
	...blitz,
	category: 'bullet',
	rating: 987,
	provisional: true,
	epoch: 8,
	cutoff: null,
	computedAt: null,
	games: 2,
	wins: 1,
	draws: 0,
	losses: 1,
};

afterEach(cleanup);

describe('TrainingRatings', () => {
	it('distinguishes an older server from an empty training history', () => {
		const unsupported = render(TrainingRatings);
		expect(
			unsupported.getByText('Training estimates are not reported by this server yet.'),
		).toBeTruthy();
		expect(unsupported.queryByText('No training estimate recorded yet.')).toBeNull();
		unsupported.unmount();

		const empty = render(TrainingRatings, { ratings: [] });
		expect(empty.getByText('No training estimate recorded yet.')).toBeTruthy();
		expect(empty.queryByText('Training estimates are not reported by this server yet.')).toBeNull();
		expect(empty.getAllByText('No training estimate at this speed.')).toHaveLength(3);
	});

	it('renders canonical speeds without filling missing estimates from another speed or a default', () => {
		const view = render(TrainingRatings, { ratings: [blitz] });
		const rows = within(view.getByRole('list', { name: 'Training vs bots' })).getAllByRole(
			'listitem',
		);
		expect(rows.map((row) => within(row).getByRole('heading').textContent?.trim())).toEqual([
			'Bullet',
			'Blitz',
			'Rapid',
		]);
		for (const row of [rows[0], rows[2]]) {
			expect(within(row).getByText('No training estimate at this speed.')).toBeTruthy();
			expect(row.querySelector('strong')).toBeNull();
			expect(row.textContent).not.toMatch(/1,235|1,500/);
		}
		expect(within(rows[1]).getByText('1,235')).toBeTruthy();
	});

	it('keeps provisional status, explicit intervals and metadata scoped to their speed', () => {
		const view = render(TrainingRatings, { ratings: [blitz, bullet] });
		const rows = view.getAllByRole('listitem');
		expect(within(rows[0]).getByText('provisional')).toBeTruthy();
		expect(within(rows[1]).queryByText('provisional')).toBeNull();
		expect(within(rows[1]).getByText('95% interval 1,101–1,368')).toBeTruthy();
		expect(within(rows[0]).getByText('Epoch 8')).toBeTruthy();
		expect(within(rows[1]).getByText('Epoch 7')).toBeTruthy();
		expect(within(rows[0]).getByText('Data cutoff not reported')).toBeTruthy();
		expect(within(rows[0]).getByText('Calculation time not reported')).toBeTruthy();
		expect(within(rows[1]).getByText('Games through 2 Jan 2026, 03:04:05 UTC')).toBeTruthy();
		expect(within(rows[1]).getByText('Calculated 2 Jan 2026, 04:05:06 UTC')).toBeTruthy();
		expect(rows[1].textContent).toContain('Glicko-2 · synthetic-v1');
	});

	it('identifies training as separate and renders only each training record', () => {
		const view = render(TrainingRatings, { ratings: [blitz, bullet] });
		expect(view.getByRole('heading', { name: 'Training vs bots' })).toBeTruthy();
		expect(
			view.getByText(/Training estimates and records are separate from competitive standings/),
		).toBeTruthy();
		const rows = view.getAllByRole('listitem');
		expect(within(rows[0]).getByText('2 training games')).toBeTruthy();
		expect(within(rows[1]).getByText('9 training games')).toBeTruthy();
		expect(within(rows[1]).getByText('Training record')).toBeTruthy();
		expect(within(rows[1]).getByText('5W')).toBeTruthy();
		expect(rows[1].textContent).toContain('1D');
		expect(within(rows[1]).getByText('3L')).toBeTruthy();
		expect(within(rows[2]).queryByText('Training record')).toBeNull();
	});
});

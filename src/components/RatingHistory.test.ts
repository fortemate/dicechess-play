import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { RatingSnapshot, RatingSnapshotSummary } from '#lib/leaderboard/leaderboardApi.js';
const api = vi.hoisted(() => ({ list: vi.fn(), item: vi.fn() }));
vi.mock('#lib/leaderboard/leaderboardApi.js', () => ({
	fetchRatingSnapshots: api.list,
	fetchRatingSnapshot: api.item,
}));
vi.mock('#lib/authStore.svelte.js', () => ({ authStore: { nickname: null } }));
vi.mock('$app/paths', () => ({
	resolve: (path: string, p?: Record<string, string>) =>
		p
			? path.replace('[team]', p.team).replace('[name]', p.name).replace('[nickname]', p.nickname)
			: path,
}));
import RatingHistory from './RatingHistory.svelte';
const summary = (overrides: Partial<RatingSnapshotSummary> = {}): RatingSnapshotSummary => ({
	category: 'blitz',
	epoch: 1,
	anchorSetVersion: 'synthetic-v1',
	cutoff: '2026-10-01T00:00:00Z',
	computedAt: '2026-10-01T01:00:00Z',
	isCurrent: true,
	entryCount: 1,
	...overrides,
});
const snapshot = (item = summary(), name = 'past-bot'): RatingSnapshot => ({
	category: item.category,
	epoch: item.epoch,
	anchorSetVersion: item.anchorSetVersion,
	cutoff: item.cutoff,
	computedAt: item.computedAt,
	isCurrent: item.isCurrent,
	leaders: [
		{
			rank: 1,
			kind: 'bot',
			team: 'synthetic',
			name,
			rating: 1800,
			rd: 50,
			onLadder: false,
			games: 10,
			wins: 5,
			draws: 2,
			losses: 3,
			epoch: item.epoch,
			orderingValue: 1731,
		},
	],
});
beforeEach(() => {
	api.list.mockReset();
	api.item.mockReset();
});
afterEach(cleanup);
describe('immutable published rating history', () => {
	it('accepts the API canonical cutoff for an equivalent deep-link instant', async () => {
		api.list.mockResolvedValue([summary()]);
		api.item.mockResolvedValue(snapshot());
		const view = render(RatingHistory, {
			category: 'blitz',
			requested: { epoch: 1, cutoff: '2026-10-01T01:00:00.000+01:00' },
		});
		expect(await view.findByText('synthetic past-bot')).toBeTruthy();
		expect(view.queryByRole('alert')).toBeNull();
	});
	it('shows an earlier epoch separately without calling an unscheduled bot inactive/frozen', async () => {
		api.list.mockResolvedValue([summary()]);
		api.item.mockResolvedValue(snapshot());
		const view = render(RatingHistory, { category: 'blitz', currentEpoch: 2 });
		expect(await view.findByText('synthetic past-bot')).toBeTruthy();
		expect(view.getByText('Earlier epoch')).toBeTruthy();
		expect(view.getByText('Not in automatic ladder')).toBeTruthy();
		expect(view.queryByText(/frozen|inactive/i)).toBeNull();
		expect(view.getByText('1,731')).toBeTruthy();
		const link = view.getByRole('link', { name: 'Link to this snapshot' }) as HTMLAnchorElement;
		expect(link.href).toContain('epoch=1');
		expect(link.href).toContain('cutoff=2026-10-01');
	});
	it('distinguishes no published history from an unsupported old server', async () => {
		api.list.mockResolvedValue([]);
		const empty = render(RatingHistory, { category: 'blitz' });
		expect(await empty.findByText('No published snapshots for this speed yet.')).toBeTruthy();
		empty.unmount();
		api.list.mockRejectedValue(new Error('fetchRatingSnapshots failed: 404'));
		const unsupported = render(RatingHistory, { category: 'blitz' });
		expect(
			await unsupported.findByText('Published history is not available on this server yet.'),
		).toBeTruthy();
	});
	it('allows retry after a list error without showing another board', async () => {
		api.list.mockRejectedValueOnce(new Error('503')).mockResolvedValue([summary()]);
		api.item.mockResolvedValue(snapshot());
		const view = render(RatingHistory, { category: 'blitz' });
		await view.findByRole('alert');
		await fireEvent.click(view.getByRole('button', { name: 'Retry' }));
		expect(await view.findByText('synthetic past-bot')).toBeTruthy();
	});
	it('does not replace a missing requested snapshot with the newest publication', async () => {
		api.list.mockResolvedValue([summary()]);
		api.item.mockRejectedValue(new Error('fetchRatingSnapshot failed: 404'));
		const wanted = { epoch: 2, cutoff: '2026-11-01T00:00:00Z' };
		const view = render(RatingHistory, { category: 'blitz', requested: wanted });
		expect((await view.findByRole('alert')).textContent).toContain('no longer available');
		expect(api.item.mock.calls[0].slice(0, 3)).toEqual(['blitz', wanted.epoch, wanted.cutoff]);
		expect(view.queryByText('synthetic past-bot')).toBeNull();
	});
	it('cancels a different speed and ignores its late response', async () => {
		let finishOld!: (items: RatingSnapshotSummary[]) => void;
		api.list.mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)));
		const bullet = summary({ category: 'bullet' });
		api.list.mockResolvedValue([bullet]);
		api.item.mockResolvedValue(snapshot(bullet, 'bullet-bot'));
		const view = render(RatingHistory, { category: 'blitz' });
		await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
		const oldSignal = api.list.mock.calls[0][1] as AbortSignal;
		await view.rerender({ category: 'bullet' });
		expect(await view.findByText('synthetic bullet-bot')).toBeTruthy();
		finishOld([summary()]);
		await Promise.resolve();
		expect(oldSignal.aborted).toBe(true);
		expect(view.queryByText('synthetic past-bot')).toBeNull();
		expect(api.item.mock.calls.every((call) => call[0] === 'bullet')).toBe(true);
	});
	it('keeps same-millisecond cutoff identities distinct and ignores late item responses', async () => {
		const first = summary({ cutoff: '2026-10-01T00:00:00.000001Z' });
		const second = summary({ cutoff: '2026-10-01T00:00:00.000002Z' });
		let finishOld!: (item: RatingSnapshot) => void;
		api.list.mockResolvedValue([first, second]);
		api.item
			.mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)))
			.mockResolvedValue(snapshot(second, 'second-bot'));
		const view = render(RatingHistory, { category: 'blitz' });
		await waitFor(() => expect(api.item).toHaveBeenCalledTimes(1));
		await fireEvent.change(view.getByRole('combobox'), {
			target: { value: JSON.stringify([second.epoch, second.cutoff]) },
		});
		expect(await view.findByText('synthetic second-bot')).toBeTruthy();
		finishOld(snapshot(first));
		await Promise.resolve();
		expect(view.queryByText('synthetic past-bot')).toBeNull();
		expect(api.item.mock.calls[1].slice(0, 3)).toEqual(['blitz', 1, second.cutoff]);
	});
});

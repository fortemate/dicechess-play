import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import GamesFilterBar from './GamesFilterBar.svelte';
import type { GamesFilters, OpponentOption } from '$lib/games/gamesFilters';

const noFilters: GamesFilters = { vs: null, result: null, source: null };

const options: OpponentOption[] = [
	{ vs: { kind: 'local', algorithm: 'greedy' }, label: 'Greedy' },
	{ vs: { kind: 'bot', team: 'acme', botName: 'alice' }, label: 'acme alice' },
	{ vs: { kind: 'human' }, label: 'Anonymous players' },
];

describe('GamesFilterBar', () => {
	it('reports a source change without touching the other filters', async () => {
		const onChange = vi.fn();
		const { getByRole } = render(GamesFilterBar, { filters: noFilters, options, onChange });

		await fireEvent.click(getByRole('button', { name: 'On this device' }));

		expect(onChange).toHaveBeenCalledWith({ vs: null, result: null, source: 'device' });
	});

	it('reports a result change without touching the other filters', async () => {
		const onChange = vi.fn();
		const filters: GamesFilters = { ...noFilters, source: 'lobby' };
		const { getByRole } = render(GamesFilterBar, { filters, options, onChange });

		await fireEvent.click(getByRole('button', { name: 'Won' }));

		expect(onChange).toHaveBeenCalledWith({ vs: null, result: 'win', source: 'lobby' });
	});

	it('selecting a matching opponent from the search box reports its vs filter and clears the input', async () => {
		const onChange = vi.fn();
		const { getByPlaceholderText } = render(GamesFilterBar, {
			filters: noFilters,
			options,
			onChange,
		});

		const input = getByPlaceholderText('Search opponent…') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'acme alice' } });
		await fireEvent.change(input);

		expect(onChange).toHaveBeenCalledWith({
			...noFilters,
			vs: { kind: 'bot', team: 'acme', botName: 'alice' },
		});
		expect(input.value).toBe('');
	});

	it('does nothing when the search text matches no option', async () => {
		const onChange = vi.fn();
		const { getByPlaceholderText } = render(GamesFilterBar, {
			filters: noFilters,
			options,
			onChange,
		});

		const input = getByPlaceholderText('Search opponent…') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'nobody' } });
		await fireEvent.change(input);

		expect(onChange).not.toHaveBeenCalled();
	});

	it('shows the selected opponent as a chip instead of the search box', () => {
		const filters: GamesFilters = { ...noFilters, vs: { kind: 'human' } };
		const { getByText, queryByPlaceholderText } = render(GamesFilterBar, {
			filters,
			options,
			onChange: vi.fn(),
		});

		expect(getByText('Anonymous players')).toBeTruthy();
		expect(queryByPlaceholderText('Search opponent…')).toBeNull();
	});

	it('falls back to a generic label when vs matches no known option', () => {
		const filters: GamesFilters = { ...noFilters, vs: { kind: 'bot', team: 'x', botName: 'y' } };
		const { getByText } = render(GamesFilterBar, { filters, options: [], onChange: vi.fn() });

		expect(getByText('Selected opponent')).toBeTruthy();
	});

	it('clearing the opponent chip reports vs: null', async () => {
		const onChange = vi.fn();
		const filters: GamesFilters = { ...noFilters, vs: { kind: 'human' } };
		const { getByRole } = render(GamesFilterBar, { filters, options, onChange });

		await fireEvent.click(getByRole('button', { name: 'Clear opponent filter' }));

		expect(onChange).toHaveBeenCalledWith({ ...noFilters, vs: null });
	});

	it('hides "Reset filters" when nothing is active', () => {
		const { queryByText } = render(GamesFilterBar, {
			filters: noFilters,
			options,
			onChange: vi.fn(),
		});
		expect(queryByText('Reset filters')).toBeNull();
	});

	it('shows "Reset filters" when any filter is active and clears all of them', async () => {
		const onChange = vi.fn();
		const filters: GamesFilters = { ...noFilters, result: 'win' };
		const { getByText } = render(GamesFilterBar, { filters, options, onChange });

		const resetButton = getByText('Reset filters');
		await fireEvent.click(resetButton);

		expect(onChange).toHaveBeenCalledWith({ vs: null, result: null, source: null });
	});
});

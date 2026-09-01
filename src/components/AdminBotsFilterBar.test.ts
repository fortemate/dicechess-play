import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import AdminBotsFilterBar from './AdminBotsFilterBar.svelte';
import { DEFAULT_ADMIN_BOTS_QUERY, type AdminBotsQuery } from '$lib/bots/adminBotsFilter';

describe('AdminBotsFilterBar', () => {
	afterEach(() => cleanup());

	it('renders search input and triggers onChange on typing', async () => {
		const onChange = vi.fn();
		const view = render(AdminBotsFilterBar, {
			query: DEFAULT_ADMIN_BOTS_QUERY,
			capabilities: ['draws', 'resign'],
			totalCount: 10,
			filteredCount: 10,
			onChange,
		});

		const searchInput = view.getByRole('searchbox', { name: /search bots/i });
		await fireEvent.input(searchInput, { target: { value: 'alice' } });

		expect(onChange).toHaveBeenCalledWith({
			...DEFAULT_ADMIN_BOTS_QUERY,
			search: 'alice',
		});
	});

	it('allows changing filter dropdowns', async () => {
		const onChange = vi.fn();
		const view = render(AdminBotsFilterBar, {
			query: DEFAULT_ADMIN_BOTS_QUERY,
			capabilities: ['draws', 'resign'],
			totalCount: 10,
			filteredCount: 10,
			onChange,
		});

		const ladderSelect = view.getByLabelText(/ladder:/i);
		await fireEvent.change(ladderSelect, { target: { value: 'on' } });
		expect(onChange).toHaveBeenCalledWith({
			...DEFAULT_ADMIN_BOTS_QUERY,
			ladder: 'on',
		});

		const catalogSelect = view.getByLabelText(/catalog:/i);
		await fireEvent.change(catalogSelect, { target: { value: 'open' } });
		expect(onChange).toHaveBeenCalledWith({
			...DEFAULT_ADMIN_BOTS_QUERY,
			catalog: 'open',
		});

		const webhookSelect = view.getByLabelText(/webhook:/i);
		await fireEvent.change(webhookSelect, { target: { value: 'configured' } });
		expect(onChange).toHaveBeenCalledWith({
			...DEFAULT_ADMIN_BOTS_QUERY,
			webhook: 'configured',
		});
	});

	it('shows clear filters button when filters are active and clears on click', async () => {
		const onChange = vi.fn();
		const activeQuery: AdminBotsQuery = {
			...DEFAULT_ADMIN_BOTS_QUERY,
			search: 'test',
			ladder: 'on',
		};

		const view = render(AdminBotsFilterBar, {
			query: activeQuery,
			capabilities: ['draws'],
			totalCount: 10,
			filteredCount: 2,
			onChange,
		});

		const clearBtn = view.getByRole('button', { name: /clear filters/i });
		expect(clearBtn).toBeTruthy();
		await fireEvent.click(clearBtn);

		expect(onChange).toHaveBeenCalledWith(DEFAULT_ADMIN_BOTS_QUERY);
	});

	it('allows changing sort key and toggling sort direction', async () => {
		const onChange = vi.fn();
		const view = render(AdminBotsFilterBar, {
			query: DEFAULT_ADMIN_BOTS_QUERY,
			capabilities: [],
			totalCount: 5,
			filteredCount: 5,
			onChange,
		});

		const sortSelect = view.getByLabelText(/sort:/i);
		await fireEvent.change(sortSelect, { target: { value: 'rating' } });
		expect(onChange).toHaveBeenCalledWith({
			...DEFAULT_ADMIN_BOTS_QUERY,
			sort: 'rating',
		});

		const toggleDirBtn = view.getByRole('button', { name: /sort ascending/i });
		await fireEvent.click(toggleDirBtn);
		expect(onChange).toHaveBeenCalledWith({
			...DEFAULT_ADMIN_BOTS_QUERY,
			dir: 'desc',
		});
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import AdminBotsInventory from './AdminBotsInventory.svelte';
import type { AdminBot } from '$lib/bots/adminApi';

const bot1: AdminBot = {
	team: 'acme',
	name: 'alice',
	rating: 1720,
	rd: 85,
	provisional: false,
	onLadder: true,
	openToHumans: true,
	description: 'A friendly bot',
	maxConcurrentGames: 4,
	ladderAllowance: 3,
	activeGames: 2,
	owned: true,
	webhook: {
		url: 'https://acme.org/webhook',
		verifiedAt: '2026-08-01T00:00:00Z',
		capabilities: ['draws'],
		lastFailure: null,
	},
};

const bot2: AdminBot = {
	team: 'beta',
	name: 'bob',
	rating: 1500,
	rd: 350,
	provisional: true,
	onLadder: false,
	openToHumans: false,
	description: null,
	maxConcurrentGames: 2,
	ladderAllowance: 2,
	activeGames: 2, // capacity reached
	owned: false,
	webhook: null,
};

describe('AdminBotsInventory', () => {
	afterEach(() => cleanup());

	it('renders table rows with identity, rating, status badges, capacity, and webhook', () => {
		const view = render(AdminBotsInventory, {
			bots: [bot1, bot2],
			totalCount: 2,
			selectedBot: null,
			onSelect: vi.fn(),
			onClearFilters: vi.fn(),
		});

		expect(view.getAllByText('alice').length).toBeGreaterThan(0);
		expect(view.getAllByText('bob').length).toBeGreaterThan(0);
		expect(view.getAllByText(/1,720/).length).toBeGreaterThan(0);
		expect(view.getAllByText(/Prov/i).length).toBeGreaterThan(0);
		expect(view.getAllByText('2/4').length).toBeGreaterThan(0);
		expect(view.getAllByText('2/2').length).toBeGreaterThan(0);
		expect(view.getAllByText(/Max/i).length).toBeGreaterThan(0);
		expect(view.getAllByText('draws').length).toBeGreaterThan(0);
	});

	it('calls onSelect when clicking the Inspect button', async () => {
		const onSelect = vi.fn();
		const view = render(AdminBotsInventory, {
			bots: [bot1],
			totalCount: 1,
			selectedBot: null,
			onSelect,
			onClearFilters: vi.fn(),
		});

		const inspectBtn = view.getByRole('button', { name: /inspect →/i });
		await fireEvent.click(inspectBtn);
		expect(onSelect).toHaveBeenCalledWith(bot1);
	});

	it('calls onSelect when clicking or keying a mobile card', async () => {
		const onSelect = vi.fn();
		const view = render(AdminBotsInventory, {
			bots: [bot1],
			totalCount: 1,
			selectedBot: null,
			onSelect,
			onClearFilters: vi.fn(),
		});

		const card = view.getByRole('button', { name: /inspect acme alice/i });
		await fireEvent.click(card);
		expect(onSelect).toHaveBeenCalledWith(bot1);

		await fireEvent.keyDown(card, { key: 'Enter' });
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	it('shows empty state when totalCount is 0', () => {
		const view = render(AdminBotsInventory, {
			bots: [],
			totalCount: 0,
			selectedBot: null,
			onSelect: vi.fn(),
			onClearFilters: vi.fn(),
		});

		expect(view.getByText(/no registered bots were returned by play-api/i)).toBeTruthy();
	});

	it('shows filtered empty state and allows clearing filters when bots array is empty but totalCount > 0', async () => {
		const onClearFilters = vi.fn();
		const view = render(AdminBotsInventory, {
			bots: [],
			totalCount: 5,
			selectedBot: null,
			onSelect: vi.fn(),
			onClearFilters,
		});

		expect(view.getByText(/no bots match the current search or filters/i)).toBeTruthy();
		const clearBtn = view.getByRole('button', { name: /clear all filters/i });
		await fireEvent.click(clearBtn);
		expect(onClearFilters).toHaveBeenCalledOnce();
	});
});

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import WdlSummaryCard from './WdlSummaryCard.svelte';

describe('WdlSummaryCard', () => {
	it('renders the win rate, WdlCounts, and game total', () => {
		const { getByText } = render(WdlSummaryCard, { counts: { wins: 3, draws: 1, losses: 1 } });

		expect(getByText('75%')).toBeTruthy();
		expect(getByText('5 games')).toBeTruthy();
		expect(getByText('3W')).toBeTruthy();
		expect(getByText('1L')).toBeTruthy();
	});

	it('renders 0% and 0 games without dividing by zero', () => {
		const { getByText } = render(WdlSummaryCard, { counts: { wins: 0, draws: 0, losses: 0 } });

		expect(getByText('0%')).toBeTruthy();
		expect(getByText('0 games')).toBeTruthy();
	});
});

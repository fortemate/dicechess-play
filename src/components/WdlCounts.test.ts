import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import WdlCounts from './WdlCounts.svelte';

describe('WdlCounts', () => {
	it('renders the win/draw/loss counts', () => {
		const { getByText } = render(WdlCounts, { counts: { wins: 3, draws: 1, losses: 2 } });
		expect(getByText('3W')).toBeTruthy();
		expect(getByText('2L')).toBeTruthy();
		expect(getByText('· 1D ·', { exact: false })).toBeTruthy();
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

import RankingViewTabs from './RankingViewTabs.svelte';

describe('RankingViewTabs', () => {
	afterEach(cleanup);

	it('links both ranking instruments and marks the selected view', () => {
		const { getByRole } = render(RankingViewTabs, { active: 'strength' });
		const ratings = getByRole('link', { name: 'Rating leaderboard' });
		const strength = getByRole('link', { name: 'Bot strength' });

		expect(ratings.getAttribute('href')).toBe('/leaderboard');
		expect(ratings.getAttribute('aria-current')).toBeNull();
		expect(strength.getAttribute('href')).toBe('/strength');
		expect(strength.getAttribute('aria-current')).toBe('page');
	});
});

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { CategoryRating } from '$lib/leaderboard/leaderboardApi';
import CategoryRatings from './CategoryRatings.svelte';

/*
 * The per-category rating block (#258). What must hold: every category renders a row even when
 * unplayed (the wire omits unplayed categories — the DASH is this component's decision, and the
 * empty state says what the dash means), the provisional note is per row, and the order is the
 * canonical bullet→blitz→rapid regardless of wire order.
 */
const blitz: CategoryRating = {
	category: 'blitz',
	rating: 1712.4,
	rd: 84.2,
	provisional: false,
	games: 30,
	wins: 20,
	draws: 3,
	losses: 7,
};
const bullet: CategoryRating = {
	category: 'bullet',
	rating: 1480.0,
	rd: 190.0,
	provisional: true,
	games: 4,
	wins: 1,
	draws: 1,
	losses: 2,
};

afterEach(() => cleanup());

describe('CategoryRatings', () => {
	it('renders all three speeds, dashing the unplayed one and saying what the dash means', () => {
		const { container, getByText } = render(CategoryRatings, { ratings: [blitz, bullet] });
		const labels = Array.from(container.querySelectorAll('li > span:first-child')).map((el) =>
			el.textContent?.trim(),
		);
		expect(labels).toEqual(['Bullet', 'Blitz', 'Rapid']);
		expect(getByText('—')).toBeTruthy();
		expect(getByText('no rated games at this speed')).toBeTruthy();
	});

	it('marks provisional per category, not per participant', () => {
		const { container } = render(CategoryRatings, { ratings: [blitz, bullet] });
		const rows = Array.from(container.querySelectorAll('li')).map((el) => el.textContent ?? '');
		expect(rows[0]).toContain('provisional'); // bullet is still settling…
		expect(rows[1]).not.toContain('provisional'); // …while blitz is settled, on the same screen
	});

	it('rounds ratings to whole points with the deviation alongside', () => {
		const { container } = render(CategoryRatings, { ratings: [blitz] });
		const blitzRow = Array.from(container.querySelectorAll('li'))[1];
		expect(blitzRow.textContent).toContain('1,712');
		expect(blitzRow.textContent).toContain('±84');
	});
});

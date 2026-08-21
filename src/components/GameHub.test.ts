import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import GameHub from './GameHub.svelte';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

// The hub is shared by the landing page and /play precisely so the set of entry points
// cannot drift between them — this pins that set. Card hrefs ARE asserted here (unlike the
// no-navigation-targets convention for imperative flows) because they are static markup:
// the whole point of #217 is which four doors exist and where each one leads.
describe('GameHub', () => {
	afterEach(() => cleanup());

	it('offers every way to start a game', () => {
		const { getByRole } = render(GameHub);

		expect(getByRole('link', { name: /practice game/i }).getAttribute('href')).toBe('/practice');
		expect(getByRole('link', { name: /rated bot/i }).getAttribute('href')).toBe('/bots');
		expect(getByRole('link', { name: /friend by link/i }).getAttribute('href')).toBe('/live');
		expect(getByRole('link', { name: /open a table/i }).getAttribute('href')).toBe('/lobby');
	});

	it('keeps the quiet links to spectating and the leaderboard', () => {
		const { getByRole } = render(GameHub);

		expect(getByRole('link', { name: /watch live games/i }).getAttribute('href')).toBe('/lobby');
		expect(getByRole('link', { name: /leaderboard/i }).getAttribute('href')).toBe('/leaderboard');
	});
});

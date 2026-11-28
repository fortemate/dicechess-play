import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { LeaderRow } from '#lib/leaderboard/leaderboardApi.js';

// The row links out via resolve(); stub it so the component renders without the SvelteKit runtime.
vi.mock('$app/paths', () => ({
	resolve: (path: string, params: Record<string, string>) =>
		path
			.replace('[team]', params.team)
			.replace('[name]', params.name)
			.replace('[nickname]', params.nickname),
}));

// A mutable stand-in for the store singleton, same pattern as AuthMenu.test.ts: the only thing the
// row asks the store is which nickname is ours.
const auth = vi.hoisted(() => ({ authStore: { nickname: null as string | null } }));
vi.mock('#lib/authStore.svelte.js', () => auth);

import LeaderboardRow from './LeaderboardRow.svelte';

const row = (overrides: Partial<LeaderRow> = {}): LeaderRow => ({
	rank: 1,
	kind: 'bot',
	team: 'acme',
	name: 'alice',
	rating: 1720.5,
	rd: 85.2,
	onLadder: true,
	games: 42,
	wins: 30,
	draws: 2,
	losses: 10,
	...overrides,
});

describe('LeaderboardRow', () => {
	beforeEach(() => {
		auth.authStore.nickname = null;
	});

	afterEach(() => {
		cleanup();
	});

	it('renders a bot with its team-qualified name, a badge, and a link to its profile', () => {
		const { getByRole, getByText } = render(LeaderboardRow, { row: row() });
		expect(getByRole('link', { name: 'acme alice' }).getAttribute('href')).toBe('/bots/acme/alice');
		expect(getByText('Bot')).toBeTruthy();
	});

	it('separates scheduling from strength, without fading a bot or calling its rating frozen', () => {
		const { getByText, container } = render(LeaderboardRow, { row: row({ onLadder: false }) });
		expect(getByText('Not in automatic ladder')).toBeTruthy();
		expect(container.querySelector('tr')?.className).not.toContain('opacity-60');
	});

	/** The point of #206: a person is a row like any other on the same scale, just without the team
	 * prefix or the badge — and linking to a player profile rather than a bot one (#207).
	 */
	it('renders a player as a bare nickname linking to their profile — no badge, no team', () => {
		const { getByRole, queryByText } = render(LeaderboardRow, {
			row: row({ kind: 'player', team: null, name: 'RollingDice' }),
		});
		expect(getByRole('link', { name: 'RollingDice' }).getAttribute('href')).toBe(
			'/players/RollingDice',
		);
		expect(queryByText('Bot')).toBeNull();
	});

	/** `onLadder` is always false for a person — the flag belongs to the bot pairing scheduler. Fading
	 * a player row for it, or captioning it "left ladder", would be nonsense.
	 */
	it('does not treat a player as having left the ladder', () => {
		const { queryByText, container } = render(LeaderboardRow, {
			row: row({ kind: 'player', team: null, name: 'RollingDice', onLadder: false }),
		});
		expect(queryByText('left ladder')).toBeNull();
		expect(container.querySelector('tr')?.className).not.toContain('opacity-60');
	});

	it('marks the signed-in visitor’s own row so they can find themselves', () => {
		auth.authStore.nickname = 'RollingDice';
		const { getByText, container } = render(LeaderboardRow, {
			row: row({ kind: 'player', team: null, name: 'RollingDice' }),
		});
		expect(getByText('you')).toBeTruthy();
		expect(container.querySelector('tr')?.className).toContain('bg-primary/10');
	});

	it('marks nobody else, and never a bot that happens to share the nickname', () => {
		auth.authStore.nickname = 'RollingDice';
		const other = render(LeaderboardRow, {
			row: row({ kind: 'player', team: null, name: 'QuietRook' }),
		});
		expect(other.queryByText('you')).toBeNull();
		other.unmount();

		// A bot could in principle be named the same; `kind` is what keeps the badge off it.
		const bot = render(LeaderboardRow, { row: row({ name: 'RollingDice' }) });
		expect(bot.queryByText('you')).toBeNull();
	});

	it('shows the rating, its 95% range, the number it ranks at and the win share', () => {
		const { getByText, getAllByText } = render(LeaderboardRow, { row: row() });
		expect(getByText('1,721')).toBeTruthy(); // whole points: the range carries the precision
		// Once beside the bar and once as the text a phone shows instead of it.
		expect(getAllByText('1,554 to 1,887').length).toBeGreaterThan(0);
		expect(getByText('1,550')).toBeTruthy();
		expect(getByText('75%')).toBeTruthy(); // 30 of 40 decided
	});

	it('draws the range as a bar with a text alternative, on the scale it is given', () => {
		const { getByRole } = render(LeaderboardRow, {
			row: row(),
			bar: { start: 10, width: 60, dot: 40 },
		});
		const image = getByRole('img', { name: '95% range from 1,554 to 1,887, rating 1,721' });
		const [fill, dot] = [...image.querySelectorAll<HTMLElement>('[style]')];
		expect(fill.style.left).toBe('10%');
		expect(fill.style.width).toBe('60%');
		expect(dot.style.left).toBe('40%');
	});

	it('writes the columns a phone has no room for as text in the row', () => {
		const { getByText } = render(LeaderboardRow, { row: row() });
		expect(getByText('42 games · 75% wins')).toBeTruthy();
		expect(getByText('W 30 · D 2 · L 10')).toBeTruthy();
		expect(getByText('ranks at 1,550')).toBeTruthy();
	});

	it('tags a newcomer by the number of rated games, and nobody else', () => {
		const few = render(LeaderboardRow, { row: row({ games: 29 }) });
		expect(few.getByText('new')).toBeTruthy();
		few.unmount();
		const many = render(LeaderboardRow, { row: row({ games: 30 }) });
		expect(many.queryByText('new')).toBeNull();
	});

	it('says so, and draws no bar, when the server reports no usable range', () => {
		const { getAllByText, queryByRole } = render(LeaderboardRow, {
			row: row({ ciLow: 1900, ciHigh: 1800 }),
			bar: null,
		});
		expect(getAllByText('Interval not reported').length).toBeGreaterThan(0);
		expect(queryByRole('img')).toBeNull();
	});
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { LeaderRow } from '$lib/leaderboard/leaderboardApi';

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
vi.mock('$lib/authStore.svelte', () => auth);

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
		expect(getByText('bot')).toBeTruthy();
	});

	it('flags a bot that left the ladder, whose rating is frozen but still listed', () => {
		const { getByText } = render(LeaderboardRow, { row: row({ onLadder: false }) });
		expect(getByText('left ladder')).toBeTruthy();
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
		expect(queryByText('bot')).toBeNull();
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

	it('shows the rating with its deviation, and the win rate over decided games', () => {
		const { getByText } = render(LeaderboardRow, { row: row() });
		expect(getByText('1,721')).toBeTruthy(); // whole points: the ± carries the precision
		expect(getByText('±85')).toBeTruthy();
		expect(getByText('75%')).toBeTruthy(); // 30 of 40 decided
	});
});

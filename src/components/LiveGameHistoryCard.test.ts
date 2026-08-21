import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import LiveGameHistoryCard from './LiveGameHistoryCard.svelte';
import type { PlayerGame } from '$lib/games/gamesApi';

// The card links out via resolve(); stub it so the component renders without the SvelteKit runtime,
// substituting [id] the same way the real router would (same pattern as GameHistoryCard.test.ts).
vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: Record<string, string>) =>
		params ? path.replace(/\[(\w+)\]/g, (_, key) => params[key]) : path,
}));

function game(overrides: Partial<PlayerGame> = {}): PlayerGame {
	return {
		gameId: 'g-1',
		seat: 'White',
		opponent: { kind: 'Bot', name: 'acme alice' },
		result: 'win',
		rated: false,
		termination: 'resign',
		timeControl: 'Fischer(300,3)',
		finishedAt: '2026-07-16T12:00:00Z',
		...overrides,
	};
}

describe('LiveGameHistoryCard', () => {
	it('renders a bot opponent with its name and the shared bot badge', () => {
		const { getByText } = render(LiveGameHistoryCard, { game: game() });
		expect(getByText('acme alice')).toBeTruthy();
		expect(getByText('bot')).toBeTruthy();
	});

	it('anonymises a human opponent and shows no bot badge', () => {
		const { getByText, queryByText } = render(LiveGameHistoryCard, {
			game: game({ opponent: { kind: 'Human', name: null } }),
		});
		expect(getByText('Anonymous opponent')).toBeTruthy();
		expect(queryByText('bot')).toBeNull();
	});

	it.each([
		['win', 'Won'],
		['loss', 'Lost'],
		['draw', 'Draw'],
		['unknown', 'Unknown'],
	] as const)('labels a %s result as %s', (result, label) => {
		const { getByText } = render(LiveGameHistoryCard, { game: game({ result }) });
		expect(getByText(label)).toBeTruthy();
	});

	it('shows which seat the guest played', () => {
		const { getByText } = render(LiveGameHistoryCard, { game: game({ seat: 'Black' }) });
		expect(getByText('You played Black')).toBeTruthy();
	});

	it('humanises the snake_case termination and parses the raw time control', () => {
		const { getByText } = render(LiveGameHistoryCard, {
			game: game({ termination: 'draw_agreement', timeControl: 'SuddenDeath(300)' }),
		});
		expect(getByText('Draw agreement')).toBeTruthy();
		expect(getByText('5 min')).toBeTruthy();
	});

	it('links to the replay page for its own gameId (#163)', () => {
		const { container } = render(LiveGameHistoryCard, { game: game({ gameId: 'g-42' }) });
		expect(container.querySelector('a')?.getAttribute('href')).toBe('/replay/g-42');
	});

	it('links a registered human opponent to their public profile (#213)', () => {
		const { getByRole } = render(LiveGameHistoryCard, {
			game: game({ opponent: { kind: 'Human', name: 'BraveDie' } }),
		});
		expect(getByRole('link', { name: 'BraveDie' }).getAttribute('href')).toBe('/players/BraveDie');
	});

	it('does not link a bot opponent to a player profile', () => {
		const { getByText } = render(LiveGameHistoryCard, { game: game() });
		expect(getByText('acme alice').closest('a')).toBeNull();
	});

	it('does not link an anonymous (unregistered) opponent', () => {
		const { getByText } = render(LiveGameHistoryCard, {
			game: game({ opponent: { kind: 'Human', name: null } }),
		});
		expect(getByText('Anonymous opponent').closest('a')).toBeNull();
	});
});

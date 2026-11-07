import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ProfileGameCard from './ProfileGameCard.svelte';
import type { ProfileRecentGame } from '#lib/leaderboard/leaderboardApi.js';
import { formatDate } from '../utils/formatters';
vi.mock('$app/paths', () => ({
	resolve: (path: string, p: Record<string, string>) => path.replace('[id]', p.id),
}));

function game(overrides: Partial<ProfileRecentGame> = {}): ProfileRecentGame {
	return {
		gameId: 'g-1',
		seat: 'White',
		opponent: { kind: 'Bot', name: 'acme alice' },
		result: 'win',
		rated: true,
		termination: 'resign',
		finishedAt: '2026-07-16T12:00:00Z',
		...overrides,
	};
}

describe('ProfileGameCard', () => {
	it('renders a bot opponent with its name and the shared bot badge', () => {
		const { getByText } = render(ProfileGameCard, { game: game() });
		expect(getByText('acme alice')).toBeTruthy();
		expect(getByText('bot')).toBeTruthy();
	});

	it('anonymises a human opponent and shows no bot badge', () => {
		const { getByText, queryByText } = render(ProfileGameCard, {
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
		const { getByText } = render(ProfileGameCard, { game: game({ result }) });
		expect(getByText(label)).toBeTruthy();
	});

	it('describes the seat the PROFILED BOT played, not the viewer', () => {
		const { getByText, queryByText } = render(ProfileGameCard, {
			game: game({ seat: 'Black' }),
		});
		expect(getByText('Played Black')).toBeTruthy();
		expect(queryByText(/you played/i)).toBeNull();
	});

	it('does not call a legacy non-competitive record casual when it may have been training', () => {
		const rated = render(ProfileGameCard, { game: game({ rated: true }) });
		expect(rated.getByText('Competitive')).toBeTruthy();
		rated.unmount();

		const casual = render(ProfileGameCard, { game: game({ rated: false }) });
		expect(casual.getByText('Not competitive')).toBeTruthy();
		expect(casual.queryByText('Casual')).toBeNull();
	});

	it('labels the snake_case termination', () => {
		const { getByText } = render(ProfileGameCard, {
			game: game({ termination: 'draw_agreement' }),
		});
		expect(getByText('Draw agreement')).toBeTruthy();
	});

	it('renders a defined fallback for an unknown termination value', () => {
		const { getByText } = render(ProfileGameCard, {
			game: game({ termination: 'future_variant' }),
		});
		expect(getByText('Game ended')).toBeTruthy();
	});

	it('links to the exact public game details where recorded rating decisions can be read', () => {
		const { container } = render(ProfileGameCard, { game: game() });
		expect(container.querySelector('a')?.getAttribute('href')).toBe('/replay/g-1');
	});

	it('distinguishes details links by opponent and finished time without changing visible text', () => {
		const firstGame = game();
		const secondGame = game({
			gameId: 'g-2',
			opponent: { kind: 'Human', name: null },
			finishedAt: '2026-07-17T15:30:00Z',
		});
		const first = render(ProfileGameCard, { game: firstGame });
		const second = render(ProfileGameCard, { game: secondGame });
		const firstLink = first.getByRole('link', {
			name: `Game details against acme alice, finished ${formatDate(firstGame.finishedAt)}`,
		});
		const secondLink = second.getByRole('link', {
			name: `Game details against Anonymous opponent, finished ${formatDate(secondGame.finishedAt)}`,
		});
		expect(firstLink.textContent).toBe('Game details');
		expect(secondLink.textContent).toBe('Game details');
		expect(firstLink.getAttribute('href')).toBe('/replay/g-1');
		expect(secondLink.getAttribute('href')).toBe('/replay/g-2');
	});
});

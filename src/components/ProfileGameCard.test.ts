import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import ProfileGameCard from './ProfileGameCard.svelte';
import type { ProfileRecentGame } from '$lib/leaderboard/leaderboardApi';

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

	it('shows a Rated/Casual pill instead of a redundant Live badge', () => {
		const rated = render(ProfileGameCard, { game: game({ rated: true }) });
		expect(rated.getByText('Rated')).toBeTruthy();
		rated.unmount();

		const casual = render(ProfileGameCard, { game: game({ rated: false }) });
		expect(casual.getByText('Casual')).toBeTruthy();
	});

	it('humanises the snake_case termination', () => {
		const { getByText } = render(ProfileGameCard, {
			game: game({ termination: 'draw_agreement' }),
		});
		expect(getByText('Draw agreement')).toBeTruthy();
	});

	it('is not a clickable link — there is nowhere to navigate (no replay data exists)', () => {
		const { container } = render(ProfileGameCard, { game: game() });
		expect(container.querySelector('a')).toBeNull();
	});
});

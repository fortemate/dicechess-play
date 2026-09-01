import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$lib/live/liveApi', () => ({ isLiveEnabled: () => false }));
vi.mock('$lib/authStore.svelte', () => ({
	authStore: { status: 'signed-out', canSignIn: false, guestsLoaded: true, loadGuests: vi.fn() },
}));
vi.mock('$lib/stores/localGamesStore.svelte', () => ({
	localGamesStore: { loaded: true, games: [], error: null, load: vi.fn() },
}));
vi.mock('$lib/stores/playerOpponentsStore.svelte', () => ({
	playerOpponentsStore: {
		loaded: true,
		opponents: [],
		error: null,
		load: vi.fn(),
		reset: vi.fn(),
	},
	myOpponentsStore: {
		loaded: true,
		opponents: [],
		error: null,
		load: vi.fn(),
		reset: vi.fn(),
	},
}));
vi.mock('$lib/ingest/guestIdentity', () => ({
	getGuestId: () => 'guest:018f0000-0000-7000-8000-000000000000',
	getGuestUuid: () => '018f0000-0000-7000-8000-000000000000',
	setGuestId: vi.fn(),
	resetGuestId: vi.fn(),
}));

import MePage from './+page.svelte';

describe('Profile page (/me)', () => {
	afterEach(() => cleanup());

	it('renders the About & Open Source section with links to licenses, rules, and source code', () => {
		const { getByRole, getByText } = render(MePage);

		expect(getByText(/About & Open Source/i)).not.toBeNull();
		expect(getByRole('link', { name: /open source licenses/i }).getAttribute('href')).toBe(
			'/licenses',
		);
		expect(getByRole('link', { name: /game rules/i }).getAttribute('href')).toBe('/rules');
		expect(getByRole('link', { name: /source code/i }).getAttribute('href')).toBe(
			'https://github.com/fortemate/dicechess-play',
		);
	});
});

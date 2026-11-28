import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

// The Arena overview page (#259) owns the feed and hands its values to four blocks. The blocks
// and the feed have their own tests; here they are stubs, and this file pins what the page
// itself owns: the head, the sections, and that the feed runs only while the page is shown.
const feed = vi.hoisted(() => ({
	live: true,
	started: 0,
	stopped: 0,
	total: 0,
	loaded: true,
	unavailable: false,
}));
vi.mock('#lib/live/liveApi.js', () => ({ isLiveEnabled: () => feed.live }));
vi.mock('#lib/arena/arenaFeed.svelte.js', () => ({
	ArenaFeed: class {
		games = [];
		others = [];
		seeks = [];
		featured = null;
		total = feed.total;
		loaded = feed.loaded;
		unavailable = feed.unavailable;
		refresh = vi.fn();
		start() {
			feed.started += 1;
			return () => (feed.stopped += 1);
		}
	},
}));
const stub = vi.hoisted(() => async () => ({
	default: (await import('../live/[id]/ChildStub.test.svelte')).default,
}));
vi.mock('../../components/ArenaFeatured.svelte', stub);
vi.mock('../../components/ArenaGames.svelte', stub);
vi.mock('../../components/ArenaSeats.svelte', stub);
vi.mock('../../components/ArenaStandings.svelte', stub);

import Page from './+page.svelte';

describe('/arena', () => {
	afterEach(() => {
		cleanup();
		Object.assign(feed, {
			live: true,
			started: 0,
			stopped: 0,
			total: 0,
			loaded: true,
			unavailable: false,
		});
	});

	it('has one page heading and a way to a game of the visitor', () => {
		const { getAllByRole } = render(Page);
		expect(getAllByRole('heading', { level: 1 }).map((h) => h.textContent?.trim())).toEqual([
			'Arena',
		]);
		const play = getAllByRole('link', { name: /Play a game/ });
		// One in the head for a wide screen, one that stays in reach on a phone.
		expect(play.map((link) => link.getAttribute('href'))).toEqual(['/play', '/play']);
	});

	it('names its sections, with the number of live games on the way to all of them', () => {
		feed.total = 100;
		const { getByRole } = render(Page);
		const links = [...getByRole('navigation', { name: 'Arena sections' }).querySelectorAll('a')];
		expect(links.map((link) => link.getAttribute('aria-current'))).toEqual(['page', null]);
		expect(links.map((link) => link.getAttribute('href'))).toEqual(['/arena', '/arena/live']);
		expect(links[1].textContent?.replace(/\s+/g, ' ')).toContain('Live games 100');
	});

	it('shows no number before the first list has arrived', () => {
		feed.loaded = false;
		const { getByRole } = render(Page);
		const live = getByRole('navigation', { name: 'Arena sections' }).querySelectorAll('a')[1];
		expect(live.textContent).not.toMatch(/\d/);
	});

	it('runs the feed while the page is shown, and stops it when the page goes away', () => {
		const { unmount } = render(Page);
		expect(feed.started).toBe(1);
		expect(feed.stopped).toBe(0);
		unmount();
		expect(feed.stopped).toBe(1);
	});

	it('says so when the games cannot be loaded, without taking the page away', () => {
		feed.unavailable = true;
		const { getByRole } = render(Page);
		expect(getByRole('alert').textContent).toContain('cannot be loaded');
		expect(getByRole('navigation', { name: 'Arena sections' })).toBeTruthy();
	});

	it('asks the server nothing in a build without one', () => {
		feed.live = false;
		const { getByText } = render(Page);
		expect(feed.started).toBe(0);
		expect(getByText(/this build has none/)).toBeTruthy();
	});
});

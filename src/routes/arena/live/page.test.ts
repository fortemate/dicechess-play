import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import type { LiveGame, PlayerKind, TimeControl } from '#lib/live/liveTypes.js';

// The Arena live list (#260), with the feed faked so the list is in the test's hands. Order and
// filters are tested as pure functions (lib/arena/liveGames.test.ts); this file pins that the
// page applies them to what is on screen: the rows, the marks, the numbers and "show more".
const feed = vi.hoisted(() => ({
	live: true,
	games: [] as LiveGame[],
	total: 0,
	loaded: true,
	unavailable: false,
	started: 0,
	stopped: 0,
}));
vi.mock('#lib/live/liveApi.js', () => ({ isLiveEnabled: () => feed.live }));
vi.mock('#lib/arena/liveGamesFeed.svelte.js', () => ({
	LiveGamesFeed: class {
		games = feed.games;
		total = feed.total;
		loaded = feed.loaded;
		unavailable = feed.unavailable;
		start() {
			feed.started += 1;
			return () => (feed.stopped += 1);
		}
	},
}));

import Page from './+page.svelte';

const blitz: TimeControl = { Fischer: { initialSeconds: 300, incrementSeconds: 3 } };
const rapid: TimeControl = { Fischer: { initialSeconds: 600, incrementSeconds: 5 } };
type Face = [name: string | null, kind: PlayerKind, rating?: number];
const game = (
	gameId: string,
	white: Face,
	black: Face,
	timeControl: TimeControl = blitz,
): LiveGame => {
	const face = ([name, kind, rating]: Face) => ({
		name,
		kind,
		...(rating === undefined ? {} : { rating }),
	});
	return {
		gameId,
		players: { white: face(white), black: face(black) },
		timeControl,
		activeSeat: 'White',
		dicePending: false,
		clocks: null,
		version: 1,
		dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 12',
	};
};
const FEW = [
	game('weak', ['grove elm', 'Bot', 1500], ['grove ash', 'Bot', 1500]),
	game('strong', ['grove cedar', 'Bot', 2324], ['grove larch', 'Bot', 2303], rapid),
	game('person', ['PlayerOne', 'Human', 2177], ['grove maple', 'Bot', 2247]),
	game('guest', ['grove rowan', 'Bot', 2000], [null, 'Human']),
];
const many = (n: number) =>
	Array.from({ length: n }, (_, i) =>
		game(`g${i}`, [`bot-${i}`, 'Bot', 3000 - i], [`foe-${i}`, 'Bot', 3000 - i]),
	);
const mount = (games: LiveGame[], total = games.length) => {
	feed.games = games;
	feed.total = total;
	return render(Page);
};
// Named through the helper: a bare `ReturnType<typeof render>` loses the component's own type.
type View = ReturnType<typeof mount>;
const rowLinks = (view: View) =>
	within(view.getByRole('list', { name: 'Live games' }))
		.getAllByRole('link')
		.map((a) => a.getAttribute('href'));
const press = (view: View, name: RegExp | string) =>
	fireEvent.click(view.getByRole('button', { name }));

describe('/arena/live', () => {
	beforeEach(() => {
		Object.assign(feed, {
			live: true,
			games: [],
			total: 0,
			loaded: true,
			unavailable: false,
			started: 0,
			stopped: 0,
		});
	});
	afterEach(cleanup);

	it('is the second section of Arena, with the number of live games', () => {
		const view = mount(FEW, 70);
		const links = [
			...view.getByRole('navigation', { name: 'Arena sections' }).querySelectorAll('a'),
		];
		expect(links.map((a) => a.getAttribute('href'))).toEqual(['/arena', '/arena/live']);
		expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page']);
		expect(links[1].textContent?.replace(/\s+/g, ' ')).toContain('Live games 70');
		expect(view.getAllByRole('heading', { level: 1 })).toHaveLength(1);
	});

	it('lists the games top rated first, each one a link to watch it', () => {
		const view = mount(FEW);
		expect(rowLinks(view)).toEqual(['/live/strong', '/live/person', '/live/weak', '/live/guest']);
		const first = within(view.getByRole('list', { name: 'Live games' })).getAllByRole('link')[0];
		expect(first.getAttribute('aria-label')).toBe(
			'Watch grove cedar against grove larch, Rapid 10 + 5 · move 12',
		);
		const text = first.textContent?.replace(/\s+/g, ' ') ?? '';
		expect(text).toContain('grove cedar');
		expect(text).toContain('2,324');
		expect(text).toContain('Rapid 10 + 5');
	});

	it('marks a game with a human, also a guest without a name or a rating', () => {
		const view = mount(FEW);
		const rows = within(view.getByRole('list', { name: 'Live games' })).getAllByRole('link');
		const text = (i: number) => rows[i].textContent?.replace(/\s+/g, ' ') ?? '';
		expect(text(1)).toMatch(/PlayerOne Player 2,177/);
		expect(text(3)).toMatch(/Anonymous player Player unrated/);
		// A game of two bots carries no such mark.
		expect(text(0)).not.toContain('Player');
	});

	it('reaches the games with a human through their filter, and says how many there are', async () => {
		const view = mount(FEW);
		const chip = (name: RegExp) =>
			view.getByRole('button', { name }).textContent?.replace(/\s+/g, ' ');
		expect(chip(/All games/)).toContain('4');
		expect(chip(/With a human/)).toContain('2');
		expect(chip(/Bots only/)).toContain('2');

		await press(view, /With a human/);
		expect(rowLinks(view)).toEqual(['/live/person', '/live/guest']);
		expect(view.getByRole('button', { name: /With a human/ }).getAttribute('aria-pressed')).toBe(
			'true',
		);
		await press(view, /Bots only/);
		expect(rowLinks(view)).toEqual(['/live/strong', '/live/weak']);
	});

	it('filters by speed and finds a player by name', async () => {
		const view = mount(FEW);
		await fireEvent.change(view.getByRole('combobox', { name: 'Speed' }), {
			target: { value: 'rapid' },
		});
		expect(rowLinks(view)).toEqual(['/live/strong']);
		await fireEvent.change(view.getByRole('combobox', { name: 'Speed' }), {
			target: { value: 'any' },
		});
		await fireEvent.input(view.getByRole('searchbox', { name: 'Find a bot or player' }), {
			target: { value: 'maple' },
		});
		expect(rowLinks(view)).toEqual(['/live/person']);
		expect(view.getByRole('status').textContent).toContain('Showing 1 of 1 live games');
	});

	it('says so when nothing matches, and clears the filters in one press', async () => {
		const view = mount(FEW);
		await fireEvent.input(view.getByRole('searchbox'), { target: { value: 'nobody' } });
		expect(view.getByText('No live game matches these filters.')).toBeTruthy();
		expect(view.queryByRole('list', { name: 'Live games' })).toBeNull();
		await press(view, 'Clear the filters');
		expect(rowLinks(view)).toHaveLength(4);
		expect((view.getByRole('searchbox') as HTMLInputElement).value).toBe('');
	});

	it('shows one page and adds to it on request', async () => {
		const view = mount(many(60), 60);
		expect(rowLinks(view)).toHaveLength(25);
		expect(view.getByRole('status').textContent).toContain(
			'Showing 25 of 60 live games, top rated first',
		);
		await press(view, 'Show 25 more');
		expect(rowLinks(view)).toHaveLength(50);
		// What is left is fewer than a page, and the button says how many.
		await press(view, 'Show 10 more');
		expect(rowLinks(view)).toHaveLength(60);
		expect(view.queryByRole('button', { name: /Show .* more/ })).toBeNull();
	});

	it('starts from one page again when a filter changes', async () => {
		const view = mount(many(60), 60);
		await press(view, 'Show 25 more');
		expect(rowLinks(view)).toHaveLength(50);
		await press(view, /Bots only/);
		expect(rowLinks(view)).toHaveLength(25);
	});

	it('says plainly when the server lists fewer games than are being played', () => {
		const capped = mount(many(50), 100);
		expect(
			capped.getByText('The server lists the 50 most active of 100 games being played.'),
		).toBeTruthy();
		cleanup();
		const whole = mount(FEW, 4);
		expect(whole.queryByText(/most active of/)).toBeNull();
	});

	it('shows the same games as boards on request, in the same order', async () => {
		const view = mount(FEW);
		expect(view.container.querySelectorAll('.mini-board')).toHaveLength(0);
		await press(view, 'Boards');
		expect(view.container.querySelectorAll('.mini-board')).toHaveLength(4);
		expect(rowLinks(view)).toEqual(['/live/strong', '/live/person', '/live/weak', '/live/guest']);
		// The mark of a person is on a board card too.
		const person = within(view.getByRole('list', { name: 'Live games' })).getAllByRole('link')[1];
		expect(person.textContent).toContain('Player');
	});

	it('tells loading from empty, and says when the games cannot be loaded', () => {
		feed.loaded = false;
		const loading = mount([]);
		expect(loading.getByRole('status').textContent).toContain('Loading the games');
		cleanup();
		feed.loaded = true;
		const empty = mount([]);
		expect(empty.getByText('No game is being played right now.')).toBeTruthy();
		expect(empty.queryByRole('button', { name: 'Clear the filters' })).toBeNull();
		cleanup();
		feed.unavailable = true;
		const failed = mount(FEW);
		expect(failed.getByRole('alert').textContent).toContain('cannot be loaded');
		// The last list stays on screen.
		expect(rowLinks(failed)).toHaveLength(4);
	});

	it('runs the feed while the page is shown, and nothing in a build without a server', () => {
		const view = mount(FEW);
		expect(feed.started).toBe(1);
		view.unmount();
		expect(feed.stopped).toBe(1);
		feed.live = false;
		const off = mount(FEW);
		expect(feed.started).toBe(1);
		expect(off.getByText(/this build has none/)).toBeTruthy();
	});
});

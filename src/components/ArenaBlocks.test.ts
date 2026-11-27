import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { FeaturedView } from '#lib/arena/arenaFeed.svelte.js';
import type { LiveGame, Seek } from '#lib/live/liveTypes.js';

// The four blocks of the Arena overview (#259). Each draws what it is given; which game is
// featured is decided elsewhere and tested there (lib/arena). The network edge is faked for the
// two blocks that talk to the server themselves: taking a seat, and the standings.
const api = vi.hoisted(() => ({ acceptSeek: vi.fn(), fetchLeaderboard: vi.fn() }));
vi.mock('#lib/live/lobbyApi.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/live/lobbyApi.js')>()),
	acceptSeek: api.acceptSeek,
}));
vi.mock('#lib/leaderboard/leaderboardApi.js', () => ({ fetchLeaderboard: api.fetchLeaderboard }));
vi.mock('#lib/ingest/guestIdentity.js', () => ({ getGuestUuid: () => 'guest-uuid' }));
const auth = vi.hoisted(() => ({
	authStore: {
		status: 'signed-out' as 'loading' | 'signed-in' | 'signed-out' | 'unavailable',
		canSignIn: true,
		signIn: vi.fn(),
	},
}));
vi.mock('#lib/authStore.svelte.js', () => auth);

import { SeekAcceptError } from '#lib/live/lobbyApi.js';
import ArenaFeatured from './ArenaFeatured.svelte';
import ArenaGames from './ArenaGames.svelte';
import ArenaSeats from './ArenaSeats.svelte';
import ArenaStandings from './ArenaStandings.svelte';

const POSITION = 'r1bqk2r/pp2bppp/2n1pn2/3p4/3P1B2/2N1PN2/PP3PPP/R2QKB1R w KQkq - 0 19';
const game = (gameId: string, extra: Partial<LiveGame> = {}): LiveGame => ({
	gameId,
	players: {
		white: { kind: 'Bot', name: `${gameId}-white`, rating: 2303 },
		black: { kind: 'Human', name: `${gameId}-black`, rating: 2324.6 },
	},
	timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
	activeSeat: 'White',
	dicePending: false,
	clocks: { white: 298_000, black: 300_000 },
	version: 30,
	dfen: `${POSITION} QKN`,
	...extra,
});
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('ArenaFeatured', () => {
	const view = (extra: Partial<FeaturedView> = {}): FeaturedView => ({
		phase: 'live',
		game: game('g1'),
		over: null,
		readAt: Date.now(),
		...extra,
	});

	it('shows both players with their ratings and clocks, the terms and the move', () => {
		vi.useFakeTimers({ now: 1_000_000 });
		const { getByRole } = render(ArenaFeatured, {
			view: view({ readAt: 1_000_000 }),
			loaded: true,
		});
		const card = text(getByRole('region', { name: 'Featured game' }));
		expect(card).toContain('Live');
		expect(card).toContain('Blitz 5 + 3 · move 19');
		expect(card).toContain('g1-white');
		expect(card).toContain('2,303');
		// Ratings arrive as raw numbers and are rounded where they are shown.
		expect(card).toContain('2,325');
		expect(getByRole('region').querySelector('[aria-label="g1-white, clock 4:58"]')).toBeTruthy();
		expect(getByRole('region').querySelector('[aria-label="g1-black, clock 5:00"]')).toBeTruthy();
	});

	it('marks a bot as a bot and a person as nothing', () => {
		const { getByRole } = render(ArenaFeatured, { view: view(), loaded: true });
		expect(text(getByRole('region'))).toMatch(/g1-white Bot/);
		expect(text(getByRole('region'))).not.toMatch(/g1-black Bot/);
	});

	it('shows the dice of the side to move, in words for a screen reader', () => {
		const { getByRole } = render(ArenaFeatured, { view: view(), loaded: true });
		const dice = getByRole('list', { name: 'Dice of the side to move: queen, king, and knight' });
		expect(dice.querySelectorAll('li')).toHaveLength(3);
		expect(text(getByRole('region'))).toContain('White to move');
	});

	it('says who is to roll while the dice are not on the board yet', () => {
		const pending = view({ game: game('g1', { dicePending: true, dfen: POSITION }) });
		const { getByRole, queryByRole } = render(ArenaFeatured, { view: pending, loaded: true });
		expect(queryByRole('list')).toBeNull();
		expect(text(getByRole('region'))).toContain('White to roll');
	});

	it('counts down the clock of the side to move between reads, and no other', async () => {
		vi.useFakeTimers({ now: 1_000_000 });
		const { getByRole } = render(ArenaFeatured, {
			view: view({ readAt: 1_000_000 }),
			loaded: true,
		});
		await vi.advanceTimersByTimeAsync(5000);
		const region = getByRole('region');
		expect(region.querySelector('[aria-label="g1-white, clock 4:53"]')).toBeTruthy();
		expect(region.querySelector('[aria-label="g1-black, clock 5:00"]')).toBeTruthy();
	});

	it('shows the final position with the result, and stops the clocks', async () => {
		vi.useFakeTimers({ now: 1_000_000 });
		const final = view({
			phase: 'final',
			readAt: 1_000_000,
			over: { result: { Win: { side: 'Black' } }, termination: 'Resign' },
		});
		const { getByRole, queryByRole } = render(ArenaFeatured, { view: final, loaded: true });
		await vi.advanceTimersByTimeAsync(5000);
		expect(text(getByRole('region'))).toContain('Final position');
		expect(getByRole('status').textContent).toBe('Black won');
		expect(queryByRole('list')).toBeNull();
		expect(getByRole('region').querySelector('[aria-label="g1-white, clock 4:58"]')).toBeTruthy();
	});

	it('says a draw is a draw', () => {
		const drawn = view({
			phase: 'final',
			over: { result: { Draw: {} }, termination: 'Draw' },
		});
		const { getByRole } = render(ArenaFeatured, { view: drawn, loaded: true });
		expect(getByRole('status').textContent).toBe('Draw');
	});

	it('calls an aborted game aborted, not a draw', () => {
		const aborted = view({
			phase: 'final',
			over: { result: { Draw: {} }, termination: 'Aborted' },
		});
		const { getByRole } = render(ArenaFeatured, { view: aborted, loaded: true });
		expect(getByRole('status').textContent).toBe('Game aborted.');
	});

	it('links to the game, to watch it', () => {
		const { getByRole } = render(ArenaFeatured, { view: view(), loaded: true });
		expect(getByRole('link', { name: 'Watch this game' }).getAttribute('href')).toBe('/live/g1');
	});

	it('has no clocks for a game without them, and seat names where a player has none', () => {
		const bare = view({ game: game('g1', { clocks: null, players: null }) });
		const { getByRole } = render(ArenaFeatured, { view: bare, loaded: true });
		expect(getByRole('region').querySelector('[aria-label*="clock"]')).toBeNull();
		expect(text(getByRole('region'))).toContain('Black');
	});

	it('tells loading from empty', () => {
		const loading = render(ArenaFeatured, { view: null, loaded: false });
		expect(loading.getByRole('status').textContent).toContain('Looking for a game');
		cleanup();
		const empty = render(ArenaFeatured, { view: null, loaded: true });
		expect(empty.getByText('No game is being played right now')).toBeTruthy();
	});
});

describe('ArenaGames', () => {
	const many = (n: number) => Array.from({ length: n }, (_, i) => game(`g${i}`));
	const mount = (n: number, total = n) =>
		render(ArenaGames, { games: many(n), total, allHref: '/arena/live' });
	const links = (container: HTMLElement) =>
		[...container.querySelectorAll('ul a')].map((a) => a.getAttribute('href'));

	it('shows two games as boards and four as rows, however many there are', () => {
		const { container } = mount(99, 100);
		expect(links(container)).toEqual([
			'/live/g0',
			'/live/g1',
			'/live/g2',
			'/live/g3',
			'/live/g4',
			'/live/g5',
		]);
		expect(container.querySelectorAll('.mini-board')).toHaveLength(2);
	});

	it('keeps all six places when fewer games are being played, so the block keeps its size', () => {
		const few = mount(2);
		const places = [...few.container.querySelectorAll('ul > li')].map((li) => li.className);
		cleanup();
		const full = mount(99, 100);
		const fullPlaces = [...full.container.querySelectorAll('ul > li')];
		expect(places).toHaveLength(6);
		expect(fullPlaces).toHaveLength(6);
		// The same fixed heights place by place; only the divider of an empty place is hidden.
		const heights = (classes: string) => classes.split(' ').filter((c) => /^(sm:)?h-/.test(c));
		expect(places.map(heights)).toEqual(fullPlaces.map((li) => heights(li.className)));
	});

	it('names each game for a screen reader and says its terms', () => {
		const { getAllByRole } = mount(3);
		expect(getAllByRole('link')[0].getAttribute('aria-label')).toBe(
			'Watch g0-white against g0-black, Blitz 5 + 3 · move 19',
		);
		expect(text(getAllByRole('link')[2])).toBe('g2-white vs g2-black Blitz 5 + 3 · move 19');
	});

	it('links to all games with the total, which can be more than the list', () => {
		const { getByRole, getByText } = mount(6, 100);
		expect(getByText('100 playing now')).toBeTruthy();
		const all = getByRole('link', { name: /All 100 live games/ });
		expect(all.getAttribute('href')).toBe('/arena/live');
	});

	it('says so when no other game is being played', () => {
		const { getByText, queryByRole } = mount(0, 1);
		expect(getByText('No other game is being played right now.')).toBeTruthy();
		// The featured game is the one game: the link to all of them is still there.
		expect(queryByRole('link', { name: /All 1 live games/ })).toBeTruthy();
	});
});

describe('ArenaSeats', () => {
	const blitz = { Fischer: { initialSeconds: 300, incrementSeconds: 3 } };
	const seek = (id: string, extra: Partial<Seek> = {}): Seek => ({
		id,
		timeControl: blitz,
		kind: 'Bot',
		name: `house bot-${id}`,
		rated: false,
		...extra,
	});

	beforeEach(() => {
		api.acceptSeek.mockReset();
		auth.authStore.status = 'signed-out';
		auth.authStore.signIn.mockReset();
		vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
	});

	it('lists bots that wait, a few of them, and no person', () => {
		const seeks = [
			seek('1'),
			seek('p', { kind: 'Human', name: 'PlayerOne' }),
			seek('2'),
			seek('3'),
			seek('4'),
		];
		const { container } = render(ArenaSeats, { seeks });
		const rows = [...container.querySelectorAll('ul > li')].map(text);
		expect(rows).toEqual([
			'house bot-1 Blitz 5 + 3 · casual Take a seat',
			'house bot-2 Blitz 5 + 3 · casual Take a seat',
			'house bot-3 Blitz 5 + 3 · casual Take a seat',
		]);
	});

	it('starts the game at once, on the seat the server drew', async () => {
		api.acceptSeek.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'Black' });
		const { getByRole } = render(ArenaSeats, { seeks: [seek('1')] });
		await fireEvent.click(
			getByRole('button', { name: 'Take a seat against house bot-1, Blitz 5 + 3' }),
		);
		await waitFor(() =>
			expect(location.href).toBe('https://play.example/live/g1?seat=t1&as=black'),
		);
		expect(api.acceptSeek).toHaveBeenCalledExactlyOnceWith('1', 'guest-uuid');
	});

	it('takes one seat at a time', async () => {
		api.acceptSeek.mockReturnValue(new Promise(() => {}));
		const { getAllByRole } = render(ArenaSeats, { seeks: [seek('1'), seek('2')] });
		const [first, second] = getAllByRole('button') as HTMLButtonElement[];
		await fireEvent.click(first);
		expect(second.disabled).toBe(true);
		second.click();
		expect(api.acceptSeek).toHaveBeenCalledOnce();
	});

	it('says the seat was taken and asks for a fresh list', async () => {
		api.acceptSeek.mockRejectedValue(new SeekAcceptError(409));
		const onstale = vi.fn();
		const { getByRole, findByRole } = render(ArenaSeats, { seeks: [seek('1')], onstale });
		await fireEvent.click(getByRole('button', { name: /Take a seat against/ }));
		expect((await findByRole('alert')).textContent).toBe('That seat was just taken. Pick another.');
		expect(onstale).toHaveBeenCalledOnce();
		expect(
			(getByRole('button', { name: /Take a seat against/ }) as HTMLButtonElement).disabled,
		).toBe(false);
	});

	it('offers a guest "Sign in to sit" at a rated table, and tells a refused visitor why', async () => {
		const rated = [seek('1', { rated: true })];
		const guest = render(ArenaSeats, { seeks: rated });
		expect(text(guest.container.querySelector('ul > li'))).toContain('Blitz 5 + 3 · rated');
		await fireEvent.click(guest.getByRole('button', { name: /Sign in to take a seat/ }));
		expect(auth.authStore.signIn).toHaveBeenCalledOnce();
		expect(api.acceptSeek).not.toHaveBeenCalled();
		cleanup();

		auth.authStore.status = 'signed-in';
		api.acceptSeek.mockRejectedValue(new SeekAcceptError(403));
		const member = render(ArenaSeats, { seeks: rated });
		await fireEvent.click(member.getByRole('button', { name: /Take a seat against/ }));
		expect((await member.findByRole('alert')).textContent).toBe(
			'That table plays for rating. Sign in to sit down.',
		);
	});

	it('says so when no bot is waiting, and always points at the open tables', () => {
		const { getByText, getByRole } = render(ArenaSeats, { seeks: [] });
		expect(getByText('No bot is waiting at a table right now.')).toBeTruthy();
		expect(getByRole('link', { name: 'All bots and open tables' }).getAttribute('href')).toBe(
			'/play?tab=table',
		);
	});
});

describe('ArenaStandings', () => {
	const leader = (rank: number, kind: 'bot' | 'player', name: string, rating: number) => ({
		rank,
		kind,
		team: kind === 'bot' ? 'grove' : null,
		name,
		rating,
		rd: 60,
		onLadder: true,
		games: 10,
		wins: 5,
		draws: 1,
		losses: 4,
	});
	const BOARD = {
		category: 'blitz',
		leaders: [
			leader(1, 'bot', 'cedar', 2324.4),
			leader(2, 'player', 'PlayerOne', 2303),
			leader(3, 'bot', 'larch', 2289),
			leader(4, 'bot', 'elm', 2275),
			leader(5, 'bot', 'ash', 2177),
			leader(6, 'bot', 'oak', 2100),
		],
	};
	beforeEach(() => api.fetchLeaderboard.mockReset().mockResolvedValue(BOARD));

	it('shows the top five of blitz, bots and people on one scale', async () => {
		const { container, findByText, getByRole } = render(ArenaStandings);
		await findByText('grove cedar');
		expect(api.fetchLeaderboard).toHaveBeenCalledExactlyOnceWith('all', 'blitz');
		expect(getByRole('heading', { level: 2 }).textContent?.trim()).toBe('Standings · Blitz');
		const rows = [...container.querySelectorAll('ol > li')].map(text);
		expect(rows).toEqual([
			'1 grove cedar Bot 2,324',
			'2 PlayerOne Player 2,303',
			'3 grove larch Bot 2,289',
			'4 grove elm Bot 2,275',
			'5 grove ash Bot 2,177',
		]);
	});

	it('links each row to its profile, and the block to the leaderboard', async () => {
		const { findByRole, getByRole } = render(ArenaStandings);
		expect((await findByRole('link', { name: 'grove cedar' })).getAttribute('href')).toBe(
			'/bots/grove/cedar',
		);
		expect(getByRole('link', { name: 'PlayerOne' }).getAttribute('href')).toBe(
			'/players/PlayerOne',
		);
		expect(getByRole('link', { name: 'Full leaderboard' }).getAttribute('href')).toBe(
			'/leaderboard',
		);
	});

	it('says so when the standings cannot be loaded, and when nobody is on them', async () => {
		api.fetchLeaderboard.mockRejectedValue(new Error('503'));
		const failed = render(ArenaStandings);
		expect((await failed.findByRole('alert')).textContent).toBe(
			'The standings cannot be loaded right now.',
		);
		cleanup();
		api.fetchLeaderboard.mockResolvedValue({ category: 'blitz', leaders: [] });
		const empty = render(ArenaStandings);
		expect(await empty.findByText('Nobody has a settled rating yet.')).toBeTruthy();
	});
});

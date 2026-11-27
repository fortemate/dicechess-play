import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import type { CatalogBot } from '#lib/catalog/catalogApi.js';
import type { Seek } from '#lib/live/liveTypes.js';
import { preferencesStore } from '#lib/preferencesStore.svelte.js';

// The bot tab of Play (#257). The three sources of the list and the three ways a game starts
// are faked at the network edge, so these tests can pin what the issue asks for:
//
//   - a starter bot game starts without a single request;
//   - a catalog bot game starts with the request the catalog page sends today;
//   - "Ready now" follows the list of open seeks.
//
// Where the browser ends up after a start is checked in a real browser, as for every other
// start flow of this site; here a start is "the right call was made with the right values".

const api = vi.hoisted(() => ({
	live: true,
	fetchCatalog: vi.fn(),
	wakeBot: vi.fn(),
	playBot: vi.fn(),
	listSeeks: vi.fn(),
	acceptSeek: vi.fn(),
	goto: vi.fn(),
	preloadCode: vi.fn(),
	startPracticeGame: vi.fn(),
	rememberBotGame: vi.fn(),
}));

vi.mock('$app/navigation', () => ({ goto: api.goto, preloadCode: api.preloadCode }));
vi.mock('#lib/live/liveApi.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/live/liveApi.js')>()),
	isLiveEnabled: () => api.live,
}));
vi.mock('#lib/catalog/catalogApi.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/catalog/catalogApi.js')>()),
	fetchCatalog: api.fetchCatalog,
	wakeBot: api.wakeBot,
	playBot: api.playBot,
}));
vi.mock('#lib/live/lobbyApi.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/live/lobbyApi.js')>()),
	listSeeks: api.listSeeks,
	acceptSeek: api.acceptSeek,
}));
vi.mock('#lib/catalog/lastBotGame.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/catalog/lastBotGame.js')>()),
	rememberBotGame: api.rememberBotGame,
}));
vi.mock('#lib/playWithBot/practiceSetup.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/playWithBot/practiceSetup.js')>()),
	startPracticeGame: api.startPracticeGame,
}));
vi.mock('#lib/playWithBot/index.js', () => ({ playWithBotStore: { startNewGame: vi.fn() } }));
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
import PlayBots from './PlayBots.svelte';

const bot = (team: string, name: string, extra: Partial<CatalogBot> = {}): CatalogBot => ({
	team,
	name,
	rating: 1600,
	rd: 60,
	provisional: false,
	description: null,
	available: true,
	...extra,
});
const blitz = { Fischer: { initialSeconds: 300, incrementSeconds: 3 } };
const botSeek = (id: string, name: string, extra: Partial<Seek> = {}): Seek => ({
	id,
	timeControl: blitz,
	kind: 'Bot',
	name,
	rated: false,
	...extra,
});

const CATALOG = [bot('grove', 'willow'), bot('grove', 'larch', { rating: 2300 })];

const mount = (props: { preselect?: string | null } = {}) => render(PlayBots, props);
// Named through the helper: a bare `ReturnType<typeof render>` loses the component's own type.
type View = ReturnType<typeof mount>;

/** The row of a bot in the list: its radio, found by the name of the bot. */
const row = (view: ReturnType<typeof within>, name: RegExp) =>
	view.getByRole('radio', { name }) as HTMLInputElement;
const botRows = (container: HTMLElement) =>
	[...container.querySelectorAll<HTMLInputElement>('input[name="play-bot"]')].map(
		(input) => input.value,
	);

describe('PlayBots', () => {
	beforeEach(() => {
		for (const mock of Object.values(api)) if (typeof mock === 'function') mock.mockReset();
		api.live = true;
		api.fetchCatalog.mockResolvedValue({ bots: CATALOG });
		api.listSeeks.mockResolvedValue([]);
		api.preloadCode.mockResolvedValue(undefined);
		auth.authStore.status = 'signed-out';
		// The preferences store is a real singleton: reset what a start may have written.
		preferencesStore.setTimeLimit(null);
		preferencesStore.setTimeBonus(0);
		preferencesStore.setPlayerColorPreference('random');
		preferencesStore.setBotChallengeRated(false);
		preferencesStore.setBotChallengeTimeControl('fischer-300-5');
		preferencesStore.setBotChallengeColor('random');
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	describe('the list', () => {
		it('shows the starter bots and the arena bots as one choice', async () => {
			const { container, findByRole } = mount();
			await findByRole('radio', { name: /grove willow/ });
			const rows = botRows(container);
			expect(rows.slice(0, 2)).toEqual(['random', 'checkmate-aware']);
			expect(rows.slice(-2)).toEqual(['grove/willow', 'grove/larch']);
			// One radio group: choosing an arena bot lets go of the starter bot.
			expect(container.querySelectorAll('input[name="play-bot"]:checked')).toHaveLength(1);
		});

		it('starts on a starter bot, so the page is ready before any answer arrives', () => {
			api.fetchCatalog.mockReturnValue(new Promise(() => {}));
			const { getByRole } = mount();
			expect((getByRole('radio', { name: /Greedy/ }) as HTMLInputElement).checked).toBe(true);
			expect(getByRole('region', { name: 'Greedy' })).toBeTruthy();
			expect(getByRole('status').textContent).toContain('Loading the arena bots');
		});

		it('keeps the starter bots when the catalog cannot be loaded, and says so', async () => {
			api.fetchCatalog.mockRejectedValue(new Error('offline'));
			api.listSeeks.mockRejectedValue(new Error('offline'));
			const { findByRole, getByRole } = mount();
			expect((await findByRole('alert')).textContent).toContain('starter bots still work');
			expect(getByRole('radio', { name: /Random Level 1/ })).toBeTruthy();
		});

		it('asks the server nothing in a build without one', () => {
			api.live = false;
			const { getByText, getByRole } = mount();
			expect(api.fetchCatalog).not.toHaveBeenCalled();
			expect(api.listSeeks).not.toHaveBeenCalled();
			expect(getByText(/this build has none/)).toBeTruthy();
			expect(getByRole('radio', { name: /Greedy/ })).toBeTruthy();
		});

		it('says what choosing an arena bot leads to', async () => {
			api.fetchCatalog.mockResolvedValue({
				bots: [bot('grove', 'willow'), bot('grove', 'larch', { available: false })],
			});
			const { findByRole, getByRole } = mount();
			const willow = (await findByRole('radio', { name: /grove willow/ })).closest('label')!;
			expect(willow.textContent).toContain('Wakes up in a few seconds');
			expect(willow.textContent).toContain('1,600');
			const larch = getByRole('radio', { name: /grove larch/ }).closest('label')!;
			expect(larch.textContent).toContain('In a game right now');
		});
	});

	describe('"Ready now"', () => {
		it('follows the open seeks: it appears with the seek and goes with it', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			const { findByRole, getByRole } = mount();
			const willow = () => getByRole('radio', { name: /grove willow/ }).closest('label')!;
			await findByRole('radio', { name: /grove willow/ });
			expect(willow().textContent).not.toContain('Ready now');

			api.listSeeks.mockResolvedValue([botSeek('s1', 'grove willow')]);
			await vi.advanceTimersByTimeAsync(5000);
			await waitFor(() => expect(willow().textContent).toContain('Ready now'));
			expect(willow().textContent).toContain('Waiting at a table');

			api.listSeeks.mockResolvedValue([]);
			await vi.advanceTimersByTimeAsync(5000);
			await waitFor(() => expect(willow().textContent).not.toContain('Ready now'));
		});

		it('lists a bot that waits at a table even when the catalog does not know it', async () => {
			api.listSeeks.mockResolvedValue([botSeek('s1', 'house oracle')]);
			const { findByRole } = mount();
			const oracle = (await findByRole('radio', { name: /house oracle/ })).closest('label')!;
			expect(oracle.textContent).toContain('Ready now');
			expect(oracle.textContent).toContain('Waiting at a table · 5 + 3');
		});

		it('keeps the last list when one poll fails', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			api.listSeeks.mockResolvedValue([botSeek('s1', 'house oracle')]);
			const { findByRole, getByRole } = mount();
			await findByRole('radio', { name: /house oracle/ });
			api.listSeeks.mockRejectedValue(new Error('blip'));
			await vi.advanceTimersByTimeAsync(5000);
			expect(getByRole('radio', { name: /house oracle/ })).toBeTruthy();
		});

		it('says who left when the chosen bot is no longer at a table', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			api.listSeeks.mockResolvedValue([botSeek('s1', 'house oracle')]);
			const { findByRole, findByText, getByRole } = mount();
			await fireEvent.click(await findByRole('radio', { name: /house oracle/ }));
			expect(getByRole('region', { name: 'house oracle' })).toBeTruthy();

			api.listSeeks.mockResolvedValue([]);
			await vi.advanceTimersByTimeAsync(5000);
			expect(await findByText('house oracle is no longer waiting at a table.')).toBeTruthy();
			// The setup never turns silently into a game against another bot: it names the new one.
			expect(getByRole('region', { name: 'Greedy' })).toBeTruthy();
		});
	});

	describe('filters', () => {
		const press = (view: View, name: string) => fireEvent.click(view.getByRole('button', { name }));

		it('narrow the list without touching the choice', async () => {
			api.listSeeks.mockResolvedValue([botSeek('s1', 'house oracle')]);
			const view = mount();
			await view.findByRole('radio', { name: /grove willow/ });
			await view.findByRole('radio', { name: /house oracle/ });

			await press(view, 'Ready now');
			expect(botRows(view.container)).toEqual(['house oracle']);
			expect(view.getByRole('button', { name: 'Ready now' }).getAttribute('aria-pressed')).toBe(
				'true',
			);

			await press(view, 'In your browser');
			expect(botRows(view.container)).not.toContain('grove/willow');
			expect(botRows(view.container)).toContain('greedy');

			await press(view, 'Rated');
			expect(botRows(view.container)).toEqual(['grove/willow', 'grove/larch']);
			expect(view.getByRole('region', { name: 'Greedy' })).toBeTruthy();

			await press(view, 'All bots');
			expect(botRows(view.container)).toContain('greedy');
			expect(botRows(view.container)).toContain('house oracle');
		});

		it('say so when no bot is waiting at a table', async () => {
			const view = mount();
			await view.findByRole('radio', { name: /grove willow/ });
			await press(view, 'Ready now');
			expect(botRows(view.container)).toEqual([]);
			expect(view.getByText('No bot is waiting at a table right now.')).toBeTruthy();
		});
	});

	describe('a starter bot', () => {
		it('starts without a single request, with the choices of the panel', async () => {
			// No network at all: every source fails, and the start must not need them.
			api.fetchCatalog.mockRejectedValue(new Error('offline'));
			api.listSeeks.mockRejectedValue(new Error('offline'));
			const fetchSpy = vi.fn(() => Promise.reject(new Error('offline')));
			vi.stubGlobal('fetch', fetchSpy);
			const view = mount();

			await fireEvent.click(view.getByRole('radio', { name: /Aggressive \+ Book/ }));
			const setup = within(view.getByRole('region', { name: 'Aggressive + Book' }));
			expect(setup.getByText('Level 5 · in your browser')).toBeTruthy();
			await fireEvent.click(setup.getByRole('radio', { name: '5 + 3' }));
			await fireEvent.click(setup.getByRole('radio', { name: 'Black' }));
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));

			expect(api.startPracticeGame).toHaveBeenCalledOnce();
			const setupArg = api.startPracticeGame.mock.calls[0][0];
			expect(setupArg).toMatchObject({ algorithm: 'aggressive-book', color: 'black' });
			expect(api.goto).toHaveBeenCalledWith('/practice');
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(api.wakeBot).not.toHaveBeenCalled();
			expect(api.playBot).not.toHaveBeenCalled();
		});

		it('fetches the code of the practice page ahead, while there is a connection', () => {
			mount();
			expect(api.preloadCode).toHaveBeenCalledWith('/practice');
		});

		it('is never rated, and the panel gives the reason', () => {
			auth.authStore.status = 'signed-in';
			const view = mount();
			const setup = within(view.getByRole('region', { name: 'Greedy' }));
			expect(setup.queryByRole('radio', { name: 'Rated' })).toBeNull();
			expect(setup.getByText('Unrated game: starter bots never change your rating.')).toBeTruthy();
			expect(setup.getByText('Starts instantly, even without a connection.')).toBeTruthy();
		});
	});

	describe('an arena bot', () => {
		const chooseWillow = async (view: View) => {
			await fireEvent.click(await view.findByRole('radio', { name: /grove willow/ }));
			return within(view.getByRole('region', { name: 'grove willow' }));
		};

		it('is woken, then started with the request the catalog page sends', async () => {
			api.wakeBot.mockResolvedValue({ alive: true, busy: false });
			api.playBot.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'White' });
			vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
			const view = mount();
			const setup = await chooseWillow(view);
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));

			await waitFor(() => expect(api.playBot).toHaveBeenCalledOnce());
			expect(api.wakeBot).toHaveBeenCalledWith('grove', 'willow');
			// Byte for byte the body of `BotChallengePanel`: no `preferredColor` for a random seat,
			// `rated` always stated.
			expect(api.playBot).toHaveBeenCalledWith({
				guestId: 'guest-uuid',
				team: 'grove',
				name: 'willow',
				timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 5 } },
				rated: false,
			});
			await waitFor(() => expect(api.rememberBotGame).toHaveBeenCalledOnce());
			expect(api.rememberBotGame).toHaveBeenCalledWith({
				gameId: 'g1',
				team: 'grove',
				name: 'willow',
				timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 5 } },
				preferredColor: 'random',
				rated: false,
			});
			expect(api.startPracticeGame).not.toHaveBeenCalled();
		});

		it('sends the colour and the clock that were chosen, and remembers them', async () => {
			api.wakeBot.mockResolvedValue({ alive: true });
			api.playBot.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'Black' });
			vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
			const view = mount();
			const setup = await chooseWillow(view);
			await fireEvent.click(setup.getByRole('radio', { name: '1 + 1' }));
			await fireEvent.click(setup.getByRole('radio', { name: 'Black' }));
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));

			await waitFor(() => expect(api.playBot).toHaveBeenCalledOnce());
			expect(api.playBot.mock.calls[0][0]).toMatchObject({
				timeControl: { Fischer: { initialSeconds: 60, incrementSeconds: 1 } },
				preferredColor: 'Black',
			});
			expect(preferencesStore.botChallengeTimeControl).toBe('fischer-60-1');
			expect(preferencesStore.botChallengeColor).toBe('Black');
		});

		it('asks for a rated game only when a signed-in visitor chose it', async () => {
			auth.authStore.status = 'signed-in';
			api.wakeBot.mockResolvedValue({ alive: true });
			api.playBot.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'White' });
			vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
			const view = mount();
			const setup = await chooseWillow(view);
			await fireEvent.click(setup.getByRole('radio', { name: 'Rated' }));
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			await waitFor(() => expect(api.playBot).toHaveBeenCalledOnce());
			expect(api.playBot.mock.calls[0][0]).toMatchObject({ rated: true });
		});

		it('offers a guest no rated game', async () => {
			const view = mount();
			const setup = await chooseWillow(view);
			expect(setup.queryByRole('radio', { name: 'Rated' })).toBeNull();
		});

		it('shows that the bot is being woken, and cannot be started twice', async () => {
			let answer!: (value: { alive: boolean }) => void;
			api.wakeBot.mockReturnValue(new Promise((resolve) => (answer = resolve)));
			const view = mount();
			const setup = await chooseWillow(view);
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			const button = setup.getByRole('button', { name: /Waking the bot/ }) as HTMLButtonElement;
			expect(button.disabled).toBe(true);
			button.click();
			expect(api.wakeBot).toHaveBeenCalledOnce();
			answer({ alive: false });
			expect((await setup.findByRole('alert')).textContent).toContain("isn't answering");
			expect(api.playBot).not.toHaveBeenCalled();
			expect(setup.getByRole('button', { name: 'Start game' })).toBeTruthy();
		});

		it('tells a busy bot apart from a silent one', async () => {
			api.wakeBot.mockResolvedValue({ alive: false, busy: true });
			const view = mount();
			const setup = await chooseWillow(view);
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			expect((await setup.findByRole('alert')).textContent).toContain('playing right now');
			expect(api.playBot).not.toHaveBeenCalled();
		});

		it('treats a failed wake as a bot that does not answer', async () => {
			api.wakeBot.mockRejectedValue(new Error('network'));
			const view = mount();
			const setup = await chooseWillow(view);
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			expect((await setup.findByRole('alert')).textContent).toContain("isn't answering");
		});

		it('links to the profile of the bot', async () => {
			const view = mount();
			const setup = await chooseWillow(view);
			expect(setup.getByRole('link', { name: 'Bot profile' }).getAttribute('href')).toBe(
				'/bots/grove/willow',
			);
		});
	});

	describe('a bot at a table', () => {
		const chooseOracle = async (view: View) => {
			await fireEvent.click(await view.findByRole('radio', { name: /house oracle/ }));
			return within(view.getByRole('region', { name: 'house oracle' }));
		};

		it('is played by sitting down at its table, on the terms of the table', async () => {
			api.listSeeks.mockResolvedValue([botSeek('s1', 'house oracle')]);
			api.acceptSeek.mockResolvedValue({ gameId: 'g9', token: 't9', seat: 'Black' });
			vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
			const view = mount();
			const setup = await chooseOracle(view);
			// The table decides: one time control, no colour, no rated choice.
			expect(setup.getByRole('radio', { name: '5 + 3' })).toBeTruthy();
			expect(setup.queryByRole('radio', { name: 'White' })).toBeNull();
			expect(setup.getByText('Your color is drawn when you sit down.')).toBeTruthy();
			expect(setup.getByText('Casual table: this game does not change ratings.')).toBeTruthy();

			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			await waitFor(() => expect(api.acceptSeek).toHaveBeenCalledWith('s1', 'guest-uuid'));
			await waitFor(() =>
				expect(location.href).toBe('https://play.example/live/g9?seat=t9&as=black'),
			);
			expect(api.wakeBot).not.toHaveBeenCalled();
			expect(api.playBot).not.toHaveBeenCalled();
		});

		it('lets the visitor choose among the tables of one bot', async () => {
			api.listSeeks.mockResolvedValue([
				botSeek('s1', 'house oracle'),
				botSeek('s2', 'house oracle', { timeControl: { SuddenDeath: { initialSeconds: 600 } } }),
			]);
			api.acceptSeek.mockResolvedValue({ gameId: 'g9', token: 't9', seat: 'White' });
			vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
			const view = mount();
			const setup = await chooseOracle(view);
			await fireEvent.click(setup.getByRole('radio', { name: '10 min' }));
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			await waitFor(() => expect(api.acceptSeek).toHaveBeenCalledWith('s2', 'guest-uuid'));
		});

		it('tells a guest that a rated table needs a sign-in, before and after the refusal', async () => {
			api.listSeeks.mockResolvedValue([botSeek('s1', 'house oracle', { rated: true })]);
			api.acceptSeek.mockRejectedValue(new SeekAcceptError(403));
			const view = mount();
			const setup = await chooseOracle(view);
			expect(setup.getByText('Rated table: only a signed-in player can sit down.')).toBeTruthy();
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			expect((await setup.findByRole('alert')).textContent).toBe(
				'This table plays for rating. Sign in to sit down.',
			);
		});

		it('says the table was taken and reads the tables again', async () => {
			api.listSeeks.mockResolvedValue([botSeek('s1', 'house oracle')]);
			api.acceptSeek.mockRejectedValue(new SeekAcceptError(409));
			const view = mount();
			const setup = await chooseOracle(view);
			const reads = api.listSeeks.mock.calls.length;
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			expect((await setup.findByRole('alert')).textContent).toBe(
				'That table was just taken. Pick another bot.',
			);
			expect(api.listSeeks.mock.calls).toHaveLength(reads + 1);
		});
	});

	describe('a link', () => {
		it('preselects a starter bot at once', () => {
			const view = mount({ preselect: 'random' });
			expect(view.getByRole('region', { name: 'Random' })).toBeTruthy();
			expect(row(within(view.container), /Random Level 1/).checked).toBe(true);
		});

		it('preselects an arena bot once the catalog has answered', async () => {
			const view = mount({ preselect: 'grove/larch' });
			expect(await view.findByRole('region', { name: 'grove larch' })).toBeTruthy();
			expect(row(within(view.container), /grove larch/).checked).toBe(true);
		});

		it('preselects a bot at a table by its public name', async () => {
			api.listSeeks.mockResolvedValue([botSeek('s1', 'house oracle')]);
			const view = mount({ preselect: 'house oracle' });
			expect(await view.findByRole('region', { name: 'house oracle' })).toBeTruthy();
		});

		// A bot of the catalog that also holds a seek is a table bot until the catalog answers, under
		// another key. The link must end up on it whichever answer comes first.
		it('keeps the bot of a link when the seeks answer before the catalog', async () => {
			let deliver!: (value: { bots: CatalogBot[] }) => void;
			api.fetchCatalog.mockReturnValue(new Promise((resolve) => (deliver = resolve)));
			api.listSeeks.mockResolvedValue([botSeek('s1', 'grove willow')]);
			const view = mount({ preselect: 'grove/willow' });
			await waitFor(() => expect(api.listSeeks).toHaveBeenCalled());
			// Nothing online is listed, so nothing can be chosen under an identity that will change.
			expect(botRows(view.container)).not.toContain('grove willow');

			deliver({ bots: CATALOG });
			expect(await view.findByRole('region', { name: 'grove willow' })).toBeTruthy();
			expect(row(within(view.container), /grove willow/).value).toBe('grove/willow');
			expect(view.queryByText(/no longer waiting/)).toBeNull();
			expect(view.queryByText(/not in the list/)).toBeNull();
		});

		it('says so when the bot is not in the list, and keeps the default', async () => {
			const view = mount({ preselect: 'grove/nobody' });
			expect(
				await view.findByText('The bot from the link is not in the list right now.'),
			).toBeTruthy();
			expect(view.getByRole('region', { name: 'Greedy' })).toBeTruthy();
		});

		it('does not take the choice back after the visitor has chosen', async () => {
			const view = mount({ preselect: 'grove/larch' });
			await view.findByRole('region', { name: 'grove larch' });
			await fireEvent.click(view.getByRole('radio', { name: /Random Level 1/ }));
			await view.rerender({ preselect: 'grove/larch' });
			expect(view.getByRole('region', { name: 'Random' })).toBeTruthy();
		});
	});

	describe('while a game is starting', () => {
		it('keeps the opponent and the choices as they were at the click', async () => {
			let answer!: (value: { alive: boolean }) => void;
			api.wakeBot.mockReturnValue(new Promise((resolve) => (answer = resolve)));
			api.playBot.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'White' });
			vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
			const view = mount();
			await fireEvent.click(await view.findByRole('radio', { name: /grove willow/ }));
			const setup = within(view.getByRole('region', { name: 'grove willow' }));
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));

			// The wake is on its way: neither another bot nor another clock can be chosen now.
			const larch = view.getByRole('radio', { name: /grove larch/ }) as HTMLInputElement;
			// Locked through their fieldset, so `:disabled` is the question to ask, not the attribute.
			expect(larch.matches(':disabled')).toBe(true);
			expect(setup.getByRole('radio', { name: '1 + 1' }).matches(':disabled')).toBe(true);
			await fireEvent.click(larch);
			await fireEvent.change(larch);
			expect(view.getByRole('region', { name: 'grove willow' })).toBeTruthy();

			answer({ alive: true });
			await waitFor(() => expect(api.playBot).toHaveBeenCalledOnce());
			expect(api.playBot.mock.calls[0][0]).toMatchObject({
				team: 'grove',
				name: 'willow',
				timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 5 } },
			});
		});

		it('stays locked once the game exists, until the page is left', async () => {
			api.wakeBot.mockResolvedValue({ alive: true });
			api.playBot.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'White' });
			vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
			const view = mount();
			await fireEvent.click(await view.findByRole('radio', { name: /grove willow/ }));
			const setup = within(view.getByRole('region', { name: 'grove willow' }));
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			await waitFor(() => expect(api.rememberBotGame).toHaveBeenCalledOnce());
			const button = setup.getByRole('button', { name: /Starting/ }) as HTMLButtonElement;
			expect(button.disabled).toBe(true);
			button.click();
			expect(api.wakeBot).toHaveBeenCalledOnce();

			// Back from the board, out of the browser's page cache: the setup works again.
			const shown = new Event('pageshow') as PageTransitionEvent;
			Object.defineProperty(shown, 'persisted', { value: true });
			window.dispatchEvent(shown);
			expect(await setup.findByRole('button', { name: 'Start game' })).toBeTruthy();
		});

		it('does not report the table the visitor has just sat down at as gone', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			api.listSeeks.mockResolvedValue([botSeek('s1', 'house oracle')]);
			api.acceptSeek.mockResolvedValue({ gameId: 'g9', token: 't9', seat: 'Black' });
			vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
			const view = mount();
			await fireEvent.click(await view.findByRole('radio', { name: /house oracle/ }));
			const setup = within(view.getByRole('region', { name: 'house oracle' }));
			await fireEvent.click(setup.getByRole('button', { name: 'Start game' }));
			await waitFor(() => expect(api.acceptSeek).toHaveBeenCalledOnce());

			api.listSeeks.mockResolvedValue([]);
			await vi.advanceTimersByTimeAsync(5000);
			expect(view.queryByText(/no longer waiting/)).toBeNull();
		});
	});

	describe('on a phone', () => {
		it('sums up the game and folds the choices away until "Change" is pressed', async () => {
			const view = mount();
			const setup = view.getByRole('region', { name: 'Greedy' });
			const change = within(setup).getByRole('button', { name: 'Change' });
			expect(change.getAttribute('aria-expanded')).toBe('false');
			expect(setup.textContent?.replace(/\s+/g, ' ')).toContain(
				'Greedy · Unlimited · Random color',
			);
			const choices = within(setup)
				.getByRole('radio', { name: 'Unlimited' })
				.closest('fieldset')!.parentElement!;
			expect(choices.className).toContain('max-lg:hidden');

			await fireEvent.click(change);
			expect(
				within(setup).getByRole('button', { name: 'Done' }).getAttribute('aria-expanded'),
			).toBe('true');
			expect(choices.className).not.toContain('max-lg:hidden');
		});
	});
});

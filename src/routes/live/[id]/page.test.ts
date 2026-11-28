import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

/*
 * The live board's finished-game actions (#216): which of them a given ending offers, and what
 * "Copy link" actually puts on the clipboard. The rule itself lives in `#lib/live/replayLink.js` and
 * is tested there; this suite covers what only the page can answer — that the rule is wired to the
 * right store fields, and that the copy button's feedback and failure path behave.
 *
 * Named `page.test.ts`, not `+page.test.ts`: a leading `+` marks a SvelteKit route file. Same
 * convention as `src/routes/leaderboard/page.test.ts`.
 *
 * The board's own children (board, dice, clocks, history) are stubbed: they are covered by their
 * own suites and by the e2e smoke, and rendering chessground here would test the wrong thing.
 */
vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: Record<string, string>) =>
		params ? path.replace('[id]', params.id) : path,
}));
const pageState = vi.hoisted(() => ({
	params: { id: 'game-1' } as Record<string, string>,
	url: new URL('http://x/live/game-1'),
}));
vi.mock('$app/state', () => ({ page: pageState }));
const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));

// `vi.mock` factories are hoisted above every top-level binding, so the stub has to be reached
// through `vi.hoisted` (or re-imported per factory) rather than a plain const.
const stub = vi.hoisted(() => async () => ({
	default: (await import('./ChildStub.test.svelte')).default,
}));
vi.mock('../../../components/Board.svelte', stub);
vi.mock('../../../components/TurnCard.svelte', stub);
vi.mock('../../../components/PreRollDrawGate.svelte', stub);
vi.mock('../../../components/MoveList.svelte', stub);
vi.mock('../../../components/PlayerStrip.svelte', stub);
vi.mock('../../../components/PawnPromotionSelector.svelte', stub);
vi.mock('../../../components/BotRematchButton.svelte', stub);

vi.mock('#lib/sound.js', () => ({ preloadSounds: vi.fn(), playSound: vi.fn() }));
vi.mock('#lib/catalog/lastBotGame.js', () => ({ recallBotGame: () => null }));
vi.mock('#lib/leaderboard/leaderboardApi.js', () => ({ fetchPlayerProfile: vi.fn() }));
const ratingApi = vi.hoisted(() => ({ fetchGameRatingChange: vi.fn().mockResolvedValue(null) }));
vi.mock('#lib/live/ratingApi.js', () => ratingApi);
// The spectator's public continuation read (#106). Default answer: an ordinary game still being
// played — `waiting` with no deadline — so existing cases see no follow activity.
const continuation = vi.hoisted(() => ({
	getContinuation: vi.fn(),
}));
vi.mock('#lib/live/continuationApi.js', async () => {
	const actual = await vi.importActual<typeof import('#lib/live/continuationApi.js')>(
		'#lib/live/continuationApi.js',
	);
	return { ...actual, getContinuation: continuation.getContinuation };
});
vi.mock('#lib/live/rematchApi.js', () => ({
	getRematch: vi.fn().mockResolvedValue({
		sourceGameId: 'game-1',
		phase: 'available',
		serverNow: '2026-09-07T12:00:00Z',
		myConsent: false,
		allowedActions: ['propose'],
		settings: {
			timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
			rated: true,
			mode: 'classic',
		},
		deadlineAt: '2026-09-07T12:00:15Z',
	}),
	postRematch: vi.fn(),
	RematchApiError: class extends Error {},
}));

// The public list of live games, which only the watching view reads (#263).
const lobby = vi.hoisted(() => ({ listGames: vi.fn().mockResolvedValue({ games: [], total: 0 }) }));
vi.mock('#lib/live/lobbyApi.js', () => lobby);

const toastStore = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('#lib/toastStore.svelte.js', () => ({ toastStore }));

// The invitation link of a game by link lives in session storage (#256); the page only asks for
// the one that belongs to its game.
const invite = vi.hoisted(() => ({ link: null as string | null, forget: vi.fn() }));
vi.mock('#lib/live/friendInvite.js', () => ({
	recallFriendInvite: () => invite.link,
	forgetFriendInvite: invite.forget,
}));

const state = vi.hoisted(() => ({
	current: {} as Record<string, unknown>,
}));
vi.mock('#lib/live/liveGameStore.svelte.js', () => ({
	LiveGameStore: class {
		constructor() {
			Object.assign(this, state.current);
		}
	},
}));

import LivePage from './+page.svelte';

function storeState(overrides: Record<string, unknown> = {}) {
	return {
		gameStatus: 'over',
		termination: 'Resign',
		authoritativeOver: { result: { Win: { side: 'White' } }, termination: 'Resign' },
		rematchStartup: null,
		spectator: false,
		outcome: 'won',
		winner: 'White',
		players: null,
		rated: false,
		connection: 'open',
		playerColor: 'w',
		activeColor: 'w',
		currentDice: [],
		historyBlocks: [],
		currentMoveIndex: 0,
		maxMoveIndex: 0,
		isManuallyBrowsing: false,
		isAnimatingRoll: false,
		hasClocks: false,
		whiteClockMs: null,
		blackClockMs: null,
		canResign: false,
		isPreRollResponder: false,
		isPreRollGateActive: false,
		finishedFromArchive: false,
		respondDraw: vi.fn(),
		drawOfferControlState: 'hidden',
		drawArmRefusal: null,
		doubling: null,
		pendingPromotion: null,
		passNoticeSeat: null,
		connect: vi.fn(),
		dispose: vi.fn(),
		resign: vi.fn(),
		setMoveIndex: vi.fn(),
		completePromotion: vi.fn(),
		cancelPromotion: vi.fn(),
		...overrides,
	};
}

describe('live board — separate training results (#124)', () => {
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		ratingApi.fetchGameRatingChange.mockReset().mockResolvedValue(null);
	});
	it('loads the recorded training update even when competitive rated is false', async () => {
		state.current = storeState({ rated: false, ratingDomain: 'training' });
		ratingApi.fetchGameRatingChange.mockResolvedValue({
			gameId: 'game-1',
			applied: true,
			outcome: 'applied',
			ratingDomain: 'training',
			white: { before: 1500, after: 1512 },
			black: null,
			reason: 'Synthetic training fixture',
			trainingReference: {
				source: 'anchor',
				rating: 1800,
				rd: 30,
				epoch: 2,
				anchorSetVersion: 'synthetic-v2',
			},
		});
		const view = render(LivePage);
		await waitFor(() =>
			expect(ratingApi.fetchGameRatingChange).toHaveBeenCalledWith(
				'game-1',
				expect.any(AbortSignal),
			),
		);
		await waitFor(() =>
			expect(view.getAllByText(/Synthetic training fixture/).length).toBeGreaterThan(0),
		);
		expect(view.getAllByText('1500 → 1512').length).toBeGreaterThan(0);
	});
	it('shows a confirmed casual game without waiting for a rating batch', async () => {
		vi.useFakeTimers();
		state.current = storeState({ rated: false, ratingDomain: 'casual' });
		ratingApi.fetchGameRatingChange.mockReset().mockResolvedValue({
			gameId: 'game-1',
			applied: false,
			outcome: 'casual',
			ratingDomain: 'casual',
			white: null,
			black: null,
			reason: 'Recorded casual fixture',
		});
		const view = render(LivePage);
		await act(async () => {
			await Promise.resolve();
		});
		expect(view.getAllByText('Rating unchanged.').length).toBeGreaterThan(0);
		expect(view.getAllByText('Reason: Recorded casual fixture.').length).toBeGreaterThan(0);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000);
		});
		expect(ratingApi.fetchGameRatingChange).toHaveBeenCalledExactlyOnceWith(
			'game-1',
			expect.any(AbortSignal),
		);
	});
});

describe('live board — a result read back from the archive (#109)', () => {
	afterEach(cleanup);

	it('names the outcome in the rail without a dialog over the board', () => {
		state.current = storeState({
			gameStatus: 'over',
			termination: 'Timeout',
			outcome: 'lost',
			winner: 'Black',
			finishedFromArchive: true,
			connection: 'connecting', // the socket is still failing against the evicted room
		});

		const { getAllByText, queryByRole } = render(LivePage);

		expect(getAllByText('You lost.').length).toBeGreaterThan(0);
		// The viewer did not watch this end. The result is in the rail, as for every finished game.
		expect(queryByRole('dialog')).toBeNull();
	});

	it('tells the seat that joined it won, even though the startup gate is still on record', () => {
		// The successor aborted because the opponent never joined: the room is evicted with
		// `rematchStartup` still reading `awaiting_joins`, which used to hijack the headline.
		state.current = storeState({
			gameStatus: 'over',
			termination: 'Timeout',
			outcome: 'won',
			winner: 'Black',
			rematchStartup: { phase: 'awaiting_joins', joinDeadlineAt: '2026-09-08T20:17:19Z' },
		});

		const { getAllByText, queryAllByText } = render(LivePage);

		expect(getAllByText('You won! 🎉').length).toBeGreaterThan(0);
		expect(queryAllByText(/Awaiting opponent/)).toHaveLength(0);
	});

	it('shows the result in the rail, not over the board, for a game that ended in front of the viewer', () => {
		// The result used to open as a dialog here. Since #256 it takes the place of the turn card,
		// so the board and the move list stay in view.
		state.current = storeState({
			gameStatus: 'over',
			termination: 'Resign',
			outcome: 'won',
			winner: 'White',
			finishedFromArchive: false,
		});

		const { getByRole, queryByRole } = render(LivePage);

		expect(queryByRole('dialog')).toBeNull();
		const result = getByRole('region', { name: 'Result' });
		expect(result.textContent).toContain('You won! 🎉');
		expect(result.textContent).toContain('Resigned');
		// The turn card is gone: the result has taken its place, it is not stacked on top of it.
		expect(queryByRole('region', { name: 'Turn' })).toBeNull();
	});
});

describe('live board — finished-game replay actions', () => {
	beforeEach(() => {
		state.current = storeState();
		toastStore.error.mockReset();
		goto.mockReset();
		sessionStorage.clear();
		continuation.getContinuation.mockReset().mockResolvedValue({
			sourceGameId: 'game-1',
			serverNow: '2026-09-07T12:00:00Z',
			phase: 'waiting',
		});
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('offers the replay and a copy button once a game has ended', () => {
		const { getAllByRole } = render(LivePage);

		expect(getAllByRole('link', { name: /watch replay/i }).length).toBeGreaterThan(0);
		expect(getAllByRole('button', { name: /copy link/i }).length).toBeGreaterThan(0);
	});

	it('points the replay link at /replay/{id}, never the board URL', () => {
		const { getAllByRole } = render(LivePage);

		for (const link of getAllByRole('link', { name: /watch replay/i })) {
			expect(link.getAttribute('href')).toBe('/replay/game-1');
		}
	});

	it('offers neither for an aborted game — play-api never archived it', () => {
		state.current = storeState({ termination: 'Aborted' });

		const { queryAllByRole } = render(LivePage);

		expect(queryAllByRole('link', { name: /watch replay/i })).toHaveLength(0);
		expect(queryAllByRole('button', { name: /copy link/i })).toHaveLength(0);
	});

	it('offers neither while the game is still being played', () => {
		state.current = storeState({ gameStatus: 'playing', termination: null });

		const { queryAllByRole } = render(LivePage);

		expect(queryAllByRole('link', { name: /watch replay/i })).toHaveLength(0);
	});

	it('copies the absolute, token-free replay URL and confirms it', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		const { getAllByRole } = render(LivePage);

		await fireEvent.click(getAllByRole('button', { name: /copy link/i })[0]);

		expect(writeText).toHaveBeenCalledWith(`${location.origin}/replay/game-1`);
		await waitFor(() =>
			expect(getAllByRole('button', { name: /copied/i }).length).toBeGreaterThan(0),
		);
		expect(toastStore.error).not.toHaveBeenCalled();
	});

	it('says so rather than failing silently when the clipboard is blocked', async () => {
		vi.stubGlobal('navigator', {
			clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
		});
		const { getAllByRole } = render(LivePage);

		await fireEvent.click(getAllByRole('button', { name: /copy link/i })[0]);

		await waitFor(() => expect(toastStore.error).toHaveBeenCalledOnce());
		expect(getAllByRole('button', { name: /copy link/i }).length).toBeGreaterThan(0);
	});

	it('renders "Draw by agreement" on draw termination', () => {
		state.current = storeState({
			gameStatus: 'over',
			termination: 'Draw',
			outcome: 'draw',
		});

		const { getAllByText } = render(LivePage);
		expect(getAllByText('Draw by agreement').length).toBeGreaterThan(0);
	});

	it('offers the draw control while the opponent is on move, which is what a forced pass needs', async () => {
		const toggleArmDrawOffer = vi.fn();
		state.current = storeState({
			gameStatus: 'waiting',
			canResign: true,
			playerColor: 'w',
			activeColor: 'b', // the opponent is thinking; arming still has to be reachable
			currentDice: [],
			drawOfferControlState: 'idle',
			toggleArmDrawOffer,
		});

		const { getByRole } = render(LivePage);
		const drawBtn = getByRole('button', { name: /offer a draw/i }) as HTMLButtonElement;
		expect(drawBtn.disabled).toBe(false);
		expect(drawBtn.textContent?.trim()).toBe('Offer a draw');

		await fireEvent.click(drawBtn);
		expect(toggleArmDrawOffer).toHaveBeenCalledOnce();
	});

	it('shows the armed state in words', () => {
		state.current = storeState({
			gameStatus: 'playing',
			canResign: true,
			drawOfferControlState: 'armed',
		});

		const { getByRole } = render(LivePage);
		const drawBtn = getByRole('button', { name: /draw offer armed/i });

		expect((drawBtn as HTMLButtonElement).disabled).toBe(false);
		expect(drawBtn.textContent?.trim()).toBe('Draw offer armed');
	});

	it("says whose turn it is to offer when the right is not this seat's", () => {
		state.current = storeState({
			gameStatus: 'playing',
			canResign: true,
			drawOfferControlState: 'forbidden',
		});

		const { getByRole } = render(LivePage);
		const drawBtn = getByRole('button', { name: /opponent must offer the next draw/i });

		expect((drawBtn as HTMLButtonElement).disabled).toBe(true);
		expect(drawBtn.textContent?.trim()).toBe('Offer a draw');
	});

	it('counts down the turns instead, where a deployment lets the right return', () => {
		state.current = storeState({
			gameStatus: 'playing',
			canResign: true,
			drawOfferControlState: 'forbidden',
			drawArmRefusal: { reason: 'draw offer cooldown', availableAfterTurns: 3 },
		});

		const { getByRole } = render(LivePage);

		const drawBtn = getByRole('button', { name: /draw offer available in 3 turns/i });
		expect(drawBtn).toBeTruthy();
		expect(drawBtn.textContent?.trim()).toBe('Offer a draw');
	});

	it('shows the offer as sent, and disables the control, while it is out', () => {
		state.current = storeState({
			gameStatus: 'playing',
			canResign: true,
			drawOfferControlState: 'pending',
		});

		const { getByRole } = render(LivePage);
		const drawBtn = getByRole('button', { name: /waiting for your opponent/i });

		expect((drawBtn as HTMLButtonElement).disabled).toBe(true);
		expect(drawBtn.textContent?.trim()).toBe('Draw offered');
	});

	it('declines by tapping the board, and only while this seat is the one being asked', async () => {
		const respondDraw = vi.fn();
		// Nothing pending: a board tap is an ordinary board gesture and must not answer anything.
		state.current = storeState({
			gameStatus: 'playing',
			isPreRollResponder: false,
			isViewingHistory: false,
			respondDraw,
		});
		const idle = render(LivePage);
		await fireEvent.pointerDown(idle.container.querySelector('.aspect-square')!);
		expect(respondDraw).not.toHaveBeenCalled();
		cleanup();

		// An offer is pending for this seat: before dice exist a board gesture has no other meaning.
		state.current = storeState({
			gameStatus: 'playing',
			isPreRollResponder: true,
			isViewingHistory: false,
			respondDraw,
		});
		const gated = render(LivePage);
		await fireEvent.pointerDown(gated.container.querySelector('.aspect-square')!);
		expect(respondDraw).toHaveBeenCalledWith(false);
		cleanup();

		// Scrubbing history is not an answer.
		respondDraw.mockClear();
		state.current = storeState({
			gameStatus: 'playing',
			isPreRollResponder: true,
			isViewingHistory: true,
			respondDraw,
		});
		const browsing = render(LivePage);
		await fireEvent.pointerDown(browsing.container.querySelector('.aspect-square')!);
		expect(respondDraw).not.toHaveBeenCalled();
	});

	it('disables resigning while the socket is down, rather than dropping the command', () => {
		state.current = storeState({
			gameStatus: 'playing',
			canResign: true,
			connection: 'connecting',
			drawOfferControlState: 'idle',
		});

		const { getByRole } = render(LivePage);
		const resignBtn = getByRole('button', { name: /resign unavailable while disconnected/i });

		expect((resignBtn as HTMLButtonElement).disabled).toBe(true);
		// The draw control travels with it: neither command can reach a closed socket.
		expect((getByRole('button', { name: /offer a draw/i }) as HTMLButtonElement).disabled).toBe(
			true,
		);
	});
});

describe('live board — how a staked game ends (#75)', () => {
	beforeEach(() => {
		toastStore.error.mockReset();
	});
	afterEach(() => {
		cleanup();
	});

	it('names a declined double and the credits lost, from the server’s amounts', () => {
		state.current = storeState({
			termination: 'DoubleDeclined',
			outcome: 'lost',
			winner: 'Black',
			settlement: '\u221210 credits',
		});

		const { getAllByText } = render(LivePage);

		expect(getAllByText('Double declined').length).toBeGreaterThan(0);
		expect(getAllByText('\u221210 credits').length).toBeGreaterThan(0);
	});

	it('keeps a resignation and a timeout at stake distinct from a dropped cube', () => {
		state.current = storeState({ termination: 'Timeout', settlement: '+10 credits' });
		const timeout = render(LivePage);
		expect(timeout.getAllByText('On time').length).toBeGreaterThan(0);
		expect(timeout.getAllByText('+10 credits').length).toBeGreaterThan(0);
		cleanup();

		state.current = storeState({ termination: 'Resign', settlement: '+10 credits' });
		const resigned = render(LivePage);
		expect(resigned.getAllByText('Resigned').length).toBeGreaterThan(0);
		expect(resigned.queryAllByText('Double declined')).toHaveLength(0);
	});

	it('shows no credits line for a classic game', () => {
		state.current = storeState();

		const { queryByTestId } = render(LivePage);

		expect(queryByTestId('settlement-line')).toBeNull();
	});

	it('renders a neutral reason for a termination this build does not know', () => {
		state.current = storeState({ termination: 'SomethingNew' });

		const { getAllByText } = render(LivePage);

		expect(getAllByText('Game over').length).toBeGreaterThan(0);
	});
});

describe('live board — ordinary HvH rematch flow (issue #105)', () => {
	beforeEach(() => {
		toastStore.error.mockReset();
	});
	afterEach(() => {
		cleanup();
	});

	it('renders rematch control on completed ordinary human game', async () => {
		state.current = storeState({
			gameStatus: 'over',
			authoritativeOver: { result: { Win: { side: 'White' } }, termination: 'Resign' },
			spectator: false,
			players: {
				white: { kind: 'Human', name: 'Player 1' },
				black: { kind: 'Human', name: 'Player 2' },
			},
		});

		const { getAllByRole } = render(LivePage);
		await waitFor(() => {
			const rematchBtns = getAllByRole('button', { name: /rematch/i });
			expect(rematchBtns.length).toBeGreaterThan(0);
		});
	});

	it('excludes rematch when opponent is a bot', () => {
		state.current = storeState({
			gameStatus: 'over',
			authoritativeOver: { result: { Win: { side: 'White' } }, termination: 'Resign' },
			spectator: false,
			players: {
				white: { kind: 'Human', name: 'Player 1' },
				black: { kind: 'Bot', name: 'Bot Alice' },
			},
		});

		const { queryByRole } = render(LivePage);
		// Ordinary rematch button is not rendered; fallback bot action or bot rematch button instead
		expect(queryByRole('button', { name: /rematch \(\d+s\)/i })).toBeNull();
	});

	it('excludes rematch for spectators', () => {
		state.current = storeState({
			gameStatus: 'over',
			authoritativeOver: { result: { Win: { side: 'White' } }, termination: 'Resign' },
			spectator: true,
			players: {
				white: { kind: 'Human', name: 'Player 1' },
				black: { kind: 'Human', name: 'Player 2' },
			},
		});

		const { queryByRole } = render(LivePage);
		expect(queryByRole('button', { name: /rematch/i })).toBeNull();
	});

	it('excludes rematch when game was aborted', () => {
		state.current = storeState({
			gameStatus: 'over',
			termination: 'Aborted',
			authoritativeOver: { result: { Draw: {} }, termination: 'Aborted' },
			spectator: false,
		});

		const { queryByRole } = render(LivePage);
		expect(queryByRole('button', { name: /rematch/i })).toBeNull();
	});

	it('excludes rematch when game was aborted authoritatively during play', () => {
		state.current = storeState({
			gameStatus: 'playing',
			termination: null,
			authoritativeOver: { result: { Draw: {} }, termination: 'Aborted' },
			spectator: false,
		});

		const { queryByRole } = render(LivePage);
		expect(queryByRole('button', { name: /rematch/i })).toBeNull();
	});

	it('shows prompt rematch control in rail when authoritativeOver is set before gameStatus is over', async () => {
		state.current = storeState({
			gameStatus: 'playing',
			authoritativeOver: { result: { Win: { side: 'White' } }, termination: 'Resign' },
			spectator: false,
			players: {
				white: { kind: 'Human', name: 'Player 1' },
				black: { kind: 'Human', name: 'Player 2' },
			},
		});

		const { getAllByRole } = render(LivePage);
		await waitFor(() => {
			const promptBtns = getAllByRole('button', { name: /rematch/i });
			expect(promptBtns.length).toBeGreaterThan(0);
		});
	});

	it('shows awaiting opponent state and countdown when rematchStartup is awaiting_joins', () => {
		state.current = storeState({
			gameStatus: 'waiting',
			authoritativeOver: null,
			rematchStartup: {
				phase: 'awaiting_joins',
				joinDeadlineAt: '2026-09-07T12:00:35Z',
			},
		});

		const { getAllByText } = render(LivePage);
		expect(getAllByText(/awaiting opponent/i).length).toBeGreaterThan(0);
	});
});

/*
 * Spectator continuation (#106): a viewer with no seat is carried into the pair's rematch, and can
 * refuse to be. The store's own rules are covered in `spectatorFollowStore.test.ts`; what only the
 * page can answer is that the panel is wired to a SEATLESS viewer, that following navigates in
 * explicit spectator mode, and that the connection itself is opened read-only.
 */
describe('live board — spectator rematch following', () => {
	const spectating = (overrides: Record<string, unknown> = {}) =>
		storeState({
			gameStatus: 'over',
			spectator: true,
			outcome: null,
			winner: 'White',
			players: {
				white: { kind: 'Human', name: 'Player 1' },
				black: { kind: 'Human', name: 'Player 2' },
			},
			...overrides,
		});

	beforeEach(() => {
		// Following is part of the live surface: without a configured play server there is nothing
		// to read, exactly as `/live` itself is disabled.
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		goto.mockReset();
		sessionStorage.clear();
		pageState.params = { id: 'game-1' };
		pageState.url = new URL('http://x/live/game-1');
		continuation.getContinuation.mockReset().mockResolvedValue({
			sourceGameId: 'game-1',
			serverNow: '2026-09-07T12:00:00Z',
			phase: 'waiting',
			deadlineAt: '2026-09-07T12:00:15Z',
		});
		state.current = spectating();
	});

	afterEach(() => {
		cleanup();
		sessionStorage.clear();
		vi.unstubAllEnvs();
	});

	it('watches for a rematch on a finished game and offers to stay', async () => {
		const { getAllByText, getAllByRole } = render(LivePage);

		await waitFor(() => expect(continuation.getContinuation).toHaveBeenCalledWith('game-1'));
		await waitFor(() => expect(getAllByText(/waiting for a rematch/i).length).toBeGreaterThan(0));
		expect(getAllByRole('button', { name: /stay on this game/i }).length).toBeGreaterThan(0);
	});

	it('follows a committed successor in explicit spectator mode', async () => {
		continuation.getContinuation.mockImplementation(async (id: string) =>
			id === 'game-1'
				? {
						sourceGameId: 'game-1',
						serverNow: '2026-09-07T12:00:00Z',
						phase: 'matched',
						nextGameId: 'game-2',
					}
				: { sourceGameId: id, serverNow: '2026-09-07T12:00:00Z', phase: 'waiting' },
		);

		render(LivePage);

		await waitFor(() => expect(goto).toHaveBeenCalledOnce());
		expect(goto).toHaveBeenCalledWith(`${location.origin}/live/game-2?spectate=1`);
	});

	it('"Stay on this game" keeps the viewer put and offers the successor explicitly', async () => {
		const { getAllByRole, getAllByText } = render(LivePage);
		await waitFor(() => expect(continuation.getContinuation).toHaveBeenCalled());

		await fireEvent.click(getAllByRole('button', { name: /stay on this game/i })[0]);

		continuation.getContinuation.mockImplementation(async (id: string) =>
			id === 'game-1'
				? {
						sourceGameId: 'game-1',
						serverNow: '2026-09-07T12:00:00Z',
						phase: 'matched',
						nextGameId: 'game-2',
					}
				: { sourceGameId: id, serverNow: '2026-09-07T12:00:00Z', phase: 'waiting' },
		);

		await waitFor(() =>
			expect(getAllByText(/players started a rematch/i).length).toBeGreaterThan(0),
		);
		expect(goto).not.toHaveBeenCalled();
		expect(getAllByRole('button', { name: /watch the current game/i }).length).toBeGreaterThan(0);
	});

	it('keeps the offer visible after a reload onto a finished game whose room is gone', async () => {
		// An ended game's room is evicted with it, so a reloaded spectator's socket never connects and
		// the page stays in 'connecting' — the end-of-game surfaces never appear. The choice to stay
		// here and the successor it was traded for must survive that anyway.
		sessionStorage.setItem('dicechess-play-follow-intent', JSON.stringify(['game-1']));
		state.current = spectating({ gameStatus: 'connecting', termination: null });
		continuation.getContinuation.mockImplementation(async (id: string) =>
			id === 'game-1'
				? {
						sourceGameId: 'game-1',
						serverNow: '2026-09-07T12:00:00Z',
						phase: 'matched',
						nextGameId: 'game-2',
					}
				: { sourceGameId: id, serverNow: '2026-09-07T12:00:00Z', phase: 'waiting' },
		);

		const { findAllByRole } = render(LivePage);

		expect(
			(await findAllByRole('button', { name: /watch the current game/i })).length,
		).toBeGreaterThan(0);
		expect(goto).not.toHaveBeenCalled();
	});

	it('never reads a continuation for a seated player', async () => {
		state.current = storeState({ gameStatus: 'over', spectator: false });

		render(LivePage);
		await waitFor(() => expect(state.current.connect).toHaveBeenCalled());

		expect(continuation.getContinuation).not.toHaveBeenCalled();
	});

	it('opens the socket read-only when the link says spectate, ignoring a seat token on it', async () => {
		pageState.url = new URL('http://x/live/game-1?spectate=1&seat=tok-abc&as=black');

		render(LivePage);

		await waitFor(() =>
			expect(state.current.connect).toHaveBeenCalledWith('game-1', null, null, true),
		);
	});

	it('opens the socket as a seated player when the link carries a seat', async () => {
		pageState.url = new URL('http://x/live/game-1?seat=tok-abc&as=black');
		state.current = storeState({ gameStatus: 'over', spectator: false });

		render(LivePage);

		await waitFor(() =>
			expect(state.current.connect).toHaveBeenCalledWith('game-1', 'tok-abc', 'black', false),
		);
	});
});

describe('live board — the invitation of a game by link (#256)', () => {
	const LINK = 'https://play.test/live/game-1?seat=friend-token&as=black';
	const move = (index: number, pieceChar: string | null) => ({
		index,
		text: pieceChar ? 'b8-c6' : 'PASS',
		pieceIcon: '',
		pieceChar,
	});
	const turn = (blackMoves: ReturnType<typeof move>[]) => ({
		turnNumber: 1,
		whiteDice: { index: 1, diceChars: ['P', 'N', 'B'] },
		whiteMoves: [move(2, 'P')],
		blackDice: { index: 3, diceChars: ['n', 'q', 'k'] },
		blackMoves,
		events: [],
	});
	// The creator plays White here, so the friend is Black.
	const running = (overrides: Record<string, unknown> = {}) =>
		storeState({
			gameStatus: 'playing',
			outcome: null,
			winner: null,
			termination: null,
			...overrides,
		});

	beforeEach(() => {
		invite.link = LINK;
		invite.forget.mockClear();
	});
	afterEach(() => {
		cleanup();
		invite.link = null;
	});

	it('shows the link to send on the board of the tab that created the game', () => {
		state.current = running();
		const { getByRole } = render(LivePage);
		const card = getByRole('region', { name: 'Waiting' });
		expect(card.textContent).toContain('Invite your friend');
		expect((getByRole('textbox', { name: 'Invitation link' }) as HTMLInputElement).value).toBe(
			LINK,
		);
		expect(getByRole('button', { name: 'Copy link' })).toBeTruthy();
	});

	it('says that the game is running, because the clock does not wait for the friend', () => {
		state.current = running();
		const { getByRole } = render(LivePage);
		expect(getByRole('region', { name: 'Waiting' }).textContent).toContain(
			'the clock of the side to move is running',
		);
	});

	it('shows nothing on a board this tab did not create', () => {
		invite.link = null;
		state.current = running();
		const { queryByRole } = render(LivePage);
		expect(queryByRole('region', { name: 'Waiting' })).toBeNull();
	});

	it.each([
		['a spectator', { spectator: true }],
		['a finished game', { gameStatus: 'over', outcome: 'won', termination: 'Resign' }],
	])('shows nothing to %s', (_who, overrides) => {
		state.current = running(overrides);
		const { queryByRole } = render(LivePage);
		expect(queryByRole('region', { name: 'Waiting' })).toBeNull();
	});

	it('lets go of the link once the friend has moved', () => {
		state.current = running({ historyBlocks: [turn([move(4, 'n')])] });
		const { queryByRole } = render(LivePage);
		expect(queryByRole('region', { name: 'Waiting' })).toBeNull();
		expect(invite.forget).toHaveBeenCalledWith('game-1');
	});

	it('keeps the link through a pass the server made for a friend who is not there', () => {
		state.current = running({ historyBlocks: [turn([move(4, null)])] });
		const { getByRole } = render(LivePage);
		expect(getByRole('region', { name: 'Waiting' })).toBeTruthy();
		expect(invite.forget).not.toHaveBeenCalled();
	});

	it('is not fooled by the moves of the creator', () => {
		state.current = running({ historyBlocks: [turn([])] });
		const { getByRole } = render(LivePage);
		expect(getByRole('region', { name: 'Waiting' })).toBeTruthy();
	});

	it('hides the link when the creator asks, and forgets it', async () => {
		state.current = running();
		const { getByRole, queryByRole } = render(LivePage);
		await fireEvent.click(getByRole('button', { name: 'Hide the link' }));
		expect(queryByRole('region', { name: 'Waiting' })).toBeNull();
		expect(invite.forget).toHaveBeenCalledWith('game-1');
	});
});

/*
 * The watching view (#263): what a seatless viewer gets beyond the board, and that none of it is
 * a control that needs a seat. The strips and the turn card are stubbed in this suite; that they
 * draw the "Challenge" link and the line about the dice is covered by their own tests.
 */
describe('live board — watching', () => {
	const listed = (id: string, rating: number) => ({
		gameId: id,
		version: 1,
		players: {
			white: { kind: 'Bot', name: `grove ${id}-w`, rating },
			black: { kind: 'Bot', name: `grove ${id}-b`, rating },
		},
		timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
		activeSeat: 'White',
		dicePending: false,
		clocks: null,
		dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 14 NP',
	});
	const watching = (overrides: Record<string, unknown> = {}) =>
		storeState({
			gameStatus: 'waiting',
			authoritativeOver: null,
			termination: null,
			outcome: null,
			winner: null,
			spectator: true,
			players: {
				white: { kind: 'Bot', name: 'grove cedar-4' },
				black: { kind: 'Bot', name: 'grove larch-1' },
			},
			...overrides,
		});

	beforeEach(() => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		pageState.params = { id: 'game-1' };
		pageState.url = new URL('http://x/live/game-1?spectate=1');
		continuation.getContinuation.mockReset().mockResolvedValue({
			sourceGameId: 'game-1',
			serverNow: '2026-09-07T12:00:00Z',
			phase: 'waiting',
			deadlineAt: null,
		});
		lobby.listGames.mockReset().mockResolvedValue({
			games: [
				listed('game-1', 3000),
				listed('low', 1500),
				listed('top', 2400),
				listed('mid', 2000),
				listed('last', 1000),
			],
			total: 61,
		});
		toastStore.error.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('says that one is watching and leads back to the Arena', () => {
		state.current = watching();
		const { getByText, getByRole } = render(LivePage);
		expect(getByText('You are watching')).toBeTruthy();
		expect(getByRole('link', { name: 'Leave game' }).getAttribute('href')).toBe('/arena');
	});

	it('never offers a control that needs a seat', () => {
		// Even if the store were to say a resignation is possible, a spectator gets no such button.
		state.current = watching({ canResign: true, drawOfferControlState: 'idle' });
		const { queryByRole, getByRole } = render(LivePage);
		expect(queryByRole('button', { name: /resign/i })).toBeNull();
		expect(queryByRole('button', { name: /draw/i })).toBeNull();
		expect(queryByRole('group', { name: 'Game actions' })).toBeNull();
		expect(getByRole('group', { name: 'Watching' })).toBeTruthy();
	});

	it('turns the board round and back', async () => {
		state.current = watching();
		const { getByRole } = render(LivePage);
		const flip = getByRole('button', { name: 'Flip board' });
		expect(flip.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(flip);
		expect(flip.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(flip);
		expect(flip.getAttribute('aria-pressed')).toBe('false');
	});

	it('copies the link that opens the game for watching, and says so', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		state.current = watching();
		const { getByRole } = render(LivePage);
		await fireEvent.click(getByRole('button', { name: 'Share' }));
		expect(writeText).toHaveBeenCalledWith(`${location.origin}/live/game-1?spectate=1`);
		await waitFor(() => expect(getByRole('button', { name: 'Link copied' })).toBeTruthy());
	});

	it('says so when the link cannot be copied', async () => {
		vi.stubGlobal('navigator', {
			clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
		});
		state.current = watching();
		const { getByRole } = render(LivePage);
		await fireEvent.click(getByRole('button', { name: 'Share' }));
		await waitFor(() => expect(toastStore.error).toHaveBeenCalledOnce());
		expect(getByRole('button', { name: 'Share' })).toBeTruthy();
	});

	it('lists three other live games, the most notable first, and links to all of them', async () => {
		state.current = watching();
		const { findByRole } = render(LivePage);
		const block = await findByRole('region', { name: 'More live games' });
		await waitFor(() => expect(block.querySelectorAll('li')).toHaveLength(3));
		const links = [...block.querySelectorAll('li a')];
		expect(links.map((a) => a.getAttribute('href'))).toEqual([
			'/live/top?spectate=1',
			'/live/mid?spectate=1',
			'/live/low?spectate=1',
		]);
		expect(links[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'grove top-w vs grove top-b Blitz 5 + 3 · move 14',
		);
		const all = [...block.querySelectorAll('a')].at(-1)!;
		expect(all.textContent?.replace(/\s+/g, ' ').trim()).toBe('All 61 live games →');
		expect(all.getAttribute('href')).toBe('/arena/live');
	});

	it('at the end names the winner and offers another game to watch', async () => {
		state.current = watching({
			gameStatus: 'over',
			termination: 'Timeout',
			winner: 'Black',
			authoritativeOver: { result: { Win: { side: 'Black' } }, termination: 'Timeout' },
		});
		const { getByText, findByRole, getByRole } = render(LivePage);
		expect(getByText('grove larch-1 won.')).toBeTruthy();
		const another = await findByRole('link', { name: 'Watch another game' });
		await waitFor(() => expect(another.getAttribute('href')).toBe('/live/top?spectate=1'));
		expect(getByRole('link', { name: '← Back to Arena' }).getAttribute('href')).toBe('/arena');
	});

	it('sends a spectator to the full list when no other game is being played', async () => {
		lobby.listGames.mockResolvedValue({ games: [listed('game-1', 3000)], total: 1 });
		state.current = watching({ gameStatus: 'over', termination: 'Resign', winner: 'White' });
		const { findByRole, findByText } = render(LivePage);
		expect(await findByText('No other game is being played right now.')).toBeTruthy();
		expect((await findByRole('link', { name: 'Watch another game' })).getAttribute('href')).toBe(
			'/arena/live',
		);
	});

	it('is not shown to a player, who never reads the list of live games for it', () => {
		state.current = storeState({ gameStatus: 'playing', authoritativeOver: null, outcome: null });
		const { queryByText, queryByRole } = render(LivePage);
		expect(queryByText('You are watching')).toBeNull();
		expect(queryByRole('group', { name: 'Watching' })).toBeNull();
		expect(queryByRole('region', { name: 'More live games' })).toBeNull();
		expect(lobby.listGames).not.toHaveBeenCalled();
	});
});

// The step controls under the board are for looking back at leisure (#279): a finished game, or
// a game one only watches. A seated player in a game does not see them.
describe('live board — step controls', () => {
	const playing = { gameStatus: 'playing', authoritativeOver: null, outcome: null, winner: null };

	it('are absent for a player while the game is in progress', () => {
		state.current = storeState(playing);
		const { queryByRole } = render(LivePage);
		expect(queryByRole('button', { name: 'First move' })).toBeNull();
	});

	it('are there for a player once the game is over', () => {
		state.current = storeState();
		const { getByRole } = render(LivePage);
		expect(getByRole('button', { name: 'First move' })).toBeTruthy();
	});

	it('are there for a spectator throughout', () => {
		state.current = storeState({ ...playing, spectator: true });
		const { getByRole } = render(LivePage);
		expect(getByRole('button', { name: 'First move' })).toBeTruthy();
	});

	it('leave a player the way back after a move from the list was opened', async () => {
		state.current = storeState({ ...playing, isManuallyBrowsing: true, maxMoveIndex: 5 });
		const { getByRole, queryByRole } = render(LivePage);
		expect(queryByRole('button', { name: 'First move' })).toBeNull();
		await fireEvent.click(getByRole('button', { name: /Return to live/ }));
		expect(state.current.setMoveIndex).toHaveBeenCalledWith(5);
	});
});

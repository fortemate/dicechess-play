import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

/*
 * The live board's finished-game actions (#216): which of them a given ending offers, and what
 * "Copy link" actually puts on the clipboard. The rule itself lives in `$lib/live/replayLink` and
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
vi.mock('$app/state', () => ({
	page: { params: { id: 'game-1' }, url: new URL('http://x/live/game-1') },
}));
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
}));

// `vi.mock` factories are hoisted above every top-level binding, so the stub has to be reached
// through `vi.hoisted` (or re-imported per factory) rather than a plain const.
const stub = vi.hoisted(() => async () => ({
	default: (await import('./ChildStub.test.svelte')).default,
}));
vi.mock('../../../components/Board.svelte', stub);
vi.mock('../../../components/DicePanel.svelte', stub);
vi.mock('../../../components/PreRollDrawGate.svelte', stub);
vi.mock('../../../components/MoveHistory.svelte', stub);
vi.mock('../../../components/PlayerStrip.svelte', stub);
vi.mock('../../../components/PawnPromotionSelector.svelte', stub);
vi.mock('../../../components/BotRematchButton.svelte', stub);

vi.mock('$lib/sound', () => ({ preloadSounds: vi.fn(), playSound: vi.fn() }));
vi.mock('$lib/catalog/lastBotGame', () => ({ recallBotGame: () => null }));
vi.mock('$lib/leaderboard/leaderboardApi', () => ({ fetchPlayerProfile: vi.fn() }));
vi.mock('$lib/live/rematchApi', () => ({
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

const toastStore = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('$lib/toastStore.svelte', () => ({ toastStore }));

const state = vi.hoisted(() => ({
	current: {} as Record<string, unknown>,
}));
vi.mock('$lib/live/liveGameStore.svelte', () => ({
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

describe('live board — finished-game replay actions', () => {
	beforeEach(() => {
		state.current = storeState();
		toastStore.error.mockReset();
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

		await fireEvent.click(drawBtn);
		expect(toggleArmDrawOffer).toHaveBeenCalledOnce();
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
	});

	it('counts down the turns instead, where a deployment lets the right return', () => {
		state.current = storeState({
			gameStatus: 'playing',
			canResign: true,
			drawOfferControlState: 'forbidden',
			drawArmRefusal: { reason: 'draw offer cooldown', availableAfterTurns: 3 },
		});

		const { getByRole } = render(LivePage);

		expect(getByRole('button', { name: /draw offer available in 3 turns/i })).toBeTruthy();
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

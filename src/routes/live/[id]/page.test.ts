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

	it('shows and toggles draw offer arm button during my active turn with revealed dice', async () => {
		const toggleArmDrawOffer = vi.fn();
		state.current = storeState({
			gameStatus: 'playing',
			canResign: true,
			playerColor: 'w',
			activeColor: 'w',
			currentDice: [{ value: 2, allowed: true, used: false }],
			mayOfferDraw: true,
			isDrawOfferArmed: false,
			toggleArmDrawOffer,
		});

		const { getByRole } = render(LivePage);
		const drawBtn = getByRole('button', {
			name: /offer draw with your turn/i,
		}) as HTMLButtonElement;
		expect(drawBtn).toBeTruthy();
		expect(drawBtn.disabled).toBe(false);

		await fireEvent.click(drawBtn);
		expect(toggleArmDrawOffer).toHaveBeenCalledOnce();
	});

	it('disables draw offer arm button when mayOfferDraw is false', () => {
		state.current = storeState({
			gameStatus: 'playing',
			canResign: true,
			playerColor: 'w',
			activeColor: 'w',
			currentDice: [{ value: 2, allowed: true, used: false }],
			mayOfferDraw: false,
			isDrawOfferArmed: false,
		});

		const { getByRole } = render(LivePage);
		const drawBtn = getByRole('button', { name: /cannot offer draw/i }) as HTMLButtonElement;
		expect(drawBtn.disabled).toBe(true);
	});
});

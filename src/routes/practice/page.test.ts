import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

/*
 * What only the practice page can answer about the shared draw lifecycle (#74): that the ½ control
 * reads the store's five-state machine and reaches `toggleArmDrawOffer`, that the pre-roll gate
 * takes the dice panel's slot instead of opening a modal, and that a tap on the board declines.
 * The rules themselves are `$lib/draw/drawRules`' suite, and the lifecycle is the store's.
 *
 * Named `page.test.ts`, not `+page.test.ts`: a leading `+` marks a SvelteKit route file.
 *
 * The board's own children are stubbed — they have their own suites, and rendering chessground here
 * would test the wrong thing.
 */
const stub = vi.hoisted(() => async () => ({
	default: (await import('../live/[id]/ChildStub.test.svelte')).default,
}));
vi.mock('../../components/Board.svelte', stub);
vi.mock('../../components/MoveHistory.svelte', stub);
vi.mock('../../components/PlayerStrip.svelte', stub);
vi.mock('../../components/PawnPromotionSelector.svelte', stub);
vi.mock('../../components/GameEndModal.svelte', stub);

vi.mock('$lib/sound', () => ({ preloadSounds: vi.fn(), playSound: vi.fn() }));
vi.mock('$lib/ingest/outbox', () => ({ flushOutbox: vi.fn() }));

const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('$lib/playWithBot', () => ({
	get playWithBotStore() {
		return state.current;
	},
}));

import PracticePage from './+page.svelte';

/** A store stub mid-game, on the player's own pre-roll turn with nothing offered. */
function storeState(overrides: Record<string, unknown> = {}) {
	return {
		gameStatus: 'rolling',
		gameEndReason: null,
		playerColor: 'w',
		activeColor: 'w',
		currentDice: [],
		historyBlocks: [],
		currentMoveIndex: 0,
		maxMoveIndex: 0,
		isViewingHistory: false,
		isAnimatingRoll: false,
		canUserRoll: true,
		timeLimit: null,
		playerTimeLeft: 0,
		botTimeLeft: 0,
		pendingPromotion: null,
		activeDrawOffer: null,
		drawOfferControlState: 'idle',
		drawTurnsUntilAvailable: null,
		isPreRollGateActive: false,
		isPreRollResponder: false,
		toggleArmDrawOffer: vi.fn(),
		respondDraw: vi.fn(),
		rollDice: vi.fn(),
		resignGame: vi.fn(),
		startNewGame: vi.fn(),
		endSession: vi.fn(),
		setMoveIndex: vi.fn(),
		completePromotion: vi.fn(),
		cancelPromotion: vi.fn(),
		...overrides,
	};
}

function renderPage(overrides: Record<string, unknown> = {}) {
	state.current = storeState(overrides);
	const { container } = render(PracticePage);
	return { store: state.current, container };
}

/** The board's wrapper, which carries the tap-to-decline handler (the board itself is stubbed). */
function boardWrapper(container: HTMLElement): Element {
	const el = container.querySelector('.aspect-square');
	if (!el) throw new Error('board wrapper not rendered');
	return el;
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('/practice draw offer controls', () => {
	it('offers the draw control while the bot is on move, which is what a forced pass needs', async () => {
		const { store } = renderPage({ gameStatus: 'bot_thinking', canUserRoll: false });

		const drawBtn = screen.getByRole('button', {
			name: /offer a draw/i,
		}) as HTMLButtonElement;
		expect(drawBtn.disabled).toBe(false);

		await fireEvent.click(drawBtn);
		expect(store.toggleArmDrawOffer).toHaveBeenCalledOnce();
	});

	it('shows the armed state, and the sent state with the control disabled', () => {
		renderPage({ drawOfferControlState: 'armed' });
		const armed = screen.getByRole('button', { name: /draw offer armed/i }) as HTMLButtonElement;
		expect(armed.disabled).toBe(false);
		expect(armed.textContent).toContain('Armed');

		cleanup();
		renderPage({ drawOfferControlState: 'pending', activeDrawOffer: 'player' });
		const sent = screen.getByRole('button', {
			name: /waiting for the bot/i,
		}) as HTMLButtonElement;
		expect(sent.disabled).toBe(true);
	});

	it('says whose turn it is to offer once the right has passed to the bot', () => {
		renderPage({ drawOfferControlState: 'forbidden' });
		const forbidden = screen.getByRole('button', {
			name: /the bot offers the next draw/i,
		}) as HTMLButtonElement;
		expect(forbidden.disabled).toBe(true);

		cleanup();
		renderPage({ drawOfferControlState: 'forbidden', drawTurnsUntilAvailable: 1 });
		expect(screen.getByRole('button', { name: /draw offer available in 1 turn/i })).toBeTruthy();
	});

	it('hides the control while the player is the one being asked — the gate owns that', () => {
		renderPage({
			drawOfferControlState: 'hidden',
			activeDrawOffer: 'bot',
			isPreRollGateActive: true,
			isPreRollResponder: true,
		});

		expect(
			screen.queryAllByRole('button', { name: /offer a draw|draw offer armed/i }),
		).toHaveLength(0);
	});

	it('answers a pending offer from the dice panel’s own slot, never a modal over the board', async () => {
		const { store } = renderPage({
			activeDrawOffer: 'bot',
			drawOfferControlState: 'hidden',
			isPreRollGateActive: true,
			isPreRollResponder: true,
		});

		// The real gate renders here (it is not stubbed): the board stays reachable behind it.
		expect(screen.getByRole('region', { name: 'Draw offer' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /decline & roll/i }));
		expect(store.respondDraw).toHaveBeenCalledWith(false);
	});

	it('declines when the responder taps the board, and never while browsing history', async () => {
		// Nothing pending: a board tap is an ordinary board gesture and must not answer anything.
		const idle = renderPage();
		await fireEvent.pointerDown(boardWrapper(idle.container));
		expect(idle.store.respondDraw).not.toHaveBeenCalled();
		cleanup();

		const gated = renderPage({
			activeDrawOffer: 'bot',
			drawOfferControlState: 'hidden',
			isPreRollGateActive: true,
			isPreRollResponder: true,
		});
		await fireEvent.pointerDown(boardWrapper(gated.container));
		expect(gated.store.respondDraw).toHaveBeenCalledWith(false);
		cleanup();

		const browsing = renderPage({
			activeDrawOffer: 'bot',
			drawOfferControlState: 'hidden',
			isPreRollGateActive: true,
			isPreRollResponder: true,
			isViewingHistory: true,
		});
		await fireEvent.pointerDown(boardWrapper(browsing.container));
		expect(browsing.store.respondDraw).not.toHaveBeenCalled();
	});
});

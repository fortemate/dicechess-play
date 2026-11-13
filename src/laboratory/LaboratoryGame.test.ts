/** Screen-level decisions remain explicit and obey the authoritative stage/seat/pending gates. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import LaboratoryGameScreen from './LaboratoryGame.svelte';
import type { LaboratoryGame } from '../lib/laboratory/game.svelte';
import type { LaboratoryGameState } from '../lib/laboratory/api';
import type { PublicTurn } from '../lib/laboratory/protocol';

afterEach(cleanup);
const dfen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const choice: PublicTurn = {
	phase: 'AwaitingPairChoice',
	offers: [
		[1, 3],
		[1, 4],
	],
	selectedPairIndex: null,
};

function model(turn: PublicTurn = choice, overrides: Record<string, unknown> = {}) {
	const state = {
		dfen,
		activeSeat: 'White',
		status: { Active: {} },
		lab: { turn },
	} as LaboratoryGameState;
	const value = {
		state,
		seat: 'White',
		connected: true,
		pending: false,
		error: null,
		tentative: null,
		draft: [],
		tree: null,
		boardDfen: dfen,
		canAct: true,
		canMove: false,
		remainingDice: [],
		moves: [],
		lastPass: null,
		drawArmed: false,
		clock: vi.fn(() => '10:00'),
		offerPlayable: vi.fn(() => true),
		chooseTentative: vi.fn(),
		confirmPair: vi.fn(),
		rollingDice: false,
		rollDice: vi.fn(),
		move: vi.fn(),
		resign: vi.fn(),
		respondDraw: vi.fn(),
		armDraw: vi.fn(),
		...overrides,
	};
	return { value, game: value as unknown as LaboratoryGame };
}

describe('LaboratoryGame screen', () => {
	it('keeps a selected square through a clock/state refresh with the same board', async () => {
		const playing: PublicTurn = { ...choice, phase: 'PlayingSelectedPair', selectedPairIndex: 0 };
		const props = () => model(playing, { canMove: true, moves: ['e2e4'] }).game;
		const { rerender } = render(LaboratoryGameScreen, { game: props() });
		await fireEvent.click(screen.getByRole('gridcell', { name: 'e2, White pawn' }));
		expect(screen.getByRole('gridcell', { name: 'e2, White pawn' })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		await rerender({ game: props() });
		expect(
			screen.getByRole('gridcell', { name: 'e4, empty, legal destination' }),
		).toBeInTheDocument();
	});

	it('keeps both whole pairs visible and requires explicit confirmation before play', async () => {
		const { game, value } = model();
		const { rerender } = render(LaboratoryGameScreen, { game });
		expect(screen.getByRole('button', { name: 'Confirm one whole pair' })).toBeDisabled();
		expect(screen.getByRole('grid', { name: 'White board' })).toHaveAttribute(
			'aria-disabled',
			'true',
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Pair 2: pawn and rook' }));
		expect(value.chooseTentative).toHaveBeenCalledExactlyOnceWith(1);
		expect(value.confirmPair).not.toHaveBeenCalled();
		await rerender({ game: model(choice, { tentative: 1, confirmPair: value.confirmPair }).game });
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm pair 2' }));
		expect(value.confirmPair).toHaveBeenCalledOnce();
		await rerender({ game: model(choice, { pending: true, canAct: false, tentative: 1 }).game });
		expect(screen.getByRole('button', { name: 'Pair 1: pawn and bishop' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Confirm pair 2' })).toBeDisabled();
	});

	it('hides the partial offer while waiting for an interrupted roll to be finished', async () => {
		const { game, value } = model({
			phase: 'AwaitingSecondRoll',
			offers: [[1, 3]],
			selectedPairIndex: null,
		});
		const { container, rerender } = render(LaboratoryGameScreen, { game });
		expect(screen.getByRole('button', { name: 'Finish roll' })).toBeEnabled();
		expect(screen.queryByLabelText('Rolled pairs')).not.toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Pair 1: pawn and bishop' }),
		).not.toBeInTheDocument();
		expect(screen.queryByLabelText('Second pair not rolled')).not.toBeInTheDocument();
		const announcements = () =>
			Array.from(container.querySelectorAll('.lab-sr')).at(-1)?.textContent ?? '';
		expect(announcements()).not.toContain('Pair 1: pawn and bishop');
		await fireEvent.click(screen.getByRole('button', { name: 'Finish roll' }));
		expect(value.rollDice).toHaveBeenCalledOnce();
		const passive = model(
			{ phase: 'AwaitingSecondRoll', offers: [[1, 3]], selectedPairIndex: null },
			{ seat: 'Black' },
		);
		await rerender({ game: passive.game });
		expect(screen.queryByLabelText('Rolled pairs')).not.toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Pair 1: pawn and bishop' }),
		).not.toBeInTheDocument();
		expect(announcements()).toContain('Rolling dice');
		expect(announcements()).not.toContain('Pair 1: pawn and bishop');
	});

	it('uses one roll action and disables it while both dice commands are pending', async () => {
		const first = model({ phase: 'AwaitingFirstRoll', offers: [], selectedPairIndex: null });
		const { rerender } = render(LaboratoryGameScreen, { game: first.game });
		await fireEvent.click(screen.getByRole('button', { name: 'Roll dice' }));
		expect(first.value.rollDice).toHaveBeenCalledOnce();
		const rolling = model(
			{ phase: 'AwaitingFirstRoll', offers: [], selectedPairIndex: null },
			{ rollingDice: true, pending: true, canAct: false },
		);
		await rerender({ game: rolling.game });
		expect(screen.getByRole('button', { name: 'Rolling dice…' })).toBeDisabled();
		await fireEvent.click(screen.getByRole('button', { name: 'Rolling dice…' }));
		expect(rolling.value.rollDice).not.toHaveBeenCalled();
	});

	it('auto-sends the completed turn without undo or submit controls and announces pending sends', async () => {
		const playing: PublicTurn = {
			phase: 'PlayingSelectedPair',
			offers: [
				[1, 3],
				[1, 4],
			],
			selectedPairIndex: 0,
		};
		const { rerender } = render(LaboratoryGameScreen, {
			game: model(playing, { remainingDice: [1], draft: ['e2e4'] }).game,
		});
		expect(screen.getByText(/your last move sends the turn automatically/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Submit turn' })).not.toBeInTheDocument();
		const pending = model(playing, {
			pending: true,
			complete: true,
			remainingDice: [],
			draft: ['e2e4'],
		});
		await rerender({ game: pending.game });
		expect(screen.getByText('Sending turn…').closest('[role="status"]')).toBeInTheDocument();
	});

	it('keeps equal and unplayable offers selectable and communicates a pass in text', () => {
		const { game } = model(
			{
				phase: 'AwaitingPairChoice',
				offers: [
					[3, 4],
					[4, 3],
				],
				selectedPairIndex: null,
			},
			{ offerPlayable: vi.fn(() => false), lastPass: 'Black passed the turn.' },
		);
		render(LaboratoryGameScreen, { game });
		expect(screen.getByText(/Both pairs are equal/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Pair 1: bishop and rook' })).toBeEnabled();
		expect(screen.getByRole('button', { name: 'Pair 2: rook and bishop' })).toBeEnabled();
		expect(screen.getAllByText('No legal moves · choosing passes')).toHaveLength(2);
		expect(screen.getByText('Black passed the turn.')).toBeInTheDocument();
	});

	it('preserves offers during reconnect, locks commands and confirms resignation separately', async () => {
		const { rerender } = render(LaboratoryGameScreen, {
			game: model(choice, { connected: false, canAct: false }).game,
		});
		expect(screen.getByText(/Your position is kept/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Pair 1: pawn and bishop' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled();
		const { game, value } = model();
		await rerender({ game });
		await fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
		expect(value.resign).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Keep playing' })).toHaveFocus());
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm resignation' }));
		expect(value.resign).toHaveBeenCalledOnce();
	});
});

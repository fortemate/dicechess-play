import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';

import type { TurnBlock } from '#lib/types.js';
import MoveList from './MoveList.svelte';

// The move list (#254): one row per turn, the dice that were rolled and the moves that were
// played. Its one job besides showing them is to ask the page for a position (`onSetMove`); it
// holds no position of its own, so it cannot touch the live one. The stores' own suites pin what
// viewing an earlier position does (`playWithBotStore.test.ts`, `liveGameStore.test.ts`).

const move = (index: number, text: string, pieceChar: string | null = 'N') => ({
	index,
	text,
	pieceIcon: '♘',
	pieceChar,
});

// Turn 1: White rolls three dice and plays all three; Black rolls three and plays ONE.
// Turn 2: White rolls and has no move (a pass); Black has just rolled, the latest entry.
const TURNS: TurnBlock[] = [
	{
		turnNumber: 1,
		whiteDice: { index: 0, diceChars: ['P', 'N', 'B'] },
		whiteMoves: [move(1, 'e2-e4', 'P'), move(2, 'g1-f3'), move(3, 'f1-c4', 'B')],
		blackDice: { index: 4, diceChars: ['n', 'q', 'k'] },
		blackMoves: [move(5, 'b8-c6', 'n')],
		events: [],
	},
	{
		turnNumber: 2,
		whiteDice: { index: 6, diceChars: ['R', 'R', 'Q'] },
		whiteMoves: [],
		blackDice: { index: 7, diceChars: ['p', 'p', 'b'] },
		blackMoves: [],
		events: [{ index: 8, text: 'Draw offered' }],
	},
];

const props = (overrides = {}) => ({
	historyBlocks: TURNS,
	currentMoveIndex: 5,
	maxMoveIndex: 7,
	onSetMove: vi.fn(),
	keyboardNavEnabled: false,
	...overrides,
});

afterEach(() => cleanup());

describe('MoveList', () => {
	it('is a named region with one row per turn', () => {
		const { getByRole } = render(MoveList, props());
		const region = getByRole('region', { name: 'Moves' });
		const rows = within(region).getAllByRole('listitem');
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('1');
		expect(within(region).getByText('Move 5 of 7')).toBeTruthy();
	});

	it('shows the dice that were rolled and the moves that were played, side by side', () => {
		const { getByRole } = render(MoveList, props());
		const whiteRoll = getByRole('button', {
			name: 'Turn 1, White rolled pawn, knight, and bishop',
		});
		expect(whiteRoll.querySelectorAll('img')).toHaveLength(3);
		for (const text of ['e2-e4', 'g1-f3', 'f1-c4']) {
			expect(getByRole('button', { name: new RegExp(text) })).toBeTruthy();
		}
	});

	it('lists fewer moves for a turn that used fewer than three dice', () => {
		const { getByRole, getAllByRole } = render(MoveList, props());
		// Black rolled three dice in turn 1 and played one of them.
		const blackRoll = getByRole('button', { name: 'Turn 1, Black rolled knight, queen, and king' });
		expect(blackRoll.querySelectorAll('img')).toHaveLength(3);

		const half = blackRoll.parentElement!;
		const moves = within(half)
			.getAllByRole('button')
			.filter((button) => button !== blackRoll);
		expect(moves).toHaveLength(1);
		expect(moves[0].textContent).toContain('b8-c6');
		// And nothing invents the two moves that were not made.
		expect(within(half).queryByText('no move')).toBeNull();
		expect(getAllByRole('listitem')).toHaveLength(2);
	});

	it('says "no move" for a roll that could not be played', () => {
		const { getByRole } = render(MoveList, props());
		const roll = getByRole('button', { name: 'Turn 2, White rolled rook, rook, and queen' });
		expect(within(roll.parentElement!).getByText('no move')).toBeTruthy();
	});

	it('shows "…" instead while that roll is the latest entry', () => {
		const { getByRole } = render(MoveList, props());
		const roll = getByRole('button', { name: 'Turn 2, Black rolled pawn, pawn, and bishop' });
		expect(within(roll.parentElement!).getByText('…')).toBeTruthy();
		expect(within(roll.parentElement!).queryByText('no move')).toBeNull();
	});

	it('asks for the position of whatever is pressed, and does nothing else', async () => {
		const onSetMove = vi.fn();
		const { getByRole } = render(MoveList, props({ onSetMove }));

		await fireEvent.click(getByRole('button', { name: /Turn 1, White rolled/ }));
		await fireEvent.click(getByRole('button', { name: /g1-f3/ }));
		await fireEvent.click(getByRole('button', { name: 'Draw offered' }));

		expect(onSetMove.mock.calls).toEqual([[0], [2], [8]]);
	});

	it('marks the viewed position, and only it', () => {
		const { container, getByRole } = render(MoveList, props({ currentMoveIndex: 5 }));
		const current = container.querySelectorAll('[data-current="true"]');
		expect(current).toHaveLength(1);
		expect(current[0]).toBe(getByRole('button', { name: /b8-c6/ }));
		expect(current[0].className).toContain('bg-primary');
		expect(getByRole('button', { name: /e2-e4/ }).className).not.toContain('bg-primary');
	});

	it('gives every control an accessible name and a target of at least 44 px', () => {
		const { getAllByRole } = render(
			MoveList,
			props({ steps: true, onclose: vi.fn(), keyboardNavEnabled: true }),
		);
		const buttons = getAllByRole('button');
		expect(buttons.length).toBeGreaterThan(10);
		for (const button of buttons) {
			const name = button.getAttribute('aria-label') ?? button.textContent?.trim();
			expect(name, button.outerHTML).toBeTruthy();
			expect(button.className, name ?? '').toContain('min-h-11');
			expect(button.className, name ?? '').toContain('focus-visible:focus-ring');
		}
	});

	it('names the piece of a move for assistive technology', () => {
		const { getByRole } = render(MoveList, props());
		expect(getByRole('button', { name: 'Bishop f1-c4' })).toBeTruthy();
	});

	describe('step controls', () => {
		it('are left to the page by default', () => {
			const { queryByRole } = render(MoveList, props());
			expect(queryByRole('button', { name: 'First move' })).toBeNull();
		});

		it('sit in the header when asked for, and step from the viewed position', async () => {
			const onSetMove = vi.fn();
			const { getByRole } = render(MoveList, props({ steps: true, onSetMove }));
			await fireEvent.click(getByRole('button', { name: 'Previous move' }));
			await fireEvent.click(getByRole('button', { name: 'Last move' }));
			expect(onSetMove.mock.calls).toEqual([[4], [7]]);
		});
	});

	describe('as a sheet on a phone', () => {
		it('has no close button unless the page can close it', () => {
			const { queryByRole } = render(MoveList, props());
			expect(queryByRole('button', { name: 'Close the move list' })).toBeNull();
		});

		it('closes through the page, with a button that only phones show', async () => {
			const onclose = vi.fn();
			const { getByRole } = render(MoveList, props({ onclose }));
			const close = getByRole('button', { name: 'Close the move list' });
			expect(close.className).toContain('md:hidden');
			await fireEvent.click(close);
			expect(onclose).toHaveBeenCalledTimes(1);
		});
	});

	it('advertises the arrow keys only where they work', () => {
		const off = render(MoveList, props({ keyboardNavEnabled: false }));
		expect(off.queryByText(/←/)).toBeNull();
		off.unmount();

		const on = render(MoveList, props({ keyboardNavEnabled: true }));
		expect(on.getByText('Use ← / → to step through the moves.')).toBeTruthy();
	});

	it('says so when the game has no move yet', () => {
		const { getByText, queryAllByRole } = render(
			MoveList,
			props({ historyBlocks: [], currentMoveIndex: 0, maxMoveIndex: 0 }),
		);
		expect(getByText('No moves yet. The first roll starts the game.')).toBeTruthy();
		expect(queryAllByRole('listitem')).toHaveLength(0);
	});
});

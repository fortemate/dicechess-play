/** Board interactions forward only advertised UCI moves, including exact promotion suffixes. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import LaboratoryPlayBoard from './LaboratoryPlayBoard.svelte';

afterEach(cleanup);
const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('LaboratoryPlayBoard', () => {
	it('requires a legal source/destination and retains keyboard navigation while inactive', async () => {
		const onmove = vi.fn();
		const { rerender } = render(LaboratoryPlayBoard, {
			props: { dfen: start, seat: 'White', moves: ['e2e4'], disabled: true, onmove },
		});
		await fireEvent.click(screen.getByRole('gridcell', { name: 'e2, White pawn' }));
		await fireEvent.click(screen.getByRole('gridcell', { name: 'e4, empty' }));
		expect(onmove).not.toHaveBeenCalled();
		await fireEvent.keyDown(screen.getByRole('gridcell', { name: 'a8, Black rook' }), {
			key: 'ArrowRight',
		});
		expect(screen.getByRole('gridcell', { name: 'b8, Black knight' })).toHaveFocus();
		await rerender({ dfen: start, seat: 'White', moves: ['e2e4'], disabled: false, onmove });
		await fireEvent.click(screen.getByRole('gridcell', { name: 'e2, White pawn' }));
		expect(
			screen.getByRole('gridcell', { name: 'e4, empty, legal destination' }),
		).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('gridcell', { name: 'e4, empty, legal destination' }));
		expect(onmove).toHaveBeenCalledExactlyOnceWith('e2e4');
	});

	it('asks for the exact advertised promotion, then forwards its suffix', async () => {
		const onmove = vi.fn();
		render(LaboratoryPlayBoard, {
			props: {
				dfen: '7k/P7/8/8/8/8/8/7K w - - 0 1',
				seat: 'White',
				moves: ['a7a8q', 'a7a8n'],
				onmove,
			},
		});
		await fireEvent.click(screen.getByRole('gridcell', { name: 'a7, White pawn' }));
		await fireEvent.click(screen.getByRole('gridcell', { name: 'a8, empty, legal destination' }));
		expect(onmove).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.getByRole('button', { name: 'queen' })).toHaveFocus());
		await fireEvent.click(screen.getByRole('button', { name: 'knight' }));
		expect(onmove).toHaveBeenCalledExactlyOnceWith('a7a8n');
	});

	it('maps the reversed Black board and forwards plain king captures without promotion', async () => {
		const onmove = vi.fn();
		render(LaboratoryPlayBoard, {
			props: { dfen: '7k/8/8/8/8/8/p7/1K6 b - - 0 1', seat: 'Black', moves: ['a2b1'], onmove },
		});
		const cells = screen.getAllByRole('gridcell');
		expect(cells[0]).toHaveAccessibleName('h1, empty');
		await fireEvent.click(screen.getByRole('gridcell', { name: 'a2, Black pawn' }));
		await fireEvent.click(
			screen.getByRole('gridcell', { name: 'b1, White king, legal destination' }),
		);
		expect(onmove).toHaveBeenCalledExactlyOnceWith('a2b1');
		expect(screen.queryByRole('group', { name: 'Choose promotion' })).not.toBeInTheDocument();
	});

	it('clears a stale source when the accepted board changes', async () => {
		const onmove = vi.fn();
		const { rerender } = render(LaboratoryPlayBoard, {
			props: { dfen: start, seat: 'White', moves: ['e2e4'], onmove },
		});
		await fireEvent.click(screen.getByRole('gridcell', { name: 'e2, White pawn' }));
		await rerender({
			dfen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
			seat: 'White',
			moves: ['e4e5'],
			onmove,
		});
		await fireEvent.click(screen.getByRole('gridcell', { name: 'e5, empty' }));
		expect(onmove).not.toHaveBeenCalled();
	});
});

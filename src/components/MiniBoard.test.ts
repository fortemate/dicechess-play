import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import MiniBoard from './MiniBoard.svelte';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('MiniBoard', () => {
	it('renders the same cburnett piece SVGs as the interactive board', () => {
		const { container } = render(MiniBoard, { fen: START_FEN });
		const images = [...container.querySelectorAll('img')];
		expect(images).toHaveLength(32);
		// Cells read a8→h1: the first is black's rook, the last is white's.
		expect(images[0].getAttribute('src')).toBe('/pieces/cburnett/bR.svg');
		expect(images.at(-1)?.getAttribute('src')).toBe('/pieces/cburnett/wR.svg');
	});

	it('keeps piece images out of empty squares', () => {
		const { container } = render(MiniBoard, { fen: '8/8/8/4k3/8/8/8/4K3 w - - 0 1' });
		expect(container.querySelectorAll('span')).toHaveLength(64);
		expect(container.querySelectorAll('img')).toHaveLength(2);
	});

	it('renders an empty 64-square board when the fen is missing', () => {
		const { container } = render(MiniBoard, { fen: undefined });
		expect(container.querySelectorAll('span')).toHaveLength(64);
		expect(container.querySelectorAll('img')).toHaveLength(0);
	});
});

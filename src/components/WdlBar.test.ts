import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import WdlBar from './WdlBar.svelte';

describe('WdlBar', () => {
	it('renders three segments proportional to wins/draws/losses', () => {
		const { container } = render(WdlBar, { counts: { wins: 2, draws: 1, losses: 1 } });
		const segments = container.querySelectorAll(':scope > div > div');
		expect(segments).toHaveLength(3);
		expect((segments[0] as HTMLElement).style.width).toBe('50%');
		expect((segments[1] as HTMLElement).style.width).toBe('25%');
		expect((segments[2] as HTMLElement).style.width).toBe('25%');
	});

	it('renders zero-width segments instead of dividing by zero when there are no games', () => {
		const { container } = render(WdlBar, { counts: { wins: 0, draws: 0, losses: 0 } });
		const segments = container.querySelectorAll(':scope > div > div');
		for (const segment of segments) expect((segment as HTMLElement).style.width).toBe('0%');
	});
});

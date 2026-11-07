import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import GameRatingContext from './GameRatingContext.svelte';
afterEach(cleanup);
describe('recorded game rating context', () => {
	it('training is not relabelled casual when rated is false', () => {
		const { getByText, queryByText } = render(GameRatingContext, {
			domain: 'training',
			rated: false,
		});
		expect(getByText('Training')).toBeTruthy();
		expect(queryByText('Casual')).toBeNull();
		expect(getByText(/Only the separate training/)).toBeTruthy();
	});
	it('does not infer a domain or category from missing metadata or remaining clocks', () => {
		const { getByText } = render(GameRatingContext, { rated: false });
		expect(getByText('Not competitive')).toBeTruthy();
		expect(getByText('Speed not reported')).toBeTruthy();
		expect(getByText(/does not say whether/)).toBeTruthy();
	});
	it('shows an actual category and keeps frozen seat ratings distinct from training estimates', () => {
		const { getByText } = render(GameRatingContext, {
			domain: 'training',
			rated: false,
			timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
			hasSeatRating: true,
		});
		expect(getByText('Blitz')).toBeTruthy();
		expect(getByText(/Seat ratings are competitive ratings at game start/)).toBeTruthy();
	});
});

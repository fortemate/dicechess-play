import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

// Play (#257) is a head, three tabs and the bot tab. The bot tab has its own tests
// (PlayBots.test.ts); here it is a stub, so this file pins only what the page itself owns: the
// one heading, the tabs as navigation, and the bot of a link handed down.
const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/play') }));
vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('../../components/PlayBots.svelte', async () => ({
	default: (await import('./PlayBotsStub.test.svelte')).default,
}));

import Page from './+page.svelte';

describe('/play', () => {
	afterEach(() => {
		cleanup();
		pageState.url = new URL('http://localhost/play');
	});

	it('has one page heading', () => {
		const { getAllByRole } = render(Page);
		const headings = getAllByRole('heading', { level: 1 });
		expect(headings.map((heading) => heading.textContent?.trim())).toEqual(['Play']);
	});

	it('offers the three ways to play as navigation, with the bot tab current', () => {
		const { getByRole } = render(Page);
		const nav = getByRole('navigation', { name: 'Ways to play' });
		const links = [...nav.querySelectorAll('a')];
		expect(links.map((link) => link.getAttribute('href'))).toEqual(['/play', '/live', '/lobby']);
		expect(links.map((link) => link.getAttribute('aria-current'))).toEqual(['page', null, null]);
		// The long name and the short one for a phone are both there; CSS shows one of them.
		expect(links[1].textContent).toContain('A friend, by link');
		expect(links[2].textContent).toContain('Open table');
	});

	it('hands the bot of a link to the bot tab', () => {
		pageState.url = new URL('http://localhost/play?bot=grove/willow');
		const { getByTestId } = render(Page);
		expect(getByTestId('play-bots').dataset.preselect).toBe('grove/willow');
	});

	it('hands down nothing when the link names no bot', () => {
		const { getByTestId } = render(Page);
		expect(getByTestId('play-bots').dataset.preselect).toBe('');
	});
});

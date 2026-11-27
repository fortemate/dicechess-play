import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

// Play (#257, #258) is a head, three tabs and the tab that the address asks for. Each tab has its
// own tests; here they are stubs, so this file pins only what the page itself owns: the one
// heading, the tabs as navigation, which tab is shown, and the wait at one's own table.
const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/play') }));
vi.mock('$app/state', () => ({ page: pageState }));
const stub = vi.hoisted(() => async () => ({
	default: (await import('./PlayTabStub.test.svelte')).default,
}));
vi.mock('../../components/PlayBots.svelte', stub);
vi.mock('../../components/PlayFriend.svelte', stub);
vi.mock('../../components/PlayTables.svelte', stub);
vi.mock('../../components/OpenTableWaiting.svelte', stub);

import Page from './+page.svelte';

const at = (search: string) => {
	pageState.url = new URL(`http://localhost/play${search}`);
	return render(Page);
};

describe('/play', () => {
	afterEach(() => {
		cleanup();
		pageState.url = new URL('http://localhost/play');
	});

	it('has one page heading', () => {
		const { getAllByRole } = at('');
		const headings = getAllByRole('heading', { level: 1 });
		expect(headings.map((heading) => heading.textContent?.trim())).toEqual(['Play']);
	});

	it('offers the three ways to play as navigation, each with an address of its own', () => {
		const { getByRole } = at('');
		const nav = getByRole('navigation', { name: 'Ways to play' });
		const links = [...nav.querySelectorAll('a')];
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'/play',
			'/play?tab=friend',
			'/play?tab=table',
		]);
		expect(links.map((link) => link.getAttribute('aria-current'))).toEqual(['page', null, null]);
		// The long name and the short one for a phone are both there; CSS shows one of them.
		expect(links[1].textContent).toContain('A friend, by link');
		expect(links[2].textContent).toContain('Open table');
	});

	it.each([
		['', 'preselect', 0],
		['?tab=friend', 'none', 1],
		['?tab=table', 'onopened', 2],
		['?tab=nonsense', 'preselect', 0],
	])('shows the tab the address asks for (%s)', (search, props, current) => {
		const { getByTestId, getByRole } = at(search);
		// Each tab takes different props, which is how the one stub tells them apart.
		expect(getByTestId('tab').dataset.props).toBe(props);
		const links = [...getByRole('navigation').querySelectorAll('a')];
		expect(links.findIndex((link) => link.getAttribute('aria-current') === 'page')).toBe(current);
	});

	it('says in its lead what the tab is for', () => {
		expect(at('?tab=friend').getByText(/send the link/)).toBeTruthy();
		cleanup();
		expect(at('?tab=table').getByText(/open your own/)).toBeTruthy();
	});

	it('hands the bot of a link to the bot tab', () => {
		const { getByTestId } = at('?bot=grove/willow');
		expect(getByTestId('tab').dataset.preselect).toBe('grove/willow');
	});

	it('turns into the waiting board when a table is opened, and back when it is closed', async () => {
		const { getByTestId, queryByRole, getByRole } = at('?tab=table');
		await fireEvent.click(getByTestId('open'));
		// The page is the board now: no head, no tabs.
		expect(queryByRole('navigation')).toBeNull();
		expect(queryByRole('heading', { level: 1 })).toBeNull();
		expect(getByTestId('tab').dataset.props).toBe('table+onclose');
		expect(getByTestId('tab').dataset.table).toBe('seek-1');

		await fireEvent.click(getByTestId('close'));
		expect(getByRole('navigation', { name: 'Ways to play' })).toBeTruthy();
		expect(getByTestId('tab').dataset.props).toBe('onopened');
	});
});

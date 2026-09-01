import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$app/state', () => ({ page: { url: { pathname: '/' } } }));
vi.mock('virtual:pwa-info', () => ({ pwaInfo: null }));
vi.mock('virtual:pwa-register/svelte', () => ({ useRegisterSW: vi.fn() }));
vi.mock('$lib/authStore.svelte', () => ({ authStore: { refresh: vi.fn(), status: 'signed-out' } }));
vi.mock('$lib/live/liveApi', () => ({ isLiveEnabled: () => false }));

import Layout from './+layout.svelte';

describe('+layout.svelte', () => {
	afterEach(() => cleanup());

	it('renders footer with links to licenses, rules, and source code across viewports', () => {
		const snippet = createRawSnippet(() => ({
			render: () => '<div>Content</div>',
		}));

		const { container } = render(Layout, {
			props: {
				children: snippet,
			},
		});

		const footer = container.querySelector('footer');
		expect(footer).not.toBeNull();
		expect(footer?.className).not.toContain('hidden');

		const licensesLink = footer?.querySelector<HTMLAnchorElement>('a[href="/licenses"]');
		expect(licensesLink).not.toBeNull();
		expect(licensesLink?.textContent?.trim()).toBe('Open source licenses');

		const rulesLink = footer?.querySelector<HTMLAnchorElement>('a[href="/rules"]');
		expect(rulesLink).not.toBeNull();
		expect(rulesLink?.textContent?.trim()).toBe('How to play');

		const sourceLink = footer?.querySelector<HTMLAnchorElement>(
			'a[href="https://github.com/fortemate/dicechess-play"]',
		);
		expect(sourceLink).not.toBeNull();
		expect(sourceLink?.textContent?.trim()).toBe('Source code');
	});
});

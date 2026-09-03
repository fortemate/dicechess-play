import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

import LicensesPage from './+page.svelte';

afterEach(() => cleanup());

describe('licenses page', () => {
	it('defines all required section anchors for direct navigation', () => {
		const { container } = render(LicensesPage);
		const anchoredIds = Array.from(container.querySelectorAll('section')).map((s) => s.id);

		expect(anchoredIds).toEqual([
			'play-client',
			'chessground',
			'engine',
			'pieces',
			'dependencies',
			'source-notice',
		]);
	});

	it('configures canonical, alternate links, and OpenGraph metadata', () => {
		render(LicensesPage);

		expect(document.title).toBe('Open Source Licenses & Disclosures | Dice Chess Play');

		const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
		expect(canonical?.href).toBe('https://fortemate.com/licenses');

		const alternates = Array.from(
			document.head.querySelectorAll<HTMLLinkElement>('link[rel="alternate"]'),
		).map((l) => `${l.getAttribute('hreflang')}:${l.href}`);
		expect(alternates).toEqual([
			'en:https://fortemate.com/licenses',
			'x-default:https://fortemate.com/licenses',
		]);

		const ogTitle = document.head
			.querySelector('meta[property="og:title"]')
			?.getAttribute('content');
		const ogUrl = document.head.querySelector('meta[property="og:url"]')?.getAttribute('content');
		expect(ogTitle).toBe('Open Source Licenses & Disclosures');
		expect(ogUrl).toBe('https://fortemate.com/licenses');
	});

	it('provides third-party and play client license disclosures', () => {
		const { container } = render(LicensesPage);

		// Chessground 10.1.1 (GPL-3.0-or-later)
		const chessground = container.querySelector('#chessground');
		expect(chessground?.textContent).toContain('@lichess-org/chessground 10.1.1');
		expect(chessground?.textContent).toContain('GPL-3.0-or-later');
		expect(chessground?.textContent).toContain('Lichess Team');
		expect(chessground?.textContent).toContain('contact@lichess.org');
		expect(
			chessground?.querySelector('a[href="https://github.com/lichess-org/chessground"]'),
		).not.toBeNull();
		expect(
			chessground?.querySelector(
				'a[href="https://github.com/lichess-org/chessground/blob/master/LICENSE"]',
			),
		).not.toBeNull();

		// Play client (AGPL-3.0)
		const client = container.querySelector('#play-client');
		expect(client?.textContent).toContain('dicechess-play');
		expect(client?.textContent).toContain('AGPL-3.0');
		expect(client?.textContent).toContain('Fortemate');
		expect(
			client?.querySelector('a[href="https://github.com/fortemate/dicechess-play"]'),
		).not.toBeNull();
		expect(
			client?.querySelector(
				'a[href="https://github.com/fortemate/dicechess-play/blob/main/LICENSE"]',
			),
		).not.toBeNull();

		// Dice Chess engine (AGPL-3.0)
		const engine = container.querySelector('#engine');
		expect(engine?.textContent).toContain('@fortemate/dicechess-engine 0.8.0');
		expect(engine?.textContent).toContain('AGPL-3.0');
		expect(
			engine?.querySelector('a[href="https://github.com/fortemate/dicechess-engine"]'),
		).not.toBeNull();

		// cburnett artwork & dependencies
		const pieces = container.querySelector('#pieces');
		expect(pieces?.textContent).toContain('Colin M.L. Burnett');
		expect(pieces?.textContent).toContain('CC BY-SA 3.0');

		const dependencies = container.querySelector('#dependencies');
		expect(dependencies?.textContent).toContain('idb');
		expect(dependencies?.textContent).toContain('uuid');
		expect(dependencies?.textContent).toContain('@sentry/sveltekit');

		// AGPL Section 13 notice
		const sourceNotice = container.querySelector('#source-notice');
		expect(sourceNotice?.textContent).toContain('Section 13');
		expect(sourceNotice?.textContent).toContain('Corresponding Source');
	});
});

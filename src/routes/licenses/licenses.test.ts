import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

/*
 * The licenses page (#14) is a prerendered static content page disclosing open-source
 * components, exact versions, licenses, copyright notices, and upstream source code links.
 * These tests pin the required legal disclosures and the head metadata it owns.
 */
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

import LicensesPage from './+page.svelte';

const sectionIds = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('section[id]')).map((s) => s.id);

const headLink = (rel: string, hreflang?: string) =>
	document.head.querySelector(
		hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`,
	) as HTMLLinkElement | null;

afterEach(() => cleanup());

describe('licenses page', () => {
	it('has all required disclosure sections with stable ids', () => {
		const { container } = render(LicensesPage);
		const ids = sectionIds(container);

		expect(ids).toContain('play-client');
		expect(ids).toContain('chessground');
		expect(ids).toContain('engine');
		expect(ids).toContain('pieces');
		expect(ids).toContain('dependencies');
		expect(ids).toContain('source-notice');
	});

	it('owns a complete head: title, canonical, hreflang alternates, and OpenGraph tags', () => {
		render(LicensesPage);

		expect(document.title).toContain('Open Source Licenses');
		expect(headLink('canonical')?.href).toBe('https://fortemate.com/licenses');
		expect(headLink('alternate', 'x-default')?.href).toBe('https://fortemate.com/licenses');
		expect(
			document.head.querySelector('meta[property="og:title"]')?.getAttribute('content'),
		).toContain('Open Source Licenses');
		expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
			'https://fortemate.com/licenses',
		);
	});

	it('discloses Chessground 10.1.1 under GPL-3.0-or-later with Lichess attribution and links', () => {
		const { container } = render(LicensesPage);
		const section = container.querySelector('section#chessground');
		expect(section).not.toBeNull();

		expect(section?.textContent).toContain('@lichess-org/chessground 10.1.1');
		expect(section?.textContent).toContain('GPL-3.0-or-later');
		expect(section?.textContent).toContain('Lichess Team');
		expect(section?.textContent).toContain('contact@lichess.org');

		const upstreamLink = section?.querySelector<HTMLAnchorElement>(
			'a[href="https://github.com/lichess-org/chessground"]',
		);
		expect(upstreamLink).not.toBeNull();

		const licenseLink = section?.querySelector<HTMLAnchorElement>(
			'a[href="https://github.com/lichess-org/chessground/blob/master/LICENSE"]',
		);
		expect(licenseLink).not.toBeNull();
	});

	it('discloses the Fortemate play client as AGPL-3.0 and links to its source code and license', () => {
		const { container } = render(LicensesPage);
		const section = container.querySelector('section#play-client');
		expect(section).not.toBeNull();

		expect(section?.textContent).toContain('dicechess-play');
		expect(section?.textContent).toContain('AGPL-3.0');
		expect(section?.textContent).toContain('Fortemate');

		const sourceLink = section?.querySelector<HTMLAnchorElement>(
			'a[href="https://github.com/fortemate/dicechess-play"]',
		);
		expect(sourceLink).not.toBeNull();

		const licenseLink = section?.querySelector<HTMLAnchorElement>(
			'a[href="https://github.com/fortemate/dicechess-play/blob/main/LICENSE"]',
		);
		expect(licenseLink).not.toBeNull();
	});

	it('discloses the Dice Chess engine 0.4.1 as AGPL-3.0 and links to upstream', () => {
		const { container } = render(LicensesPage);
		const section = container.querySelector('section#engine');
		expect(section).not.toBeNull();

		expect(section?.textContent).toContain('@fortemate/dicechess-engine 0.4.1');
		expect(section?.textContent).toContain('AGPL-3.0');

		const upstreamLink = section?.querySelector<HTMLAnchorElement>(
			'a[href="https://github.com/fortemate/dicechess-engine"]',
		);
		expect(upstreamLink).not.toBeNull();
	});

	it('discloses the cburnett chess piece artwork and CC BY-SA 3.0 license', () => {
		const { container } = render(LicensesPage);
		const section = container.querySelector('section#pieces');
		expect(section).not.toBeNull();

		expect(section?.textContent).toContain('Colin M.L. Burnett');
		expect(section?.textContent).toContain('CC BY-SA 3.0');
	});

	it('includes the AGPL-3.0 Section 13 remote network interaction notice and source access', () => {
		const { container } = render(LicensesPage);
		const section = container.querySelector('section#source-notice');
		expect(section).not.toBeNull();

		expect(section?.textContent).toContain('Section 13');
		expect(section?.textContent).toContain('Corresponding Source');
		expect(
			section?.querySelector('a[href="https://github.com/fortemate/dicechess-play"]'),
		).not.toBeNull();
	});
});

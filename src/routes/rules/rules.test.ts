import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

/*
 * The rules page (#254) is a prerendered static content page. These tests pin the section
 * skeleton (so in-page anchors keep working) and the head it owns (title/canonical/hreflang —
 * the whole point of prerendering it). Wording is deliberately NOT pinned: the owner edits copy
 * without touching tests.
 */
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

import RulesEn from './+page.svelte';

const sectionIds = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('section[id]')).map((s) => s.id);

const headLink = (rel: string, hreflang?: string) =>
	document.head.querySelector(
		hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`,
	) as HTMLLinkElement | null;

afterEach(() => cleanup());

describe('rules page', () => {
	it('has at least ten sections, each with a stable id', () => {
		const en = render(RulesEn);
		expect(sectionIds(en.container).length).toBeGreaterThanOrEqual(10);
	});

	it('owns a complete head: title, canonical, hreflang alternates', () => {
		render(RulesEn);

		expect(document.title).toContain('Dice Chess Rules');
		expect(headLink('canonical')?.href).toBe('https://fortemate.com/rules');
		expect(headLink('alternate', 'x-default')?.href).toBe('https://fortemate.com/rules');
		expect(
			document.head.querySelector('meta[property="og:title"]')?.getAttribute('content'),
		).toContain('Dice Chess Rules');
	});

	it('links into the game', () => {
		const en = render(RulesEn);
		expect(en.container.querySelector('a[href="/play"]')).not.toBeNull();
	});
});

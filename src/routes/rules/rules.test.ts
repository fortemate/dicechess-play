import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

/*
 * The two rules pages (#254) are parallel translations maintained by hand — there is no i18n
 * framework yet, so nothing structural keeps them in sync. These tests pin what must not drift:
 * the section skeleton (same ids in the same order, so anchors and the EN⇄RU toggle land on the
 * same content), the head each page owns (title/canonical/hreflang — the whole point of
 * prerendering them), and the cross-links. Wording is deliberately NOT pinned: the owner edits
 * copy without touching tests.
 */
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

import RulesEn from './+page.svelte';
import RulesRu from '../ru/rules/+page.svelte';

const sectionIds = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('section[id]')).map((s) => s.id);

const headLink = (rel: string, hreflang?: string) =>
	document.head.querySelector(
		hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`,
	) as HTMLLinkElement | null;

afterEach(() => cleanup());

describe('rules pages', () => {
	it('EN and RU mirror each other section for section', () => {
		const en = render(RulesEn);
		const enIds = sectionIds(en.container);
		en.unmount();

		const ru = render(RulesRu);
		const ruIds = sectionIds(ru.container);

		expect(enIds.length).toBeGreaterThanOrEqual(10);
		expect(ruIds).toEqual(enIds);
	});

	it('EN page owns a complete head: title, canonical, hreflang alternates', () => {
		render(RulesEn);

		expect(document.title).toContain('Dice Chess Rules');
		expect(headLink('canonical')?.href).toBe('https://fortemate.com/rules');
		expect(headLink('alternate', 'ru')?.href).toBe('https://fortemate.com/ru/rules');
		expect(headLink('alternate', 'x-default')?.href).toBe('https://fortemate.com/rules');
		expect(
			document.head.querySelector('meta[property="og:title"]')?.getAttribute('content'),
		).toContain('Dice Chess Rules');
	});

	it('RU page owns a complete head pointing back at the EN original', () => {
		render(RulesRu);

		expect(document.title).toContain('Правила Dice Chess');
		expect(headLink('canonical')?.href).toBe('https://fortemate.com/ru/rules');
		expect(headLink('alternate', 'en')?.href).toBe('https://fortemate.com/rules');
		expect(headLink('alternate', 'x-default')?.href).toBe('https://fortemate.com/rules');
	});

	it('pages link to each other and into the game', () => {
		const en = render(RulesEn);
		expect(en.container.querySelector('a[href="/ru/rules"]')).not.toBeNull();
		expect(en.container.querySelector('a[href="/play"]')).not.toBeNull();
		en.unmount();

		const ru = render(RulesRu);
		expect(ru.container.querySelector('a[href="/rules"]')).not.toBeNull();
		expect(ru.container.querySelector('a[href="/play"]')).not.toBeNull();
	});
});

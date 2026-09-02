/*
 * Identity asset wiring (#65): every favicon, Apple touch icon, manifest icon, and social preview
 * the site advertises must exist under static/ — a dangling href ships silently (the build does
 * not resolve static URLs) and only shows up as a broken unfurl or a blank install icon in
 * production. The files themselves are verbatim exports from fortemate/brand; this test pins the
 * references, not the artwork.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appHtml = readFileSync('src/app.html', 'utf-8');
const viteConfig = readFileSync('vite.config.ts', 'utf-8');
const prerenderedHeads = ['src/routes/rules/+page.svelte', 'src/routes/licenses/+page.svelte'].map(
	(path) => readFileSync(path, 'utf-8'),
);

const SOCIAL_PREVIEW = '/social-preview-1200x630.png';

function staticFileExists(url: string): boolean {
	return existsSync(`static${url.replace(/^https:\/\/fortemate\.com/, '')}`);
}

function attributeValues(html: string, attribute: 'href' | 'content' | 'src'): string[] {
	return [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map((match) => match[1]);
}

describe('identity assets', () => {
	it('points every icon link in app.html at a file under static/', () => {
		const iconLinks = [...appHtml.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map(
			(match) => match[0],
		);
		expect(iconLinks.length).toBeGreaterThanOrEqual(4);
		for (const link of iconLinks) {
			const [href] = attributeValues(link, 'href');
			expect(href, link).toBeDefined();
			expect(staticFileExists(href), `${href} is missing from static/`).toBe(true);
		}
	});

	it('uses the SVG favicon first with PNG fallbacks', () => {
		expect(appHtml).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
		expect(appHtml).toMatch(/href="\/favicon-32\.png"[^>]*sizes="32x32"/);
		expect(appHtml).toMatch(/href="\/favicon-16\.png"[^>]*sizes="16x16"/);
	});

	it('advertises the 1200×630 social preview as og:image everywhere, with its dimensions', () => {
		for (const head of [appHtml, ...prerenderedHeads]) {
			const ogImages = [...head.matchAll(/<meta property="og:image" content="([^"]+)" \/>/g)].map(
				(match) => match[1],
			);
			expect(ogImages).toHaveLength(1);
			expect(ogImages[0]).toMatch(new RegExp(`${SOCIAL_PREVIEW.replaceAll('.', '\\.')}$`));
			expect(head).toContain('<meta property="og:image:width" content="1200" />');
			expect(head).toContain('<meta property="og:image:height" content="630" />');
			expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />');
		}
		expect(staticFileExists(SOCIAL_PREVIEW)).toBe(true);
	});

	it('declares manifest icons that exist, with separate any and maskable files', () => {
		const iconsBlock = /icons:\s*\[([\s\S]*?)\]/.exec(viteConfig)?.[1];
		expect(iconsBlock).toBeDefined();
		const icons = [
			...iconsBlock!.matchAll(/src:\s*'([^']+)'[^}]*sizes:\s*'([^']+)'[^}]*purpose:\s*'([^']+)'/g),
		].map(([, src, sizes, purpose]) => ({ src, sizes, purpose }));

		expect(icons).toHaveLength(4);
		for (const { src } of icons) {
			expect(existsSync(`static/${src}`), `${src} is missing from static/`).toBe(true);
		}
		for (const purpose of ['any', 'maskable']) {
			const sizes = icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes);
			expect(sizes.sort()).toEqual(['192x192', '512x512']);
		}
		const anySources = new Set(icons.filter((i) => i.purpose === 'any').map((i) => i.src));
		for (const icon of icons.filter((i) => i.purpose === 'maskable')) {
			expect(anySources.has(icon.src), 'maskable icons need their own padded file').toBe(false);
		}
	});

	it('no longer references the game-specific PWA artwork as identity', () => {
		for (const source of [appHtml, viteConfig, ...prerenderedHeads]) {
			expect(source).not.toMatch(
				/pwa-(?:192x192|512x512)\.png|\/favicon\.png|\/apple-touch-icon\.png/,
			);
		}
	});
});

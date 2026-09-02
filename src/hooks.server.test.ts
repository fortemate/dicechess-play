/*
 * The default-head strip (#254): prerendered content pages set a complete head of their own,
 * and unfurl bots take the FIRST og:title/<title> they see — so app.html's fallback block must
 * not survive into their HTML. These tests pin the contract between app.html's marker comments
 * and the hook that consumes them; if someone renames or removes the markers, the failure shows
 * up here instead of as a wrong unfurl in production.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripDefaultHead } from './hooks.server';
describe('stripDefaultHead', () => {
	it('removes the marked block, everything between the markers included', () => {
		const html = [
			'<head>',
			'\t<meta charset="UTF-8" />',
			'\t<!-- default-head -->',
			'\t<title>Dice Chess — Play</title>',
			'\t<meta property="og:title" content="Dice Chess — Play" />',
			'\t<!-- /default-head -->',
			'\t<link rel="icon" href="/favicon.svg" />',
			'</head>',
		].join('\n');

		const stripped = stripDefaultHead(html);

		expect(stripped).not.toContain('default-head');
		expect(stripped).not.toContain('<title>');
		expect(stripped).not.toContain('og:title');
		expect(stripped).toContain('<meta charset="UTF-8" />');
		expect(stripped).toContain('<link rel="icon" href="/favicon.svg" />');
	});

	it('leaves HTML without the markers untouched', () => {
		const html = '<head><title>Something</title></head>';
		expect(stripDefaultHead(html)).toBe(html);
	});

	it('finds the real marker block in app.html', () => {
		const appHtml = readFileSync('src/app.html', 'utf-8');
		const stripped = stripDefaultHead(appHtml);

		// The block is actually present and carries the fallback tags…
		expect(appHtml).toContain('<!-- default-head -->');
		expect(stripped.length).toBeLessThan(appHtml.length);
		// …and stripping removes every fallback tag the rules pages redefine. (The literal
		// `<title>` string still appears in an explanatory comment, so match the elements.)
		expect(stripped).not.toContain('<title>Dice Chess');
		expect(stripped).not.toContain('property="og:title"');
		expect(stripped).not.toContain('name="description"');
	});
});

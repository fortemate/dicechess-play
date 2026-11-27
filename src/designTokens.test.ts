import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { THEMES, type Theme } from './lib/appearance';

// The colour tokens of the site are plain values in two stylesheets, one block per theme each:
// the interface tokens in `src/app.css` (#250) and the board colours in `src/board.css` (#251).
// `@theme` in `app.css` maps both to Tailwind names. Nothing else stops a value from being changed to one
// that reads badly, or a component from reaching past the tokens for a Tailwind palette colour
// that ignores the theme. These tests are that guard. They read the shipped stylesheet and the
// component sources, so they describe the site as it is and not a copy of its values:
//
//   1. each stylesheet has exactly the themes the appearance model lists, and both themes set
//      the same variables;
//   2. the pairs components combine meet WCAG 2 AA in both themes: 4.5:1 for text, 3:1 for the
//      edge of a control;
//   3. text of a status colour on a tint of the same colour (`bg-danger/10 text-danger`) meets
//      4.5:1 at every tint strength a component uses;
//   4. no component uses a Tailwind palette utility (`bg-slate-900`, `text-white`) or writes
//      a colour into a class (`bg-[#f0d9b5]`);
//   5. the coordinate ink of the board meets 4.5:1 on every colour a square can take.
//
// Not covered, on purpose: text dimmed with an opacity (`text-content-muted/60`) and a tint
// placed straight on the page instead of on a card. Both are choices of one component, not
// properties of a token.

const TEXT_MINIMUM = 4.5;
const EDGE_MINIMUM = 3;

const appCss = readFileSync('src/app.css', 'utf-8');
const STYLESHEETS = { 'app.css': appCss, 'board.css': readFileSync('src/board.css', 'utf-8') };

/** The variables one theme block of a stylesheet sets, by name. */
function blockOf(css: string, theme: Theme): Map<string, string> {
	// Same lookup as appearanceBootstrap.test.ts.
	const block = css.split(`[data-theme='${theme}'] {`)[1]?.split('}')[0] ?? '';
	const variables = new Map<string, string>();
	for (const [, name, value] of block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) {
		variables.set(name, value.trim().toLowerCase());
	}
	return variables;
}

/** Every variable a theme sets, across the stylesheets. */
function variablesOf(theme: Theme): Map<string, string> {
	return new Map(Object.values(STYLESHEETS).flatMap((css) => [...blockOf(css, theme)]));
}

const TOKENS = Object.fromEntries(THEMES.map((theme) => [theme, variablesOf(theme)])) as Record<
	Theme,
	Map<string, string>
>;

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
	return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as Rgb;
}

/** WCAG 2 relative luminance of an sRGB colour. */
function luminance(colour: Rgb): number {
	const [r, g, b] = colour
		.map((channel) => channel / 255)
		.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, from 1 (no contrast) to 21. */
function contrast(a: Rgb, b: Rgb): number {
	const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (lighter + 0.05) / (darker + 0.05);
}

/** What a colour at the given opacity looks like on an opaque backdrop. */
function over(colour: Rgb, backdrop: Rgb, opacity: number): Rgb {
	return colour.map((channel, i) => channel * opacity + backdrop[i] * (1 - opacity)) as Rgb;
}

function token(theme: Theme, name: string): Rgb {
	const value = TOKENS[theme].get(name);
	if (!value) throw new Error(`${name} is not set in the ${theme} theme`);
	return rgb(value);
}

describe('theme blocks', () => {
	describe.each(Object.entries(STYLESHEETS))('%s', (_name, css) => {
		it('has a block for each theme of the appearance model and for no other', () => {
			const selectors = [...css.matchAll(/\[data-theme='([^']+)'\]/g)].map(([, theme]) => theme);
			expect(selectors.sort()).toEqual([...THEMES].sort());
		});

		it('sets the same variables in both themes, each to a six-digit hex colour', () => {
			const blocks = THEMES.map((theme) => blockOf(css, theme));
			const [first, ...rest] = blocks.map((block) => [...block.keys()].sort());
			expect(first.length).toBeGreaterThan(0);
			for (const names of rest) expect(names).toEqual(first);

			for (const block of blocks) {
				for (const [name, value] of block) expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
			}
		});
	});

	it('sets every variable that a Tailwind colour name reads', () => {
		const mapping = appCss.split('@theme {')[1]?.split(':root,')[0] ?? '';
		const read = [...mapping.matchAll(/--color-[a-z-]+:\s*var\((--[a-z-]+)\)/g)].map(
			([, name]) => name,
		);
		expect(read.length).toBeGreaterThan(0);
		for (const theme of THEMES) {
			for (const name of read) {
				expect(TOKENS[theme].has(name), `${name} in the ${theme} theme`).toBe(true);
			}
		}
	});
});

// The surfaces text is put on: the page, a card, and a sunk or hovered area.
const SURFACES = ['--bg-app', '--bg-surface', '--bg-surface-hover'];

// Every colour used as text or as a link, on every surface.
const TEXT_ON_SURFACES = [
	'--text-primary',
	'--text-muted',
	'--accent',
	'--accent-hover',
	'--danger',
	'--badge-accent',
	'--success',
].flatMap((text) => SURFACES.map((surface) => [text, surface]));

// Text that belongs to one filled background.
const TEXT_ON_FILLS = [
	['--accent-content', '--accent'],
	['--accent-content', '--accent-hover'],
	['--danger-content', '--danger'],
	['--text-highlight', '--bg-highlight'],
];

// The edge of a control (an input, an outlined button) against what it stands on.
const CONTROL_EDGES = [
	['--border-strong', '--bg-app'],
	['--border-strong', '--bg-surface'],
];

describe.each(THEMES)('contrast in the %s theme', (theme) => {
	it.each([...TEXT_ON_SURFACES, ...TEXT_ON_FILLS])('%s is readable on %s', (text, background) => {
		expect(contrast(token(theme, text), token(theme, background))).toBeGreaterThanOrEqual(
			TEXT_MINIMUM,
		);
	});

	it.each(CONTROL_EDGES)('%s is visible as a control edge on %s', (edge, background) => {
		expect(contrast(token(theme, edge), token(theme, background))).toBeGreaterThanOrEqual(
			EDGE_MINIMUM,
		);
	});
});

// What a square of the board can look like under a coordinate.
const SQUARES = ['--board-light', '--board-dark', '--board-last-move', '--board-selected'];

describe.each(THEMES)('the board in the %s theme', (theme) => {
	it.each(SQUARES)('shows its coordinates readably on %s', (square) => {
		expect(contrast(token(theme, '--board-coord'), token(theme, square))).toBeGreaterThanOrEqual(
			TEXT_MINIMUM,
		);
	});

	it('tells a light square from a dark one', () => {
		// Not a WCAG threshold: the two squares only have to stay apart, and a pair that
		// drifts together would still pass every coordinate check above.
		expect(
			contrast(token(theme, '--board-light'), token(theme, '--board-dark')),
		).toBeGreaterThanOrEqual(1.8);
	});
});

/** Source files that can hold class names. The showcase is left alone: it goes away (#265). */
function sources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return path === join('src', 'components', 'showcase') ||
				path === join('src', 'lib', 'paraglide')
				? []
				: sources(path);
		}
		return /\.(svelte|ts|html|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts')
			? [path]
			: [];
	});
}

const SOURCES = sources('src').map((path) => ({
	path,
	lines: readFileSync(path, 'utf-8').split('\n'),
}));

// The Tailwind name of a status colour and the variable behind it.
const TINTABLE: Record<string, string> = {
	danger: '--danger',
	primary: '--accent',
	success: '--success',
	'badge-accent': '--badge-accent',
};

/** Each "text of a colour on an N% tint of the same colour" that some line of source writes. */
function tintsInUse(): [string, number][] {
	const found = new Set<string>();
	for (const { lines } of SOURCES) {
		for (const line of lines) {
			for (const name of Object.keys(TINTABLE)) {
				if (!new RegExp(`\\btext-${name}(?![\\w/-])`).test(line)) continue;
				for (const [, strength] of line.matchAll(new RegExp(`\\bbg-${name}/(\\d+)\\b`, 'g'))) {
					found.add(`${name}/${strength}`);
				}
			}
		}
	}
	return [...found].sort().map((entry) => {
		const [name, strength] = entry.split('/');
		return [name, Number(strength)];
	});
}

describe('status text on a tint of its own colour', () => {
	const tints = tintsInUse();

	it('finds the tints components use', () => {
		// A guard for the scan itself: if this goes empty, the cases below prove nothing.
		expect(tints).toContainEqual(['danger', 10]);
		expect(tints).toContainEqual(['primary', 10]);
	});

	describe.each(THEMES)('in the %s theme', (theme) => {
		it.each(tints)('text-%s is readable on a tint of %i percent over a card', (name, strength) => {
			const colour = token(theme, TINTABLE[name]);
			const tint = over(colour, token(theme, '--bg-surface'), strength / 100);
			expect(contrast(colour, tint)).toBeGreaterThanOrEqual(TEXT_MINIMUM);
		});
	});
});

describe('palette utilities', () => {
	const PALETTE_UTILITY =
		/\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|shadow|placeholder|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?\b/g;

	it('are not used: a colour comes from a token, so that it follows the theme', () => {
		const found = SOURCES.flatMap(({ path, lines }) =>
			lines.flatMap((line, i) =>
				[...line.matchAll(PALETTE_UTILITY)].map(([utility]) => `${path}:${i + 1} ${utility}`),
			),
		);
		expect(found).toEqual([]);
	});

	it('are not replaced by a colour written into a class (`bg-[#f0d9b5]`)', () => {
		const found = SOURCES.flatMap(({ path, lines }) =>
			lines.flatMap((line, i) =>
				[...line.matchAll(/[\w-]+-\[#[0-9a-fA-F]{3,8}\]/g)].map(
					([utility]) => `${path}:${i + 1} ${utility}`,
				),
			),
		);
		expect(found).toEqual([]);
	});
});

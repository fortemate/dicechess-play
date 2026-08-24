import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import * as svelteParser from 'svelte-eslint-parser';
// @ts-expect-error - plain JS ESLint rule, no type declarations
import rule from './no-untranslated-text.js';

/*
 * The guard for the i18n epic (#8). These tests pin the two things it must catch and — more
 * importantly — the things it must NOT, because a noisy guard gets switched off.
 *
 * RuleTester wants vitest's globals under different names; ESLint 10 exposes the hook it needs.
 */
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parser: svelteParser,
		ecmaVersion: 2023,
		sourceType: 'module',
	},
});

const svelte = (body: string) => `<script>let n = 0;</script>\n${body}`;

describe('no-untranslated-text', () => {
	ruleTester.run('no-untranslated-text', rule, {
		valid: [
			// The migrated shape: text and attributes both come from the catalog.
			{ filename: 'A.svelte', code: svelte('<h1>{m.page_heading()}</h1>') },
			{ filename: 'A.svelte', code: svelte('<div aria-label={m.region()}></div>') },
			{ filename: 'A.svelte', code: svelte('<img src="/x.png" alt={m.board_alt()} />') },

			// Script literals are out of scope — this is where eslint-plugin-i18next was noisy.
			{ filename: 'A.svelte', code: '<script>const msg = "not template copy";</script>' },
			{
				filename: 'A.svelte',
				code: svelte('<button onclick={() => console.log("rolled")}>{m.go()}</button>'),
			},

			// Machinery attributes are never copy, however word-like their values.
			{ filename: 'A.svelte', code: svelte('<a href="/lobby" class="text-content">{m.x()}</a>') },

			// Below the two-letter floor: counts, separators, single-letter W/D/L labels.
			{ filename: 'A.svelte', code: svelte('<span>{n}W · {n}%</span>') },
			{ filename: 'A.svelte', code: svelte('<span>  \n  </span>') },

			// Literal identifiers, not prose.
			{ filename: 'A.svelte', code: svelte('<code>VITE_PLAY_API_URL</code>') },
			{ filename: 'A.svelte', code: svelte('<pre>npm run build</pre>') },

			// allowPattern carves out non-copy tokens without disabling the rule for the file.
			{
				filename: 'A.svelte',
				code: svelte('<span>AGPL-3.0</span>'),
				options: [{ allowPattern: '^AGPL-3\\.0$' }],
			},

			// A user-facing attribute can be muted deliberately while a migration is staged.
			{
				filename: 'A.svelte',
				code: svelte('<div title="Later"></div>'),
				options: [{ ignoreAttributes: ['title'] }],
			},
		],

		invalid: [
			{
				filename: 'A.svelte',
				code: svelte('<h1>How to play Dice Chess</h1>'),
				errors: [{ messageId: 'text' }],
			},
			{
				filename: 'A.svelte',
				code: svelte('<div aria-label="Dice"></div>'),
				errors: [{ messageId: 'attr' }],
			},
			{
				filename: 'A.svelte',
				code: svelte('<img src="/x.png" alt="Board" />'),
				errors: [{ messageId: 'attr' }],
			},
			{
				filename: 'A.svelte',
				code: svelte('<input placeholder="Search players" />'),
				errors: [{ messageId: 'attr' }],
			},
			{
				filename: 'A.svelte',
				code: svelte('<button title="Roll three dice">{m.go()}</button>'),
				errors: [{ messageId: 'attr' }],
			},

			// Text split by an interpolation reports twice on purpose: that is the rule saying the
			// fragments must become ONE interpolated message, not two keys. Documented in CONTRIBUTING.
			{
				filename: 'A.svelte',
				code: svelte('<p>You have {n} moves left.</p>'),
				errors: [{ messageId: 'text' }, { messageId: 'text' }],
			},

			// Overriding ignoreElements replaces the default list rather than extending it.
			{
				filename: 'A.svelte',
				code: svelte('<code>Real prose here</code>'),
				options: [{ ignoreElements: ['pre'] }],
				errors: [{ messageId: 'text' }],
			},
		],
	});
});

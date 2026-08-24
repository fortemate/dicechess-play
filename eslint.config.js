import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import noUntranslatedText from './eslint-local/no-untranslated-text.js';

export default ts.config(
	{
		linterOptions: {
			// Load-bearing for the i18n guard (#25), not a style preference. Every not-yet-migrated
			// file carries an eslint-disable for local/no-untranslated-text; at ESLint 10's default
			// of 'warn' a suppression could outlive its file's migration unnoticed, and `npm run
			// lint` has no --max-warnings 0 to catch it (nor can it — the repo has 27 legitimate
			// warnings). At 'error' the i18n debt list is provably shrink-only.
			reportUnusedDisableDirectives: 'error',
		},
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			// Allow explicit any in a frontend project where external APIs return untyped data
			'@typescript-eslint/no-explicit-any': 'warn',
			// Allow unused vars with underscore prefix (common convention for intentionally unused)
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
			},
		},
		rules: {
			// Svelte each-key is a recommendation, not always necessary for small static lists
			'svelte/require-each-key': 'warn',
			// SvelteSet/SvelteMap recommendations
			'svelte/prefer-svelte-reactivity': 'warn',
			// Unused svelte-ignore is noisy during rapid iteration
			'svelte/no-unused-svelte-ignore': 'warn',
		},
	},
	{
		// The i18n guard (#8). On repo-wide and at 'error': a file is either migrated or carries an
		// explicit debt suppression, so a NEW component is guarded by default. An allowlist of
		// migrated files would do the opposite and let new work ship unguarded.
		files: ['**/*.svelte'],
		plugins: { local: { rules: { 'no-untranslated-text': noUntranslatedText } } },
		rules: {
			'local/no-untranslated-text': [
				'error',
				{
					// Not copy: a licence identifier and the two SI-ish rating/percent suffixes that
					// survive the two-letter floor. Keep this list short — reaching for it instead of
					// a catalog key is how a guard rots.
					allowPattern: '^(AGPL-3\\.0|CC BY-SA 4\\.0)$',
				},
			],
		},
	},
	{
		// src/lib/paraglide/ is compiler output: generated, gitignored, and it carries its own
		// `/* eslint-disable */` headers that would trip unused-directive reporting (i18n epic #8).
		ignores: ['dist/', 'node_modules/', '.svelte-kit/', 'public/', '.vite/', 'src/lib/paraglide/'],
	},
);

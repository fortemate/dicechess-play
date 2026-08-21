import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
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
		ignores: ['dist/', 'node_modules/', '.svelte-kit/', 'public/', '.vite/'],
	},
);

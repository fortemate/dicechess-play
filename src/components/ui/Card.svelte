<script lang="ts">
	// The surface content sits on: a 1 px edge and one radius everywhere (#252). Only the main
	// card of a page (the featured game, the setup panel) is `raised`, so a shadow keeps
	// meaning "this is the thing to look at".
	//
	// `as` picks the element: a card that is a region of the page is a `section` and then
	// needs an accessible name (`aria-label` or `aria-labelledby`), which passes through.
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props {
		as?: 'div' | 'section' | 'article' | 'aside';
		raised?: boolean;
		/** `none` for a card whose content runs to the edge, e.g. a list with dividers. */
		padding?: 'none' | 'md' | 'lg';
		children: Snippet;
		class?: string;
	}

	let {
		as = 'div',
		raised = false,
		padding = 'md',
		children,
		class: className = '',
		...rest
	}: Props & Omit<HTMLAttributes<HTMLElement>, keyof Props> = $props();

	const PADDING = { none: '', md: 'p-4', lg: 'p-5' };
</script>

<svelte:element
	this={as}
	class="rounded-card border border-border bg-surface text-content {PADDING[padding]} {raised
		? 'shadow-lg'
		: ''} {className}"
	{...rest}
>
	{@render children()}
</svelte:element>

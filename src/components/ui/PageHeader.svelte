<script lang="ts">
	// The head of a page: its one `<h1>`, an optional lead line and optional actions on the
	// right (#252). Titles are set in the serif display face.
	//
	// `plain` switches the title to the sans-serif face. Use it when the title contains the
	// name of a bot or a player: the serif face has old-style digits, which make a name with
	// numbers hard to read.
	//
	// The title and the lead are text from the caller, already translated.
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		lead?: string;
		plain?: boolean;
		actions?: Snippet;
		class?: string;
	}

	let { title, lead, plain = false, actions, class: className = '' }: Props = $props();
</script>

<header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 {className}">
	<div class="min-w-0">
		<h1
			class="m-0 text-content {plain
				? 'text-3xl font-bold tracking-tight md:text-4xl'
				: 'font-display text-4xl leading-tight font-normal tracking-tight md:text-5xl'}"
		>
			{title}
		</h1>
		{#if lead}
			<p class="mt-2 mb-0 max-w-2xl text-base text-content-muted md:text-lg">{lead}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</header>

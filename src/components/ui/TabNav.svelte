<script lang="ts">
	// The sections of a page as a row of links (#258, #259): the three ways to play, the sections
	// of Arena. Each section has an address of its own, so this is navigation and the current
	// link says so (`aria-current`), rather than a tab list with panels.
	//
	// A track of pills on a phone, a row of underlined tabs from the `sm` breakpoint. A long row
	// scrolls sideways inside itself, never the page. `short` is the label for the phone, where
	// "Anyone, at an open table" has no room; `count` is a number shown after the label.
	//
	// The labels come from the caller, already translated, and so do the addresses, already
	// resolved.
	interface Item {
		href: string;
		label: string;
		short?: string;
		current: boolean;
		count?: number;
	}

	interface Props {
		/** The accessible name of the navigation, e.g. "Ways to play". */
		label: string;
		items: readonly Item[];
		class?: string;
	}

	let { label, items, class: className = '' }: Props = $props();
</script>

<nav
	aria-label={label}
	class="flex gap-1 overflow-x-auto rounded-xl bg-surface-hover p-1 sm:gap-6 sm:rounded-none sm:border-b sm:border-border sm:bg-transparent sm:p-0 {className}"
>
	{#each items as item (item.href)}
		<!-- The caller passes an address it has resolved. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={item.href}
			aria-current={item.current ? 'page' : undefined}
			class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[0.5rem] px-2 text-center text-sm font-semibold whitespace-nowrap transition-colors focus-visible:focus-ring sm:-mb-px sm:flex-none sm:rounded-none sm:border-b-2 sm:px-1 sm:text-base
				{item.current
				? 'bg-surface text-content sm:border-primary sm:bg-transparent'
				: 'text-content-muted hover:text-content sm:border-transparent'}"
		>
			{#if item.short}
				<span class="sm:hidden">{item.short}</span>
				<span class="max-sm:hidden">{item.label}</span>
			{:else}
				<span>{item.label}</span>
			{/if}
			{#if item.count !== undefined}
				<span
					class="rounded-full bg-surface-hover px-2 py-px text-xs font-bold text-content tabular-nums max-sm:bg-transparent max-sm:px-0"
				>
					{item.count}
				</span>
			{/if}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/each}
</nav>

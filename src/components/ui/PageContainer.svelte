<script lang="ts">
	// The one content width of the site (#252): 1200 px at most, with 16 px of padding on a
	// phone and 32 px from the `md` breakpoint. Every redesigned page puts its content in one,
	// so a page title no longer moves sideways from one section to the next.
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<div class="mx-auto w-full max-w-page px-4 md:px-8 {className}">
	{@render children()}
</div>

<script lang="ts">
	// "Play a game" on a phone, on every Arena page (#259, #260): the way to a game of one's own
	// stays in reach above the bottom navigation of the current shell (57 px). The new navigation
	// (#264) brings its own offset. From the `sm` breakpoint the button is in the head instead.
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import Button from './ui/Button.svelte';
</script>

<div class="sticky bottom-[calc(3.5625rem+env(safe-area-inset-bottom))] z-30 pb-2 sm:hidden">
	<Button href={resolve('/play')} variant="primary" size="lg" block>
		{m.arena_play()}
		<span aria-hidden="true">→</span>
	</Button>
</div>

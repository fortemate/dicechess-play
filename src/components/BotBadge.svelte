<script lang="ts">
	// The one way a bot is marked across the site (lobby, game views, history, leaderboard):
	// humans must always see they are facing a machine (transparency, D.3). Extracted from the
	// lobby's local snippet so every surface renders the identical badge.
	interface Props {
		/** Tailwind text-size class — the badge scales with its host row. */
		sizeClass?: string;
	}

	let { sizeClass = 'text-[10px]' }: Props = $props();
</script>

<span
	class="shrink-0 rounded bg-primary/15 px-1 py-px {sizeClass} font-bold uppercase tracking-wide text-primary"
>
	bot
</span>

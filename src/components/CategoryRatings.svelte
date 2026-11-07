<script lang="ts">
	// Competitive profile entries stay on their own speed. Missing metadata is not borrowed from a
	// leaderboard fetched at a different instant, and an unplayed speed never gets a fallback rating.
	import { m } from '#lib/paraglide/messages.js';
	import type { CategoryRating } from '#lib/leaderboard/leaderboardApi.js';
	import { RATING_CATEGORY_LABELS, RATING_CATEGORY_ORDER } from '#lib/live/ratingCategory.js';
	import RatingEstimate from './RatingEstimate.svelte';
	import WdlCounts from './WdlCounts.svelte';
	let { ratings }: { ratings: CategoryRating[] } = $props();
	const rows = $derived(
		RATING_CATEGORY_ORDER.map((category) => ({
			category,
			label: RATING_CATEGORY_LABELS[category],
			rating: ratings.find((r) => r.category === category),
		})),
	);
</script>

<ul class="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface/40">
	{#each rows as row (row.category)}
		<li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
			<span class="w-14 shrink-0 text-xs font-bold uppercase tracking-wider text-content-muted"
				>{row.label}</span
			>
			{#if row.rating}
				<div class="min-w-0 flex-1"><RatingEstimate estimate={row.rating} /></div>
				<WdlCounts counts={row.rating} />
			{:else}
				<span
					class="min-w-0 flex-1 font-mono text-sm text-content-muted"
					aria-label={m.common_rating_unrated()}>—</span
				>
				<span class="text-xs text-content-muted/70">{m.common_rating_no_games()}</span>
			{/if}
		</li>
	{/each}
</ul>
<p class="mt-2 text-xs text-content-muted">{m.common_rating_profile_unknown()}</p>
<details class="mt-2 text-xs text-content-muted">
	<summary class="cursor-pointer font-semibold">{m.common_rating_explanation()}</summary>
	<p class="mt-2">{m.common_rating_interval_help()}</p>
</details>

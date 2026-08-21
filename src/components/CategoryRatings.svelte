<script lang="ts">
	// One rating per speed (#258): the per-category block shared by both public profiles and /me.
	// Renders ALL three categories in canonical order even when unplayed — an absent wire entry means
	// "genuinely unrated at this speed", and showing the row with an explicit dash says so, where
	// omitting it would read as the site not tracking that speed at all. `provisional` is per
	// category: settled at blitz and still settling at bullet is a normal state, so the note lives
	// on the row, not on the page.
	import type { CategoryRating } from '$lib/leaderboard/leaderboardApi';
	import {
		RATING_CATEGORY_LABELS,
		RATING_CATEGORY_ORDER,
		type RatingCategory,
	} from '$lib/live/ratingCategory';
	import WdlCounts from './WdlCounts.svelte';

	let { ratings }: { ratings: CategoryRating[] } = $props();

	// Glicko ratings are estimates: whole points are honest enough (the ± carries the precision) —
	// the same stance as the leaderboard.
	const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

	const byCategory = $derived(new Map(ratings.map((r) => [r.category, r])));
	const rows = $derived(
		RATING_CATEGORY_ORDER.map((category: RatingCategory) => ({
			category,
			label: RATING_CATEGORY_LABELS[category],
			rating: byCategory.get(category) ?? null,
		})),
	);
</script>

<ul class="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface/40">
	{#each rows as row (row.category)}
		<li class="flex items-center justify-between gap-3 px-4 py-2.5">
			<span class="w-14 shrink-0 text-xs font-bold uppercase tracking-wider text-content-muted">
				{row.label}
			</span>
			{#if row.rating}
				<span class="min-w-0 flex-1 font-mono text-sm tabular-nums text-content-muted">
					<b class="text-content">{wholeNumber.format(row.rating.rating)}</b>
					±{wholeNumber.format(row.rating.rd)}
					{#if row.rating.provisional}<span class="italic"> · provisional</span>{/if}
				</span>
				<span class="shrink-0">
					<WdlCounts
						counts={{
							wins: row.rating.wins,
							draws: row.rating.draws,
							losses: row.rating.losses,
						}}
					/>
				</span>
			{:else}
				<span class="min-w-0 flex-1 font-mono text-sm tabular-nums text-content-muted">—</span>
				<span class="shrink-0 text-xs text-content-muted/70">no rated games at this speed</span>
			{/if}
		</li>
	{/each}
</ul>

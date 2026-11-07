<script lang="ts">
	// Training estimates form their own domain: sparse speeds stay unmeasured and records never
	// inherit competitive results. An absent array means the server does not report training yet.
	import { m } from '#lib/paraglide/messages.js';
	import type { TrainingCategoryRating } from '#lib/leaderboard/leaderboardApi.js';
	import { RATING_CATEGORY_LABELS, RATING_CATEGORY_ORDER } from '#lib/live/ratingCategory.js';
	import { formatWholeNumber } from '../utils/formatters';
	import RatingEstimate from './RatingEstimate.svelte';
	import WdlCounts from './WdlCounts.svelte';

	let { ratings }: { ratings?: TrainingCategoryRating[] } = $props();
	const byCategory = $derived(new Map((ratings ?? []).map((rating) => [rating.category, rating])));
</script>

<section class="space-y-3">
	<h2 class="text-sm font-bold uppercase tracking-widest text-content-muted">
		{m.profile_training_heading()}
	</h2>
	<p class="text-sm text-content-muted">{m.profile_training_explanation()}</p>
	{#if ratings === undefined}
		<p class="text-sm text-content-muted">{m.profile_training_unsupported()}</p>
	{:else if ratings.length === 0}
		<p class="text-sm text-content-muted">{m.profile_training_empty()}</p>
	{/if}
	<ul
		aria-label={m.profile_training_heading()}
		class="divide-y divide-border rounded-2xl border border-border bg-surface/40"
	>
		{#each RATING_CATEGORY_ORDER as category (category)}
			{@const rating = byCategory.get(category)}
			<li class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
				<h3 class="shrink-0 text-xs font-bold uppercase tracking-wider text-content-muted sm:w-14">
					{RATING_CATEGORY_LABELS[category]}
				</h3>
				{#if rating}
					<div class="min-w-0 flex-1">
						<RatingEstimate estimate={rating} showMetadata />
					</div>
					<div class="space-y-1 sm:text-right">
						<p class="text-xs text-content-muted">{m.profile_training_record()}</p>
						<WdlCounts counts={{ wins: rating.wins, draws: rating.draws, losses: rating.losses }} />
						<p class="text-xs text-content-muted">
							{m.profile_training_games({ count: formatWholeNumber(rating.games) })}
						</p>
					</div>
				{:else}
					<p class="text-sm text-content-muted">{m.profile_training_unmeasured()}</p>
				{/if}
			</li>
		{/each}
	</ul>
</section>

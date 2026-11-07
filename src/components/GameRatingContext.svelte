<script lang="ts">
	// Show the recorded game domain, not a guess from a bot/human pairing or rated=false (#124).
	import { m } from '#lib/paraglide/messages.js';
	import { ratingCategoryOf, RATING_CATEGORY_LABELS } from '#lib/live/ratingCategory.js';
	import type { TimeControl } from '#lib/live/liveTypes.js';
	let {
		domain,
		rated,
		timeControl,
		compact = false,
		hasSeatRating = false,
	}: {
		domain?: string | null;
		rated?: boolean;
		timeControl?: TimeControl | null;
		compact?: boolean;
		hasSeatRating?: boolean;
	} = $props();
	const category = $derived(ratingCategoryOf(timeControl));
	const label = $derived(
		domain === 'training'
			? m.common_rating_game_training()
			: domain === 'competitive' || (!domain && rated === true)
				? m.common_rating_game_competitive()
				: domain === 'casual'
					? m.common_rating_game_casual()
					: !domain && rated === false
						? m.common_rating_game_noncompetitive()
						: m.common_rating_game_unknown(),
	);
</script>

<div class="space-y-1 text-xs text-content-muted">
	<span
		class="inline-flex rounded border border-border bg-surface/50 px-2 py-1 font-semibold"
		title={!domain && rated === false ? m.common_rating_domain_unknown() : undefined}>{label}</span
	>
	{#if !compact}
		<span class="ml-1"
			>{category
				? RATING_CATEGORY_LABELS[category]
				: timeControl
					? m.common_rating_speed_uncategorised()
					: m.common_rating_speed_unknown()}</span
		>
		{#if domain === 'training'}<p>{m.common_rating_training_explainer()}</p>{/if}
		{#if !domain && rated === false}<p>{m.common_rating_domain_unknown()}</p>{/if}
		{#if hasSeatRating}<p>{m.common_rating_seat_estimate_context()}</p>{/if}
	{/if}
</div>

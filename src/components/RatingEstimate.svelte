<script lang="ts">
	// Shared uncertainty display for the public rating contract; never confuses RD with 95% bounds.
	import { m } from '#lib/paraglide/messages.js';
	import {
		confidenceInterval,
		knownEpoch,
		ratingDate,
		type RatingEstimateInput,
	} from '#lib/ratings/ratingPresentation.js';
	import { formatWholeNumber } from '../utils/formatters';
	let {
		estimate,
		showMetadata = false,
		compact = false,
	}: {
		estimate: RatingEstimateInput;
		showMetadata?: boolean;
		compact?: boolean;
	} = $props();
	const interval = $derived(confidenceInterval(estimate));
	const cutoff = $derived(ratingDate(estimate.cutoff));
	const computed = $derived(ratingDate(estimate.computedAt));
</script>

<div class="min-w-0" class:text-right={compact}>
	<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1" class:justify-end={compact}>
		<strong class="font-mono tabular-nums text-content">{formatWholeNumber(estimate.rating)}</strong
		>
		{#if estimate.provisional}
			<span
				class="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-content-muted"
				>{m.common_rating_provisional()}</span
			>
		{/if}
	</div>
	<p class="text-xs tabular-nums text-content-muted">
		{#if interval}
			{m.common_rating_interval({
				low: formatWholeNumber(interval.low),
				high: formatWholeNumber(interval.high),
			})}
		{:else}
			{m.common_rating_interval_unknown()}
		{/if}
	</p>
	{#if showMetadata}
		<div class="mt-1 space-y-0.5 text-xs text-content-muted">
			<p>
				{knownEpoch(estimate.epoch)
					? m.common_rating_epoch({ epoch: estimate.epoch })
					: m.common_rating_epoch_unknown()}
			</p>
			<p>{cutoff ? m.common_rating_cutoff({ date: cutoff }) : m.common_rating_cutoff_unknown()}</p>
			<p>
				{computed
					? m.common_rating_computed({ date: computed })
					: m.common_rating_computed_unknown()}
			</p>
			<p>
				{estimate.algorithm === 'glicko2' || !estimate.algorithm
					? m.common_rating_glicko()
					: estimate.algorithm} · {estimate.algorithmVersion ??
					m.common_rating_algorithm_version_unknown()}
			</p>
		</div>
	{/if}
</div>

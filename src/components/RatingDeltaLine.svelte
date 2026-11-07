<script lang="ts">
	// Explain only this game's recorded rating decision. Metadata is optional for older APIs; a
	// training reference is the captured server value, never a lookup of today's bot rating.
	import { ratingDeltaDisplay, type RatingOutcome } from '#lib/live/ratingDelta.js';
	import * as m from '#lib/paraglide/messages.js';
	import { formatWholeNumber } from '../utils/formatters.js';

	interface Props {
		outcome: RatingOutcome | null;
		/** Only the visible finished-game surface announces changes when both are mounted. */
		announce?: boolean;
		/** Shared game explanations need appear only once when displaying both seats. */
		showDetails?: boolean;
	}

	let { outcome, announce = true, showDetails = true }: Props = $props();
	let details = $derived(outcome?.details);
	let reference = $derived(details?.trainingReference);
	let visible = $derived(outcome && (outcome.kind !== 'unmoved' || details != null));
</script>

{#if visible && outcome}
	<p class="text-sm font-bold tabular-nums" aria-live={announce ? 'polite' : 'off'}>
		{#if showDetails && details?.ratingDomain === 'competitive'}
			<span class="block">{m.game_rating_competitive()}</span>
		{:else if showDetails && details?.ratingDomain === 'training'}
			<span class="block">{m.game_rating_training()}</span>
		{:else if showDetails && details?.ratingDomain === 'casual'}
			<span class="block">{m.game_rating_casual()}</span>
		{/if}
		{#if outcome.kind === 'waiting'}
			<span class="animate-pulse font-normal text-content-muted italic"
				>{m.game_rating_updating()}</span
			>
		{:else if outcome.kind === 'moved'}
			{@const shown = ratingDeltaDisplay(outcome.change)}
			<span class="text-content-muted">{shown.from} → {shown.to}</span>
			<span
				class={shown.tone === 'gain'
					? 'text-success'
					: shown.tone === 'loss'
						? 'text-danger'
						: 'text-content-muted'}
			>
				({shown.label})
			</span>
		{:else if details?.outcome === 'applied' || details?.outcome === 'skipped' || details?.outcome === 'casual'}
			<span>{m.game_rating_unchanged()}</span>
		{:else}
			<span>{m.game_rating_unrecorded()}</span>
		{/if}
		{#if showDetails && outcome.kind !== 'waiting' && details}
			{#if details.ratingDomain === 'competitive'}
				<span class="block font-normal text-content-muted"
					>{m.game_rating_competitive_explanation()}</span
				>
			{:else if details.ratingDomain === 'training'}
				<span class="block font-normal text-content-muted"
					>{m.game_rating_training_explanation()}</span
				>
			{:else if details.ratingDomain === 'casual' || details.outcome === 'casual'}
				<span class="block font-normal text-content-muted"
					>{m.game_rating_casual_explanation()}</span
				>
			{/if}
			{#if details.outcome === 'applied'}
				<span class="block font-normal text-content-muted">{m.game_rating_applied()}</span>
			{:else if details.outcome === 'skipped'}
				<span class="block font-normal text-content-muted">{m.game_rating_skipped()}</span>
			{:else if details.outcome === 'legacy'}
				<span class="block font-normal text-content-muted">{m.game_rating_legacy()}</span>
			{:else if details.outcome && details.outcome !== 'casual'}
				<span class="block font-normal text-content-muted">{m.game_rating_details_unknown()}</span>
			{/if}
			{#if details.reason}
				<span class="block font-normal text-content-muted"
					>{m.game_rating_reason({ reason: details.reason })}</span
				>
			{/if}
			{#if details.ratingDomain === 'training'}
				{#if reference && (reference.source === 'anchor' || reference.source === 'bot_rating')}
					<span class="block font-normal text-content-muted">
						{reference.source === 'anchor'
							? m.game_rating_reference_anchor()
							: m.game_rating_reference_bot()}
						{m.game_rating_reference_values({
							rating: formatWholeNumber(reference.rating),
							rd: formatWholeNumber(reference.rd),
						})}
					</span>
					{#if reference.anchorSetVersion != null}
						<span class="block font-normal text-content-muted"
							>{m.game_rating_reference_version({ version: reference.anchorSetVersion })}</span
						>
					{/if}
					{#if reference.epoch != null}
						<span class="block font-normal text-content-muted"
							>{m.game_rating_reference_epoch({ epoch: reference.epoch })}</span
						>
					{/if}
				{:else}
					<span class="block font-normal text-content-muted"
						>{m.game_rating_reference_unknown()}</span
					>
				{/if}
			{/if}
		{/if}
	</p>
{/if}

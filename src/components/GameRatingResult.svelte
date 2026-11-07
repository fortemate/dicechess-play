<script lang="ts">
	// Public replay ratings come only from the game's recorded result, never current profiles.
	// Polling is bounded because a recently completed game's rating may still be waiting to apply.
	import { untrack } from 'svelte';
	import { fetchGameRatingChange, type GameRatingChange } from '#lib/live/ratingApi.js';
	import { ratingPollStep, type RatingOutcome } from '#lib/live/ratingDelta.js';
	import * as m from '#lib/paraglide/messages.js';
	import RatingDeltaLine from './RatingDeltaLine.svelte';

	interface Props {
		gameId: string;
		onDomain?: (domain: string | null | undefined) => void;
	}

	let { gameId, onDomain }: Props = $props();
	let result = $state<GameRatingChange | null>(null);
	let status = $state<'loading' | 'ready' | 'retrying' | 'unavailable' | 'delayed'>('loading');

	function seatOutcome(game: GameRatingChange, seat: 'White' | 'Black'): RatingOutcome {
		const outcome = ratingPollStep(game, seat).outcome;
		// Public history explicitly distinguishes absent historical movement from no change.
		return outcome.kind === 'unmoved' && !outcome.details ? { ...outcome, details: {} } : outcome;
	}

	$effect(() => {
		const id = gameId;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let attempts = 0;
		result = null;
		status = 'loading';
		untrack(() => onDomain?.(undefined));

		async function load() {
			attempts += 1;
			try {
				const response = await fetchGameRatingChange(id);
				if (disposed) return;
				if (!response) {
					status = 'unavailable';
					return;
				}
				result = response;
				status = 'ready';
				onDomain?.(response.ratingDomain);
				if (ratingPollStep(response, 'White').done) return;
			} catch {
				if (disposed) return;
				status = 'retrying';
			}
			if (attempts >= 36) {
				status = 'delayed';
				return;
			}
			timer = setTimeout(load, 5_000);
		}

		void load();
		return () => {
			disposed = true;
			if (timer !== undefined) clearTimeout(timer);
		};
	});
</script>

<section class="space-y-3 rounded-xl border border-border p-4" aria-live="polite">
	<h2 class="font-semibold">{m.game_rating_result_title()}</h2>
	{#if status === 'loading'}
		<p class="text-sm text-content-muted">{m.game_rating_result_loading()}</p>
	{:else if status === 'unavailable'}
		<p class="text-sm text-content-muted">{m.game_rating_result_unavailable()}</p>
	{:else if status === 'delayed'}
		<p class="text-sm text-content-muted">{m.game_rating_result_delayed()}</p>
	{:else}
		{#if status === 'retrying'}
			<p class="text-sm text-content-muted">{m.game_rating_result_retrying()}</p>
		{/if}
		{#if result}
			<div class="space-y-1">
				<h3 class="text-sm font-semibold">{m.game_rating_white()}</h3>
				<RatingDeltaLine outcome={seatOutcome(result, 'White')} announce={false} />
			</div>
			<div class="space-y-1">
				<h3 class="text-sm font-semibold">{m.game_rating_black()}</h3>
				<RatingDeltaLine
					outcome={seatOutcome(result, 'Black')}
					announce={false}
					showDetails={false}
				/>
			</div>
		{/if}
	{/if}
</section>

<script lang="ts">
	// The one line that tells a player what a finished rated game did to their rating. Rendered on
	// both finished-game surfaces (the end-of-game modal and the side-rail card), which is why it is
	// a component rather than a snippet: the two callers must never drift, and the markup is worth
	// mounting in a test of its own.
	//
	// It renders THREE states, and the pending one is load-bearing: play-api applies rating in a
	// background batch up to a minute after the game ends, so for that minute there is genuinely
	// nothing to report. Saying so is the difference between "busy" and "broken" — a silent blank
	// was read as the feature not working (#235 follow-up).
	import { ratingDeltaDisplay, type RatingOutcome } from '$lib/live/ratingDelta';

	interface Props {
		/** What the server has said so far. `null` renders nothing at all — not a rated game of
		 * mine, or the poll gave up; `unmoved` renders nothing either (see `RatingOutcome`). */
		outcome: RatingOutcome | null;
		/** Whether THIS instance is the one a screen reader should hear. Both finished-game surfaces
		 * are mounted at once while the end-of-game modal is open (the side-rail card sits underneath
		 * it as the after-dismissal fallback), so without this the same line is announced twice —
		 * three times over, since it changes from pending to settled. The caller hands the duty to
		 * whichever surface the player is actually looking at. */
		announce?: boolean;
	}

	let { outcome, announce = true }: Props = $props();
</script>

<!-- The two speaking states share ONE element, so the delta REPLACES the pending text for a screen
     reader rather than being announced as an unrelated new line. The silent states render no
     element at all: an empty <p> would still occupy a line in the modal's flex column. -->
{#if outcome?.kind === 'waiting' || outcome?.kind === 'moved'}
	<p class="text-sm font-bold tabular-nums" aria-live={announce ? 'polite' : 'off'}>
		{#if outcome.kind === 'waiting'}
			<span class="animate-pulse font-normal text-content-muted italic">Rating updating…</span>
		{:else}
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
		{/if}
	</p>
{/if}

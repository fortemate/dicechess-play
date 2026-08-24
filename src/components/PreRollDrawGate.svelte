<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// Pre-roll draw offer gate card for live games (play-api #327, this repo #253).
	// When an offer is pending for the active player before their dice roll, auto-roll is
	// suspended: the responder must either Accept (draw immediately) or Roll (declines the offer).
	// This card sits in the dice panel's slot so no modal blocks board/history navigation.

	interface Props {
		isResponder: boolean;
		offeredByName?: string | null;
		onAccept?: () => void;
		onDecline?: () => void;
	}

	let { isResponder, offeredByName, onAccept, onDecline }: Props = $props();
</script>

<div
	class="flex flex-col justify-center gap-3.5 rounded-2xl border border-primary/40 bg-surface p-4 shadow-lg md:flex-1"
	role="region"
	aria-label="Draw offer"
>
	<div class="flex items-center justify-center gap-2 text-primary">
		<span class="text-xl font-black">½–½</span>
		<h4 class="text-base font-extrabold uppercase tracking-wider text-content">Draw Offered</h4>
	</div>

	{#if isResponder}
		<p class="text-center text-xs text-content-muted">
			{offeredByName ? `${offeredByName} offered a draw.` : 'Your opponent offered a draw.'}
			Accept to end the game, or roll dice to decline.
		</p>

		<div class="flex flex-col gap-2 pt-1">
			<button
				type="button"
				onclick={onAccept}
				class="w-full cursor-pointer rounded-xl bg-primary py-3 text-sm font-bold tracking-wider text-primary-content uppercase shadow-md transition-all hover:bg-primary-hover active:scale-[0.98]"
			>
				Accept draw ½–½
			</button>
			<button
				type="button"
				onclick={onDecline}
				class="w-full cursor-pointer rounded-xl border border-border bg-surface-hover py-2.5 text-sm font-bold tracking-wider text-content uppercase shadow-sm transition-all hover:border-border-strong hover:bg-surface active:scale-[0.98]"
			>
				Roll dice (decline) 🎲
			</button>
		</div>
	{:else}
		<div class="flex items-center justify-center gap-3 py-2" aria-label="Dice withheld">
			{#each [0, 1, 2] as i (i)}
				<div class="h-14 w-14 rounded-xl border border-border opacity-30 xl:h-16 xl:w-16"></div>
			{/each}
		</div>
		<p class="text-center text-xs text-content-muted animate-pulse">
			{offeredByName
				? `${offeredByName} offered a draw — waiting for decision…`
				: 'Draw offered — waiting for decision…'}
		</p>
	{/if}
</div>

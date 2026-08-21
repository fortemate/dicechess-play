<script lang="ts">
	// The dice card on the game screen. Used dice dim — that alone communicates progress,
	// so there is deliberately no "N dice left" text. Shared by vs-bot (with a Roll
	// button) and live (dice arrive from the server; `emptyText` shows waiting states).
	import { getPieceImage } from '$lib/utils/getPieceImage';
	import type { DieState } from '$lib/playWithBot/playWithBotDice.svelte';

	interface Props {
		dice: DieState[];
		animating?: boolean;
		canRoll?: boolean;
		onRoll?: () => void;
		/** Shown instead of the placeholder slots when there are no dice (live status). */
		emptyText?: string;
	}

	let { dice, animating = false, canRoll = false, onRoll, emptyText }: Props = $props();
</script>

<div
	class="flex flex-col justify-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5 md:flex-1"
>
	{#if dice.length > 0}
		<div class="flex items-center justify-center gap-3" aria-label="Dice">
			{#each dice as d, i (i)}
				<div
					class="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-dice-surface transition-all duration-300 xl:h-16 xl:w-16
						{d.used ? 'scale-95 opacity-30 grayscale' : 'shadow-md ring-2 ring-primary/40'}
						{animating ? 'animate-[spin_0.3s_linear_infinite] opacity-80' : ''}"
				>
					<img
						src={getPieceImage(d.value)}
						alt={d.value}
						class="pointer-events-none h-10 w-10 drop-shadow-md select-none xl:h-12 xl:w-12"
					/>
				</div>
			{/each}
		</div>
	{:else}
		<div class="flex items-center justify-center gap-3" aria-label="Dice">
			{#each [0, 1, 2] as i (i)}
				<div class="h-14 w-14 rounded-xl border border-border opacity-30 xl:h-16 xl:w-16"></div>
			{/each}
		</div>
		{#if emptyText}
			<p class="text-center text-sm text-content-muted">{emptyText}</p>
		{/if}
	{/if}

	{#if canRoll && onRoll}
		<button
			type="button"
			onclick={onRoll}
			class="w-full cursor-pointer rounded-xl bg-primary py-3 text-sm font-bold tracking-widest text-primary-content uppercase shadow-lg transition-all hover:bg-primary-hover active:scale-[0.98]"
		>
			Roll
		</button>
	{/if}
</div>

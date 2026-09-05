<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getPieceImage } from '$lib/utils/getPieceImage';
	import { DICE_STAGGER_MS } from '$lib/timings';
	import type { DieState } from '$lib/playWithBot/playWithBotDice.svelte';
	import type { ShowcaseState } from './types';

	interface Props {
		state: ShowcaseState;
	}

	let { state }: Props = $props();

	const isLive = $derived(state.kind === 'live-player' || state.kind === 'live-spectator');
	const isResetting = $derived(state.kind === 'reset');

	const diceList = $derived.by<DieState[]>(() => {
		if (state.kind === 'live-player' || state.kind === 'live-spectator') {
			return state.dice ?? [];
		}
		return [];
	});

	// A roll tumbles the dice once, staggered, on top of the already-revealed values — the
	// same presentation as DicePanel on /live and /practice (shared keyframes in app.css).
	const rolling = $derived(
		(state.kind === 'live-player' || state.kind === 'live-spectator') && state.rolling === true,
	);

	const pieceNames: Record<string, string> = {
		P: 'Pawn',
		N: 'Knight',
		B: 'Bishop',
		R: 'Rook',
		Q: 'Queen',
		K: 'King',
	};

	const diceAriaLabel = $derived.by(() => {
		const dice = diceList;
		if (dice.length === 0) return undefined;
		const names = dice.map((d: DieState) => pieceNames[d.value] ?? d.value).join(', ');
		return m.home_dice_rolled({ dice: names });
	});
</script>

<!-- Dice only. On phones this is a flat row inside the rail card; ShowcaseShell puts the status
     badge (or, in live play, the resign control) at its right, and whose turn it is is said once,
     on the seat strip — so there is no caption here. On md+ it is a card of its own with the
     caption under the dice. -->
<div
	class="flex items-center gap-2 transition-colors md:h-[104px] md:flex-col md:justify-center md:gap-3 md:rounded-xl md:border md:border-border md:bg-surface md:p-3"
	aria-label={diceAriaLabel}
>
	{#if isLive && diceList.length > 0}
		<div class="flex items-center gap-2 md:gap-3">
			{#each diceList as d, i (i)}
				<div
					class="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-dice-surface transition-all duration-200 md:h-14 md:w-14
						{d.used ? 'scale-95 opacity-30 grayscale' : 'shadow-md ring-2 ring-primary/40'}
						{rolling ? 'animate-dice-tumble motion-reduce:animate-none' : ''}"
					style:animation-delay={rolling ? `${i * DICE_STAGGER_MS}ms` : undefined}
				>
					<img
						src={getPieceImage(d.value)}
						alt={d.value}
						class="pointer-events-none h-8 w-8 drop-shadow-md select-none md:h-10 md:w-10 {rolling
							? 'animate-dice-tumble-glyph motion-reduce:animate-none'
							: ''}"
						style:animation-delay={rolling ? `${i * DICE_STAGGER_MS}ms` : undefined}
					/>
				</div>
			{/each}
		</div>
	{:else}
		<div class="flex items-center gap-2 opacity-25 md:gap-3" aria-hidden="true">
			{#each [0, 1, 2] as i (i)}
				<div
					class="h-11 w-11 rounded-xl border-2 border-dashed border-border md:h-14 md:w-14"
				></div>
			{/each}
		</div>
		<span class="hidden text-xs font-semibold text-content-muted/60 md:inline">
			{isResetting ? m.home_cue_dice_clearing() : m.home_cue_dice_reserved()}
		</span>
	{/if}
</div>

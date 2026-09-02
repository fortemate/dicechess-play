<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getPieceImage } from '$lib/utils/getPieceImage';
	import type { DieState } from '$lib/playWithBot/playWithBotDice.svelte';
	import type { ShowcaseState } from './types';

	interface Props {
		state: ShowcaseState;
	}

	let { state }: Props = $props();

	const isLive = $derived(state.kind === 'live-player' || state.kind === 'live-spectator');
	const isFinishing = $derived(state.kind === 'finishing');
	const isResetting = $derived(state.kind === 'reset');

	const diceList = $derived.by<DieState[]>(() => {
		if (state.kind === 'live-player' || state.kind === 'live-spectator') {
			return state.dice ?? [];
		}
		if (state.kind === 'finishing' && state.dice) {
			return state.dice;
		}
		return [];
	});

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

	const liveTurnText = $derived.by(() => {
		if (state.kind === 'live-player') {
			return state.activeColor === state.playerColor
				? m.home_cue_your_move()
				: m.home_player_opponent_thinking();
		}
		if (state.kind === 'live-spectator') {
			return m.home_cue_spectator_turn({
				player: state.activeColor === 'w' ? 'White' : 'Black',
			});
		}
		return '';
	});
</script>

<!-- Responsive Dice Slot: mobile h-11, desktop fixed h-[104px] -->
<div
	class="flex h-11 md:h-[104px] items-center justify-between md:justify-center md:flex-col gap-2 md:gap-3 rounded-xl border border-border bg-surface px-2.5 md:p-3 transition-colors"
	aria-label={diceAriaLabel}
>
	{#if (isLive || isFinishing) && diceList.length > 0}
		<div class="flex items-center gap-2 md:gap-3">
			{#each diceList as d, i (i)}
				<div
					class="flex h-8 w-8 md:h-14 md:w-14 items-center justify-center rounded-lg md:rounded-xl border border-border bg-dice-surface transition-all duration-200
						{d.used || isFinishing
						? 'scale-95 opacity-30 grayscale'
						: 'shadow-sm md:shadow-md ring-1 md:ring-2 ring-primary/40'}"
				>
					<img
						src={getPieceImage(d.value)}
						alt={d.value}
						class="pointer-events-none h-6 w-6 md:h-10 md:w-10 drop-shadow-md select-none"
					/>
				</div>
			{/each}
		</div>
		<span class="text-[11px] font-medium text-content-muted md:hidden">
			{isLive ? liveTurnText : m.home_status_finished()}
		</span>
	{:else}
		<div class="flex items-center gap-2 md:gap-3 opacity-25" aria-hidden="true">
			{#each [0, 1, 2] as i (i)}
				<div
					class="h-8 w-8 md:h-14 md:w-14 rounded-lg md:rounded-xl border md:border-2 border-dashed border-border"
				></div>
			{/each}
		</div>
		<span class="text-[11px] md:text-xs font-semibold text-content-muted/60">
			{isResetting ? m.home_cue_dice_clearing() : m.home_cue_dice_reserved()}
		</span>
	{/if}
</div>

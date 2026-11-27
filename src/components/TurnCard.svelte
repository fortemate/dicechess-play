<script lang="ts">
	// The turn card of the game screen (#254): who is to move, one line about the dice, and the
	// dice themselves, each named. Replaces the dice panel, which showed three dice in the middle
	// of an empty card and left "whose turn is it, and what is left to play" to the visitor.
	//
	// It renders what the game stores already expose and decides nothing: `title` comes from the
	// page (it knows the players), the dice and their states come from the store. A die face is a
	// light board square, so a white and a black piece both read on it. A die that is still to be
	// used carries the highlight edge, a used one is dimmed and says so in words, because colour
	// and opacity alone must not carry the meaning. The card does not know whether a move exists
	// for a die (see `turnCard.ts`), so it never says that one can be played.
	//
	// Shared by the practice game (which may show a roll button) and the live game (dice arrive
	// from the server; `emptyText` carries its waiting states).
	import { m } from '#lib/paraglide/messages.js';
	import { getPieceImage } from '#lib/utils/getPieceImage.js';
	import { DICE_STAGGER_MS } from '#lib/timings.js';
	import { diceHint, dieLabel, dieStatus } from '#lib/turnCard.js';
	import type { DieState } from '#lib/playWithBot/playWithBotDice.svelte.js';
	import Button from './ui/Button.svelte';

	interface Props {
		/** Who is to move, in the page's words: "Your turn", "Greedy is thinking". */
		title?: string;
		/** Whether the dice are the visitor's own: theirs are counted down, others only named. */
		mine?: boolean;
		dice: DieState[];
		animating?: boolean;
		canRoll?: boolean;
		onRoll?: () => void;
		/** Shown under the empty slots when there are no dice (a live status). */
		emptyText?: string;
	}

	let {
		title,
		mine = false,
		dice,
		animating = false,
		canRoll = false,
		onRoll,
		emptyText,
	}: Props = $props();

	const rollDue = $derived(canRoll && !!onRoll);
	const hint = $derived(
		dice.length > 0 ? diceHint(dice, mine) : rollDue ? m.game_turn_hint_roll() : '',
	);

	const EDGE = {
		used: 'scale-95 border-board-dark opacity-40',
		available: 'border-badge-accent shadow-md',
		idle: 'border-board-dark',
	};
</script>

<section
	aria-label={m.game_turn_region()}
	class="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-4"
>
	{#if title || hint}
		<!-- Announced when it changes: whose turn it is must reach a visitor who cannot see it. -->
		<div class="flex flex-col gap-1" aria-live="polite">
			{#if title}
				<h2 class="m-0 text-xl leading-tight font-bold text-content">{title}</h2>
			{/if}
			{#if hint}
				<p class="m-0 text-sm text-content-muted">{hint}</p>
			{/if}
		</div>
	{/if}

	{#if dice.length > 0}
		<ul
			class="m-0 flex list-none items-start justify-center gap-3 p-0"
			aria-label={m.game_dice_region()}
		>
			{#each dice as d, i (i)}
				{@const status = dieStatus(d)}
				<li class="flex w-18 flex-col items-center gap-1.5" data-die={status}>
					<div
						class="flex h-16 w-16 items-center justify-center rounded-xl border-2 bg-dice-surface transition-all duration-300
							{EDGE[status]}
							{animating ? 'animate-dice-tumble motion-reduce:animate-none' : ''}"
						style:animation-delay={animating ? `${i * DICE_STAGGER_MS}ms` : undefined}
					>
						<img
							src={getPieceImage(d.value)}
							alt=""
							class="pointer-events-none h-12 w-12 drop-shadow-md select-none {animating
								? 'animate-dice-tumble-glyph motion-reduce:animate-none'
								: ''}"
							style:animation-delay={animating ? `${i * DICE_STAGGER_MS}ms` : undefined}
						/>
					</div>
					<span
						class="text-center text-xs leading-tight font-semibold {status === 'available'
							? 'text-content'
							: 'text-content-muted'}"
					>
						{dieLabel(d)}
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<div
			class="flex items-center justify-center gap-3"
			role="group"
			aria-label={m.game_dice_region()}
		>
			{#each [0, 1, 2] as i (i)}
				<div class="h-16 w-16 rounded-xl border-2 border-dashed border-border-strong"></div>
			{/each}
		</div>
		{#if emptyText}
			<p class="m-0 text-center text-sm text-content-muted">{emptyText}</p>
		{/if}
	{/if}

	{#if rollDue}
		<Button variant="primary" size="lg" block onclick={onRoll}>{m.game_turn_roll()}</Button>
	{/if}
</section>

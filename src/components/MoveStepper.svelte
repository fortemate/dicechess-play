<script lang="ts">
	// The four step controls of a game's history and the position they point at (#254): first,
	// previous, "12 / 40", next, last. Four pages each wrote these as 32 px icon buttons; this is
	// the one copy, 44 px and named for assistive technology.
	//
	// It only reports the index the visitor asks for. The stores decide what viewing an earlier
	// position means, and they keep it apart from the live one.
	//
	// The row is a `div` whose direct children are the buttons and the counter, on purpose: the
	// smoke test finds the counter as the `span` next to the "First move" button.
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		currentMoveIndex: number;
		maxMoveIndex: number;
		onSetMove: (index: number) => void;
		class?: string;
	}

	let { currentMoveIndex, maxMoveIndex, onSetMove, class: className = '' }: Props = $props();

	const atStart = $derived(currentMoveIndex === 0);
	const atEnd = $derived(currentMoveIndex === maxMoveIndex);

	const BUTTON =
		'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control text-content transition-colors hover:bg-surface-hover focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';
</script>

{#snippet icon(path: string)}
	<svg
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d={path} />
	</svg>
{/snippet}

<div class="flex items-center justify-center gap-1 {className}">
	<button
		type="button"
		aria-label={m.game_history_first()}
		onclick={() => onSetMove(0)}
		disabled={atStart}
		class={BUTTON}
	>
		{@render icon('M11 6l-6 6 6 6M19 6l-6 6 6 6')}
	</button>
	<button
		type="button"
		aria-label={m.game_history_previous()}
		onclick={() => onSetMove(currentMoveIndex - 1)}
		disabled={atStart}
		class={BUTTON}
	>
		{@render icon('M15 6l-6 6 6 6')}
	</button>
	<span
		class="min-w-16 px-1 text-center font-mono text-sm font-bold text-content-muted tabular-nums"
	>
		{currentMoveIndex} / {maxMoveIndex}
	</span>
	<button
		type="button"
		aria-label={m.game_history_next()}
		onclick={() => onSetMove(currentMoveIndex + 1)}
		disabled={atEnd}
		class={BUTTON}
	>
		{@render icon('M9 6l6 6-6 6')}
	</button>
	<button
		type="button"
		aria-label={m.game_history_last()}
		onclick={() => onSetMove(maxMoveIndex)}
		disabled={atEnd}
		class={BUTTON}
	>
		{@render icon('M13 6l6 6-6 6M5 6l6 6-6 6')}
	</button>
</div>

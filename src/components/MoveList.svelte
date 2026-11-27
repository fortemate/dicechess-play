<script lang="ts">
	// The move list of a game (#254): one row per turn, White's half and Black's half side by
	// side, each showing the dice that were rolled and the moves that were played with them.
	// Replaces the move history, which stacked a card per turn in a wide column.
	//
	// Every roll and every move is a button that asks the page to view that position
	// (`onSetMove`). The list never changes a position itself: the stores keep the viewed
	// position apart from the live one, and this component only reports an index.
	//
	// A turn in dice chess uses up to three dice. A half with fewer moves than dice simply lists
	// fewer moves; one with none says so in words ("no move"), or shows "…" while it is the
	// latest entry, because that turn may still be in progress.
	//
	// `steps` puts the step controls in the header, for a layout that has no room for them under
	// the board. `onclose` adds a close button on phones, where the page shows the list as a
	// sheet over the lower part of the screen.
	import { m } from '#lib/paraglide/messages.js';
	import { pieceList, pieceName } from '#lib/turnCard.js';
	import type { TurnBlock } from '#lib/types.js';
	import { getPieceImage } from '#lib/utils/getPieceImage.js';
	import MoveStepper from './MoveStepper.svelte';

	interface Props {
		historyBlocks: TurnBlock[];
		currentMoveIndex: number;
		maxMoveIndex: number;
		onSetMove: (index: number) => void;
		// Whether ← / → currently step through the history on the caller's route (the game
		// pages only allow it after the game): the hint must not advertise a dead shortcut.
		keyboardNavEnabled: boolean;
		steps?: boolean;
		onclose?: () => void;
	}

	let {
		historyBlocks,
		currentMoveIndex,
		maxMoveIndex,
		onSetMove,
		keyboardNavEnabled,
		steps = false,
		onclose,
	}: Props = $props();

	type Roll = NonNullable<TurnBlock['whiteDice']>;
	type Move = TurnBlock['whiteMoves'][number];

	const halves = (turn: TurnBlock) => [
		{ side: m.common_seat_white(), dice: turn.whiteDice, moves: turn.whiteMoves },
		{ side: m.common_seat_black(), dice: turn.blackDice, moves: turn.blackMoves },
	];

	/** The indices a turn covers, to mark the row that holds the viewed position. */
	const holdsCurrent = (turn: TurnBlock) =>
		[
			turn.whiteDice?.index,
			turn.blackDice?.index,
			...turn.whiteMoves.map((move: Move) => move.index),
			...turn.blackMoves.map((move: Move) => move.index),
			...turn.events.map((event) => event.index),
		].includes(currentMoveIndex);

	const isLatest = (roll: Roll) => roll.index === maxMoveIndex;

	// Keep the viewed position in sight: scroll only when it has left the visible part.
	let scrollContainer = $state<HTMLElement | undefined>();
	function scrollToCurrent(container: HTMLElement) {
		if (container.clientHeight === 0) return;
		const active = container.querySelector<HTMLElement>('[data-current="true"]');
		if (!active) return;
		const containerRect = container.getBoundingClientRect();
		const activeRect = active.getBoundingClientRect();
		if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
			container.scrollTop +=
				activeRect.top - containerRect.top - container.clientHeight / 2 + active.clientHeight / 2;
		}
	}
	$effect(() => {
		void currentMoveIndex;
		void historyBlocks;
		if (scrollContainer) scrollToCurrent(scrollContainer);
	});
	// The list can be in the page while it is not shown: the game frame keeps it mounted behind
	// the "Moves" button of a phone. Nothing can be scrolled into view in a box without height,
	// and showing the box changes no prop, so the effect above does not run again. Watch the box
	// itself and catch up the moment it gets a height.
	$effect(() => {
		const container = scrollContainer;
		if (!container || typeof ResizeObserver === 'undefined') return;
		let shown = container.clientHeight > 0;
		const observer = new ResizeObserver(() => {
			const nowShown = container.clientHeight > 0;
			if (nowShown && !shown) scrollToCurrent(container);
			shown = nowShown;
		});
		observer.observe(container);
		return () => observer.disconnect();
	});

	const ENTRY =
		'flex min-h-11 w-full cursor-pointer items-center gap-1.5 rounded-control px-2 text-left text-sm transition-colors focus-visible:focus-ring';
	const entryTone = (index: number) =>
		currentMoveIndex === index
			? 'bg-primary font-bold text-primary-content'
			: 'text-content hover:bg-surface-hover';
</script>

<section
	aria-label={m.game_moves_title()}
	class="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-surface max-md:rounded-b-none max-md:shadow-2xl"
>
	<header class="flex flex-col gap-1 border-b border-border px-4 pt-3 pb-2">
		<div class="flex items-center justify-between gap-2">
			<h2 class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase">
				{m.game_moves_title()}
			</h2>
			<span class="font-mono text-xs font-bold text-content-muted tabular-nums">
				{m.game_moves_position({ current: currentMoveIndex, max: maxMoveIndex })}
			</span>
			{#if onclose}
				<button
					type="button"
					aria-label={m.game_moves_close()}
					onclick={onclose}
					class="-mr-2 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control text-content transition-colors hover:bg-surface-hover focus-visible:focus-ring md:hidden"
				>
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			{/if}
		</div>
		{#if keyboardNavEnabled}
			<p class="m-0 text-xs text-content-muted">{m.game_moves_keyboard_hint()}</p>
		{/if}
		{#if steps}
			<MoveStepper {currentMoveIndex} {maxMoveIndex} {onSetMove} />
		{/if}
	</header>

	<div bind:this={scrollContainer} class="move-list-scroll min-h-0 flex-1 overflow-y-auto">
		{#if historyBlocks.length === 0}
			<p class="m-0 px-4 py-4 text-sm text-content-muted">{m.game_moves_empty()}</p>
		{:else}
			<ol class="m-0 list-none p-0">
				{#each historyBlocks as turn (turn.turnNumber)}
					<li
						class="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-1 border-b border-border px-2 py-1.5 last:border-b-0
							{holdsCurrent(turn) ? 'bg-surface-hover' : ''}"
					>
						<span
							class="flex min-h-11 items-center justify-center text-sm text-content-muted tabular-nums"
						>
							{turn.turnNumber}
						</span>
						{#each halves(turn) as half (half.side)}
							<div class="flex min-w-0 flex-col">
								{#if half.dice}
									<button
										type="button"
										data-current={currentMoveIndex === half.dice.index}
										aria-label={m.game_moves_rolled({
											turn: turn.turnNumber,
											side: half.side,
											pieces: pieceList(half.dice.diceChars),
										})}
										onclick={() => onSetMove(half.dice!.index)}
										class="{ENTRY} {entryTone(half.dice.index)}"
									>
										{#each half.dice.diceChars as char, i (i)}
											<img
												src={getPieceImage(char)}
												alt=""
												class="pointer-events-none h-5 w-5 rounded bg-dice-surface"
											/>
										{/each}
									</button>
									{#if half.moves.length === 0}
										<span class="flex min-h-11 items-center px-2 text-sm text-content-muted">
											{isLatest(half.dice) ? m.game_moves_in_progress() : m.game_moves_no_move()}
										</span>
									{/if}
								{/if}
								{#each half.moves as move (move.index)}
									<button
										type="button"
										data-current={currentMoveIndex === move.index}
										onclick={() => onSetMove(move.index)}
										class="{ENTRY} font-mono {entryTone(move.index)}"
									>
										{#if move.pieceChar}
											<img
												src={getPieceImage(move.pieceChar)}
												alt={pieceName(move.pieceChar)}
												class="pointer-events-none h-4 w-4 shrink-0"
											/>
										{:else}
											<span aria-hidden="true" class="w-4 shrink-0 text-center"
												>{move.pieceIcon}</span
											>
										{/if}
										<span class="truncate">{move.text}</span>
									</button>
								{/each}
							</div>
						{/each}
						{#each turn.events as event (event.index)}
							<button
								type="button"
								data-current={currentMoveIndex === event.index}
								onclick={() => onSetMove(event.index)}
								class="{ENTRY} col-span-2 col-start-2 {currentMoveIndex === event.index
									? 'bg-primary font-bold text-primary-content'
									: 'text-content-muted hover:bg-surface-hover'}"
							>
								{event.text}
							</button>
						{/each}
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</section>

<style>
	.move-list-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.move-list-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.move-list-scroll::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 9999px;
	}
	.move-list-scroll::-webkit-scrollbar-thumb:hover {
		background: var(--color-border-strong);
	}
</style>

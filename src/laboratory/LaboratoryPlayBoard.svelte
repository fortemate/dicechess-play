<script lang="ts">
	/** Keyboard/touch presentation of the accepted legal tree; no chess rules are inferred here. */
	import { tick } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import { boardGrid } from '#lib/live/boardGrid.js';
	import { getPieceImage } from '#lib/utils/getPieceImage.js';
	import type { Seat } from '#lib/live/liveTypes.js';
	let {
		dfen,
		seat,
		moves,
		disabled = false,
		onmove,
	}: {
		dfen: string;
		seat: Seat;
		moves: string[];
		disabled?: boolean;
		onmove: (uci: string) => void;
	} = $props();
	let source = $state<string | null>(null);
	let promotions = $state<string[]>([]);
	let focusIndex = $state(0);
	let grid = $state<HTMLDivElement>();
	let promotionPanel = $state<HTMLFieldSetElement>();
	let previousBoard: { dfen: string; disabled: boolean; seat: Seat } | undefined;
	const pieces: Record<string, string> = {
		p: m.lab_game_pawn(),
		n: m.lab_game_knight(),
		b: m.lab_game_bishop(),
		r: m.lab_game_rook(),
		q: m.lab_game_queen(),
		k: m.lab_game_king(),
	};
	const cells = $derived(seat === 'White' ? boardGrid(dfen) : boardGrid(dfen).reverse());
	const destinations = $derived(
		source ? moves.filter((move) => move.startsWith(source!)).map((move) => move.slice(2, 4)) : [],
	);
	$effect(() => {
		// Polls replace the parent's state object even when the board is unchanged. Reset input only
		// for an actual position, permission or orientation change, including reconnects.
		const next = { dfen, disabled, seat };
		if (
			previousBoard?.dfen === dfen &&
			previousBoard.disabled === disabled &&
			previousBoard.seat === seat
		)
			return;
		previousBoard = next;
		source = null;
		promotions = [];
	});
	function square(index: number): string {
		return `${'abcdefgh'[seat === 'White' ? index % 8 : 7 - (index % 8)]}${seat === 'White' ? 8 - Math.floor(index / 8) : 1 + Math.floor(index / 8)}`;
	}
	function label(index: number): string {
		const piece = cells[index];
		const name = piece
			? m.lab_game_square_piece({
					color: piece === piece.toUpperCase() ? m.laboratory_white() : m.laboratory_black(),
					piece: pieces[piece.toLowerCase()],
				})
			: m.lab_game_empty();
		return destinations.includes(square(index))
			? m.lab_game_destination({ square: square(index), piece: name })
			: m.lab_game_square({ square: square(index), piece: name });
	}
	async function select(index: number) {
		if (disabled || promotions.length) return;
		const target = square(index);
		const candidates = source ? moves.filter((move) => move.startsWith(source + target)) : [];
		if (candidates.length === 1) {
			source = null;
			onmove(candidates[0]);
		} else if (candidates.length > 1) {
			promotions = candidates;
			await tick();
			promotionPanel?.querySelector('button')?.focus();
		} else source = moves.some((move) => move.startsWith(target)) ? target : null;
	}
	function key(event: KeyboardEvent, index: number) {
		const offsets: Record<string, number> = {
			ArrowLeft: -1,
			ArrowRight: 1,
			ArrowUp: -8,
			ArrowDown: 8,
			Home: -(index % 8),
			End: 7 - (index % 8),
		};
		if (event.key === 'Escape') {
			source = null;
			promotions = [];
			return;
		}
		if (!(event.key in offsets)) return;
		event.preventDefault();
		const rowStart = Math.floor(index / 8) * 8;
		focusIndex =
			event.key === 'ArrowLeft' || event.key === 'ArrowRight'
				? Math.max(rowStart, Math.min(rowStart + 7, index + offsets[event.key]))
				: Math.max(0, Math.min(63, index + offsets[event.key]));
		grid?.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')[focusIndex]?.focus();
	}
	export function focusBoard() {
		if (moves.length && !moves.some((move) => move.startsWith(square(focusIndex)))) {
			focusIndex = cells.findIndex((_, index) => square(index) === moves[0].slice(0, 2));
		}
		grid?.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')[focusIndex]?.focus();
	}
</script>

<div class="lab-play-board-wrap">
	<p class="lab-sr" id="lab-board-help">
		{m.lab_game_board_help()}
	</p>
	<div
		class="lab-board lab-play-board"
		role="grid"
		aria-label={m.lab_game_board_label({
			color: seat === 'White' ? m.laboratory_white() : m.laboratory_black(),
		})}
		aria-describedby="lab-board-help"
		aria-disabled={disabled}
		bind:this={grid}
	>
		{#each Array(8) as _, row (row)}
			<div role="row" class="lab-board-row">
				{#each cells.slice(row * 8, row * 8 + 8) as piece, column (column)}
					{@const index = row * 8 + column}
					<button
						type="button"
						role="gridcell"
						class="lab-square"
						class:lab-dark-square={(row + column) % 2 === 1}
						class:lab-square-selected={source === square(index)}
						class:lab-square-destination={destinations.includes(square(index))}
						aria-label={label(index)}
						aria-selected={source === square(index)}
						aria-disabled={disabled}
						tabindex={focusIndex === index ? 0 : -1}
						onfocus={() => (focusIndex = index)}
						onclick={() => select(index)}
						onkeydown={(event) => key(event, index)}
					>
						{#if piece}<img src={getPieceImage(piece)} alt="" draggable="false" />{/if}
						{#if column === 0}<span class="lab-rank" aria-hidden="true">{square(index)[1]}</span
							>{/if}
						{#if row === 7}<span class="lab-file" aria-hidden="true">{square(index)[0]}</span>{/if}
					</button>
				{/each}
			</div>
		{/each}
	</div>
	{#if promotions.length}
		<fieldset class="lab-promotion" bind:this={promotionPanel}>
			<legend>{m.lab_game_choose_promotion()}</legend>
			{#each promotions as move (move)}<button
					class="lab-secondary"
					type="button"
					onclick={async () => {
						promotions = [];
						source = null;
						onmove(move);
						await tick();
						focusBoard();
					}}>{pieces[move[4]]}</button
				>{/each}
			<button
				class="lab-text-button"
				type="button"
				onclick={() => {
					promotions = [];
					focusBoard();
				}}>{m.lab_game_cancel()}</button
			>
		</fieldset>
	{/if}
</div>

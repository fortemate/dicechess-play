<script lang="ts">
	// Read-only entrance preview: reuses the site's piece assets and board expansion, never move rules.
	import { boardGrid } from '#lib/live/boardGrid.js';
	import { getPieceImage } from '#lib/utils/getPieceImage.js';
	import * as m from '#lib/paraglide/messages.js';
	import type { Seat } from '#lib/live/liveTypes.js';
	let { dfen, seat }: { dfen: string; seat: Seat } = $props();
	const cells = $derived(seat === 'White' ? boardGrid(dfen) : boardGrid(dfen).reverse());
</script>

<div
	class="lab-board"
	role="img"
	aria-label={seat === 'White' ? m.laboratory_board_white() : m.laboratory_board_black()}
>
	{#each cells as piece, index (index)}
		<div class="lab-square" class:lab-dark-square={(Math.floor(index / 8) + index) % 2 === 1}>
			{#if piece}<img src={getPieceImage(piece)} alt="" draggable="false" />{/if}
			{#if index % 8 === 0}<span class="lab-rank" aria-hidden="true"
					>{seat === 'White' ? 8 - Math.floor(index / 8) : Math.floor(index / 8) + 1}</span
				>{/if}
			{#if index >= 56}<span class="lab-file" aria-hidden="true"
					>{'abcdefgh'[seat === 'White' ? index % 8 : 7 - (index % 8)]}</span
				>{/if}
		</div>
	{/each}
</div>

<script lang="ts">
	// A static, dependency-free board preview for lobby tiles: the same cburnett piece SVGs
	// as the interactive board, laid out on a plain CSS grid re-rendered on each poll.
	// Interactive boards stay chessground's job (see Board.svelte).
	import { boardGrid } from '$lib/live/boardGrid';
	import { getPieceImage } from '$lib/utils/getPieceImage';

	let { fen, faded = false }: { fen: string | undefined; faded?: boolean } = $props();

	const cells = $derived(boardGrid(fen));
</script>

<div class="mini-board" class:faded aria-hidden="true">
	{#each cells as piece, i (i)}
		<span
			class="flex aspect-square items-center justify-center
				{(Math.floor(i / 8) + i) % 2 === 0 ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'}"
		>
			{#if piece}
				<img class="h-full w-full" src={getPieceImage(piece)} alt="" draggable="false" />
			{/if}
		</span>
	{/each}
</div>

<style>
	.mini-board {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		width: 100%;
		aspect-ratio: 1;
		border-radius: 6px;
		overflow: hidden;
		user-select: none;
	}
	.faded {
		opacity: 0.35;
	}
</style>

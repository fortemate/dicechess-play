<script lang="ts">
	// Thin, store-driven board for the play site. Wraps the low-level Chessground component and binds
	// it to a BoardStore (fen / legal dests / move callback). The store is a prop, so the same board
	// serves both vs-bot (playWithBotStore) and live human-vs-human (liveGameStore).
	import Chessground from './lib/Chessground.svelte';
	import '@lichess-org/chessground/assets/chessground.base.css';
	import '@lichess-org/chessground/assets/chessground.brown.css';
	import '@lichess-org/chessground/assets/chessground.cburnett.css';
	import type { Key } from '@lichess-org/chessground/types';
	import type { BoardStore } from '$lib/boardStore';

	let { store }: { store: BoardStore } = $props();

	const toCg = (c: 'w' | 'b'): 'white' | 'black' => (c === 'w' ? 'white' : 'black');

	const canMove = $derived(
		store.gameStatus === 'playing' &&
			store.activeColor === store.playerColor &&
			!store.isViewingHistory,
	);
</script>

<div class="relative w-full h-full mx-auto">
	<Chessground
		class="rounded-xl overflow-hidden shadow-lg"
		fen={store.currentBoardFen}
		orientation={toCg(store.playerColor)}
		turnColor={toCg(store.activeColor)}
		lastMove={store.lastMove}
		movable={{
			free: false,
			color: canMove ? toCg(store.playerColor) : undefined,
			dests: store.legalMovesDests as Map<Key, Key[]>,
			showDests: true,
			events: {
				after: (orig: Key, dest: Key) => store.handleBoardMove(orig as string, dest as string),
			},
		}}
	/>
</div>

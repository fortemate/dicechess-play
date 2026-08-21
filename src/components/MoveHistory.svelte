<script lang="ts">
	import type { TurnBlock } from '$lib/types';
	import { getPieceImage } from '$lib/utils/getPieceImage';

	interface Props {
		historyBlocks: TurnBlock[];
		currentMoveIndex: number;
		maxMoveIndex: number;
		onSetMove: (index: number) => void;
		// Whether ← / → currently scrub history on the caller's route (both routes gate
		// keyboard nav post-game/spectator) — the hint below must not advertise a dead shortcut.
		keyboardNavEnabled: boolean;
	}

	let { historyBlocks, currentMoveIndex, maxMoveIndex, onSetMove, keyboardNavEnabled }: Props =
		$props();

	let scrollContainer = $state<HTMLElement | undefined>();
	$effect(() => {
		void currentMoveIndex;
		void historyBlocks;
		const container = scrollContainer;
		if (!container || container.clientHeight === 0) return;
		const active = container.querySelector<HTMLElement>('[data-current="true"]');
		if (active) {
			const containerRect = container.getBoundingClientRect();
			const activeRect = active.getBoundingClientRect();
			if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
				container.scrollTop +=
					activeRect.top - containerRect.top - container.clientHeight / 2 + active.clientHeight / 2;
			}
		}
	});
</script>

<div
	class="h-full flex flex-col gap-3 rounded-2xl bg-surface border border-border p-4 shadow-2xl relative overflow-hidden"
>
	<div class="flex flex-col gap-1 z-10 pb-2 border-b border-border">
		<h3 class="text-content font-extrabold uppercase tracking-[0.2em] text-sm">Game History</h3>
		{#if keyboardNavEnabled}
			<p class="text-xs text-content-muted font-mono">Use ← / → arrows to navigate</p>
		{/if}
		<div class="text-xs font-mono font-bold text-primary mt-1">
			Move {currentMoveIndex} of {maxMoveIndex}
		</div>
	</div>

	<div
		bind:this={scrollContainer}
		class="flex-1 overflow-y-auto pr-2 custom-scrollbar z-10 flex flex-col gap-3 pb-6"
	>
		{#if historyBlocks.length === 0}
			<div class="text-center text-content-muted text-sm mt-8 italic font-mono">
				Awaiting game data...
			</div>
		{:else}
			{#each historyBlocks as turn (turn.turnNumber)}
				<div
					class="shrink-0 bg-surface-hover border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition"
				>
					<div class="bg-surface px-3 py-1 border-b border-border">
						<span class="text-[10px] font-black uppercase text-primary tracking-widest">
							Turn {turn.turnNumber}
						</span>
					</div>

					<div class="p-2 flex gap-2">
						<!-- White Column -->
						<div class="flex-1 flex flex-col gap-1 border-r border-border pr-2">
							{#if turn.whiteDice}
								<button
									type="button"
									data-current={currentMoveIndex === turn.whiteDice.index}
									onclick={() => onSetMove(turn.whiteDice!.index)}
									class="w-full px-2 py-1 rounded border border-border hover:bg-border transition shadow-inner flex justify-center items-center gap-1 {currentMoveIndex ===
									turn.whiteDice.index
										? 'bg-primary/20 ring-1 ring-primary shadow-md'
										: 'bg-dice-surface'}"
								>
									{#each turn.whiteDice.diceChars as char, i (i)}
										<img
											src={getPieceImage(char)}
											alt={char}
											class="w-[18px] h-[18px] pointer-events-none drop-shadow-md"
										/>
									{/each}
								</button>
							{/if}
							{#each turn.whiteMoves as m (m.index)}
								<button
									type="button"
									data-current={currentMoveIndex === m.index}
									onclick={() => onSetMove(m.index)}
									class="w-full bg-surface px-2 py-1 rounded border border-border flex items-center gap-2 hover:bg-border-strong transition font-mono text-xs {currentMoveIndex ===
									m.index
										? 'bg-primary/20 border-primary text-primary'
										: 'text-content'}"
								>
									<div class="w-4 flex justify-center opacity-80 shrink-0">
										{#if m.pieceChar}
											<img
												src={getPieceImage(m.pieceChar)}
												alt={m.pieceChar}
												class="w-4 h-4 pointer-events-none drop-shadow-sm"
											/>
										{:else}
											<span class="text-[14px]">{m.pieceIcon}</span>
										{/if}
									</div>
									<span>{m.text}</span>
								</button>
							{/each}
						</div>

						<!-- Black Column -->
						<div class="flex-1 flex flex-col gap-1 pl-2">
							{#if turn.blackDice}
								<button
									type="button"
									data-current={currentMoveIndex === turn.blackDice.index}
									onclick={() => onSetMove(turn.blackDice!.index)}
									class="w-full px-2 py-1 rounded border border-border hover:bg-border transition shadow-inner flex justify-center items-center gap-1 {currentMoveIndex ===
									turn.blackDice.index
										? 'bg-primary/20 ring-1 ring-primary shadow-md'
										: 'bg-dice-surface'}"
								>
									{#each turn.blackDice.diceChars as char, i (i)}
										<img
											src={getPieceImage(char)}
											alt={char}
											class="w-[18px] h-[18px] pointer-events-none drop-shadow-md"
										/>
									{/each}
								</button>
							{/if}
							{#each turn.blackMoves as m (m.index)}
								<button
									type="button"
									data-current={currentMoveIndex === m.index}
									onclick={() => onSetMove(m.index)}
									class="w-full bg-surface px-2 py-1 rounded border border-border flex items-center gap-2 hover:bg-border-strong transition font-mono text-xs {currentMoveIndex ===
									m.index
										? 'bg-primary/20 border-primary text-primary'
										: 'text-content'}"
								>
									<div class="w-4 flex justify-center opacity-80 shrink-0">
										{#if m.pieceChar}
											<img
												src={getPieceImage(m.pieceChar)}
												alt={m.pieceChar}
												class="w-4 h-4 pointer-events-none drop-shadow-sm"
											/>
										{:else}
											<span class="text-[14px]">{m.pieceIcon}</span>
										{/if}
									</div>
									<span>{m.text}</span>
								</button>
							{/each}
						</div>
					</div>

					{#if turn.events.length > 0}
						<div class="px-2 pb-2 flex flex-col gap-1">
							{#each turn.events as evt (evt.index)}
								<button
									type="button"
									data-current={currentMoveIndex === evt.index}
									onclick={() => onSetMove(evt.index)}
									class="w-full bg-surface px-2 py-1 rounded border border-border font-mono text-xs text-left hover:bg-border transition {currentMoveIndex ===
									evt.index
										? 'bg-primary/20 border-primary text-primary'
										: 'text-content-muted'}"
								>
									{evt.text}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 9999px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: var(--color-border-strong);
	}
</style>

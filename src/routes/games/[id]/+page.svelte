<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getLocalGame, type LocalGameRecord } from '$lib/localGamesDB';
	import { reconstructHistoryMap } from '$lib/history/reconstructHistory';
	import { buildTurnBlocks } from '$lib/playWithBot/turnBlocks';
	import { botLabel } from '$lib/bots';
	import { playerOutcome, outcomeLabel, endReasonLabel, type GameOutcome } from '$lib/gameOutcome';
	import { formatDate } from '../../../utils/formatters';
	import MoveHistory from '../../../components/MoveHistory.svelte';
	import Chessground from '../../../components/lib/Chessground.svelte';
	import type { Key } from '@lichess-org/chessground/types';
	import '@lichess-org/chessground/assets/chessground.base.css';
	import '@lichess-org/chessground/assets/chessground.brown.css';
	import '@lichess-org/chessground/assets/chessground.cburnett.css';

	let loading = $state(true);
	let record = $state<LocalGameRecord | null>(null);
	let currentMoveIndex = $state(0);

	// Re-fetch when the id changes: SvelteKit reuses this component instance when
	// navigating between two /games/[id] pages, so onMount would leave stale data.
	$effect(() => {
		const id = page.params.id;
		if (!id) {
			record = null;
			loading = false;
			currentMoveIndex = 0;
			return;
		}

		let active = true;
		loading = true;
		getLocalGame(id).then((rec) => {
			if (!active) return;
			record = rec ?? null;
			loading = false;
			currentMoveIndex = 0;
		});

		return () => {
			active = false;
		};
	});

	const reconstructed = $derived(record ? reconstructHistoryMap(record.moves_history ?? []) : null);
	const historyMap = $derived(reconstructed?.historyMap ?? {});
	const maxMoveIndex = $derived(reconstructed?.maxMoveIndex ?? 0);
	const historyBlocks = $derived(buildTurnBlocks(historyMap, maxMoveIndex));

	const currentState = $derived(historyMap[String(currentMoveIndex)] ?? null);
	const currentFen = $derived(currentState?.fen ?? '');
	const lastMove = $derived(
		currentState?.gameMoveHistoryMove?.from
			? ([currentState.gameMoveHistoryMove.from, currentState.gameMoveHistoryMove.to] as Key[])
			: undefined,
	);

	const orientation = $derived<'white' | 'black'>(
		record?.player_color === 'BLACK' ? 'black' : 'white',
	);
	const opponent = $derived(record ? botLabel(record.bot_id) : '');
	const playedColor = $derived(record?.player_color === 'BLACK' ? 'Black' : 'White');
	const outcome = $derived<GameOutcome | null>(
		record ? playerOutcome(record.result, record.player_color) : null,
	);
	const endReason = $derived(record ? endReasonLabel(record.end_reason) : '');
	const hasReplay = $derived(maxMoveIndex > 0);

	const outcomeClass: Record<GameOutcome, string> = {
		win: 'bg-primary/15 text-primary border-primary/30',
		loss: 'bg-danger/15 text-danger border-danger/30',
		draw: 'bg-surface text-content-muted border-border',
	};

	function setMove(index: number) {
		currentMoveIndex = Math.max(0, Math.min(index, maxMoveIndex));
	}

	function onKeydown(event: KeyboardEvent) {
		// Don't hijack arrow/Home/End keys while the user is in a form control
		// (e.g. the theme <select> in the header).
		const el = document.activeElement;
		if (
			el &&
			(el.tagName === 'INPUT' ||
				el.tagName === 'TEXTAREA' ||
				el.tagName === 'SELECT' ||
				el.hasAttribute('contenteditable'))
		) {
			return;
		}

		switch (event.key) {
			case 'ArrowLeft':
				setMove(currentMoveIndex - 1);
				event.preventDefault();
				break;
			case 'ArrowRight':
				setMove(currentMoveIndex + 1);
				event.preventDefault();
				break;
			case 'Home':
				setMove(0);
				event.preventDefault();
				break;
			case 'End':
				setMove(maxMoveIndex);
				event.preventDefault();
				break;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<section class="flex flex-col gap-6">
	<a
		href={resolve('/games')}
		class="text-sm text-content-muted hover:text-content transition-colors w-fit"
	>
		← Back to games
	</a>

	{#if loading}
		<div class="h-[480px] rounded-2xl bg-surface/40 border border-border animate-pulse"></div>
	{:else if !record}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<p class="text-content-muted">That game isn't on this device.</p>
			<a
				href={resolve('/games')}
				class="px-6 py-3 rounded-xl bg-primary text-primary-content font-bold shadow-lg shadow-primary/30 hover:bg-primary-hover transition-colors"
			>
				Back to your games
			</a>
		</div>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-col gap-1 min-w-0">
				<div class="flex items-center gap-2">
					<span class="text-[11px] font-black uppercase tracking-widest text-content-muted/60"
						>vs</span
					>
					<h2 class="text-xl font-bold text-content truncate">{opponent}</h2>
				</div>
				<span class="text-xs text-content-muted">
					You played {playedColor} · {formatDate(record.start_time)}{endReason
						? ` · ${endReason}`
						: ''}
				</span>
			</div>
			{#if outcome}
				<span
					class="shrink-0 px-3 py-1 rounded-lg text-sm font-black uppercase tracking-wider border {outcomeClass[
						outcome
					]}"
				>
					{outcomeLabel(outcome)}
				</span>
			{/if}
		</div>

		{#if !hasReplay}
			<div
				class="rounded-2xl border border-border bg-surface/40 p-6 text-center text-content-muted"
			>
				No moves were recorded for this game.
			</div>
		{:else}
			<div class="flex flex-col lg:flex-row gap-6 items-center lg:items-start justify-center">
				<div class="flex-1 w-full max-w-[480px] flex flex-col gap-4 items-center">
					<div class="relative w-full max-w-[480px] mx-auto aspect-square">
						<Chessground
							class="rounded-xl overflow-hidden shadow-lg"
							fen={currentFen}
							{orientation}
							{lastMove}
							viewOnly={true}
						/>
					</div>

					<div class="flex items-center justify-center gap-2 w-full">
						<button
							type="button"
							aria-label="First move"
							onclick={() => setMove(0)}
							disabled={currentMoveIndex === 0}
							class="px-3 py-2 rounded-lg bg-surface border border-border text-content font-bold hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						>
							⏮
						</button>
						<button
							type="button"
							aria-label="Previous move"
							onclick={() => setMove(currentMoveIndex - 1)}
							disabled={currentMoveIndex === 0}
							class="px-3 py-2 rounded-lg bg-surface border border-border text-content font-bold hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						>
							◀
						</button>
						<span class="px-2 text-xs font-mono font-bold text-content-muted tabular-nums">
							{currentMoveIndex} / {maxMoveIndex}
						</span>
						<button
							type="button"
							aria-label="Next move"
							onclick={() => setMove(currentMoveIndex + 1)}
							disabled={currentMoveIndex === maxMoveIndex}
							class="px-3 py-2 rounded-lg bg-surface border border-border text-content font-bold hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						>
							▶
						</button>
						<button
							type="button"
							aria-label="Last move"
							onclick={() => setMove(maxMoveIndex)}
							disabled={currentMoveIndex === maxMoveIndex}
							class="px-3 py-2 rounded-lg bg-surface border border-border text-content font-bold hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						>
							⏭
						</button>
					</div>
				</div>

				<aside class="w-full lg:w-72 shrink-0 h-[420px] lg:h-[540px]">
					<MoveHistory
						{historyBlocks}
						{currentMoveIndex}
						{maxMoveIndex}
						onSetMove={(i) => setMove(i)}
						keyboardNavEnabled={true}
					/>
				</aside>
			</div>
		{/if}
	{/if}
</section>

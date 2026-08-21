<script lang="ts">
	import { resolve } from '$app/paths';
	import type { LocalGameRecord } from '$lib/localGamesDB';
	import { botLabel } from '$lib/bots';
	import { playerOutcome, outcomeLabel, endReasonLabel, type GameOutcome } from '$lib/gameOutcome';
	import { formatDate } from '../utils/formatters';
	import BotBadge from './BotBadge.svelte';
	import MiniBoard from './MiniBoard.svelte';

	const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

	interface Props {
		game: LocalGameRecord;
	}

	let { game }: Props = $props();

	const opponent = $derived(botLabel(game.bot_id));
	// Final position for the thumbnail: the last turn's end position, falling back to the first
	// turn's start (or the opening) for a 0-turn record so the preview is never a blank board.
	const finalFen = $derived(
		game.moves_history?.at(-1)?.end_dfen ?? game.moves_history?.[0]?.start_dfen ?? START_FEN,
	);
	const outcome = $derived(playerOutcome(game.result, game.player_color));
	const playedColor = $derived(game.player_color === 'WHITE' ? 'White' : 'Black');
	const turns = $derived(game.moves_history?.length ?? 0);
	const endReason = $derived(endReasonLabel(game.end_reason));

	const outcomeClass: Record<GameOutcome, string> = {
		win: 'bg-primary/15 text-primary border-primary/30',
		loss: 'bg-danger/15 text-danger border-danger/30',
		draw: 'bg-surface text-content-muted border-border',
	};
</script>

<a
	href={resolve('/games/[id]', { id: game.id })}
	class="group bg-surface/60 hover:bg-surface-hover/80 border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-row gap-4 transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
>
	<div class="w-24 shrink-0 self-center">
		<MiniBoard fen={finalFen} />
	</div>

	<div class="flex flex-1 flex-col gap-4 min-w-0">
		<div class="flex justify-between items-center gap-2">
			{#if game.mode === 'x2'}
				<span
					class="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-badge-accent/10 text-badge-accent border border-badge-accent/20"
				>
					x2
				</span>
			{:else}
				<span
					class="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-primary/10 text-primary border border-primary/20"
				>
					Classic
				</span>
			{/if}
			<span class="text-xs text-content-muted font-medium text-right">
				{formatDate(game.start_time)}
			</span>
		</div>

		<div class="flex items-center justify-between gap-3">
			<div class="flex flex-col gap-0.5 min-w-0">
				<span class="text-[11px] font-black uppercase tracking-widest text-content-muted/60"
					>vs</span
				>
				<span class="flex min-w-0 items-center gap-1.5">
					<span class="font-bold text-content text-lg truncate" title={opponent}>{opponent}</span>
					<BotBadge />
				</span>
				<span class="text-xs text-content-muted">You played {playedColor}</span>
			</div>
			<span
				class="shrink-0 px-3 py-1 rounded-lg text-sm font-black uppercase tracking-wider border {outcomeClass[
					outcome
				]}"
			>
				{outcomeLabel(outcome)}
			</span>
		</div>

		<div
			class="mt-auto flex justify-between items-center pt-3 border-t border-border-strong/40 text-xs font-semibold text-content-muted"
		>
			<span>Turns: {turns}{endReason ? ` · ${endReason}` : ''}</span>
			{#if game.sync_status !== 'synced'}
				<span
					class="flex items-center gap-1.5"
					title={game.sync_status === 'pending'
						? 'Not yet recorded to analytics'
						: 'Recording was rejected'}
				>
					<span
						class="w-1.5 h-1.5 rounded-full {game.sync_status === 'pending'
							? 'bg-badge-accent'
							: 'bg-danger'}"
					></span>
					{game.sync_status === 'pending' ? 'Saving…' : 'Local only'}
				</span>
			{/if}
		</div>
	</div>
</a>

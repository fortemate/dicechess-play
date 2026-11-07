<script lang="ts">
	// Scheduling, uncertainty and historical state are separate; onLadder never freezes a rating.
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { authStore } from '#lib/authStore.svelte.js';
	import type { LeaderRow } from '#lib/leaderboard/leaderboardApi.js';
	import { orderingScore } from '#lib/ratings/ratingPresentation.js';
	import { winRate } from '#lib/stats/playerRecord.js';
	import { formatWholeNumber } from '../utils/formatters';
	import BotBadge from './BotBadge.svelte';
	import RatingEstimate from './RatingEstimate.svelte';
	let { row, historical = false }: { row: LeaderRow; historical?: boolean } = $props();
	const isPlayer = $derived(row.kind === 'player');
	const isMe = $derived(
		!historical && isPlayer && authStore.nickname !== null && row.name === authStore.nickname,
	);
	const score = $derived(orderingScore(row));
</script>

<tr class="border-b border-border/50 last:border-b-0 {isMe ? 'bg-primary/10' : ''}">
	<td class="px-2 py-3 text-right font-mono font-bold tabular-nums text-content-muted sm:px-4"
		>{row.rank}</td
	>
	<td class="px-2 py-3 sm:px-4">
		<div class="flex min-w-0 flex-wrap items-center gap-1.5">
			{#if isPlayer}
				<a
					href={resolve('/players/[nickname]', { nickname: row.name })}
					class="font-semibold text-content hover:text-primary hover:underline">{row.name}</a
				>
			{:else}
				<a
					href={resolve('/bots/[team]/[name]', { team: row.team ?? '', name: row.name })}
					class="font-semibold text-content hover:text-primary hover:underline"
					>{row.team} {row.name}</a
				>
				<BotBadge />
			{/if}
			{#if isMe}<span class="rounded bg-primary/20 px-1 text-[10px] font-bold text-primary"
					>{m.common_rating_you()}</span
				>{/if}
		</div>
		{#if historical}<p class="mt-1 text-[10px] text-content-muted">
				{m.common_rating_historical()}
			</p>{/if}
		{#if !isPlayer && !row.onLadder}<p
				class="mt-1 text-[10px] text-content-muted"
				title={m.common_rating_scheduling_help()}
			>
				{m.common_rating_scheduling_off()}
			</p>{/if}
	</td>
	<td class="px-2 py-3 sm:px-4"><RatingEstimate estimate={row} compact /></td>
	<td class="px-2 py-3 text-right font-mono tabular-nums text-content sm:px-4"
		>{score === null ? m.common_rating_score_unknown() : formatWholeNumber(score)}</td
	>
	<td class="hidden px-4 py-3 text-right font-mono tabular-nums text-content-muted sm:table-cell"
		>{row.games}</td
	>
	<td
		class="hidden px-4 py-3 text-right font-mono text-xs tabular-nums text-content-muted md:table-cell"
		><span class="text-primary">{row.wins}</span> · {row.draws} ·
		<span class="text-danger">{row.losses}</span></td
	>
	<td
		class="hidden px-4 py-3 text-right font-mono font-bold tabular-nums text-content sm:table-cell"
		>{Math.round(winRate(row) * 100)}%</td
	>
</tr>

<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { resolve } from '$app/paths';
	import type { BotStrengthRow } from '$lib/stats/botStrength';
	import { formatRelativeElo } from '$lib/stats/botStrength';
	import { formatWholeNumber } from '../utils/formatters';
	import BotBadge from './BotBadge.svelte';

	// One schedule-adjusted strength row. Bradley-Terry and its asymmetric interval get the
	// strongest visual weight; the joined Glicko row is context only and may legitimately be absent.
	interface Props {
		row: BotStrengthRow;
	}

	let { row }: Props = $props();

	const winPercentage = (wins: number, games: number): string =>
		games === 0 ? '—' : `${Math.round((wins / games) * 100)}%`;
</script>

<tr class="border-b border-border/50 last:border-b-0">
	<td
		class="w-10 px-2 py-3 text-right font-mono font-bold tabular-nums text-content-muted sm:w-auto sm:px-4"
	>
		{row.rank}
	</td>
	<td class="min-w-0 px-2 py-3 sm:px-4">
		<span class="flex min-w-0 items-center gap-1.5">
			{#if row.identity}
				<a
					href={resolve('/bots/[team]/[name]', row.identity)}
					class="truncate font-semibold text-content hover:text-primary hover:underline"
				>
					{row.player}
				</a>
			{:else}
				<span class="truncate font-semibold text-content">{row.player}</span>
			{/if}
			<span class="hidden shrink-0 sm:inline-flex"><BotBadge /></span>
		</span>
	</td>
	<td class="w-40 px-2 py-3 text-right font-mono tabular-nums sm:w-auto sm:px-4">
		<div class="font-bold text-content">
			<span class="text-base">{formatRelativeElo(row.elo)}</span>
			<span class="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
				relative Elo
			</span>
		</div>
		<div class="whitespace-nowrap text-[11px] text-content-muted">
			95% CI {formatRelativeElo(row.ciLow)} to {formatRelativeElo(row.ciHigh)}
		</div>
		<div class="whitespace-nowrap text-[11px] text-content-muted">
			{#if row.losVsNext === undefined || row.losVsNext === null}
				<span aria-label="No next-ranked bot">LOS vs next —</span>
			{:else}
				LOS vs next {Math.round(row.losVsNext * 100)}%
			{/if}
		</div>
	</td>
	<td class="hidden px-4 py-3 text-right font-mono tabular-nums text-content-muted sm:table-cell">
		{#if row.ladder}
			<div>
				<b class="text-content">{formatWholeNumber(row.ladder.rating)}</b>
				<span class="text-[11px]">±{formatWholeNumber(row.ladder.rd)}</span>
			</div>
			<div class="text-[10px] font-sans uppercase tracking-wide">
				{row.ladder.onLadder ? 'on ladder' : 'rating frozen'}
			</div>
		{:else}
			<span aria-label="No converged Glicko rating">—</span>
		{/if}
	</td>
	<td
		class="hidden px-4 py-3 text-right font-mono text-xs tabular-nums text-content-muted md:table-cell"
	>
		{#if row.ladder}
			<div>
				<span class="text-primary">{row.ladder.wins}</span>
				· {row.ladder.draws} ·
				<span class="text-danger">{row.ladder.losses}</span>
			</div>
			<div class="whitespace-nowrap text-[10px] font-sans uppercase tracking-wide">
				{row.ladder.games} games · {winPercentage(row.ladder.wins, row.ladder.games)} wins
			</div>
		{:else}
			<span aria-label="No rating-board record">—</span>
		{/if}
	</td>
</tr>

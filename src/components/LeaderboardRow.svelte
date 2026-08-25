<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { resolve } from '$app/paths';
	import { authStore } from '$lib/authStore.svelte';
	import type { LeaderRow } from '$lib/leaderboard/leaderboardApi';
	import { winRate } from '$lib/stats/playerRecord';
	import { formatWholeNumber } from '../utils/formatters';
	import BotBadge from './BotBadge.svelte';

	// One row of the shared rating board (#206). Extracted from the page because the row now has two
	// shapes — a bot and a person — and this repo has no route-level test harness, so leaving the
	// branch inline would have left the only behavioural difference on the page untestable.
	//
	// Own-row detection lives here rather than being passed in: the component already needs no other
	// input, and reading the store in one place keeps the page from threading auth state through a
	// loop.
	interface Props {
		row: LeaderRow;
	}

	let { row }: Props = $props();

	/** A person, not a bot. Asked this way round deliberately: on a server that predates `kind` every
	 * row reads as a bot, which is what every row used to be. */
	const isPlayer = $derived(row.kind === 'player');

	/** The signed-in visitor's own row. Nicknames are unique, and a bot can never collide because the
	 * check requires a player row. */
	const isMe = $derived(isPlayer && authStore.nickname !== null && row.name === authStore.nickname);

	const fmt = (value: number): string => formatWholeNumber(value);
</script>

<tr
	class="border-b border-border/50 last:border-b-0
		{isPlayer || row.onLadder ? '' : 'opacity-60'}
		{isMe ? 'bg-primary/10' : ''}"
>
	<td class="px-4 py-3 text-right font-mono font-bold tabular-nums text-content-muted">
		{row.rank}
	</td>
	<td class="px-4 py-3">
		<span class="flex min-w-0 items-center gap-1.5">
			{#if isPlayer}
				<!-- No team prefix and no BotBadge — that is the whole visual difference from a bot. -->
				<a
					href={resolve('/players/[nickname]', { nickname: row.name })}
					class="truncate font-semibold text-content hover:text-primary hover:underline"
				>
					{row.name}
				</a>
				{#if isMe}
					<span
						class="shrink-0 rounded bg-primary/20 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-primary"
					>
						you
					</span>
				{/if}
			{:else}
				<a
					href={resolve('/bots/[team]/[name]', { team: row.team ?? '', name: row.name })}
					class="truncate font-semibold text-content hover:text-primary hover:underline"
				>
					{row.team}
					{row.name}
				</a>
				<BotBadge />
				{#if !row.onLadder}
					<span class="shrink-0 text-[10px] text-content-muted italic">left ladder</span>
				{/if}
			{/if}
		</span>
	</td>
	<td class="px-4 py-3 text-right font-mono tabular-nums">
		<b class="text-content">{fmt(row.rating)}</b>
		<span class="text-[11px] text-content-muted">±{fmt(row.rd)}</span>
	</td>
	<td class="hidden px-4 py-3 text-right font-mono tabular-nums text-content-muted sm:table-cell">
		{row.games}
	</td>
	<td
		class="hidden px-4 py-3 text-right font-mono text-xs tabular-nums text-content-muted sm:table-cell"
	>
		<span class="text-primary">{row.wins}</span>
		· {row.draws} ·
		<span class="text-danger">{row.losses}</span>
	</td>
	<td class="px-4 py-3 text-right font-mono font-bold tabular-nums text-content">
		{Math.round(winRate(row) * 100)}%
	</td>
</tr>

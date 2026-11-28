<script lang="ts">
	// One row of the leaderboard (#261), for current standings and for a saved snapshot alike.
	//
	// The place, the order and "Ranks at" are the server's. The row only draws them: the 95%
	// range as a bar on the scale the table shares, with its numbers beside it, so that the
	// order of the table can be seen in the bars.
	//
	// From the `md` breakpoint every value has a column. Below it the row keeps the place, the
	// name and the rating as columns and writes the rest as text under them, so nothing is
	// dropped on a phone. There is no bar on a phone.
	//
	// "Not in automatic ladder" is about bot pairing only: it never means a frozen rating.
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { authStore } from '#lib/authStore.svelte.js';
	import { isNewcomer, rangeOf, ranksAt, type Bar } from '#lib/leaderboard/boardView.js';
	import type { LeaderRow } from '#lib/leaderboard/leaderboardApi.js';
	import { winRate } from '#lib/stats/playerRecord.js';
	import { formatWholeNumber } from '../utils/formatters';
	import Tag from './ui/Tag.svelte';

	let {
		row,
		bar = null,
		historical = false,
	}: { row: LeaderRow; bar?: Bar | null; historical?: boolean } = $props();

	const isPlayer = $derived(row.kind === 'player');
	const isMe = $derived(
		!historical && isPlayer && authStore.nickname !== null && row.name === authStore.nickname,
	);
	const score = $derived(ranksAt(row));
	const range = $derived(rangeOf(row));
	const rating = $derived(formatWholeNumber(row.rating));
	const rangeText = $derived(
		range
			? m.leaderboard_range_text({
					low: formatWholeNumber(range.low),
					high: formatWholeNumber(range.high),
				})
			: m.common_rating_interval_unknown(),
	);
	const scoreText = $derived(
		score === null ? m.common_rating_score_unknown() : formatWholeNumber(score),
	);
	const win = $derived(`${Math.round(winRate(row) * 100)}%`);
	const games = $derived(formatWholeNumber(row.games));

	const cell = 'px-1.5 py-3 md:px-3 md:py-4';
	const wide = `${cell} max-md:hidden`;
</script>

<tr class="border-t border-border {isMe ? 'bg-primary/10' : ''}">
	<td class="{cell} w-6 align-top font-semibold text-content-muted tabular-nums md:align-middle">
		{row.rank}
	</td>
	<th scope="row" class="{cell} text-left align-top font-normal md:align-middle">
		<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
			{#if isPlayer}
				<a
					href={resolve('/players/[nickname]', { nickname: row.name })}
					class="font-semibold text-content hover:underline">{row.name}</a
				>
			{:else}
				<a
					href={resolve('/bots/[team]/[name]', { team: row.team ?? '', name: row.name })}
					class="font-semibold text-content hover:underline">{row.team} {row.name}</a
				>
				<Tag>{m.leaderboard_tag_bot()}</Tag>
			{/if}
			{#if isNewcomer(row)}
				<span
					class="inline-flex shrink-0 items-center rounded-md border border-border-strong px-1.5 text-xs font-semibold text-content"
					>{m.leaderboard_new()}</span
				>
			{/if}
			{#if isMe}<Tag tone="accent">{m.common_rating_you()}</Tag>{/if}
		</span>
		{#if !isPlayer && !row.onLadder}
			<span class="mt-1 block text-xs text-content-muted" title={m.common_rating_scheduling_help()}>
				{m.common_rating_scheduling_off()}
			</span>
		{/if}
		<!-- On a phone: the columns that have no room, as text. -->
		<span class="mt-1 block text-sm text-content-muted tabular-nums md:hidden">
			{m.leaderboard_phone_games({ games, win })}
		</span>
		<span class="block text-xs text-content-muted tabular-nums md:hidden">
			{m.leaderboard_phone_record({
				wins: formatWholeNumber(row.wins),
				draws: formatWholeNumber(row.draws),
				losses: formatWholeNumber(row.losses),
			})}
		</span>
	</th>
	<td class="{wide} text-base font-bold text-content tabular-nums">{scoreText}</td>
	<td class="{cell} text-right align-top tabular-nums md:text-left md:align-middle">
		<span class="text-lg font-bold text-content md:text-sm md:font-normal">{rating}</span>
		<span class="block text-sm text-content-muted md:hidden">{rangeText}</span>
		<span class="block text-xs text-content-muted md:hidden">
			{m.leaderboard_phone_ranks_at({ score: scoreText })}
		</span>
	</td>
	<td class={wide}>
		{#if range && bar}
			<!-- One image for assistive technology: the bar and its numbers say the same thing. -->
			<div
				role="img"
				aria-label={m.leaderboard_range_label({
					low: formatWholeNumber(range.low),
					high: formatWholeNumber(range.high),
					rating,
				})}
				class="min-w-48"
			>
				<div class="relative h-1.5 rounded-full bg-surface-hover">
					<div
						class="absolute inset-y-0 rounded-full bg-primary"
						style:left="{bar.start}%"
						style:width="{bar.width}%"
					></div>
					<div
						class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-content"
						style:left="{bar.dot}%"
					></div>
				</div>
				<p class="m-0 mt-2 text-xs text-content-muted tabular-nums">{rangeText}</p>
			</div>
		{:else}
			<span class="text-xs text-content-muted">{rangeText}</span>
		{/if}
	</td>
	<td class="{wide} text-right text-content tabular-nums">{games}</td>
	<td class="{wide} text-right text-content tabular-nums">
		{formatWholeNumber(row.wins)} · {formatWholeNumber(row.draws)} · {formatWholeNumber(row.losses)}
	</td>
	<td class="{wide} text-right font-bold text-content tabular-nums">{win}</td>
</tr>

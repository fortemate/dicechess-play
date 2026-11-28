<script lang="ts">
	// The leaderboard table (#261): the rows the server ranked, for current standings and for a
	// saved snapshot alike.
	//
	// It takes the whole board and decides only what part of it is on screen: the rows a search
	// by name keeps, one page of them at first, more on request. A new search starts from one
	// page again. The places are the server's and stay as they are when a search hides rows.
	//
	// Every bar is drawn on one scale, taken from the whole board, so a bar stays where it is
	// when a search hides rows or more rows are shown. The footer says how many entries are shown and, for current standings, when the
	// board was last worked out.
	import { m } from '#lib/paraglide/messages.js';
	import {
		FIRST_PAGE,
		MORE_STEP,
		barOf,
		scaleMiddle,
		scaleOf,
		searchRows,
	} from '#lib/leaderboard/boardView.js';
	import type { LeaderRow } from '#lib/leaderboard/leaderboardApi.js';
	import { formatWholeNumber } from '../utils/formatters';
	import LeaderboardRow from './LeaderboardRow.svelte';
	import Button from './ui/Button.svelte';

	let {
		rows,
		speed,
		query = '',
		updated = null,
		historical = false,
	}: {
		rows: LeaderRow[];
		/** The speed of the board, already worded: "Blitz". */
		speed: string;
		query?: string;
		/** When the board was last worked out, already worded; null when not known or not said. */
		updated?: string | null;
		historical?: boolean;
	} = $props();

	let limit = $state(FIRST_PAGE);
	$effect(() => {
		void query;
		void rows;
		limit = FIRST_PAGE;
	});

	const matching = $derived(searchRows(rows, query));
	const shown = $derived(matching.slice(0, limit));
	const more = $derived(Math.min(MORE_STEP, matching.length - shown.length));
	const scale = $derived(scaleOf(rows));
	const footer = $derived.by(() => {
		const showing = m.leaderboard_showing({ shown: shown.length, count: matching.length, speed });
		return updated ? `${showing} · ${m.leaderboard_updated({ date: updated })}` : showing;
	});

	const head = 'px-2 py-3 text-xs font-bold tracking-wider text-content-muted uppercase md:px-3';
	const wide = `${head} max-md:hidden`;
</script>

{#if matching.length === 0}
	<p class="m-0 py-4 text-content-muted">{m.leaderboard_no_match({ query: query.trim() })}</p>
{:else}
	<div class="rounded-card border border-border bg-surface px-2 md:px-3">
		<table class="w-full border-collapse text-sm">
			<caption class="sr-only">{m.leaderboard_caption({ speed })}</caption>
			<thead>
				<tr class="text-left align-bottom">
					<th scope="col" class={head}>
						<span aria-hidden="true">#</span><span class="sr-only">{m.leaderboard_place()}</span>
					</th>
					<th scope="col" class={head}>{m.leaderboard_name()}</th>
					<th scope="col" class={wide} aria-sort="descending">
						{m.leaderboard_ranks_at()} <span aria-hidden="true">↓</span>
					</th>
					<th scope="col" class="{head} text-right whitespace-nowrap md:text-left">
						<span class="max-md:hidden">{m.leaderboard_rating()}</span>
						<span class="md:hidden">{m.leaderboard_phone_head()}</span>
					</th>
					<th scope="col" class={wide}>
						{m.leaderboard_range()}
						{#if scale}
							<!-- The ends and the middle of the scale the bars below are drawn on. -->
							<span
								aria-hidden="true"
								class="mt-1 flex justify-between font-semibold tracking-normal tabular-nums"
							>
								<span>{formatWholeNumber(scale.min)}</span>
								<span>{formatWholeNumber(scaleMiddle(scale))}</span>
								<span>{formatWholeNumber(scale.max)}</span>
							</span>
						{/if}
					</th>
					<th scope="col" class="{wide} text-right">{m.leaderboard_games()}</th>
					<th scope="col" class="{wide} text-right">{m.leaderboard_record()}</th>
					<th scope="col" class="{wide} text-right">{m.leaderboard_win_percent()}</th>
				</tr>
			</thead>
			<tbody>
				{#each shown as row (`${row.kind}/${row.team ?? ''}/${row.name}`)}
					<LeaderboardRow {row} bar={barOf(row, scale)} {historical} />
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
		<div class="flex flex-col gap-1 text-content-muted">
			<p class="m-0 text-base" role="status">{footer}</p>
			<p class="m-0 text-sm max-md:hidden">{m.leaderboard_bar_help()}</p>
		</div>
		{#if more > 0}
			<Button variant="secondary" onclick={() => (limit += MORE_STEP)}>
				{m.leaderboard_more({ count: more })}
			</Button>
		{/if}
	</div>
{/if}

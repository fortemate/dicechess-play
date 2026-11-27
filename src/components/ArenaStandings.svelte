<script lang="ts">
	// "Standings" on the Arena overview (#259): the top five of one speed, bots and people on
	// one scale, with a link to the leaderboard. Read once per visit: the board moves slowly.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { fetchLeaderboard, type LeaderRow } from '#lib/leaderboard/leaderboardApi.js';
	import { RATING_CATEGORY_LABELS, type RatingCategory } from '#lib/live/ratingCategory.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatWholeNumber } from '../utils/formatters';
	import Spinner from './Spinner.svelte';
	import Card from './ui/Card.svelte';
	import Tag from './ui/Tag.svelte';

	/** The speed most games are played at. */
	const SPEED: RatingCategory = 'blitz';
	const SHOWN = 5;

	let leaders = $state<LeaderRow[]>([]);
	let phase = $state<'loading' | 'ready' | 'failed'>('loading');

	onMount(() => {
		let alive = true;
		fetchLeaderboard('all', SPEED)
			.then((board) => {
				if (!alive) return;
				leaders = board.leaders.slice(0, SHOWN);
				phase = 'ready';
			})
			.catch(() => {
				if (alive) phase = 'failed';
			});
		return () => {
			alive = false;
		};
	});

	// A bot is known by its team and its name, a person by a nickname alone.
	const nameOf = (row: LeaderRow) => (row.team ? `${row.team} ${row.name}` : row.name);
	const hrefOf = (row: LeaderRow) =>
		row.kind === 'player'
			? resolve('/players/[nickname]', { nickname: row.name })
			: resolve('/bots/[team]/[name]', { team: row.team ?? '', name: row.name });
</script>

<Card as="section" padding="lg" aria-labelledby="arena-standings-title" class="flex flex-col gap-1">
	<div class="flex items-baseline justify-between gap-4 border-b border-border pb-2">
		<h2
			id="arena-standings-title"
			class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase"
		>
			{m.arena_standings_title({ speed: RATING_CATEGORY_LABELS[SPEED] })}
		</h2>
		<span class="text-sm text-content-muted">{m.arena_standings_rating()}</span>
	</div>

	{#if phase === 'loading'}
		<p class="m-0 flex items-center gap-2 py-3 text-sm text-content-muted" role="status">
			<Spinner />
			{m.arena_standings_loading()}
		</p>
	{:else if phase === 'failed'}
		<p class="m-0 py-3 text-sm text-danger" role="alert">{m.arena_standings_failed()}</p>
	{:else if leaders.length === 0}
		<p class="m-0 py-3 text-sm text-content-muted">{m.arena_standings_empty()}</p>
	{:else}
		<ol class="m-0 flex list-none flex-col divide-y divide-border p-0">
			{#each leaders as row (row.rank)}
				<li class="flex min-h-11 items-center gap-3 py-2">
					<span class="w-5 shrink-0 text-sm text-content-muted tabular-nums">{row.rank}</span>
					<!-- The address comes from `resolve`, by way of a function. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={hrefOf(row)}
						class="min-w-0 flex-1 truncate rounded font-semibold text-content no-underline hover:underline focus-visible:focus-ring"
					>
						{nameOf(row)}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<Tag tone={row.kind === 'player' ? 'highlight' : 'neutral'}>
						{row.kind === 'player' ? m.arena_player() : m.arena_bot()}
					</Tag>
					<span class="w-14 shrink-0 text-right font-semibold text-content tabular-nums">
						{formatWholeNumber(row.rating)}
					</span>
				</li>
			{/each}
		</ol>
	{/if}

	<a
		href={resolve('/leaderboard')}
		class="mt-2 w-fit rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:focus-ring"
	>
		{m.arena_standings_full()}
	</a>
</Card>

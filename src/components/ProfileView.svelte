<script lang="ts">
	// A public profile (#262): one template for a bot and for a person.
	//
	// It draws what it is given and reads no server: the page that owns the address fetches the
	// profile (`Profile.svelte`). What the tiles, the records and the lists hold is worked out by
	// `lib/profile/profileView`, which is pure.
	//
	// The page stays short however long the history is: eight opponents and eight games, each
	// with a way to see the rest in place. On a phone the two lists share one place and a
	// switch picks which is shown.
	//
	// An outcome is never told by colour alone: every bar has its numbers beside it, and the
	// result of a game is a word.
	//
	// What only one kind has: a bot gets "Challenge this bot", a link that preselects it on
	// Play, and a link to watch while it is in a game; a person gets the switch between
	// competitive ratings and training estimates, which are never mixed.
	import { resolve } from '$app/paths';
	import type { PlayerOpponent } from '#lib/games/gamesApi.js';
	import { RESULT_LABEL, terminationLabel } from '#lib/gameOutcome.js';
	import type {
		CategoryRating,
		ProfileRecentGame,
		TrainingCategoryRating,
	} from '#lib/leaderboard/leaderboardApi.js';
	import { SEAT_LABELS } from '#lib/live/playerLabel.js';
	import { RATING_CATEGORY_LABELS, RATING_CATEGORY_ORDER } from '#lib/live/ratingCategory.js';
	import { knownEpoch, ratingDate } from '#lib/ratings/ratingPresentation.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		FIRST_GAMES,
		FIRST_OPPONENTS,
		botOpponents,
		gameCounts,
		outcomeBar,
		playedAt,
		ratingTiles,
		records,
		winPercent,
		type Subject,
		type Tally,
	} from '#lib/profile/profileView.js';
	import { formatWholeNumber } from '../utils/formatters';
	import Button from './ui/Button.svelte';
	import Card from './ui/Card.svelte';
	import SegmentedControl from './ui/SegmentedControl.svelte';
	import Tag from './ui/Tag.svelte';

	interface Props {
		subject: Subject;
		ratings: CategoryRating[];
		/** A person's training estimates; undefined when the server does not report them. */
		training?: TrainingCategoryRating[];
		opponents: PlayerOpponent[];
		recent: ProfileRecentGame[];
		/** A person's count of every finished game, rated or not. */
		totalGames?: number;
		/** A bot outside automatic pairing. It says nothing about its rating. */
		offLadder?: boolean;
		/** The game the bot is in now, when there is one. */
		playingGameId?: string | null;
	}

	let {
		subject,
		ratings,
		training,
		opponents,
		recent,
		totalGames,
		offLadder = false,
		playingGameId = null,
	}: Props = $props();

	const isBot = $derived(subject.kind === 'bot');
	const title = $derived(subject.kind === 'bot' ? subject.name : subject.nickname);
	const initial = $derived([...title.trim()][0]?.toUpperCase() ?? '?');

	let domain = $state<'competitive' | 'training'>('competitive');
	let list = $state<'opponents' | 'recent'>('opponents');
	let allOpponents = $state(false);
	let allGames = $state(false);

	const showTraining = $derived(!isBot && domain === 'training');
	const tiles = $derived(ratingTiles(showTraining ? training : ratings));
	const record = $derived(records(opponents));
	const met = $derived(botOpponents(opponents));
	const shownOpponents = $derived(allOpponents ? met : met.slice(0, FIRST_OPPONENTS));
	const shownGames = $derived(allGames ? recent : recent.slice(0, FIRST_GAMES));
	const counts = $derived(gameCounts(ratings, totalGames));

	const domains = $derived([
		{ value: 'competitive' as const, label: m.profile_switch_competitive() },
		{ value: 'training' as const, label: m.profile_switch_training() },
	]);
	const lists = $derived([
		{ value: 'opponents' as const, label: m.profile_tab_opponents() },
		{ value: 'recent' as const, label: m.profile_tab_recent() },
	]);

	const recordLine = (tally: Tally) =>
		m.profile_record_line({
			wins: formatWholeNumber(tally.wins),
			draws: formatWholeNumber(tally.draws),
			losses: formatWholeNumber(tally.losses),
		});

	// "1 game", "2 games": the count decides the word.
	const gamesText = (count: number) =>
		count === 1
			? m.profile_tile_games_one()
			: m.profile_tile_games({ count: formatWholeNumber(count) });
	const trainingGamesText = (count: number) =>
		count === 1
			? m.profile_training_games_one()
			: m.profile_training_games({ count: formatWholeNumber(count) });

	// Where a training estimate comes from. What the server does not say is said to be unknown,
	// never left out.
	const estimates = $derived(
		RATING_CATEGORY_ORDER.flatMap((category) => {
			const found = (training ?? []).find((rating) => rating.category === category);
			if (!found) return [];
			const cutoff = ratingDate(found.cutoff);
			const computed = ratingDate(found.computedAt);
			const algorithm =
				found.algorithm === 'glicko2' || !found.algorithm
					? m.common_rating_glicko()
					: found.algorithm;
			return [
				{
					category,
					facts: [
						knownEpoch(found.epoch)
							? m.common_rating_epoch({ epoch: found.epoch })
							: m.common_rating_epoch_unknown(),
						cutoff ? m.common_rating_cutoff({ date: cutoff }) : m.common_rating_cutoff_unknown(),
						computed
							? m.common_rating_computed({ date: computed })
							: m.common_rating_computed_unknown(),
						`${algorithm} · ${found.algorithmVersion ?? m.common_rating_algorithm_version_unknown()}`,
					],
				},
			];
		}),
	);

	const label = 'm-0 text-xs font-bold tracking-wider text-content-muted uppercase';
	const moreLink =
		'mt-3 cursor-pointer self-start rounded-control border-0 bg-transparent p-0 py-1 text-base font-bold text-content underline-offset-4 hover:underline focus-visible:focus-ring';
</script>

<!-- A record as a bar: won, drawn, lost. Decoration only; the numbers are always beside it. -->
{#snippet bar(tally: Tally, thin: boolean)}
	{@const share = outcomeBar(tally)}
	<span aria-hidden="true" class="flex w-full gap-0.5 {thin ? 'h-1.5' : 'h-2'}">
		{#if share.won > 0}
			<span class="rounded-full bg-primary min-w-1" style:width="{share.won}%"></span>
		{/if}
		{#if share.drawn > 0}
			<span class="rounded-full bg-border-strong min-w-1" style:width="{share.drawn}%"></span>
		{/if}
		{#if share.lost > 0}
			<span class="rounded-full bg-content-muted/60 min-w-1" style:width="{share.lost}%"></span>
		{/if}
	</span>
{/snippet}

{#snippet recordTile(heading: string, tally: Tally | null)}
	<div class="flex min-w-0 flex-col gap-2">
		<h2 class={label}>{heading}</h2>
		{#if tally}
			<!-- The share is of decided games, as everywhere on the site; the line under the bar
			     gives every game, draws included. -->
			<p class="m-0 flex flex-wrap items-baseline gap-x-2 text-content-muted">
				<span class="text-3xl font-bold text-content tabular-nums">{winPercent(tally)}%</span>
				{m.profile_record_wins()}
			</p>
			{@render bar(tally, false)}
			<p class="m-0 text-content tabular-nums">{gamesText(tally.games)} · {recordLine(tally)}</p>
		{:else}
			<p class="m-0 text-content-muted">{m.profile_record_none()}</p>
		{/if}
	</div>
{/snippet}

<div class="flex min-w-0 flex-col gap-5">
	<a
		href={resolve('/leaderboard')}
		class="flex w-fit items-center gap-2 font-semibold text-content-muted hover:text-content focus-visible:focus-ring"
	>
		<span aria-hidden="true">←</span>
		{m.profile_back()}
	</a>

	<header class="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
		<div class="flex min-w-0 items-center gap-4">
			<span
				aria-hidden="true"
				class="flex size-14 shrink-0 items-center justify-center rounded-card bg-surface-hover text-2xl font-bold text-content md:size-18 md:text-3xl"
			>
				{initial}
			</span>
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<h1 class="m-0 text-2xl font-bold tracking-tight break-words text-content md:text-4xl">
						{title}
					</h1>
					{#if isBot}
						<Tag>{m.profile_tag_bot()}</Tag>
					{:else}
						<Tag tone="highlight">{m.profile_tag_player()}</Tag>
					{/if}
				</div>
				<p class="m-0 mt-1 text-content-muted">
					{#if subject.kind === 'bot'}
						{m.profile_bot_team({ team: subject.team })}
					{:else if counts.consistent}
						{m.profile_competitive_record_summary({
							rated: counts.rated,
							other: counts.other,
							total: counts.total,
						})}
					{:else}
						{m.profile_competitive_record_unreconciled({
							rated: counts.rated,
							total: counts.total,
						})}
					{/if}
				</p>
				{#if offLadder}
					<p class="m-0 mt-1 text-sm text-content-muted">{m.common_rating_scheduling_help()}</p>
				{/if}
			</div>
		</div>
		{#if subject.kind === 'bot'}
			<div
				class="flex flex-wrap items-center gap-3 max-sm:w-full max-sm:flex-col max-sm:items-stretch"
			>
				{#if playingGameId}
					<Button href={resolve('/live/[id]', { id: playingGameId })} size="lg">
						<span aria-hidden="true" class="size-2 rounded-full bg-success"></span>
						{m.profile_watch()}
					</Button>
				{/if}
				<Button
					variant="primary"
					size="lg"
					href="{resolve('/play')}?bot={encodeURIComponent(`${subject.team}/${subject.name}`)}"
				>
					{m.profile_challenge()}
				</Button>
			</div>
		{/if}
	</header>

	<section class="flex flex-col gap-3" aria-labelledby="profile-ratings">
		<div
			class="flex flex-wrap items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch"
		>
			<h2 id="profile-ratings" class={label}>
				{showTraining ? m.profile_ratings_training() : m.profile_ratings_competitive()}
			</h2>
			{#if !isBot}
				<SegmentedControl
					label={m.profile_ratings_switch()}
					options={domains}
					bind:value={domain}
					class="sm:min-w-64"
				/>
			{/if}
		</div>
		{#if showTraining}
			<p class="m-0 text-sm text-content-muted">
				{training === undefined
					? m.profile_training_unsupported()
					: m.profile_training_explanation()}
			</p>
		{/if}
		<ul class="m-0 grid list-none grid-cols-3 gap-2 p-0 md:gap-4">
			{#each tiles as tile (tile.category)}
				<li
					class="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-3 md:p-5"
				>
					<h3 class={label}>{RATING_CATEGORY_LABELS[tile.category]}</h3>
					{#if tile.rated}
						<p class="m-0 flex flex-wrap items-baseline gap-x-3">
							<span class="text-2xl font-bold text-content tabular-nums md:text-4xl">
								{formatWholeNumber(tile.rated.rating)}
							</span>
							{#if tile.rated.rank !== null}
								<span class="text-sm font-bold text-content md:text-base">
									{m.profile_tile_place({ place: tile.rated.rank })}
								</span>
							{/if}
						</p>
						{#if tile.rated.range}
							<p class="m-0 text-xs text-content-muted tabular-nums md:text-base">
								<span class="max-md:sr-only">{m.profile_tile_range_lead()}</span>
								{m.profile_tile_range({
									low: formatWholeNumber(tile.rated.range.low),
									high: formatWholeNumber(tile.rated.range.high),
								})}
							</p>
						{/if}
						<p class="m-0 text-xs text-content-muted tabular-nums md:text-base">
							{showTraining ? trainingGamesText(tile.rated.games) : gamesText(tile.rated.games)}
							{#if tile.rated.provisional}
								· {m.common_rating_provisional()}
							{/if}
						</p>
					{:else}
						<p class="m-0 text-sm text-content-muted md:text-base">
							{showTraining ? m.profile_training_unmeasured() : m.profile_tile_unplayed()}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
		{#if showTraining && estimates.length > 0}
			<ul
				aria-label={m.profile_training_details()}
				class="m-0 flex list-none flex-col gap-1 p-0 text-sm text-content-muted"
			>
				{#each estimates as estimate (estimate.category)}
					<li>
						<span class="font-semibold text-content">
							{RATING_CATEGORY_LABELS[estimate.category]}
						</span>
						<span> · {estimate.facts.join(' · ')}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<div class="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
		<Card padding="lg" class="flex min-w-0 flex-col gap-5">
			<div class="grid gap-5 sm:grid-cols-2">
				{@render recordTile(m.profile_against_bots(), record.bots)}
				{@render recordTile(m.profile_against_people(), record.people)}
			</div>

			<!-- On a phone the two lists share one place. -->
			<SegmentedControl
				label={m.profile_tabs_label()}
				options={lists}
				bind:value={list}
				class="lg:hidden"
			/>

			<section
				class="flex flex-col {list === 'opponents' ? '' : 'max-lg:hidden'}"
				aria-labelledby="profile-opponents"
			>
				<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-3">
					<h2 id="profile-opponents" class={label}>{m.profile_opponents()}</h2>
					<p class="m-0 flex items-center gap-3 text-sm text-content-muted">
						<span class="flex items-center gap-1.5">
							<span aria-hidden="true" class="h-1.5 w-4 rounded-full bg-primary"></span>
							{m.profile_legend_won()}
						</span>
						<span class="flex items-center gap-1.5">
							<span aria-hidden="true" class="h-1.5 w-4 rounded-full bg-content-muted/60"></span>
							{m.profile_legend_lost()}
						</span>
					</p>
				</div>
				{#if met.length === 0}
					<p class="m-0 border-t border-border py-4 text-content-muted">
						{m.profile_opponents_none()}
					</p>
				{:else}
					<ul class="m-0 flex list-none flex-col border-b border-border p-0">
						{#each shownOpponents as row (`${row.team}/${row.botName}`)}
							<li class="border-t border-border">
								<a
									href={resolve('/bots/[team]/[name]', { team: row.team, name: row.botName })}
									class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-3 text-content no-underline hover:bg-surface-hover focus-visible:focus-ring md:grid-cols-[minmax(0,1fr)_minmax(6rem,10rem)_auto_3rem]"
								>
									<span class="min-w-0 truncate font-semibold">{row.team} {row.botName}</span>
									<span class="max-md:order-3 max-md:col-span-2">{@render bar(row, true)}</span>
									<span class="text-right text-sm text-content-muted tabular-nums md:text-base">
										{recordLine(row)}
										<span class="font-bold text-content md:hidden">· {winPercent(row)}%</span>
									</span>
									<span class="text-right font-bold tabular-nums max-md:hidden">
										{winPercent(row)}%
									</span>
								</a>
							</li>
						{/each}
					</ul>
					{#if met.length > FIRST_OPPONENTS}
						<button
							type="button"
							class={moreLink}
							aria-expanded={allOpponents}
							onclick={() => (allOpponents = !allOpponents)}
						>
							{allOpponents
								? m.profile_show_fewer()
								: m.profile_opponents_all({ count: met.length })}
						</button>
					{/if}
				{/if}
			</section>
		</Card>

		<Card
			as="section"
			padding="lg"
			aria-labelledby="profile-recent"
			class="flex min-w-0 flex-col {list === 'recent' ? '' : 'max-lg:hidden'}"
		>
			<h2 id="profile-recent" class="{label} pb-3">{m.profile_recent()}</h2>
			{#if recent.length === 0}
				<p class="m-0 border-t border-border py-4 text-content-muted">{m.profile_recent_none()}</p>
			{:else}
				<ul class="m-0 flex list-none flex-col border-b border-border p-0">
					{#each shownGames as game (game.gameId)}
						<li class="border-t border-border">
							<a
								href={resolve('/replay/[id]', { id: game.gameId })}
								class="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-3 py-3 text-content no-underline hover:bg-surface-hover focus-visible:focus-ring"
							>
								<!-- The result is a word; the fill only helps to scan the column. -->
								<span
									class="inline-flex items-center justify-center rounded-md border px-2 py-1 text-sm font-bold
										{game.result === 'win'
										? 'border-primary bg-primary text-primary-content'
										: 'border-border-strong bg-transparent text-content'}"
								>
									{RESULT_LABEL[game.result]}
								</span>
								<span class="flex min-w-0 flex-col">
									<span class="truncate font-semibold">
										{m.profile_recent_vs({
											name: game.opponent.name ?? m.common_player_anonymous(),
										})}
									</span>
									<span class="truncate text-sm text-content-muted">
										{m.profile_recent_detail({
											colour: SEAT_LABELS[game.seat],
											how: terminationLabel(game.termination),
										})}
									</span>
								</span>
								<span class="text-right text-sm text-content-muted tabular-nums">
									{playedAt(game.finishedAt)}
								</span>
							</a>
						</li>
					{/each}
				</ul>
				{#if recent.length > FIRST_GAMES}
					<button
						type="button"
						class={moreLink}
						aria-expanded={allGames}
						onclick={() => (allGames = !allGames)}
					>
						{allGames ? m.profile_show_fewer() : m.profile_recent_all({ count: recent.length })}
					</button>
				{/if}
			{/if}
		</Card>
	</div>

	<details class="text-sm text-content-muted">
		<summary class="cursor-pointer font-semibold text-content focus-visible:focus-ring">
			{m.common_rating_explanation()}
		</summary>
		<p class="m-0 mt-3 max-w-3xl">{m.common_rating_interval_help()}</p>
	</details>
</div>

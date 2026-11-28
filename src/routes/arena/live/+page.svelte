<script lang="ts">
	// Every live game (#260): the second view of Arena. A list by default, the same games as
	// small boards on request; who plays, at what speed and a search by name narrow it down.
	//
	// The page owns the feed and the state of the controls. Which games the filters keep and in
	// what order is decided by `lib/arena/liveGames`, which is pure; how a game is drawn is
	// `ArenaLiveGames`.
	//
	// The list is as long as the visitor asks for: it starts with one page and "show more" adds
	// to it. Changing a filter starts from one page again.
	import { onMount } from 'svelte';
	import {
		FIRST_PAGE,
		GAME_KINDS,
		MORE_STEP,
		NO_FILTERS,
		countByKind,
		filterGames,
		isFiltered,
		type GameKind,
		type SpeedFilter,
	} from '#lib/arena/liveGames.js';
	import { LiveGamesFeed } from '#lib/arena/liveGamesFeed.svelte.js';
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import { RATING_CATEGORY_LABELS, RATING_CATEGORY_ORDER } from '#lib/live/ratingCategory.js';
	import { m } from '#lib/paraglide/messages.js';
	import ArenaHead from '../../../components/ArenaHead.svelte';
	import ArenaLiveGames from '../../../components/ArenaLiveGames.svelte';
	import ArenaPlayBar from '../../../components/ArenaPlayBar.svelte';
	import Spinner from '../../../components/Spinner.svelte';
	import Button from '../../../components/ui/Button.svelte';
	import Chip from '../../../components/ui/Chip.svelte';
	import SegmentedControl from '../../../components/ui/SegmentedControl.svelte';

	const feed = new LiveGamesFeed();
	const live = isLiveEnabled();
	onMount(() => (live ? feed.start() : undefined));

	let kind = $state<GameKind>(NO_FILTERS.kind);
	let speed = $state<SpeedFilter>(NO_FILTERS.speed);
	let query = $state(NO_FILTERS.query);
	let view = $state<'list' | 'boards'>('list');
	let limit = $state(FIRST_PAGE);

	const filters = $derived({ kind, speed, query });
	const counts = $derived(countByKind(feed.games));
	const matching = $derived(filterGames(feed.games, filters));
	const shown = $derived(matching.slice(0, limit));
	const more = $derived(Math.min(MORE_STEP, matching.length - shown.length));

	const KIND_LABELS: Record<GameKind, () => string> = {
		all: m.arena_live_kind_all,
		human: m.arena_live_kind_human,
		bots: m.arena_live_kind_bots,
	};
	const viewOptions = $derived([
		{ value: 'list' as const, label: m.arena_live_view_list() },
		{ value: 'boards' as const, label: m.arena_live_view_boards() },
	]);

	// A narrower or a wider list starts from its first page.
	function narrow(change: () => void) {
		change();
		limit = FIRST_PAGE;
	}
	function clear() {
		narrow(() => {
			kind = NO_FILTERS.kind;
			speed = NO_FILTERS.speed;
			query = NO_FILTERS.query;
		});
	}

	const fieldClass =
		'min-h-11 rounded-control border border-border-strong bg-surface px-3 text-sm text-content placeholder:text-content-muted focus-visible:focus-ring';
</script>

<svelte:head>
	<title>{m.arena_live_meta_title()}</title>
	<meta name="description" content={m.arena_live_meta_description()} />
</svelte:head>

<div class="flex flex-col gap-5">
	<ArenaHead current="live" total={feed.loaded ? feed.total : undefined} />

	{#if !live}
		<p class="m-0 text-content-muted">{m.arena_off()}</p>
	{:else}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
			<div
				role="group"
				aria-label={m.arena_live_kind_label()}
				class="-mx-1 flex gap-2 overflow-x-auto px-1 py-1"
			>
				{#each GAME_KINDS as option (option)}
					<Chip
						pressed={kind === option}
						class="shrink-0"
						onclick={() => narrow(() => (kind = option))}
					>
						{KIND_LABELS[option]()}
						<span class="tabular-nums opacity-80">{counts[option]}</span>
					</Chip>
				{/each}
			</div>
			<div class="flex flex-1 flex-wrap items-center justify-end gap-3">
				<label class="min-w-40 flex-1 sm:max-w-56">
					<span class="sr-only">{m.arena_live_search()}</span>
					<input
						type="search"
						value={query}
						oninput={(event) => narrow(() => (query = event.currentTarget.value))}
						placeholder={m.arena_live_search()}
						class="w-full {fieldClass}"
					/>
				</label>
				<label>
					<span class="sr-only">{m.arena_live_speed()}</span>
					<select
						value={speed}
						onchange={(event) => narrow(() => (speed = event.currentTarget.value as SpeedFilter))}
						class="cursor-pointer font-semibold {fieldClass}"
					>
						<option value="any">{m.arena_live_speed_any()}</option>
						{#each RATING_CATEGORY_ORDER as category (category)}
							<option value={category}>{RATING_CATEGORY_LABELS[category]}</option>
						{/each}
					</select>
				</label>
				<SegmentedControl label={m.arena_live_view()} options={viewOptions} bind:value={view} />
			</div>
		</div>

		<!-- Said plainly: the list is the server's page, not everything that is running. -->
		{#snippet capNotice()}
			{#if feed.games.length > 0 && feed.total > feed.games.length}
				<p class="m-0 text-sm text-content-muted">
					{m.arena_live_capped({ listed: feed.games.length, total: feed.total })}
				</p>
			{/if}
		{/snippet}

		{#if feed.unavailable}
			<p class="m-0 text-sm text-danger" role="alert">{m.arena_unavailable()}</p>
		{/if}

		{#if !feed.loaded}
			{#if !feed.unavailable}
				<p class="m-0 flex items-center gap-2 text-sm text-content-muted" role="status">
					<Spinner />
					{m.arena_live_loading()}
				</p>
			{/if}
		{:else if matching.length === 0}
			<div class="flex flex-col items-start gap-3 py-4">
				<p class="m-0 text-content-muted">
					{isFiltered(filters) ? m.arena_live_no_match() : m.arena_live_none()}
				</p>
				<!-- Nothing matched on the server's page only: a matching game may be running off it. -->
				{@render capNotice()}
				{#if isFiltered(filters)}
					<Button variant="secondary" onclick={clear}>{m.arena_live_clear()}</Button>
				{/if}
			</div>
		{:else}
			<ArenaLiveGames games={shown} {view} />

			<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
				<div class="flex flex-col gap-1 text-sm text-content-muted">
					<p class="m-0" role="status">
						{m.arena_live_showing({ shown: shown.length, count: matching.length })}
					</p>
					{@render capNotice()}
				</div>
				{#if more > 0}
					<Button variant="secondary" onclick={() => (limit += MORE_STEP)}>
						{m.arena_live_more({ count: more })}
					</Button>
				{/if}
			</div>
		{/if}
	{/if}

	<ArenaPlayBar />
</div>

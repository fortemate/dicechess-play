<script lang="ts">
	// The Arena overview (#259): the games being played now, as a page whose size does not depend
	// on how many there are. One featured game, six more, a link to all of them; then the bots
	// that wait for an opponent and the top of the rating board.
	//
	// The page owns the feed (`lib/arena/arenaFeed`) and hands plain values to four blocks, each
	// of which draws one thing. Which game is featured is the feed's business, not the page's.
	//
	// The full list of live games is its own page, `/arena/live` (#260).
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { ArenaFeed } from '#lib/arena/arenaFeed.svelte.js';
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import { m } from '#lib/paraglide/messages.js';
	import ArenaFeatured from '../../components/ArenaFeatured.svelte';
	import ArenaHead from '../../components/ArenaHead.svelte';
	import ArenaPlayBar from '../../components/ArenaPlayBar.svelte';
	import ArenaGames from '../../components/ArenaGames.svelte';
	import ArenaSeats from '../../components/ArenaSeats.svelte';
	import ArenaStandings from '../../components/ArenaStandings.svelte';

	const feed = new ArenaFeed();
	const live = isLiveEnabled();
	onMount(() => (live ? feed.start() : undefined));

	const allGamesHref = resolve('/arena/live');
</script>

<svelte:head>
	<title>{m.arena_meta_title()}</title>
	<meta name="description" content={m.arena_meta_description()} />
</svelte:head>

<div class="flex flex-col gap-5">
	<ArenaHead current="overview" total={feed.loaded ? feed.total : undefined} />

	{#if !live}
		<p class="m-0 text-content-muted">{m.arena_off()}</p>
	{:else}
		{#if feed.unavailable}
			<p class="m-0 text-sm text-danger" role="alert">{m.arena_unavailable()}</p>
		{/if}
		<div
			class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-6"
		>
			<ArenaFeatured view={feed.featured} loaded={feed.loaded} />
			<div class="flex flex-col gap-4 lg:gap-6">
				<ArenaGames games={feed.others} total={feed.total} allHref={allGamesHref} />
				<ArenaSeats seeks={feed.seeks} onstale={() => feed.refresh()} />
				<ArenaStandings />
			</div>
		</div>
	{/if}

	<ArenaPlayBar />
</div>

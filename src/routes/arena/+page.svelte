<script lang="ts">
	// The Arena overview (#259): the games being played now, as a page whose size does not depend
	// on how many there are. One featured game, six more, a link to all of them; then the bots
	// that wait for an opponent and the top of the rating board.
	//
	// The page owns the feed (`lib/arena/arenaFeed`) and hands plain values to four blocks, each
	// of which draws one thing. Which game is featured is the feed's business, not the page's.
	//
	// The full list of live games is its own page, `/arena/live` (#260). Until that exists the
	// link to "all live games" goes to the lobby, which shows them today.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { ArenaFeed } from '#lib/arena/arenaFeed.svelte.js';
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import { m } from '#lib/paraglide/messages.js';
	import ArenaFeatured from '../../components/ArenaFeatured.svelte';
	import ArenaGames from '../../components/ArenaGames.svelte';
	import ArenaSeats from '../../components/ArenaSeats.svelte';
	import ArenaStandings from '../../components/ArenaStandings.svelte';
	import Button from '../../components/ui/Button.svelte';
	import PageHeader from '../../components/ui/PageHeader.svelte';
	import TabNav from '../../components/ui/TabNav.svelte';

	const feed = new ArenaFeed();
	const live = isLiveEnabled();
	onMount(() => (live ? feed.start() : undefined));

	const allGamesHref = resolve('/lobby');
	const tabs = $derived([
		{ href: resolve('/arena'), label: m.arena_tab_overview(), current: true },
		{
			href: allGamesHref,
			label: m.arena_tab_live(),
			short: m.arena_tab_live_short(),
			current: false,
			count: feed.loaded ? feed.total : undefined,
		},
	]);
</script>

<svelte:head>
	<title>{m.arena_meta_title()}</title>
	<meta name="description" content={m.arena_meta_description()} />
</svelte:head>

{#snippet playButton(block: boolean)}
	<Button href={resolve('/play')} variant="primary" size="lg" {block}>
		{m.arena_play()}
		<span aria-hidden="true">→</span>
	</Button>
{/snippet}

<div class="flex flex-col gap-5">
	<PageHeader title={m.arena_title()} lead={m.arena_lead()}>
		{#snippet actions()}
			<span class="max-sm:hidden">{@render playButton(false)}</span>
		{/snippet}
	</PageHeader>

	<TabNav label={m.arena_tabs_label()} items={tabs} />

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

	<!-- On a phone the way to a game of one's own stays in reach, above the bottom navigation of
	     the current shell (57 px); the new navigation (#264) brings its own offset. -->
	<div class="sticky bottom-[calc(3.5625rem+env(safe-area-inset-bottom))] z-30 pb-2 sm:hidden">
		{@render playButton(true)}
	</div>
</div>

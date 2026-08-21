<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { localGamesStore } from '$lib/stores/localGamesStore.svelte';
	import { myGamesStore, playerGamesStore } from '$lib/stores/playerGamesStore.svelte';
	import { myOpponentsStore, playerOpponentsStore } from '$lib/stores/playerOpponentsStore.svelte';
	import { authStore } from '$lib/authStore.svelte';
	import { mergeGameHistory } from '$lib/stores/gameHistoryMerge';
	import { paginateGameHistory } from '$lib/stores/gameHistoryPagination';
	import {
		parseGamesFilters,
		serverVsParam,
		filterLocalGames,
		liveGamesVisible,
		opponentOptions,
		computeHeadToHead,
		vsParamValue,
		type GamesFilters,
	} from '$lib/games/gamesFilters';
	import { totalGames } from '$lib/stats/playerRecord';
	import GameHistoryCard from '../../components/GameHistoryCard.svelte';
	import LiveGameHistoryCard from '../../components/LiveGameHistoryCard.svelte';
	import GamesFilterBar from '../../components/GamesFilterBar.svelte';
	import WdlSummaryCard from '../../components/WdlSummaryCard.svelte';
	import BotBadge from '../../components/BotBadge.svelte';

	// "Show more" grows the render cap by one page (#150); 24 renders as 12 rows of the 2-column
	// grid below.
	const PAGE_SIZE = 24;

	onMount(() => {
		void localGamesStore.load();
	});

	// Whose server-side history this page shows (#229, the same split /me makes in #226): the
	// signed-in account's union — its own games plus every claimed guest, merged server-side —
	// or this browser's guest record. Both the games list and the opponent data (filter options,
	// head-to-head, totals) must draw from the SAME identity, or the filter offers opponents
	// whose games the list cannot show.
	const signedIn = $derived(authStore.status === 'signed-in');
	const gamesStore = $derived(signedIn ? myGamesStore : playerGamesStore);
	const opponentsStore = $derived(signedIn ? myOpponentsStore : playerOpponentsStore);

	// The session resolves asynchronously, so opponents load on the SETTLED status (matching /me):
	// fetching the guest aggregate during 'loading' would flash guest data at a signed-in player.
	$effect(() => {
		if (authStore.status === 'signed-in') void myOpponentsStore.load();
		else if (authStore.status !== 'loading') void playerOpponentsStore.load();
	});

	// The query string is the source of truth for every filter (#151) — shareable, back-button
	// friendly. Re-parsed reactively; a filter-only navigation never remounts this page (same
	// route), so this is the only thing that notices the change.
	const filters = $derived(parseGamesFilters(page.url));

	// vs/result narrow the *live* half on the server (#173) — never client-side over an
	// already-fetched page, which would break pagination (sparse pages, wrong hasMore). `source`
	// alone never needs a new request (the server has no notion of it), so this only reloads when
	// the server-relevant signature actually changed — a bare $effect over `filters` would
	// over-fire on every source-only change. reset() discards a request from before the change if
	// it lands after the new one (the store's own guard). The identity is part of the signature
	// (#229): the fetch waits for the session to settle instead of loading guest games it would
	// immediately throw away, and a runtime sign-out re-fires it against the guest store.
	let lastServerFilterKey: string | null = null;
	$effect(() => {
		if (authStore.status === 'loading') return;
		const store = gamesStore;
		const vs = serverVsParam(filters.vs);
		const result = filters.result ?? undefined;
		const key = `${signedIn ? 'me' : 'guest'}|${vs ?? ''}|${result ?? ''}`;
		if (key === lastServerFilterKey) return;
		lastServerFilterKey = key;
		store.reset();
		void store.load({ vs, result });
	});

	// A newly filtered (or unfiltered) view starts its own reveal progress from the top — including
	// a source-only change, which the effect above deliberately does NOT refetch for.
	let renderCap = $state(PAGE_SIZE);
	$effect(() => {
		void filters;
		renderCap = PAGE_SIZE;
	});

	function updateFilters(next: GamesFilters): void {
		const params = new URLSearchParams();
		if (next.vs) params.set('vs', vsParamValue(next.vs));
		if (next.result) params.set('result', next.result);
		if (next.source) params.set('source', next.source);
		const query = params.toString();
		void goto(query ? resolve(`/games?${query}`) : resolve('/games'), {
			noScroll: true,
			keepFocus: true,
		});
	}

	const hasActiveFilters = $derived(
		filters.vs !== null || filters.result !== null || filters.source !== null,
	);

	// The local list (IndexedDB, near-instant) governs the loading/empty gates below, unchanged
	// from before live games were added: it must render promptly regardless of play-api's health,
	// so nothing here waits on the network fetch. A guest with live games but no local ones may
	// briefly see the empty state until that fetch resolves a moment later — a narrow, self-correcting
	// tradeoff in favour of never blocking the local list on network I/O.
	const filteredLocal = $derived(filterLocalGames(localGamesStore.games, filters));
	const showLive = $derived(liveGamesVisible(filters));
	const effectiveLive = $derived(showLive ? gamesStore.games : []);
	// A live fetch failure releases the boundary (see gameHistoryPagination.ts: nothing should stay
	// stuck behind a boundary that can never resolve further) but must NOT also hide "Show more" —
	// the server may genuinely still have more once the guest retries, and canFetchMore (below,
	// ungated by error) is what keeps that retry path alive instead of forcing a full page reload.
	const boundaryHasMore = $derived(showLive && !gamesStore.error && gamesStore.hasMore);
	const canFetchMore = $derived(showLive && gamesStore.hasMore);
	const history = $derived(mergeGameHistory(filteredLocal, effectiveLive));
	const paginated = $derived(
		paginateGameHistory(history, effectiveLive, boundaryHasMore, renderCap, canFetchMore),
	);

	function showMore(): void {
		const needsFetch = paginated.needsFetch;
		renderCap += PAGE_SIZE;
		if (needsFetch) void gamesStore.loadMore();
	}

	const options = $derived(opponentOptions(localGamesStore.games, opponentsStore.opponents));

	// The head-to-head summary shown above the list when `vs=` is active — always the true overall
	// record against that opponent, deliberately unaffected by result/source (see
	// computeHeadToHead's own doc comment for why).
	const headToHead = $derived(
		computeHeadToHead(
			filters.vs,
			localGamesStore.games,
			opponentsStore.opponents,
			gamesStore.games,
			showLive,
		),
	);

	// "Showing X of N" only when N is exact: a specific opponent (the same total the head-to-head
	// card already shows), or no filters at all (every local game plus the guest's whole lobby
	// total, #174). A result/source-only filter has no cheap exact denominator, so the line just
	// shows a bare count rather than a misleading mismatched one.
	const totalMatchingFilters = $derived.by(() => {
		if (filters.vs) return headToHead ? totalGames(headToHead.counts) : null;
		if (hasActiveFilters) return null;
		const lobbyTotal = opponentsStore.opponents.reduce((sum, o) => sum + o.games, 0);
		return localGamesStore.games.length + lobbyTotal;
	});
</script>

<section class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-bold text-content">Your games</h2>
		<p class="text-sm text-content-muted">Every game you've played — on this device and online.</p>
	</div>

	<GamesFilterBar {filters} {options} onChange={updateFilters} />

	{#if headToHead}
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<h3 class="text-lg font-bold text-content">{headToHead.label}</h3>
				{#if headToHead.isBot}<BotBadge />{/if}
			</div>
			<WdlSummaryCard counts={headToHead.counts} />
		</div>
	{/if}

	<!-- Hoisted above the branches below (rather than duplicated inside the non-empty one): a guest
	     whose local list is empty but who HAS played lobby games must still be told the live fetch
	     failed, not shown a bare "you haven't played any games yet" that contradicts what they know
	     to be true. -->
	{#if gamesStore.error}
		<div
			class="rounded-xl border border-danger/30 bg-danger/10 p-3 text-center text-xs text-danger"
		>
			{gamesStore.error}
		</div>
	{/if}

	{#if !localGamesStore.loaded && !localGamesStore.error}
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-busy="true">
			{#each Array.from({ length: 4 }) as _, i (i)}
				<div class="h-40 rounded-2xl bg-surface/40 border border-border animate-pulse"></div>
			{/each}
		</div>
	{:else if localGamesStore.error && history.length === 0}
		<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-center text-danger">
			Couldn't load your games: {localGamesStore.error}
		</div>
	{:else if history.length === 0}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			{#if hasActiveFilters}
				<p class="text-content-muted">No games match these filters.</p>
				<button
					type="button"
					onclick={() => updateFilters({ vs: null, result: null, source: null })}
					class="px-6 py-3 rounded-xl bg-primary text-primary-content font-bold shadow-lg shadow-primary/30 hover:bg-primary-hover transition-colors"
				>
					Reset filters
				</button>
			{:else}
				<p class="text-content-muted">You haven't played any games yet.</p>
				<a
					href={resolve('/play')}
					class="px-6 py-3 rounded-xl bg-primary text-primary-content font-bold shadow-lg shadow-primary/30 hover:bg-primary-hover transition-colors"
				>
					Play your first game →
				</a>
			{/if}
		</div>
	{:else}
		{#if localGamesStore.error}
			<div
				class="rounded-xl border border-danger/30 bg-danger/10 p-3 text-center text-xs text-danger"
			>
				Couldn't refresh your games: {localGamesStore.error}
			</div>
		{/if}
		<p class="text-xs text-content-muted">
			Showing {paginated.visible.length}{totalMatchingFilters !== null
				? ` of ${totalMatchingFilters}`
				: ''} game{paginated.visible.length === 1 ? '' : 's'}
		</p>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			{#each paginated.visible as item (item.source === 'local' ? item.game.id : item.game.gameId)}
				{#if item.source === 'local'}
					<GameHistoryCard game={item.game} />
				{:else}
					<LiveGameHistoryCard game={item.game} />
				{/if}
			{/each}
		</div>
		{#if paginated.canShowMore}
			<button
				type="button"
				onclick={showMore}
				disabled={gamesStore.loading}
				class="self-center px-6 py-2.5 rounded-xl bg-surface border border-border text-content font-bold hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			>
				{gamesStore.loading ? 'Loading…' : 'Show more'}
			</button>
		{/if}
	{/if}
</section>

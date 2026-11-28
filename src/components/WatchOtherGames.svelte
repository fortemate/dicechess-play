<script lang="ts">
	// "More live games" beside a game being watched (#263): a few other games, each a link that
	// opens it for watching, and a link to all of them. It draws what the page hands it and
	// reads no server.
	import { resolve } from '$app/paths';
	import type { LiveGame } from '#lib/live/liveTypes.js';
	import { OTHER_GAMES, pairing, progress } from '#lib/live/watching.js';
	import { m } from '#lib/paraglide/messages.js';
	import Card from './ui/Card.svelte';

	let {
		games,
		total,
		id,
	}: {
		/** The other live games, the most notable first. */
		games: LiveGame[];
		/** How many games are being played in all, the watched one included. */
		total: number;
		id?: string;
	} = $props();

	const shown = $derived(games.slice(0, OTHER_GAMES));
</script>

<Card as="section" {id} aria-labelledby="{id}-title" class="flex flex-col">
	<h2
		id="{id}-title"
		class="m-0 pb-2 text-xs font-bold tracking-wider text-content-muted uppercase"
	>
		{m.game_watch_more()}
	</h2>
	{#if shown.length === 0}
		<p class="m-0 border-t border-border py-3 text-sm text-content-muted">
			{m.game_watch_more_none()}
		</p>
	{:else}
		<ul class="m-0 flex list-none flex-col p-0">
			{#each shown as game (game.gameId)}
				<li class="border-t border-border">
					<!-- A reload, not a client navigation: the page of a game holds one socket for its
					     whole life, and a new game starts from a clean one. -->
					<a
						href="{resolve('/live/[id]', { id: game.gameId })}?spectate=1"
						data-sveltekit-reload
						class="flex min-h-11 flex-wrap items-center justify-between gap-x-3 py-2 text-content no-underline hover:bg-surface-hover focus-visible:focus-ring"
					>
						<span class="min-w-0 truncate font-semibold">{pairing(game)}</span>
						<span class="text-sm text-content-muted tabular-nums">{progress(game)}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
	<a
		href={resolve('/arena/live')}
		class="flex min-h-11 items-center gap-2 border-t border-border pt-2 font-bold text-content hover:underline focus-visible:focus-ring"
	>
		{m.game_watch_all({ count: total })}
		<span aria-hidden="true">→</span>
	</a>
</Card>

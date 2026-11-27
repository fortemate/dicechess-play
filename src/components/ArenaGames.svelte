<script lang="ts">
	// "More live games" on the Arena overview (#259): two games as small boards, four as rows of
	// text, then one link to all of them with the total. The block has the same size whether
	// seven games are being played or seven hundred, which is the point of the overview: the
	// full list is a page of its own.
	//
	// The games arrive already ordered (by the rule that picks the featured game) and without
	// the featured one. Every entry is a link to watch that game.
	//
	// "The same size" is meant literally: the six places have fixed heights and are kept when
	// fewer games are being played. Only when there is no other game at all does the block close
	// up to one line.
	import { resolve } from '$app/paths';
	import { fullmoveOf } from '#lib/live/boardGrid.js';
	import type { LiveGame, Seat } from '#lib/live/liveTypes.js';
	import { publicPlayer, seatLabel } from '#lib/live/playerLabel.js';
	import { timeControlTerms } from '#lib/live/timeControls.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatWholeNumber } from '../utils/formatters';
	import MiniBoard from './MiniBoard.svelte';
	import Card from './ui/Card.svelte';

	interface Props {
		/** The live games other than the featured one, in the order to show them. */
		games: readonly LiveGame[];
		/** How many games are being played in all. */
		total: number;
		/** Where the full list is. */
		allHref: string;
	}

	let { games, total, allHref }: Props = $props();

	const BOARDS = 2;
	const ROWS = 4;
	const boards = $derived(games.slice(0, BOARDS));
	const rows = $derived(games.slice(BOARDS, BOARDS + ROWS));

	const nameOf = (game: LiveGame, seat: Seat) =>
		publicPlayer(game.players, seat)?.name ?? seatLabel(seat);
	const ratingOf = (game: LiveGame, seat: Seat) => publicPlayer(game.players, seat)?.rating;
	const termsOf = (game: LiveGame) =>
		m.arena_featured_terms({
			terms: timeControlTerms(game.timeControl),
			move: fullmoveOf(game.dfen),
		});
	const watchLabel = (game: LiveGame) =>
		m.arena_games_watch({
			white: nameOf(game, 'White'),
			black: nameOf(game, 'Black'),
			terms: termsOf(game),
		});
	const linkClass =
		'rounded-control text-content no-underline transition-colors hover:bg-surface-hover focus-visible:focus-ring';
</script>

<Card as="section" padding="lg" aria-labelledby="arena-games-title" class="flex flex-col gap-1">
	<div class="flex items-baseline justify-between gap-4 border-b border-border pb-2">
		<h2
			id="arena-games-title"
			class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase"
		>
			{m.arena_games_title()}
		</h2>
		<span class="text-sm text-content-muted">{m.arena_games_count({ count: total })}</span>
	</div>

	{#if games.length === 0}
		<!-- Nothing else is being played: one line says so. Empty places are kept only while there
		     is a list to keep steady. -->
		<p class="m-0 py-3 text-sm text-content-muted">{m.arena_games_none()}</p>
	{:else}
		<!-- Six places: two boards and four rows. A place without a game is left empty rather than
	     closed up, so the block keeps its height while games start and end, and the buttons of
	     the blocks below do not move under the visitor's hand. -->
		<ul class="m-0 flex list-none flex-col p-0">
			{#each { length: BOARDS } as _, index (index)}
				{@const game = boards[index]}
				<li class="h-29 border-b {game ? 'border-border' : 'border-transparent'}">
					{#if game}
						<a
							href={resolve('/live/[id]', { id: game.gameId })}
							aria-label={watchLabel(game)}
							class="-mx-2 flex h-full items-center gap-4 px-2 {linkClass}"
						>
							<span class="w-24 shrink-0"><MiniBoard fen={game.dfen} /></span>
							<span class="flex min-w-0 flex-1 flex-col gap-1">
								{#each ['Black', 'White'] as const as seat (seat)}
									{@const rating = ratingOf(game, seat)}
									<span class="flex items-baseline justify-between gap-3">
										<span class="truncate font-semibold">{nameOf(game, seat)}</span>
										{#if rating !== undefined}
											<span class="text-sm text-content-muted tabular-nums">
												{formatWholeNumber(rating)}
											</span>
										{/if}
									</span>
								{/each}
								<span class="truncate text-xs text-content-muted">{termsOf(game)}</span>
							</span>
						</a>
					{/if}
				</li>
			{/each}
			{#each { length: ROWS } as _, index (index)}
				{@const game = rows[index]}
				<li class="h-14 border-b sm:h-11 {game ? 'border-border' : 'border-transparent'}">
					{#if game}
						<a
							href={resolve('/live/[id]', { id: game.gameId })}
							aria-label={watchLabel(game)}
							class="-mx-2 flex h-full flex-col justify-center gap-x-4 px-2 sm:flex-row sm:items-center sm:justify-between {linkClass}"
						>
							<span class="min-w-0 truncate font-semibold">
								{m.arena_games_versus({
									white: nameOf(game, 'White'),
									black: nameOf(game, 'Black'),
								})}
							</span>
							<span class="shrink-0 text-xs whitespace-nowrap text-content-muted">
								{termsOf(game)}
							</span>
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if total > 0}
		<!-- The caller passes an address it has resolved. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={allHref}
			class="mt-2 w-fit rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:focus-ring"
		>
			{m.arena_games_all({ count: total })}
			<span aria-hidden="true">→</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}
</Card>

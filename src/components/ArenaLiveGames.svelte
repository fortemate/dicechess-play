<script lang="ts">
	// The games of the Arena live list (#260), as rows or as small boards. Both views show the
	// same games in the same order; the page decides which games and how many.
	//
	// Every game is one link to watch it, the whole row or the whole card. Nothing here talks to
	// the server: a row is drawn from the listing, and so is a board, which is the static small
	// board redrawn on each read.
	//
	// A seat held by a person carries the "Player" tag in both views and on every screen width;
	// that tag is how a game with a human is told from a game of two bots at a glance. A person
	// without a rating says "unrated" where a rating would be.
	import { resolve } from '$app/paths';
	import { fullmoveOf } from '#lib/live/boardGrid.js';
	import type { LiveGame, Seat } from '#lib/live/liveTypes.js';
	import { publicPlayer, seatLabel } from '#lib/live/playerLabel.js';
	import { timeControlTerms } from '#lib/live/timeControls.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getPieceImage } from '#lib/utils/getPieceImage.js';
	import { formatWholeNumber } from '../utils/formatters';
	import MiniBoard from './MiniBoard.svelte';
	import Tag from './ui/Tag.svelte';

	interface Props {
		games: readonly LiveGame[];
		view: 'list' | 'boards';
	}

	let { games, view }: Props = $props();

	const seatOf = (game: LiveGame, seat: Seat) => {
		const face = publicPlayer(game.players, seat);
		const human = face?.kind === 'Human';
		return {
			seat,
			name: face?.name ?? (human ? m.common_player_anonymous() : seatLabel(seat)),
			human,
			bot: face?.kind === 'Bot',
			rating: face?.rating,
		};
	};
	const termsOf = (game: LiveGame) => timeControlTerms(game.timeControl);
	const watchLabel = (game: LiveGame) =>
		m.arena_games_watch({
			white: seatOf(game, 'White').name,
			black: seatOf(game, 'Black').name,
			terms: m.arena_featured_terms({ terms: termsOf(game), move: fullmoveOf(game.dfen) }),
		});

	// One set of columns for the head and for every row, from the `md` breakpoint.
	const COLUMNS = 'md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_9rem_4rem_5.5rem]';
	const headClass = 'text-xs font-bold tracking-widest text-content-muted uppercase';
</script>

{#snippet player(info: ReturnType<typeof seatOf>, botTag: 'wide' | 'never')}
	<span class="flex min-w-0 items-center gap-2">
		<!-- Which side: its king on a square of the board, the same in both themes. -->
		<span
			aria-hidden="true"
			class="flex size-5 shrink-0 items-center justify-center rounded bg-board-light"
		>
			<img
				src={getPieceImage(info.seat === 'White' ? 'K' : 'k')}
				alt=""
				class="size-4 select-none"
				draggable="false"
			/>
		</span>
		<span class="min-w-0 truncate font-semibold text-content">{info.name}</span>
		{#if info.human}
			<Tag tone="highlight">{m.arena_player()}</Tag>
		{:else if info.bot && botTag === 'wide'}
			<!-- Where there is room. The tag that must always show is the person's. -->
			<Tag class="max-md:hidden">{m.arena_bot()}</Tag>
		{/if}
		<span class="shrink-0 text-sm text-content-muted tabular-nums">
			{#if info.rating !== undefined}
				{formatWholeNumber(info.rating)}
			{:else if info.human}
				{m.arena_live_unrated()}
			{/if}
		</span>
	</span>
{/snippet}

{#if view === 'list'}
	<div class="rounded-card border border-border bg-surface px-4 md:px-5">
		<div aria-hidden="true" class="grid items-center gap-x-4 py-3 max-md:hidden {COLUMNS}">
			<span class={headClass}>{m.arena_live_col_white()}</span>
			<span class={headClass}>{m.arena_live_col_black()}</span>
			<span class={headClass}>{m.arena_live_col_speed()}</span>
			<span class={headClass}>{m.arena_live_col_move()}</span>
			<span></span>
		</div>
		<ul
			aria-label={m.arena_live_list_label()}
			class="m-0 flex list-none flex-col divide-y divide-border p-0 md:border-t md:border-border"
		>
			{#each games as game (game.gameId)}
				{@const move = fullmoveOf(game.dfen)}
				<li>
					<a
						href={resolve('/live/[id]', { id: game.gameId })}
						aria-label={watchLabel(game)}
						class="-mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-control px-2 py-2.5 text-content no-underline transition-colors hover:bg-surface-hover focus-visible:focus-ring md:min-h-13 {COLUMNS}"
					>
						<span class="col-start-1 row-start-1 min-w-0">
							{@render player(seatOf(game, 'White'), 'wide')}
						</span>
						<span class="col-start-1 row-start-2 min-w-0 md:col-start-2 md:row-start-1">
							{@render player(seatOf(game, 'Black'), 'wide')}
						</span>
						<span
							class="col-start-2 row-start-1 text-right text-sm whitespace-nowrap text-content-muted md:col-start-3 md:text-left md:text-content"
						>
							{termsOf(game)}
						</span>
						<span
							class="col-start-2 row-start-2 text-right text-sm whitespace-nowrap text-content-muted tabular-nums md:col-start-4 md:row-start-1 md:text-left md:text-content"
						>
							<span class="md:hidden">{m.arena_live_move({ move })}</span>
							<span class="max-md:hidden">{move}</span>
						</span>
						<span
							aria-hidden="true"
							class="text-right font-semibold whitespace-nowrap text-primary max-md:hidden md:col-start-5 md:row-start-1"
						>
							{m.arena_live_watch()} →
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
{:else}
	<ul
		aria-label={m.arena_live_list_label()}
		class="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 md:gap-4 lg:grid-cols-4"
	>
		{#each games as game (game.gameId)}
			<li>
				<a
					href={resolve('/live/[id]', { id: game.gameId })}
					aria-label={watchLabel(game)}
					class="flex h-full flex-col gap-2 rounded-card border border-border bg-surface p-3 text-content no-underline transition-colors hover:bg-surface-hover focus-visible:focus-ring"
				>
					{@render player(seatOf(game, 'Black'), 'never')}
					<MiniBoard fen={game.dfen} />
					{@render player(seatOf(game, 'White'), 'never')}
					<span class="truncate text-xs text-content-muted">
						{m.arena_featured_terms({ terms: termsOf(game), move: fullmoveOf(game.dfen) })}
					</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<script lang="ts">
	// The featured game of Arena (#259): both players with their ratings and clocks, the board,
	// and the dice of the side to move. Which game it is, and when it changes, is not decided
	// here (`lib/arena`): this card draws what it is given.
	//
	// The board is the static small board, redrawn on every read. It is a picture of a game to
	// look at, with a button to go and watch it; nothing on it can be moved.
	//
	// The clock of the side to move is counted down between reads, from the moment its value was
	// read, so it runs like a clock and is corrected by every read.
	import { resolve } from '$app/paths';
	import type { FeaturedView } from '#lib/arena/arenaFeed.svelte.js';
	import { fullmoveOf } from '#lib/live/boardGrid.js';
	import { formatClock } from '#lib/live/clockFormat.js';
	import { splitDfen } from '#lib/live/dfenUtils.js';
	import type { Seat } from '#lib/live/liveTypes.js';
	import { publicPlayer, seatLabel } from '#lib/live/playerLabel.js';
	import { timeControlTerms } from '#lib/live/timeControls.js';
	import { m } from '#lib/paraglide/messages.js';
	import { pieceList } from '#lib/turnCard.js';
	import { getPieceImage } from '#lib/utils/getPieceImage.js';
	import { formatWholeNumber } from '../utils/formatters';
	import MiniBoard from './MiniBoard.svelte';
	import Spinner from './Spinner.svelte';
	import Button from './ui/Button.svelte';
	import Card from './ui/Card.svelte';
	import Tag from './ui/Tag.svelte';

	interface Props {
		view: FeaturedView | null;
		/** The first list of games has arrived: before that the card is loading, not empty. */
		loaded: boolean;
	}

	let { view, loaded }: Props = $props();

	// The running clock: a tick a second while a game is on the card.
	let now = $state(Date.now());
	$effect(() => {
		if (view?.phase !== 'live') return;
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const game = $derived(view?.game);
	const live = $derived(view?.phase === 'live');
	const dice = $derived(game?.dfen ? splitDfen(game.dfen).dice : []);

	const seatInfo = (seat: Seat) => {
		const face = publicPlayer(game?.players, seat);
		const base = game?.clocks ? (seat === 'White' ? game.clocks.white : game.clocks.black) : null;
		const running = live && game?.activeSeat === seat;
		const elapsed = running && view ? Math.max(0, now - view.readAt) : 0;
		return {
			seat,
			name: face?.name ?? seatLabel(seat),
			bot: face?.kind === 'Bot',
			rating: face?.rating,
			running,
			clock: base === null ? null : Math.max(0, base - elapsed),
		};
	};
	// Black at the top, White at the bottom: the board is drawn from White's side.
	const top = $derived(seatInfo('Black'));
	const bottom = $derived(seatInfo('White'));

	const result = $derived.by(() => {
		const over = view?.over;
		if (!over) return null;
		// An aborted game has no winner and is not a draw either.
		if (over.termination === 'Aborted') return m.game_live_status_aborted();
		return 'Win' in over.result
			? m.arena_featured_won({ seat: seatLabel(over.result.Win.side) })
			: m.arena_featured_draw();
	});
	const turnLine = $derived(
		!game
			? ''
			: game.dicePending || dice.length === 0
				? m.arena_featured_to_roll({ seat: seatLabel(game.activeSeat) })
				: m.arena_featured_to_move({ seat: seatLabel(game.activeSeat) }),
	);
</script>

{#snippet player(info: ReturnType<typeof seatInfo>)}
	<div class="flex items-center gap-2">
		<!-- Which side this is: its king on a square of the board. A plain light or dark dot would
		     turn into its opposite with the theme. -->
		<span
			aria-hidden="true"
			class="flex size-6 shrink-0 items-center justify-center rounded bg-board-light"
		>
			<img
				src={getPieceImage(info.seat === 'White' ? 'K' : 'k')}
				alt=""
				class="size-5 select-none"
				draggable="false"
			/>
		</span>
		<span class="sr-only">{seatLabel(info.seat)}:</span>
		<span class="min-w-0 truncate font-semibold text-content">{info.name}</span>
		{#if info.bot}<Tag>{m.arena_bot()}</Tag>{/if}
		{#if info.rating !== undefined}
			<span class="text-sm text-content-muted tabular-nums">
				<span class="sr-only">{m.arena_rating({ rating: formatWholeNumber(info.rating) })}</span>
				<span aria-hidden="true">{formatWholeNumber(info.rating)}</span>
			</span>
		{/if}
		{#if info.clock !== null}
			<span
				aria-label={m.arena_featured_clock({ name: info.name, time: formatClock(info.clock) })}
				class="ms-auto min-w-[5.25rem] shrink-0 rounded-lg border px-2.5 py-0.5 text-right font-mono text-xl font-bold tabular-nums
					{info.running
					? 'border-highlight-content/50 bg-highlight text-highlight-content'
					: 'border-transparent bg-surface-hover text-content'}"
			>
				{formatClock(info.clock)}
			</span>
		{/if}
	</div>
{/snippet}

<Card
	as="section"
	raised
	padding="lg"
	aria-labelledby="arena-featured-title"
	class="flex flex-col gap-3"
>
	<h2 id="arena-featured-title" class="sr-only">{m.arena_featured_title()}</h2>

	{#if view && game}
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
			<span
				class="flex items-center gap-2 text-xs font-bold tracking-widest uppercase {live
					? 'text-success'
					: 'text-content-muted'}"
			>
				<span
					aria-hidden="true"
					class="size-2 rounded-full {live ? 'bg-success' : 'bg-content-muted'}"
				></span>
				{live ? m.arena_featured_live() : m.arena_featured_final()}
			</span>
			<span class="text-sm text-content-muted">
				{m.arena_featured_terms({
					terms: timeControlTerms(game.timeControl),
					move: fullmoveOf(game.dfen),
				})}
			</span>
		</div>

		{@render player(top)}
		<div class="overflow-hidden rounded-xl">
			<MiniBoard fen={game.dfen} />
		</div>
		{@render player(bottom)}

		<div class="flex flex-wrap items-center gap-3 border-t border-border pt-3">
			{#if result}
				<p class="m-0 font-semibold text-content" role="status">{result}</p>
			{:else}
				{#if dice.length > 0 && !game.dicePending}
					<ul
						class="m-0 flex list-none gap-1.5 p-0"
						aria-label={m.arena_featured_dice({ pieces: pieceList(dice) })}
					>
						{#each dice as die, index (index)}
							<li
								class="flex size-11 items-center justify-center rounded-lg border-2 border-primary/60 bg-dice-surface"
							>
								<img src={getPieceImage(die)} alt="" class="size-8 select-none" draggable="false" />
							</li>
						{/each}
					</ul>
				{/if}
				<p class="m-0 font-semibold text-content">{turnLine}</p>
			{/if}
			<Button
				href={resolve('/live/[id]', { id: game.gameId })}
				variant="secondary"
				class="ms-auto"
				aria-label={m.arena_featured_watch()}
			>
				<span class="sm:hidden">{m.arena_featured_watch_short()}</span>
				<span class="max-sm:hidden">{m.arena_featured_watch()}</span>
			</Button>
		</div>
	{:else if !loaded}
		<p class="m-0 flex items-center gap-2 py-10 text-sm text-content-muted" role="status">
			<Spinner />
			{m.arena_featured_loading()}
		</p>
	{:else}
		<div class="flex flex-col items-start gap-1 py-8">
			<p class="m-0 text-lg font-semibold text-content">{m.arena_featured_empty_title()}</p>
			<p class="m-0 text-sm text-content-muted">{m.arena_featured_empty_text()}</p>
		</div>
	{/if}
</Card>

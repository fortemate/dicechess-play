<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Key } from '@lichess-org/chessground/types';
	import type { BoardStore } from '$lib/boardStore';
	import { m } from '$lib/paraglide/messages.js';
	import Board from '../Board.svelte';
	import PlayerStrip from '../PlayerStrip.svelte';
	import ShowcaseHeader from './ShowcaseHeader.svelte';
	import ShowcaseStatus from './ShowcaseStatus.svelte';
	import ShowcaseDice from './ShowcaseDice.svelte';
	import ShowcaseAction from './ShowcaseAction.svelte';
	import type { ShowcaseColor, ShowcaseIntent, ShowcaseState } from './types';

	interface Props {
		state: ShowcaseState;
		onIntent?: (intent: ShowcaseIntent) => void;
	}

	let { state, onIntent }: Props = $props();

	// Orientation of the board
	const boardOrientation = $derived.by<ShowcaseColor>(() => {
		switch (state.kind) {
			case 'open':
			case 'claiming':
				return state.assignedColor;
			case 'live-player':
				return state.playerColor;
			case 'live-spectator':
				return 'w';
			case 'reconnecting':
			case 'finishing':
				return state.playerColor ?? 'w';
			case 'reset':
			case 'unavailable':
				return 'w';
		}
	});

	const boardActiveColor = $derived.by<ShowcaseColor>(() => {
		if (state.kind === 'live-player' || state.kind === 'live-spectator') {
			return state.activeColor;
		}
		return 'w';
	});

	const boardGameStatus = $derived.by<string>(() => {
		return state.kind === 'live-player' ? 'playing' : 'idle';
	});

	const boardLegalMoves = $derived.by<Map<Key, Key[]>>(() => {
		if (state.kind === 'live-player' && state.legalMovesDests) {
			return state.legalMovesDests;
		}
		return new Map();
	});

	const boardLastMove = $derived.by<Key[] | undefined>(() => {
		if (
			state.kind === 'live-player' ||
			state.kind === 'live-spectator' ||
			state.kind === 'finishing' ||
			state.kind === 'reconnecting'
		) {
			return state.lastMove;
		}
		return undefined;
	});

	// Adapter conforming to BoardStore for Board.svelte
	const boardStore = $derived<BoardStore>({
		currentBoardFen: state.boardFen,
		activeColor: boardActiveColor,
		playerColor: boardOrientation,
		gameStatus: boardGameStatus,
		legalMovesDests: boardLegalMoves,
		isViewingHistory: false,
		lastMove: boardLastMove,
		handleBoardMove(orig: string, dest: string) {
			onIntent?.({ type: 'move', orig, dest });
		},
	});

	const topActive = $derived.by<boolean>(() => {
		if (state.topPlayer.active !== undefined) return state.topPlayer.active;
		if (state.kind === 'live-player') return state.activeColor !== state.playerColor;
		if (state.kind === 'live-spectator') return state.activeColor === 'b';
		return false;
	});

	const bottomActive = $derived.by<boolean>(() => {
		if (state.bottomPlayer.active !== undefined) return state.bottomPlayer.active;
		if (state.kind === 'live-player') return state.activeColor === state.playerColor;
		if (state.kind === 'live-spectator') return state.activeColor === 'w';
		return false;
	});

	const isReconnecting = $derived(state.kind === 'reconnecting');

	// The live-player action is a compact control (the resign flag, see ShowcaseAction); every other
	// action is a full-width button. On phones the compact one sits at the right end of the dice row.
	const actionInline = $derived(state.kind === 'live-player');
</script>

<svelte:head>
	<title>{m.home_showcase_title()} — {m.home_brand_name()}</title>
	<meta name="description" content={m.home_open_body()} />
	<meta property="og:title" content="{m.home_showcase_title()} — {m.home_brand_name()}" />
	<meta property="og:description" content={m.home_open_body()} />
	<meta property="og:image" content="/fortemate-mark.svg" />
</svelte:head>

<div
	data-surface="showcase"
	class="min-h-screen flex flex-col bg-background text-content transition-colors duration-300"
>
	<ShowcaseHeader />

	<main
		class="flex-grow w-full max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-2 sm:py-6 flex flex-col justify-center"
	>
		<!-- Desktop / Tablet Grid and Mobile Stack -->
		<div
			class="w-full flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[minmax(0,1fr)_320px] md:items-start gap-3 sm:gap-4 lg:gap-6"
		>
			<!-- Board Column: Left.
			     Phones: the board takes the full width unless the viewport is too short for everything
			     above the footer: header 48 + main padding 16 + two 48px seat strips + gaps 28 + the
			     open-table card 118 + 6px slack = 310px. The footer is deliberately outside that budget,
			     so on a short phone the board keeps its width and the footer is what drops below the
			     fold. `svh`, so a mobile browser's collapsing toolbar cannot resize the board mid-game. -->
			<div
				class="w-full flex flex-col items-center gap-2 sm:gap-2.5 mx-auto max-w-[min(100vw-24px,max(240px,calc(100svh-310px)))] md:max-w-[min(480px,max(240px,calc(100dvh-180px)))] lg:max-w-[min(560px,max(240px,calc(100dvh-200px)))]"
			>
				<div class="w-full {isReconnecting ? 'opacity-60 transition-opacity' : ''}">
					<PlayerStrip
						name={state.topPlayer.name}
						sub={state.topPlayer.sub}
						bot={state.topPlayer.bot}
						active={topActive}
						thinking={state.topPlayer.thinking}
						clockMs={state.clocks.topMs}
						rating={state.topPlayer.rating}
						href={state.topPlayer.href}
						compact
					/>
				</div>

				<!-- Single persistent board instance with fixed aspect ratio -->
				<div
					class="relative w-full aspect-square shadow-md rounded-xl overflow-hidden {isReconnecting
						? 'opacity-70'
						: ''}"
				>
					<Board store={boardStore} />
				</div>

				<div class="w-full {isReconnecting ? 'opacity-60 transition-opacity' : ''}">
					<PlayerStrip
						name={state.bottomPlayer.name}
						sub={state.bottomPlayer.sub}
						bot={state.bottomPlayer.bot}
						active={bottomActive}
						thinking={state.bottomPlayer.thinking}
						clockMs={state.clocks.bottomMs}
						rating={state.bottomPlayer.rating}
						href={state.bottomPlayer.href}
						compact
					/>
				</div>
			</div>

			<!-- Rail Column: Right on desktop/tablet, stacked below on mobile -->
			<div
				class="w-full md:w-[280px] lg:w-[320px] md:shrink-0 flex flex-col gap-2 md:gap-3 rounded-2xl border border-border bg-surface p-2 md:p-0 md:bg-transparent md:border-none"
			>
				<!-- On phones the card is one flex-wrap flow. Row 1: the dice, with the status badge (or, in
				     live play, the resign control) at the right edge. The status message and a full-width
				     action (claim, retry, reset…) wrap onto rows of their own. ShowcaseStatus renders as
				     `contents` on phones so its badge (order 2) and message (order 3) join this flow
				     directly. On md+ the wrapper dissolves and the rail is a column: status, dice, action. -->
				<div class="flex flex-wrap items-center gap-2 md:contents">
					<div class="order-1 min-w-0 flex-1 md:order-2 md:flex-none">
						<ShowcaseDice {state} />
					</div>
					<ShowcaseStatus {state} />
					<div class="{actionInline ? 'order-2 shrink-0' : 'order-4 w-full'} md:order-3 md:w-full">
						<ShowcaseAction {state} {onIntent} />
					</div>
				</div>

				<!-- /play alternative escape hatch card (Desktop / Tablet) -->
				<div
					class="order-4 hidden md:flex h-[52px] items-center justify-between rounded-xl border border-border bg-surface/60 px-3 py-2 text-xs"
				>
					<span class="truncate text-content-muted text-[11px] lg:text-xs">
						{m.home_spectator_play_alt()}
					</span>
					<a
						href={resolve('/play')}
						class="shrink-0 font-bold text-primary hover:text-primary-hover hover:underline ml-2 text-xs"
					>
						{m.home_nav_play_bots()} →
					</a>
				</div>
			</div>
		</div>
	</main>

	<!-- Restrained Showcase Footer (32px) -->
	<footer
		class="w-full border-t border-border bg-surface/30 py-2 text-center text-xs text-content-muted"
	>
		<div
			class="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-1 sm:gap-2"
		>
			<p class="hidden text-[11px] text-content-muted/80 sm:block">
				{m.home_footer_summary()}
			</p>
			<p class="text-[11px] text-content-muted/60 flex items-center gap-2">
				<a href={resolve('/rules')} class="hover:text-content hover:underline">
					{m.home_nav_how_to_play()}
				</a>
				<span>·</span>
				<a href={resolve('/licenses')} class="hover:text-content hover:underline">
					{m.home_nav_licenses()}
				</a>
			</p>
		</div>
	</footer>
</div>

<style>
	[data-surface='showcase'] {
		--showcase-board-max: min(560px, calc(100dvh - 200px));
		--showcase-rail-width: 320px;
		--showcase-strip-height: 56px;
		--showcase-dice-slot-height: 104px;
		--showcase-action-slot-height: 56px;
		--showcase-status-slot-height: 64px;
	}

	@media (prefers-reduced-motion: reduce) {
		:global([data-surface='showcase'] *) {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>

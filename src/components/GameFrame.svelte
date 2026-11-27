<script lang="ts">
	// The one frame of a game in progress (#255), shared by the practice game and the live game.
	// Each of the two pages used to lay the game out itself, with the same grid written twice.
	//
	//   - A slim top bar: leave, the title of the game, a status slot and the sound switch. The
	//     site header is not shown during a game (the pages set `chromeStore.zen`).
	//   - Desktop: the board with a player strip above and below, and ONE side rail with the turn
	//     card, the move list and the actions.
	//   - Phone: a full-width board, the card below it and the actions as a bar that stays at the
	//     bottom of the screen. The move list is a sheet over the lower part of the screen, opened
	//     from that bar, so the board stays in view.
	//
	// It is layout only. The frame holds no game state and reads no store: every part is a
	// snippet or a value the page passes from its own stores, so the rule that game logic reads
	// the live fields and never the presentation getters stays where it was, in the pages and
	// the stores. The one thing the frame owns is local to the screen: whether the move sheet is
	// open on a phone, and where keyboard focus goes when it opens and closes.
	//
	// Every part exists once in the DOM and is placed by CSS for both layouts. That matters
	// beyond tidiness: the pages' tests and the smoke test find a control by its name, and a
	// second copy for the other layout would make each name ambiguous.
	import { tick, type Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface MovesControl {
		/** Whether the move sheet is open (phones only; on a wider screen the list is always shown). */
		open: boolean;
		/** The id of the element that holds the list, for `aria-controls`. */
		controls: string;
		toggle: () => void;
	}

	interface Props {
		/** What this game is, e.g. "Greedy · level 3 · 5 + 3". */
		title: string;
		/** Leave by navigation... */
		leaveHref?: string;
		/** ...or by an action of the page. One of the two. */
		onleave?: () => void;
		/** The sound switch of the top bar: the page's preference and how to flip it. */
		sound: { enabled: boolean; toggle: () => void };
		/** Identifies the game on screen. When it changes, the move sheet of a phone closes: a page
		 * that is reused for the next game (a rematch, a spectator following one) must not open
		 * it with the lower part of the screen covered. */
		gameKey?: unknown;
		/** Badges at the right of the top bar: connection state, "Spectating". */
		status?: Snippet;
		/** The player strip above the board. */
		top: Snippet;
		/** The board with its overlays. */
		board: Snippet;
		/** Under the board: the step controls of a finished or watched game, a "return to live"
		 * banner. A player in a game has neither (#279), and the row then takes no space. */
		underBoard?: Snippet;
		/** The player strip below the board. */
		bottom: Snippet;
		/** The first card of the rail: the turn card, a pending draw offer, or the result. */
		card: Snippet;
		/** More rail content under the card. */
		extra?: Snippet;
		/** The move list. Receives the function that closes the sheet on a phone. */
		moves: Snippet<[() => void]>;
		/** The actions of the game. Receives what the "Moves" button of a phone needs. */
		actions?: Snippet<[MovesControl]>;
	}

	let {
		title,
		leaveHref,
		onleave,
		sound,
		gameKey,
		status,
		top,
		board,
		underBoard,
		bottom,
		card,
		extra,
		moves,
		actions,
	}: Props = $props();

	const movesId = $props.id();
	let movesOpen = $state(false);
	let movesPanel = $state<HTMLElement | undefined>();

	// Opening the sheet moves keyboard focus into it, and closing it gives focus back to the
	// button that opened it. The list precedes that button in the page, so without this a
	// keyboard user would tab past what they just opened, and closing it would leave focus on a
	// button that is no longer shown. On a wider screen there is no sheet and none of this runs:
	// the "Moves" button and the close button are both hidden there.
	async function openMoves() {
		movesOpen = true;
		await tick();
		movesPanel?.querySelector<HTMLElement>('button, a[href]')?.focus();
	}
	async function closeMoves() {
		if (!movesOpen) return;
		movesOpen = false;
		await tick();
		document.querySelector<HTMLElement>(`[aria-controls="${movesId}"]`)?.focus();
	}

	// A new game on the same page starts with the sheet closed. The key is compared by value:
	// the effect also runs when the page merely re-reads the same key (any navigation re-reads
	// `page.params`), and that must not close a sheet the visitor has open.
	let seenKey: unknown;
	let keySeen = false;
	$effect(() => {
		const key = gameKey;
		if (keySeen && key !== seenKey) movesOpen = false;
		seenKey = key;
		keySeen = true;
	});

	const BAR_BUTTON =
		'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-control border border-border-strong bg-transparent px-2.5 text-sm font-semibold text-content no-underline transition-colors hover:bg-surface-hover focus-visible:focus-ring';
</script>

{#snippet leaveContent()}
	<svg
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M19 12H6M11 6l-6 6 6 6" />
	</svg>
	<span class="max-sm:hidden" aria-hidden="true">{m.game_frame_leave_short()}</span>
{/snippet}

<div class="flex w-full flex-col gap-2.5 md:gap-3" data-game-frame>
	<header class="flex min-h-11 items-center gap-2">
		{#if leaveHref}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the page passes a path it has resolved -->
			<a href={leaveHref} aria-label={m.game_frame_leave()} class={BAR_BUTTON}>
				{@render leaveContent()}
			</a>
		{:else}
			<button type="button" onclick={onleave} aria-label={m.game_frame_leave()} class={BAR_BUTTON}>
				{@render leaveContent()}
			</button>
		{/if}
		<h1 class="m-0 min-w-0 flex-1 truncate text-base font-bold text-content">{title}</h1>
		{#if status}
			<div class="flex shrink-0 items-center gap-1.5">{@render status()}</div>
		{/if}
		<button
			type="button"
			onclick={sound.toggle}
			aria-label={m.game_frame_sound()}
			aria-pressed={sound.enabled}
			title={sound.enabled ? m.game_frame_sound_on() : m.game_frame_sound_off()}
			class="{BAR_BUTTON} {sound.enabled ? '' : 'text-content-muted'}"
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M11 5.5 6.5 9H3.5v6h3l4.5 3.5z" />
				{#if sound.enabled}
					<path d="M14.5 9.5a3.6 3.6 0 0 1 0 5" /><path d="M17 7.5a6.5 6.5 0 0 1 0 9" />
				{:else}
					<path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
				{/if}
			</svg>
		</button>
	</header>

	<div
		class="flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-stretch md:gap-4 lg:grid-cols-[minmax(0,1fr)_22.5rem]"
	>
		<!-- The board column. On a phone held upright the board is as wide as the screen, whatever
		     its height: the board is the game, and the card below it can be scrolled to. Where
		     height is the tighter limit, the board is as tall as the screen leaves after the top
		     bar, the two player strips and the step controls: from md up, and on a phone held
		     sideways. The step controls are counted even while a player's game hides them (#279),
		     so the board does not change size when the game ends and they appear. The 200px floor
		     keeps the board from collapsing there. -->
		<div class="flex min-w-0 justify-center">
			<div
				class="flex w-full max-w-[560px] flex-col gap-2.5 max-md:landscape:max-w-[min(560px,max(200px,calc(100dvh-15rem)))] md:max-w-[max(200px,calc(100dvh-18.5rem))]"
			>
				{@render top()}
				{@render board()}
				{#if underBoard}{@render underBoard()}{/if}
				{@render bottom()}
			</div>
		</div>

		<div
			class="flex min-w-0 flex-col gap-2.5 md:sticky md:top-4 md:max-h-[calc(100dvh-6rem)] md:self-start md:min-h-[min(100%,calc(100dvh-6rem))]"
		>
			{@render card()}
			{#if extra}{@render extra()}{/if}
			<div
				id={movesId}
				bind:this={movesPanel}
				class="md:flex md:min-h-44 md:flex-1 md:flex-col {movesOpen
					? 'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:h-[40dvh]'
					: 'max-md:hidden'}"
			>
				{@render moves(closeMoves)}
			</div>
			{#if actions}
				<div
					class="max-md:sticky max-md:bottom-0 max-md:z-30 max-md:-mx-3 max-md:border-t max-md:border-border max-md:bg-background max-md:px-3 max-md:py-2"
				>
					{@render actions({
						open: movesOpen,
						controls: movesId,
						toggle: () => (movesOpen ? closeMoves() : openMoves()),
					})}
				</div>
			{/if}
		</div>
	</div>
</div>

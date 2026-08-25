<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { onMount } from 'svelte';
	import { playWithBotStore as store } from '$lib/playWithBot';
	import Board from '../../components/Board.svelte';
	import MoveHistory from '../../components/MoveHistory.svelte';
	import PawnPromotionSelector from '../../components/PawnPromotionSelector.svelte';
	import PlayerStrip from '../../components/PlayerStrip.svelte';
	import GameEndModal from '../../components/GameEndModal.svelte';
	import DicePanel from '../../components/DicePanel.svelte';
	import { chromeStore } from '$lib/stores/chromeStore.svelte';
	import { preferencesStore } from '$lib/preferencesStore.svelte';
	import { preloadSounds } from '$lib/sound';
	import { endReasonLabel } from '$lib/gameOutcome';
	import { flushOutbox } from '$lib/ingest/outbox';
	import { BOTS, PLAYABLE_BOTS } from '$lib/bots';

	const COLORS = ['white', 'black', 'random'] as const;

	/** Bot-game time controls map onto the store's minutes-limit + seconds-bonus model.
	 * Unlimited first: a casual bot game shouldn't surprise anyone with a flag fall.
	 * "Unlimited" (not "No clock") to match the term used across the live/lobby surface
	 * and the server's TimeControl ADT variant. */
	const TIME_PRESETS: {
		label: string;
		group: string;
		limit: number | null;
		bonus: number;
	}[] = [
		{ label: 'Unlimited', group: 'Casual', limit: null, bonus: 0 },
		{ label: '3 + 2', group: 'Blitz', limit: 3, bonus: 2 },
		{ label: '5 min', group: 'Blitz', limit: 5, bonus: 0 },
		{ label: '5 + 3', group: 'Blitz', limit: 5, bonus: 3 },
		{ label: '10 min', group: 'Rapid', limit: 10, bonus: 0 },
		{ label: '10 + 5', group: 'Rapid', limit: 10, bonus: 5 },
		{ label: '15 + 10', group: 'Rapid', limit: 15, bonus: 10 },
	];
	const TIME_GROUPS = ['Casual', 'Blitz', 'Rapid'].map((g) => ({
		label: g,
		presets: TIME_PRESETS.map((p, index) => ({ ...p, index })).filter((p) => p.group === g),
	}));

	// Move history is on by default only where a third column fits.
	const wideScreen = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

	// Reflect the persisted preference so a stored time control is always VISIBLE in the
	// picker — a clock must never tick that the player didn't see coming.
	const storedTimeIndex = () => {
		const i = TIME_PRESETS.findIndex(
			(p) =>
				p.limit === preferencesStore.timeLimit && p.bonus === (preferencesStore.timeBonus ?? 0),
		);
		return i >= 0 ? i : 0;
	};

	let selectedAlgo = $state('greedy');
	let selectedColor = $state<(typeof COLORS)[number]>(preferencesStore.playerColorPreference);
	let selectedTime = $state(storedTimeIndex());
	// Color/time live behind a disclosure so the default path is bot → Start game. It opens
	// pre-expanded when a stored clock applies, keeping the never-an-unseen-clock rule intact
	// (the collapsed summary also always shows the current color + time).
	let settingsOpen = $state(storedTimeIndex() !== 0);
	let showHistory = $state(wideScreen());
	let confirmResign = $state(false);

	const inLobby = $derived(store.gameStatus === 'idle');
	const isOver = $derived(
		store.gameStatus === 'victory' || store.gameStatus === 'defeat' || store.gameStatus === 'draw',
	);
	const bot = $derived(BOTS.find((b) => b.id === selectedAlgo));
	const yourColorName = $derived(store.playerColor === 'w' ? 'white' : 'black');
	const botColorName = $derived(store.playerColor === 'w' ? 'black' : 'white');
	// End-of-game modal: shows once per finished game, re-armed when a new game starts.
	let endModalDismissed = $state(false);
	$effect(() => {
		if (!isOver) endModalDismissed = false;
	});
	const showEndModal = $derived(isOver && !endModalDismissed);
	const endTone = $derived(
		store.gameStatus === 'victory'
			? ('win' as const)
			: store.gameStatus === 'defeat'
				? ('loss' as const)
				: ('neutral' as const),
	);
	const endHeadline = $derived(
		store.gameStatus === 'victory'
			? 'You won! 🎉'
			: store.gameStatus === 'defeat'
				? 'You lost.'
				: 'Draw.',
	);

	const botActive = $derived(!isOver && store.activeColor !== store.playerColor);
	const youActive = $derived(!isOver && store.activeColor === store.playerColor);
	const hasClocks = $derived(store.timeLimit !== null);
	const timeLabel = $derived(TIME_PRESETS[selectedTime]?.label ?? 'Unlimited');

	function startGame() {
		const t = TIME_PRESETS[selectedTime];
		preferencesStore.setTimeLimit(t.limit);
		preferencesStore.setTimeBonus(t.bonus);
		preferencesStore.setPlayerColorPreference(selectedColor);
		// Rolling is not a decision in dice chess — the play site always auto-rolls,
		// so the dice panel never needs a Roll button.
		preferencesStore.setAutoRollDice(true);
		store.startNewGame(selectedColor, selectedAlgo);
	}

	// The board is the primary element: hide the app chrome while a game is on screen.
	$effect(() => {
		chromeStore.zen = !inLobby;
		return () => {
			chromeStore.zen = false;
		};
	});

	// Reset transient panel state whenever a new game starts.
	$effect(() => {
		if (inLobby) {
			showHistory = wideScreen();
			confirmResign = false;
		}
	});

	// Flush finished games to play-api's ingest endpoint exactly once per game. `flushed` is a
	// plain (non-reactive) flag so this effect depends only on gameStatus.
	let flushed = false;
	$effect(() => {
		const s = store.gameStatus;
		if (s === 'victory' || s === 'defeat' || s === 'draw') {
			if (!flushed) {
				flushed = true;
				void flushOutbox();
			}
		} else {
			flushed = false;
		}
	});

	onMount(() => {
		// Retry games left pending from a previous session.
		void flushOutbox();
		preloadSounds(); // fetch + arm the gesture unlock before the first roll
	});

	let resignTimeout: ReturnType<typeof setTimeout> | undefined;

	function resign() {
		if (!confirmResign) {
			confirmResign = true;
			resignTimeout = setTimeout(() => (confirmResign = false), 3000);
			return;
		}
		clearTimeout(resignTimeout);
		confirmResign = false;
		store.resignGame();
	}

	$effect(() => () => clearTimeout(resignTimeout));

	function onKeydown(event: KeyboardEvent) {
		// Disable keyboard navigation during active game play to prevent accidental jumps.
		if (!isOver) return;

		const el = document.activeElement;
		if (
			el &&
			(el.tagName === 'INPUT' ||
				el.tagName === 'TEXTAREA' ||
				el.tagName === 'SELECT' ||
				el.hasAttribute('contenteditable'))
		) {
			return;
		}

		switch (event.key) {
			case 'ArrowLeft':
				store.setMoveIndex(store.currentMoveIndex - 1);
				event.preventDefault();
				break;
			case 'ArrowRight':
				store.setMoveIndex(store.currentMoveIndex + 1);
				event.preventDefault();
				break;
			case 'Home':
				store.setMoveIndex(0);
				event.preventDefault();
				break;
			case 'End':
				store.setMoveIndex(store.maxMoveIndex);
				event.preventDefault();
				break;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet iconBtn(
	kind: 'back' | 'list' | 'flag' | 'first' | 'prev' | 'next' | 'last' | 'sound-on' | 'sound-off',
)}
	<svg
		viewBox="0 0 24 24"
		class="h-[17px] w-[17px]"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if kind === 'back'}
			<path d="M19 12H6M11 6l-6 6 6 6" />
		{:else if kind === 'list'}
			<path d="M9 6h11M9 12h11M9 18h11" /><circle
				cx="5"
				cy="6"
				r="1.2"
				fill="currentColor"
				stroke="none"
			/><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle
				cx="5"
				cy="18"
				r="1.2"
				fill="currentColor"
				stroke="none"
			/>
		{:else if kind === 'sound-on'}
			<path d="M11 5.5 6.5 9H3.5v6h3l4.5 3.5z" /><path d="M14.5 9.5a3.6 3.6 0 0 1 0 5" /><path
				d="M17 7.5a6.5 6.5 0 0 1 0 9"
			/>
		{:else if kind === 'sound-off'}
			<path d="M11 5.5 6.5 9H3.5v6h3l4.5 3.5z" /><path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
		{:else}
			{#if kind === 'first'}
				<path d="M11 6l-6 6 6 6M18 6l-6 6 6 6" />
			{:else if kind === 'prev'}
				<path d="M15 6l-6 6 6 6" />
			{:else if kind === 'next'}
				<path d="M9 6l6 6-6 6" />
			{:else if kind === 'last'}
				<path d="M6 6l6 6-6 6M13 6l6 6-6 6" />
			{:else}
				<path d="M6 20V4M6 5h11l-2 3 2 3H6" />
			{/if}
		{/if}
	</svg>
{/snippet}

<GameEndModal
	open={showEndModal}
	headline={endHeadline}
	tone={endTone}
	reason={endReasonLabel(store.gameEndReason)}
	onDismiss={() => (endModalDismissed = true)}
>
	<button
		type="button"
		onclick={startGame}
		class="w-full rounded-xl bg-primary py-2.5 font-bold text-primary-content shadow-md transition-colors hover:bg-primary-hover"
	>
		New game
	</button>
	<button
		type="button"
		onclick={() => store.endSession()}
		class="text-sm text-content-muted underline transition-colors hover:text-content"
	>
		Change opponent
	</button>
</GameEndModal>

{#if inLobby}
	<section class="max-w-md mx-auto flex flex-col gap-6">
		<h2 class="text-2xl font-bold text-content">Practice game</h2>

		<div class="flex flex-col gap-2">
			<span class="text-sm font-bold text-content-muted">Opponent</span>
			{#each PLAYABLE_BOTS as b (b.id)}
				<button
					type="button"
					onclick={() => (selectedAlgo = b.id)}
					aria-label="{b.label}, level {b.level}"
					aria-pressed={selectedAlgo === b.id}
					class="flex items-center justify-between px-4 py-3 rounded-lg border transition-colors {selectedAlgo ===
					b.id
						? 'border-primary bg-primary/10 text-content'
						: 'border-border bg-surface text-content-muted hover:text-content'}"
				>
					<span class="font-bold">{b.label}</span>
					<span class="text-xs text-content-muted">Level {b.level}</span>
				</button>
			{/each}
		</div>

		<button
			type="button"
			onclick={startGame}
			class="px-6 py-3 rounded-xl bg-primary text-primary-content font-bold text-lg shadow-lg shadow-primary/30 hover:bg-primary-hover transition-colors"
		>
			Start game
		</button>

		<div class="flex flex-col gap-3">
			<button
				type="button"
				onclick={() => (settingsOpen = !settingsOpen)}
				aria-expanded={settingsOpen}
				aria-controls={settingsOpen ? 'game-settings' : undefined}
				class="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-bold text-content-muted transition-colors hover:text-content"
			>
				<span>Game settings</span>
				<span class="flex items-center gap-2 text-xs font-semibold">
					<span class="capitalize tabular-nums">{selectedColor} · {timeLabel}</span>
					<svg
						viewBox="0 0 24 24"
						class="h-4 w-4 transition-transform {settingsOpen ? 'rotate-180' : ''}"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M6 9l6 6 6-6" />
					</svg>
				</span>
			</button>

			{#if settingsOpen}
				<div id="game-settings" class="flex flex-col gap-6 rounded-lg border border-border p-4">
					<div class="flex flex-col gap-2">
						<span class="text-sm font-bold text-content-muted">Your color</span>
						<div class="flex gap-2">
							{#each COLORS as color (color)}
								<button
									type="button"
									onclick={() => (selectedColor = color)}
									aria-pressed={selectedColor === color}
									class="flex-1 px-3 py-2 rounded-lg border capitalize transition-colors {selectedColor ===
									color
										? 'border-primary bg-primary/10 text-content'
										: 'border-border bg-surface text-content-muted hover:text-content'}"
								>
									{color}
								</button>
							{/each}
						</div>
					</div>

					<fieldset class="flex flex-col gap-3">
						<legend class="text-sm font-bold text-content-muted pb-2">Time control</legend>
						{#each TIME_GROUPS as g (g.label)}
							<div class="flex flex-col gap-1.5">
								<span class="text-[10px] font-bold tracking-widest text-content-muted/80 uppercase">
									{g.label}
								</span>
								<div class="flex flex-wrap gap-2">
									{#each g.presets as p (p.label)}
										<label
											class="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-bold tabular-nums transition-colors focus-within:ring-2 focus-within:ring-primary/50
												{selectedTime === p.index
												? 'border-primary bg-primary text-primary-content'
												: 'border-border bg-surface text-content-muted hover:text-content'}"
										>
											<input
												type="radio"
												name="botTimeControl"
												value={p.index}
												bind:group={selectedTime}
												aria-label={p.label}
												class="sr-only"
											/>
											{p.label}
										</label>
									{/each}
								</div>
							</div>
						{/each}
					</fieldset>
				</div>
			{/if}
		</div>
	</section>
{:else}
	<section class="w-full">
		<div
			class="flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-3 lg:gap-4 {showHistory
				? 'lg:grid-cols-[300px_minmax(0,1fr)_280px]'
				: ''}"
		>
			{#if showHistory}
				<!-- On phones the history acts as a tab: it takes the board's slot and the
				     board/dice hide. From md up it is an extra panel alongside the game. -->
				<aside
					class="order-2 h-[70dvh] md:order-none md:col-span-2 md:row-start-2 md:h-[320px] lg:sticky lg:top-4 lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:h-[calc(100dvh-2rem)]"
				>
					<MoveHistory
						historyBlocks={store.historyBlocks}
						currentMoveIndex={store.currentMoveIndex}
						maxMoveIndex={store.maxMoveIndex}
						onSetMove={(i) => store.setMoveIndex(i)}
						keyboardNavEnabled={isOver}
					/>
				</aside>
			{/if}

			<!-- Board column — the hero. Player strips sit above and below the board and share
			     its width; the board is width-capped by the column and height-capped by the
			     screen minus the strips. -->
			<div
				class="order-2 min-w-0 justify-center md:order-none md:col-start-1 md:row-start-1 {showHistory
					? 'hidden md:flex lg:col-start-2'
					: 'flex'}"
			>
				<!-- Cap the board by the height left after the surrounding chrome (two player strips, the
				     move-nav row, and — stacked below on phones — the turn line + dice panel), not just
				     10rem, so a short mobile viewport (browser URL bar showing) doesn't push the dice
				     panel off the bottom. On a narrow phone the board is width-limited anyway, so this
				     only engages when height is the tighter constraint. The 200px floor keeps it from
				     collapsing in landscape. -->
				<div
					class="flex w-full max-w-[min(560px,max(200px,calc(100dvh-24rem)))] flex-col gap-2.5 md:max-w-[calc(100dvh-15rem)]"
				>
					<PlayerStrip
						name={bot?.label ?? 'Bot'}
						sub="bot · {botColorName}"
						bot
						active={botActive}
						thinking={store.gameStatus === 'bot_thinking'}
						clockMs={hasClocks ? store.botTimeLeft : undefined}
					/>

					<!-- Relative wrapper so the promotion overlay covers the board. -->
					<div class="relative w-full aspect-square">
						<Board {store} />
						{#if store.pendingPromotion}
							<PawnPromotionSelector
								color={store.pendingPromotion.color}
								availablePieces={store.pendingPromotion.availablePieces}
								onSelect={(p) => store.completePromotion(p)}
								onCancel={() => store.cancelPromotion()}
							/>
						{/if}
					</div>

					<!-- History navigation buttons under the board -->
					<div class="flex items-center justify-center gap-2 w-full">
						<button
							type="button"
							aria-label="First move"
							onclick={() => store.setMoveIndex(0)}
							disabled={store.currentMoveIndex === 0}
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-content hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						>
							{@render iconBtn('first')}
						</button>
						<button
							type="button"
							aria-label="Previous move"
							onclick={() => store.setMoveIndex(store.currentMoveIndex - 1)}
							disabled={store.currentMoveIndex === 0}
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-content hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						>
							{@render iconBtn('prev')}
						</button>
						<span class="px-2 text-xs font-mono font-bold text-content-muted tabular-nums">
							{store.currentMoveIndex} / {store.maxMoveIndex}
						</span>
						<button
							type="button"
							aria-label="Next move"
							onclick={() => store.setMoveIndex(store.currentMoveIndex + 1)}
							disabled={store.currentMoveIndex === store.maxMoveIndex}
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-content hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						>
							{@render iconBtn('next')}
						</button>
						<button
							type="button"
							aria-label="Last move"
							onclick={() => store.setMoveIndex(store.maxMoveIndex)}
							disabled={store.currentMoveIndex === store.maxMoveIndex}
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-content hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						>
							{@render iconBtn('last')}
						</button>
					</div>

					<PlayerStrip
						name="You"
						sub="guest · {yourColorName}"
						active={youActive}
						clockMs={hasClocks ? store.playerTimeLeft : undefined}
					/>
				</div>
			</div>

			<!-- Rail: actions and dice. -->
			<div
				class="contents md:sticky md:top-4 md:col-start-2 md:row-start-1 md:flex md:flex-col md:gap-2.5 md:self-stretch md:[max-height:calc(100dvh-2rem)] {showHistory
					? 'lg:col-start-3'
					: ''}"
			>
				<div class="order-1 flex items-center gap-1.5 md:order-none">
					<button
						type="button"
						onclick={() => store.endSession()}
						aria-label="Leave game"
						title="Leave"
						class="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-content-muted transition-colors hover:border-border-strong hover:text-content"
					>
						{@render iconBtn('back')}
					</button>
					<button
						type="button"
						onclick={() => (showHistory = !showHistory)}
						aria-label="Move history"
						aria-pressed={showHistory}
						title="Moves"
						class="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors {showHistory
							? 'border-primary bg-primary/10 text-content'
							: 'border-border bg-surface text-content-muted hover:border-border-strong hover:text-content'}"
					>
						{@render iconBtn('list')}
					</button>
					<button
						type="button"
						onclick={() => preferencesStore.setSoundEnabled(!preferencesStore.soundEnabled)}
						aria-label="Sound effects"
						aria-pressed={preferencesStore.soundEnabled}
						title={preferencesStore.soundEnabled ? 'Sound on' : 'Sound off'}
						class="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface transition-colors hover:border-border-strong hover:text-content {preferencesStore.soundEnabled
							? 'text-content-muted'
							: 'text-content-muted/50'}"
					>
						{@render iconBtn(preferencesStore.soundEnabled ? 'sound-on' : 'sound-off')}
					</button>
					{#if !isOver && store.playerCanOfferDraw}
						<button
							type="button"
							onclick={() => store.offerDraw()}
							disabled={!store.canUserOfferDraw}
							aria-label="Offer a draw"
							title="Offer a draw"
							class="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-sm font-bold text-content-muted transition-colors hover:border-border-strong hover:text-content disabled:opacity-30 disabled:cursor-not-allowed"
						>
							½
						</button>
					{/if}
					{#if !isOver}
						<button
							type="button"
							onclick={resign}
							aria-label={confirmResign ? 'Click again to confirm resignation' : 'Resign'}
							title="Resign"
							class="flex h-8 items-center justify-center gap-1.5 rounded-lg border transition-colors {confirmResign
								? 'border-danger/50 bg-danger/15 px-2.5 text-xs font-bold text-danger'
								: 'w-8 border-border bg-surface text-content-muted hover:border-danger/50 hover:text-danger'}"
						>
							{@render iconBtn('flag')}
							{#if confirmResign}Resign?{/if}
						</button>
					{/if}
					<span
						class="ml-auto truncate rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-bold text-content-muted"
					>
						{bot?.label ?? 'Bot'} · lvl {bot?.level ?? '?'}{hasClocks ? ` · ${timeLabel}` : ''}
					</span>
				</div>

				{#if isOver}
					<div
						class="order-4 flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-4 md:order-none md:flex-1 md:justify-center {showHistory
							? 'hidden md:flex'
							: 'flex'}"
					>
						<p class="text-lg font-bold text-content">
							{#if store.gameStatus === 'victory'}You won! 🎉
							{:else if store.gameStatus === 'defeat'}You lost.
							{:else}Draw.{/if}
						</p>
						{#if endReasonLabel(store.gameEndReason)}
							<p class="text-sm text-content-muted">{endReasonLabel(store.gameEndReason)}</p>
						{/if}
						<button
							type="button"
							onclick={startGame}
							class="w-full rounded-xl bg-primary py-2.5 font-bold text-primary-content shadow-md transition-colors hover:bg-primary-hover"
						>
							New game
						</button>
						<button
							type="button"
							onclick={() => store.endSession()}
							class="text-sm text-content-muted underline transition-colors hover:text-content"
						>
							Change opponent
						</button>
					</div>
				{:else if store.activeDrawOffer === 'bot'}
					<!-- Non-modal by design: the board (and its history-scrub nav) stays interactive
					     so the player can check the live position before deciding — see the
					     scrubbing guard's comment in the store for why draw offers never block it. -->
					<div
						class="order-4 flex-col items-center gap-3 rounded-2xl border border-badge-accent/40 bg-badge-accent/5 p-4 md:order-none md:flex-1 md:justify-center {showHistory
							? 'hidden md:flex'
							: 'flex'}"
					>
						<p class="text-lg font-bold text-content">The bot offers a draw</p>
						<p class="text-center text-sm text-content-muted">
							Accept to end the game as a draw, or decline to keep playing.
						</p>
						<button
							type="button"
							onclick={() => store.acceptBotDraw()}
							class="w-full rounded-xl bg-primary py-2.5 font-bold text-primary-content shadow-md transition-colors hover:bg-primary-hover"
						>
							Accept draw
						</button>
						<button
							type="button"
							onclick={() => store.declineBotDraw()}
							class="w-full rounded-xl border border-border bg-surface py-2.5 font-bold text-content-muted transition-colors hover:text-content"
						>
							Decline
						</button>
					</div>
				{:else}
					<div
						class="order-4 md:order-none md:min-h-0 md:flex-1 md:flex-col {showHistory
							? 'hidden md:flex'
							: 'md:flex'}"
					>
						<DicePanel
							dice={store.currentDice}
							animating={store.isAnimatingRoll}
							canRoll={store.canUserRoll && !preferencesStore.autoRollDice}
							onRoll={() => store.rollDice()}
						/>
					</div>
				{/if}
			</div>
		</div>
	</section>
{/if}

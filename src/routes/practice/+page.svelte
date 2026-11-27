<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { onMount } from 'svelte';
	import { playWithBotStore as store } from '#lib/playWithBot/index.js';
	import GameSetupPanel from '../../components/GameSetupPanel.svelte';
	import Board from '../../components/Board.svelte';
	import MoveList from '../../components/MoveList.svelte';
	import MoveStepper from '../../components/MoveStepper.svelte';
	import PawnPromotionSelector from '../../components/PawnPromotionSelector.svelte';
	import PlayerStrip from '../../components/PlayerStrip.svelte';
	import GameEndModal from '../../components/GameEndModal.svelte';
	import TurnCard from '../../components/TurnCard.svelte';
	import PreRollDrawGate from '../../components/PreRollDrawGate.svelte';
	import { chromeStore } from '#lib/stores/chromeStore.svelte.js';
	import { preferencesStore } from '#lib/preferencesStore.svelte.js';
	import { preloadSounds } from '#lib/sound.js';
	import { endReasonLabel } from '#lib/gameOutcome.js';
	import { flushOutbox } from '#lib/ingest/outbox.js';
	import { BOTS, PLAYABLE_BOTS } from '#lib/bots.js';
	import { RESIGN_CONFIRM_MS } from '#lib/timings.js';

	type ColorChoice = 'random' | 'white' | 'black';
	// The setup panel speaks of three colours, and so does the store: the values are the same.
	const COLOR_VALUES = { random: 'random', white: 'white', black: 'black' } as const;

	/** Bot-game time controls map onto the store's minutes-limit + seconds-bonus model.
	 * Unlimited first: a casual bot game shouldn't surprise anyone with a flag fall.
	 * "Unlimited" (not "No clock") to match the term used across the live/lobby surface
	 * and the server's TimeControl ADT variant.
	 *
	 * This list deliberately stays separate from `botTimeControlPresets` in timeControls.ts (#20):
	 * the two surfaces are structurally different. /practice drives an offline Stockfish bot through
	 * `timeLimit` (minutes) + `timeBonus` (seconds), while the catalog panel drives a live server
	 * game with the structured `TimeControl` ADT. Merging them would force one to bend to the other's
	 * wire format. The two lists also differ in content (this one includes Unlimited and '5 + 3', the
	 * catalog one includes '1 + 1' and '3 + 3'). Keep them in sync manually if presets are added. */
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
	// The rows of the setup panel: one per group, each choice keyed by its index in TIME_PRESETS.
	const TIME_GROUPS = ['Casual', 'Blitz', 'Rapid'].map((g) => ({
		label: g,
		options: TIME_PRESETS.map((p, index) => ({
			value: index,
			label: p.label,
			group: p.group,
		})).filter((p) => p.group === g),
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
	let selectedColor = $state<ColorChoice>(preferencesStore.playerColorPreference);
	let selectedTime = $state(storedTimeIndex());
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
	$effect(() => {
		chromeStore.holdReload = !inLobby && !isOver;
		return () => {
			chromeStore.holdReload = false;
		};
	});
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

	// The ½ control, in the same five states and with the same wording as the live page: the two
	// surfaces teach one mental model, which is the whole point of sharing the rules module.
	const drawControl = $derived(store.drawOfferControlState);
	const drawLabel = $derived.by(() => {
		switch (drawControl) {
			case 'armed':
				return 'Draw offer armed — sent when your turn completes (click to cancel)';
			case 'pending':
				return 'Draw offered — waiting for the bot';
			case 'forbidden': {
				const turns = store.drawTurnsUntilAvailable;
				return turns === null
					? 'The bot offers the next draw'
					: `Draw offer available in ${turns} ${turns === 1 ? 'turn' : 'turns'}`;
			}
			default:
				return 'Offer a draw with your next turn';
		}
	});

	// A tap on the board while the bot's offer is pending declines it: before dice exist a board
	// gesture has no other meaning, and it saves the responder from aiming at a button. Guarded to a
	// non-browsing view so scrubbing history is never mistaken for an answer.
	function onBoardPointerDown() {
		if (store.isPreRollResponder && !store.isViewingHistory) store.respondDraw(false);
	}

	let resignTimeout: ReturnType<typeof setTimeout> | undefined;

	function resign() {
		if (!confirmResign) {
			confirmResign = true;
			resignTimeout = setTimeout(() => (confirmResign = false), RESIGN_CONFIRM_MS);
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
	kind:
		| 'back'
		| 'list'
		| 'flag'
		| 'first'
		| 'prev'
		| 'next'
		| 'last'
		| 'sound-on'
		| 'sound-off'
		| 'handshake',
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
		{:else if kind === 'handshake'}
			<path
				d="m11 17 2 2a1 1 0 0 0 1.4 0l4.3-4.3a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0L13.5 12"
			/>
			<path d="m13 7-2-2a1 1 0 0 0-1.4 0L5.3 9.3a1 1 0 0 0 0 1.4l2.4 2.4a1 1 0 0 0 1.4 0L10.5 12" />
			<path d="m16 8 2-2a2.83 2.83 0 0 1 4 0 2.83 2.83 0 0 1 0 4l-2 2" />
			<path d="m8 16-2 2a2.83 2.83 0 0 1-4 0 2.83 2.83 0 0 1 0-4l2-2" />
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

		<!-- The colour and the clock are always in view: a clock must never tick that the player
		     did not see coming. A practice game is local and never rated. -->
		<GameSetupPanel
			name="practice"
			timeGroups={TIME_GROUPS}
			bind:time={selectedTime}
			colorValues={COLOR_VALUES}
			bind:color={selectedColor}
			rating="unrated"
			actionLabel="Start game"
			onstart={startGame}
		/>
	</section>
{:else}
	<section class="w-full">
		<div
			class="flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-3 lg:gap-4 {showHistory
				? 'lg:grid-cols-[300px_minmax(0,1fr)_280px]'
				: ''}"
		>
			{#if showHistory}
				<!-- On phones the move list is a sheet over the lower part of the screen, so the
				     board stays in view. From md up it is an extra panel alongside the game. -->
				<aside
					class="fixed inset-x-0 bottom-0 z-40 h-[40dvh] md:static md:z-auto md:col-span-2 md:row-start-2 md:h-[320px] lg:sticky lg:top-4 lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:h-[calc(100dvh-2rem)]"
				>
					<MoveList
						historyBlocks={store.historyBlocks}
						currentMoveIndex={store.currentMoveIndex}
						maxMoveIndex={store.maxMoveIndex}
						onSetMove={(i) => store.setMoveIndex(i)}
						keyboardNavEnabled={isOver}
						onclose={() => (showHistory = false)}
					/>
				</aside>
			{/if}

			<!-- Board column — the hero. Player strips sit above and below the board and share
			     its width; the board is width-capped by the column and height-capped by the
			     screen minus the strips. -->
			<div
				class="order-2 min-w-0 justify-center md:order-none md:col-start-1 md:row-start-1 flex {showHistory
					? 'lg:col-start-2'
					: ''}"
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

					<!-- Relative wrapper so the promotion overlay covers the board. The pointer handler is
					     on the wrapper, not an overlay: nothing is ever laid over the board, so the king
					     stays one click away at every moment of the game. -->
					<!-- svelte-ignore a11y_no_static_element_interactions (declining by tapping the board is
					     a pointer shortcut; Escape and the gate card's own focused button are the
					     keyboard paths) -->
					<div class="relative w-full aspect-square" onpointerdown={onBoardPointerDown}>
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

					<MoveStepper
						currentMoveIndex={store.currentMoveIndex}
						maxMoveIndex={store.maxMoveIndex}
						onSetMove={(i) => store.setMoveIndex(i)}
					/>

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
					<!-- Standing draw offer. Available in every phase, the bot's turn included: arming
					     reaches nobody until this seat's own turn completes, which is the only way an
					     offer can ride out on a forced pass. -->
					{#if drawControl !== 'hidden'}
						<button
							type="button"
							onclick={() => store.toggleArmDrawOffer()}
							disabled={drawControl === 'forbidden' || drawControl === 'pending'}
							aria-label={drawLabel}
							title={drawLabel}
							class="relative flex h-8 items-center justify-center gap-1.5 rounded-lg border transition-colors after:absolute after:-inset-1.5 after:content-[''] disabled:cursor-not-allowed disabled:opacity-40 {drawControl ===
							'armed'
								? 'border-primary bg-primary/20 text-primary shadow-sm px-2.5 text-xs font-bold'
								: drawControl === 'pending'
									? 'border-primary/50 bg-primary/10 text-primary px-2.5 text-xs font-bold'
									: 'w-8 border-border bg-surface text-content-muted hover:border-border-strong hover:text-content'}"
						>
							{@render iconBtn('handshake')}
							{#if drawControl === 'armed'}
								Armed
							{:else if drawControl === 'pending'}
								Sent
							{/if}
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
						class="order-4 flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-4 md:order-none md:flex-1 md:justify-center flex"
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
				{:else}
					<div class="order-4 md:order-none md:flex md:min-h-0 md:flex-1 md:flex-col">
						<!-- The gate takes the dice panel's slot rather than opening a modal: the board and
						     its history nav stay live while the clock runs, which is what makes declining
						     cheap enough to be the honest default. -->
						{#if store.isPreRollGateActive}
							<PreRollDrawGate
								isResponder={store.isPreRollResponder}
								offeredByName={store.activeDrawOffer === 'bot' ? (bot?.label ?? 'Bot') : null}
								onAccept={() => store.respondDraw(true)}
								onDecline={() => store.respondDraw(false)}
							/>
						{:else}
							<TurnCard
								title={store.isViewingHistory
									? undefined
									: youActive
										? 'Your turn'
										: `${bot?.label ?? 'Bot'} is thinking`}
								mine={youActive && !store.isViewingHistory}
								dice={store.currentDice}
								animating={store.isAnimatingRoll}
								canRoll={store.canUserRoll && !preferencesStore.autoRollDice}
								onRoll={() => store.rollDice()}
							/>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</section>
{/if}

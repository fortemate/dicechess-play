<script lang="ts">
	import { onMount } from 'svelte';
	import { playWithBotStore as store } from '#lib/playWithBot/index.js';
	import GameSetupPanel from '../../components/GameSetupPanel.svelte';
	import Board from '../../components/Board.svelte';
	import GameActions from '../../components/GameActions.svelte';
	import GameFrame from '../../components/GameFrame.svelte';
	import MoveList from '../../components/MoveList.svelte';
	import MoveStepper from '../../components/MoveStepper.svelte';
	import PawnPromotionSelector from '../../components/PawnPromotionSelector.svelte';
	import PlayerStrip from '../../components/PlayerStrip.svelte';
	import GameResultCard from '../../components/GameResultCard.svelte';
	import TurnCard from '../../components/TurnCard.svelte';
	import PreRollDrawGate from '../../components/PreRollDrawGate.svelte';
	import Button from '../../components/ui/Button.svelte';
	import { chromeStore } from '#lib/stores/chromeStore.svelte.js';
	import { preferencesStore } from '#lib/preferencesStore.svelte.js';
	import { preloadSounds } from '#lib/sound.js';
	import { endReasonLabel } from '#lib/gameOutcome.js';
	import { flushOutbox } from '#lib/ingest/outbox.js';
	import { BOTS, PLAYABLE_BOTS } from '#lib/bots.js';
	import { RESIGN_CONFIRM_MS } from '#lib/timings.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		PRACTICE_COLOR_VALUES,
		PRACTICE_TIME_PRESETS,
		practiceTimeGroups,
		practiceTimeLabel,
		startPracticeGame,
		storedPracticeTimeIndex,
		type PracticeColor,
	} from '#lib/playWithBot/practiceSetup.js';

	// The setup of a starter bot game is shared with Play (#257), which starts the same game from
	// the same choices and then hands over to this page.
	const timeGroups = $derived(practiceTimeGroups());

	// A game that is already on the board was started elsewhere (Play) with its own bot: show that
	// bot, and offer the rematch against it, rather than this page's default.
	let selectedAlgo = $state(store.gameStatus === 'idle' ? 'greedy' : store.botAlgorithm);
	let selectedColor = $state<PracticeColor>(preferencesStore.playerColorPreference);
	let selectedTime = $state(storedPracticeTimeIndex());
	let confirmResign = $state(false);

	const inLobby = $derived(store.gameStatus === 'idle');
	const isOver = $derived(
		store.gameStatus === 'victory' || store.gameStatus === 'defeat' || store.gameStatus === 'draw',
	);
	const bot = $derived(BOTS.find((b) => b.id === selectedAlgo));
	const colorName = (color: 'w' | 'b') =>
		color === 'w' ? m.common_seat_white_lower() : m.common_seat_black_lower();
	const yourColorName = $derived(colorName(store.playerColor));
	const botColorName = $derived(colorName(store.playerColor === 'w' ? 'b' : 'w'));
	const botName = $derived(bot?.label ?? m.game_practice_bot());
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
			? m.game_over_won()
			: store.gameStatus === 'defeat'
				? m.game_over_lost()
				: m.game_over_draw(),
	);

	const botActive = $derived(!isOver && store.activeColor !== store.playerColor);
	const youActive = $derived(!isOver && store.activeColor === store.playerColor);
	const hasClocks = $derived(store.timeLimit !== null);
	const timeLabel = $derived(
		practiceTimeLabel(PRACTICE_TIME_PRESETS[selectedTime] ?? PRACTICE_TIME_PRESETS[0]),
	);
	// What this game is, for the top bar of the frame.
	const frameTitle = $derived(
		hasClocks
			? m.game_practice_frame_title_timed({
					name: botName,
					level: bot?.level ?? '?',
					time: timeLabel,
				})
			: m.game_practice_frame_title({ name: botName, level: bot?.level ?? '?' }),
	);

	function startGame() {
		startPracticeGame({ algorithm: selectedAlgo, color: selectedColor, timeIndex: selectedTime });
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
		if (inLobby) confirmResign = false;
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
				return m.game_draw_label_armed();
			case 'pending':
				return m.game_draw_label_pending_bot();
			case 'forbidden': {
				const turns = store.drawTurnsUntilAvailable;
				if (turns === null) return m.game_draw_label_forbidden_bot();
				return turns === 1
					? m.game_draw_label_available_one()
					: m.game_draw_label_available_many({ turns });
			}
			default:
				return m.game_draw_label_idle();
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

{#if inLobby}
	<section class="mx-auto flex max-w-md flex-col gap-6">
		<h2 class="text-2xl font-bold text-content">{m.game_practice_title()}</h2>

		<div class="flex flex-col gap-2">
			<span class="text-sm font-bold text-content-muted">{m.game_practice_opponent()}</span>
			{#each PLAYABLE_BOTS as b (b.id)}
				<button
					type="button"
					onclick={() => (selectedAlgo = b.id)}
					aria-label={m.game_practice_bot_label({ name: b.label, level: b.level })}
					aria-pressed={selectedAlgo === b.id}
					class="flex min-h-11 items-center justify-between rounded-control border px-4 py-3 transition-colors focus-visible:focus-ring {selectedAlgo ===
					b.id
						? 'border-primary bg-primary/10 text-content'
						: 'border-border bg-surface text-content-muted hover:text-content'}"
				>
					<span class="font-bold">{b.label}</span>
					<span class="text-xs text-content-muted">{m.game_practice_level({ level: b.level })}</span
					>
				</button>
			{/each}
		</div>

		<!-- The colour and the clock are always in view: a clock must never tick that the player
		     did not see coming. A practice game is local and never rated. -->
		<GameSetupPanel
			name="practice"
			{timeGroups}
			bind:time={selectedTime}
			colorValues={PRACTICE_COLOR_VALUES}
			bind:color={selectedColor}
			rating="unrated"
			actionLabel={m.game_practice_start()}
			onstart={startGame}
		/>
	</section>
{:else}
	<GameFrame
		title={frameTitle}
		onleave={() => store.endSession()}
		sound={{
			enabled: preferencesStore.soundEnabled,
			toggle: () => preferencesStore.setSoundEnabled(!preferencesStore.soundEnabled),
		}}
	>
		{#snippet top()}
			<PlayerStrip
				name={botName}
				sub={m.game_practice_bot_sub({ color: botColorName })}
				bot
				compact
				active={botActive}
				thinking={store.gameStatus === 'bot_thinking'}
				clockMs={hasClocks ? store.botTimeLeft : undefined}
			/>
		{/snippet}

		{#snippet board()}
			<!-- Relative wrapper so the promotion overlay covers the board. The pointer handler is
			     on the wrapper, not an overlay: nothing is ever laid over the board, so the king
			     stays one click away at every moment of the game. -->
			<!-- svelte-ignore a11y_no_static_element_interactions (declining by tapping the board is
			     a pointer shortcut; Escape and the gate card's own focused button are the
			     keyboard paths) -->
			<div class="relative aspect-square w-full" onpointerdown={onBoardPointerDown}>
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
		{/snippet}

		{#snippet underBoard()}
			<MoveStepper
				currentMoveIndex={store.currentMoveIndex}
				maxMoveIndex={store.maxMoveIndex}
				onSetMove={(i) => store.setMoveIndex(i)}
			/>
		{/snippet}

		{#snippet bottom()}
			<PlayerStrip
				name={m.common_player_you()}
				sub={m.game_practice_guest_sub({ color: yourColorName })}
				compact
				active={youActive}
				clockMs={hasClocks ? store.playerTimeLeft : undefined}
			/>
		{/snippet}

		{#snippet card()}
			{#if isOver}
				<!-- The result takes the place of the turn card, so the board and the move list stay in
				     view. "Rematch" starts the same game again; "New opponent" goes back to the setup. -->
				<GameResultCard
					headline={endHeadline}
					tone={endTone}
					reason={endReasonLabel(store.gameEndReason)}
				>
					<Button variant="primary" block onclick={startGame}>{m.game_result_rematch()}</Button>
					<Button variant="secondary" block onclick={() => store.endSession()}>
						{m.game_result_new_opponent()}
					</Button>
				</GameResultCard>
			{:else if store.isPreRollGateActive}
				<!-- The gate takes the turn card's slot rather than opening a modal: the board and its
				     step controls stay live while the clock runs, which is what makes declining cheap
				     enough to be the honest default. -->
				<PreRollDrawGate
					isResponder={store.isPreRollResponder}
					offeredByName={store.activeDrawOffer === 'bot' ? botName : null}
					onAccept={() => store.respondDraw(true)}
					onDecline={() => store.respondDraw(false)}
				/>
			{:else}
				<TurnCard
					title={store.isViewingHistory
						? undefined
						: youActive
							? m.game_turn_yours()
							: m.game_turn_thinking({ name: botName })}
					mine={youActive && !store.isViewingHistory}
					dice={store.currentDice}
					animating={store.isAnimatingRoll}
					canRoll={store.canUserRoll && !preferencesStore.autoRollDice}
					onRoll={() => store.rollDice()}
				/>
			{/if}
		{/snippet}

		{#snippet moves(close)}
			<MoveList
				historyBlocks={store.historyBlocks}
				currentMoveIndex={store.currentMoveIndex}
				maxMoveIndex={store.maxMoveIndex}
				onSetMove={(i) => store.setMoveIndex(i)}
				keyboardNavEnabled={isOver}
				onclose={close}
			/>
		{/snippet}

		{#snippet actions(movesControl)}
			<!-- The standing draw offer is available in every phase, the bot's turn included: arming
			     reaches nobody until this seat's own turn completes, which is the only way an offer
			     can ride out on a forced pass. -->
			<GameActions
				moves={movesControl}
				draw={drawControl === 'hidden'
					? undefined
					: {
							state: drawControl,
							label: drawLabel,
							ontoggle: () => store.toggleArmDrawOffer(),
						}}
				resign={isOver ? undefined : { armed: confirmResign, onpress: resign }}
			/>
		{/snippet}
	</GameFrame>
{/if}

<script lang="ts">
	/** Laboratory gameplay presents the server's stages and submits explicit immutable decisions. */
	import { onMount, tick } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import type { LaboratoryGame } from '#lib/laboratory/game.svelte.js';
	import type { PairIndex } from '#lib/laboratory/protocol.js';
	import type { Seat } from '#lib/live/liveTypes.js';
	import LaboratoryPlayBoard from './LaboratoryPlayBoard.svelte';
	import './game.css';
	let { game }: { game: LaboratoryGame } = $props();
	let controls = $state<HTMLElement>();
	let board = $state<{ focusBoard(): void }>();
	let resigning = $state(false);
	let resignPanel = $state<HTMLDivElement>();
	let resignButton = $state<HTMLButtonElement>();
	let clockTick = $state(0);
	onMount(() => {
		const timer = setInterval(() => (clockTick += 1), 200);
		return () => clearInterval(timer);
	});
	function clock(seat: Seat): string {
		void clockTick;
		return game.clock(seat);
	}
	const pieceLetters = ['', 'P', 'N', 'B', 'R', 'Q', 'K'];
	const names = [
		'',
		m.lab_game_pawn(),
		m.lab_game_knight(),
		m.lab_game_bishop(),
		m.lab_game_rook(),
		m.lab_game_queen(),
		m.lab_game_king(),
	];
	const colorName = (seat: Seat) =>
		seat === 'White' ? m.laboratory_white() : m.laboratory_black();
	const position = $derived(game.state);
	const turn = $derived(position?.lab.turn);
	const phase = $derived(turn?.phase);
	const otherSeat: Seat = $derived(game.seat === 'White' ? 'Black' : 'White');
	const ended = $derived(position !== null && 'Ended' in position.status);
	const ownTurn = $derived(position?.activeSeat === game.seat);
	const phaseTitle = $derived(
		turn?.phase === 'AwaitingPlayers'
			? m.lab_game_waiting()
			: turn?.phase === 'AwaitingFirstRoll'
				? m.lab_game_first()
				: turn?.phase === 'AwaitingSecondRoll'
					? m.lab_game_second()
					: turn?.phase === 'AwaitingPairChoice'
						? m.lab_game_choice()
						: turn?.phase === 'PlayingSelectedPair'
							? m.lab_game_play()
							: m.lab_game_finished(),
	);
	const equal = $derived(
		!!turn &&
			turn.offers.length === 2 &&
			[...turn.offers[0]].sort().join() === [...turn.offers[1]].sort().join(),
	);
	const announcement = $derived(
		turn
			? `${ownTurn ? m.lab_game_your_turn() : m.lab_game_friend_turn()}. ${phaseTitle}. ${turn.offers.map((_, index) => pairLabel(index)).join('. ')} ${turn.selectedPairIndex !== null ? m.lab_game_selected_announcement({ number: turn.selectedPairIndex + 1 }) : ''} ${game.lastPass ?? ''}`
			: m.lab_game_loading(),
	);
	$effect(() => {
		const focusPhase = phase;
		if (!ownTurn || !game.connected || game.pending) return;
		void tick().then(() => {
			if (phase !== focusPhase || !game.connected || game.pending) return;
			if (focusPhase === 'PlayingSelectedPair') board?.focusBoard();
			else
				controls?.querySelector<HTMLButtonElement>('[data-stage-action]:not(:disabled)')?.focus();
		});
	});
	function pairLabel(index: number): string {
		const pair = turn?.offers[index];
		return m.lab_game_pair_label({
			number: index + 1,
			pieces: pair ? m.lab_game_and({ first: names[pair[0]], second: names[pair[1]] }) : '',
		});
	}
	async function confirmResign() {
		resigning = true;
		await tick();
		resignPanel?.querySelector('button')?.focus();
	}
	function cancelResign() {
		resigning = false;
		resignButton?.focus();
	}
	function resultLabel(): string {
		if (!position || !('Ended' in position.status)) return '';
		const over = position.status.Ended.over;
		return 'Draw' in over.result
			? m.lab_game_draw_result()
			: m.lab_game_win_result({
					score: over.result.Win.side === 'White' ? '1 — 0' : '0 — 1',
					color: colorName(over.result.Win.side),
				});
	}
</script>

{#if position && turn}
	<div class="lab-game-top">
		<h1 class="lab-game-title">{ended ? m.lab_game_finished() : m.lab_game_title()}</h1>
		<span class="lab-turn-label"
			>{ended
				? m.lab_game_unrated()
				: turn.phase === 'PlayingSelectedPair'
					? m.lab_game_to_move({ color: colorName(position.activeSeat) })
					: m.lab_game_to_act({ color: colorName(position.activeSeat) })}</span
		>
	</div>
	{#if !game.connected && !ended}<div class="lab-alert lab-game-notice" role="status">
			{m.lab_game_reconnect()}
		</div>{/if}
	{#if game.error}<div class="lab-alert lab-game-notice" role="alert">{game.error}</div>{/if}
	{#if game.lastPass}<p class="lab-pass-notice" role="status">{game.lastPass}</p>{/if}
	<div class="lab-game-grid">
		<section class="lab-game-board-column" aria-label={m.lab_game_board_clocks()}>
			<div class="lab-player">
				<div>
					<p class="lab-seat-name">{m.lab_game_friend_color({ color: colorName(otherSeat) })}</p>
					<p class="lab-seat-status">
						{ended
							? m.lab_game_finished()
							: position.activeSeat === otherSeat
								? m.lab_game_clock_running()
								: m.lab_game_wait()}
					</p>
				</div>
				<span
					class="lab-clock"
					class:lab-clock-active={!ended &&
						position.activeSeat === otherSeat &&
						turn.phase !== 'AwaitingPlayers'}
					aria-label={m.laboratory_clock_label({ color: colorName(otherSeat) })}
					>{clock(otherSeat)}</span
				>
			</div>
			<LaboratoryPlayBoard
				dfen={game.boardDfen}
				seat={game.seat}
				moves={game.moves}
				disabled={!game.canMove}
				onmove={(uci) => game.move(uci)}
				bind:this={board}
			/>
			<div class="lab-player">
				<div>
					<p class="lab-seat-name">{m.lab_game_you_color({ color: colorName(game.seat) })}</p>
					<p class="lab-seat-status">
						{ended
							? m.lab_game_finished()
							: game.connected
								? ownTurn
									? m.lab_game_your_turn()
									: m.lab_game_friend_turn()
								: m.lab_game_reconnecting()}
					</p>
				</div>
				<span
					class="lab-clock"
					class:lab-clock-active={!ended && ownTurn && turn.phase !== 'AwaitingPlayers'}
					aria-label={m.laboratory_clock_label({ color: colorName(game.seat) })}
					>{clock(game.seat)}</span
				>
			</div>
		</section>
		<aside class="lab-game-rail" aria-label={m.lab_game_controls()} bind:this={controls}>
			<section class="lab-action-panel" aria-busy={game.pending}>
				<div class="lab-action-head">
					<span
						>{ended
							? m.lab_game_result()
							: ownTurn
								? m.lab_game_your_turn()
								: m.lab_game_friend_turn()}</span
					><span>{game.pending ? m.lab_game_confirming() : m.lab_game_two_pairs()}</span>
				</div>
				<h2>{ended ? resultLabel() : phaseTitle}</h2>
				{#if ended}
					<p class="lab-action-description">
						{m.lab_game_result_description({
							reason: 'Ended' in position.status ? position.status.Ended.over.termination : '',
						})}
					</p>
				{:else if turn.phase === 'AwaitingPlayers'}
					<p class="lab-action-description">
						{m.lab_game_wait_description()}
					</p>
				{:else if !ownTurn}
					<p class="lab-action-description">
						{turn.phase === 'AwaitingPairChoice'
							? m.lab_game_friend_choice()
							: turn.phase === 'PlayingSelectedPair'
								? m.lab_game_friend_play()
								: m.lab_game_friend_roll()}
					</p>
				{:else if turn.phase === 'AwaitingFirstRoll'}
					<p class="lab-action-description">
						{m.lab_game_first_description()}
					</p>
				{:else if turn.phase === 'AwaitingSecondRoll'}
					<p class="lab-action-description">
						{m.lab_game_second_description()}
					</p>
				{:else if turn.phase === 'AwaitingPairChoice'}
					<p class="lab-action-description">
						{m.lab_game_choice_description()}
						{equal ? m.lab_game_equal() : ''}
					</p>
				{:else if turn.phase === 'PlayingSelectedPair'}
					<p class="lab-action-description">
						{m.lab_game_play_description()}
					</p>
				{/if}
				{#if turn.offers.length}
					<div class="lab-pair-cards" aria-label={m.lab_game_pairs()}>
						{#each turn.offers as pair, index (index)}
							{@const chosen = turn.selectedPairIndex === index}
							{@const selectable = turn.phase === 'AwaitingPairChoice' && game.canAct}
							<button
								type="button"
								class="lab-pair-card"
								class:lab-pair-chosen={chosen}
								class:lab-pair-tentative={game.tentative === index &&
									turn.selectedPairIndex === null}
								class:lab-pair-discarded={turn.selectedPairIndex !== null && !chosen}
								aria-label={pairLabel(index)}
								aria-pressed={chosen || game.tentative === index}
								disabled={!selectable}
								data-stage-action={selectable ? '' : undefined}
								onclick={() => game.chooseTentative(index as PairIndex)}
							>
								<span class="lab-pair-caption"
									>{m.lab_game_pair({ number: index + 1 })}<span aria-hidden="true"
										>{chosen ? '✓' : game.tentative === index ? '○' : ''}</span
									></span
								>
								<span class="lab-pair-dice" aria-hidden="true"
									>{#each pair as die, dieIndex (dieIndex)}<span class="lab-die"
											><img
												src={`/pieces/cburnett/${position.activeSeat === 'White' ? 'w' : 'b'}${pieceLetters[die]}.svg`}
												alt=""
											/></span
										>{/each}</span
								>
								<span class="lab-pair-state"
									>{chosen
										? m.lab_game_locked()
										: turn.selectedPairIndex !== null
											? m.lab_game_not_selected()
											: game.tentative === index
												? m.lab_game_tentative()
												: m.lab_game_whole()}</span
								>
								{#if turn.phase === 'AwaitingPairChoice' && game.offerPlayable(index as PairIndex) === false}<span
										class="lab-pair-state">{m.lab_game_no_moves()}</span
									>{/if}
							</button>
						{/each}
						{#if turn.offers.length === 1}<div
								class="lab-pair-placeholder"
								aria-label={m.lab_game_second_missing()}
							>
								<span>{m.lab_game_pair({ number: 2 })}</span><span aria-hidden="true">? + ?</span
								><span>{m.lab_game_not_rolled()}</span>
							</div>{/if}
					</div>
				{/if}
				{#if turn.phase === 'AwaitingFirstRoll' && ownTurn}<button
						type="button"
						class="lab-primary"
						data-stage-action
						disabled={!game.canAct}
						onclick={() => game.rollFirst()}
						>{m.lab_game_roll_first()} <span aria-hidden="true">↗</span></button
					>{/if}
				{#if turn.phase === 'AwaitingSecondRoll' && ownTurn}<button
						type="button"
						class="lab-primary"
						data-stage-action
						disabled={!game.canAct}
						onclick={() => game.rollSecond()}
						>{m.lab_game_roll_second()} <span aria-hidden="true">↗</span></button
					>{/if}
				{#if turn.phase === 'AwaitingPairChoice' && ownTurn}<button
						type="button"
						class="lab-primary"
						disabled={!game.canAct || game.tentative === null}
						onclick={() => game.confirmPair()}
						>{game.tentative === null
							? m.lab_game_confirm_empty()
							: m.lab_game_confirm({ number: game.tentative + 1 })}
						<span aria-hidden="true">→</span></button
					>
					<p class="lab-fineprint">
						{m.lab_game_pass_description()}
					</p>{/if}
				{#if turn.phase === 'PlayingSelectedPair'}
					<div class="lab-selected-summary">
						{m.lab_game_remaining({
							number: turn.selectedPairIndex! + 1,
							count: game.remainingDice.length,
						})}
					</div>
					{#if ownTurn}<div class="lab-draft-moves" aria-label={m.lab_game_draft()}>
							{#each game.draft as move, index (index)}<span
									>{move.slice(0, 2)}–{move.slice(2)}{move.length > 4 ? ` (${move[4]})` : ''}</span
								>{/each}
						</div>
						<div class="lab-turn-actions">
							<button
								type="button"
								class="lab-secondary"
								disabled={!game.canAct || !game.draft.length}
								onclick={() => game.undo()}>{m.lab_game_undo()}</button
							><button
								type="button"
								class="lab-primary"
								disabled={!game.canAct || !game.draft.length || game.moves.length > 0}
								onclick={() => game.submit()}
								>{m.lab_game_submit()} <span aria-hidden="true">→</span></button
							>
						</div>{/if}
				{/if}
			</section>
			{#if !ended && turn.phase !== 'AwaitingPlayers'}
				{#if position.drawOffer?.pending && ownTurn}<section
						class="lab-draw-response"
						aria-label={m.lab_game_draw_offer()}
					>
						<p>{m.lab_game_draw_description()}</p>
						<div class="lab-turn-actions">
							<button
								type="button"
								class="lab-secondary"
								disabled={!game.canAct}
								onclick={() => game.respondDraw(false)}>{m.lab_game_decline()}</button
							><button
								type="button"
								class="lab-secondary"
								disabled={!game.canAct}
								onclick={() => game.respondDraw(true)}>{m.lab_game_accept_draw()}</button
							>
						</div>
					</section>{/if}
				<div class="lab-game-secondary">
					<label class="lab-draw-checkbox"
						><input
							type="checkbox"
							checked={game.drawArmed}
							disabled={!game.canAct || position.mayOfferDraw === false}
							onchange={(event) => game.armDraw(event.currentTarget.checked)}
						/>
						{m.lab_game_offer_draw()}</label
					><button
						type="button"
						class="lab-text-button"
						bind:this={resignButton}
						disabled={!game.connected || game.pending}
						onclick={confirmResign}>{m.lab_game_resign()}</button
					>
				</div>
				{#if resigning}<div
						class="lab-resign-confirm"
						role="group"
						aria-label={m.lab_game_confirm_resign()}
						bind:this={resignPanel}
					>
						<p>{m.lab_game_resign_question()}</p>
						<div class="lab-turn-actions">
							<button
								type="button"
								class="lab-secondary"
								onclick={cancelResign}
								onkeydown={(event) => {
									if (event.key === 'Escape') cancelResign();
								}}>{m.lab_game_keep_playing()}</button
							><button
								type="button"
								class="lab-secondary"
								disabled={!game.connected || game.pending}
								onkeydown={(event) => {
									if (event.key === 'Escape') cancelResign();
								}}
								onclick={() => {
									resigning = false;
									game.resign();
								}}>{m.lab_game_confirm_resign()}</button
							>
						</div>
					</div>{/if}
			{/if}
		</aside>
	</div>
	<div class="lab-sr" role="status" aria-live="polite">{announcement}</div>
{/if}

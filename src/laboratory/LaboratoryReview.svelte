<script lang="ts">
	/** Public record review stays separate from live state; rematches preserve server-owned conditions. */
	import { tick } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import type { LaboratoryApi } from '#lib/laboratory/api.js';
	import type { LaboratorySession } from '#lib/laboratory/session.svelte.js';
	import { LaboratoryRecordsApi, type LaboratoryTranscript } from '#lib/laboratory/records.js';
	import type { PublicTurn } from '#lib/laboratory/protocol.js';
	import LaboratoryBoard from './LaboratoryBoard.svelte';
	let { api, session }: { api: LaboratoryApi; session: LaboratorySession } = $props();
	let record = $state<LaboratoryTranscript | null>(null);
	let loading = $state(false);
	let error = $state('');
	let open = $state(false);
	let index = $state(0);
	let heading = $state<HTMLHeadingElement>();
	const gameId = $derived(session.access?.mine.gameId ?? null);
	const rematchEligible = $derived(
		session.ended &&
			session.state !== null &&
			'Ended' in session.state.status &&
			session.state.status.Ended.over.termination !== 'Aborted',
	);
	let request = 0;
	$effect(() => {
		void gameId;
		request += 1;
		record = null;
		open = false;
		index = 0;
		error = '';
		loading = false;
	});
	const selected = $derived(record && index > 0 ? record.turns[index - 1] : null);
	const position = $derived(selected?.fenAfter ?? record?.initialDfen ?? '');
	const names = [
		'',
		m.laboratory_review_pawn(),
		m.laboratory_review_knight(),
		m.laboratory_review_bishop(),
		m.laboratory_review_rook(),
		m.laboratory_review_queen(),
		m.laboratory_review_king(),
	];
	function phaseName(turn: PublicTurn): string {
		switch (turn.phase) {
			case 'AwaitingPlayers':
				return m.laboratory_review_stage_awaiting_players();
			case 'AwaitingFirstRoll':
				return m.laboratory_review_stage_awaiting_first_roll();
			case 'AwaitingSecondRoll':
				return m.laboratory_review_stage_awaiting_second_roll();
			case 'AwaitingPairChoice':
				return m.laboratory_review_stage_awaiting_pair_choice();
			case 'PlayingSelectedPair':
				return m.laboratory_review_stage_playing_selected_pair();
			case 'Ended':
				return m.laboratory_review_stage_ended();
		}
	}
	async function review() {
		if (!gameId || loading) return;
		const current = ++request;
		loading = true;
		error = '';
		try {
			const result = await new LaboratoryRecordsApi(api).transcript(gameId);
			if (current !== request) return;
			record = result;
			open = true;
			index = result.turns.length;
			await tick();
			heading?.focus();
		} catch {
			if (current === request) error = m.laboratory_review_unavailable();
		} finally {
			if (current === request) loading = false;
		}
	}
	function download() {
		if (!record) return;
		// Only the validated public schema is serialized, never room access or raw network data.
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }),
		);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `dicechess-choice-2x2d6-r1-schema1-${gameId}.json`;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
</script>

<section class="lab-record-controls" aria-label={m.laboratory_review_controls()}>
	{#if rematchEligible}
		<p class="lab-hint">{m.laboratory_review_rematch_note()}</p>
		<div class="lab-record-buttons">
			<button
				class="lab-primary"
				type="button"
				disabled={session.rematchPending}
				onclick={() => session.rematch()}
				>{session.rematchPending
					? m.laboratory_review_checking()
					: session.rematchWaiting
						? m.laboratory_review_check_rematch()
						: m.laboratory_review_offer_rematch()} <span aria-hidden="true">→</span></button
			>
			{#if session.rematchWaiting}<button
					class="lab-secondary"
					type="button"
					disabled={session.rematchPending}
					onclick={() => session.rematch(false)}>{m.laboratory_review_withdraw_consent()}</button
				>{/if}
		</div>
		{#if session.rematchWaiting}<p role="status" class="lab-hint">
				{m.laboratory_review_waiting_consent()}
			</p>{/if}
	{/if}
	<button class="lab-secondary" type="button" onclick={review} disabled={loading}
		>{loading
			? m.laboratory_review_loading()
			: open
				? m.laboratory_review_refresh()
				: m.laboratory_review_open()}</button
	>
	{#if error}<p role="alert" class="lab-alert">{error}</p>{/if}
</section>
{#if open && record}
	<section class="lab-review" aria-labelledby="lab-review-title">
		<div class="lab-game-top">
			<h2 id="lab-review-title" bind:this={heading} tabindex="-1">{m.laboratory_review_title()}</h2>
			<button type="button" class="lab-text-button" onclick={() => (open = false)}
				>{m.laboratory_review_close()}</button
			>
		</div>
		<p class="lab-hint">
			{m.laboratory_review_variant()} · {m.laboratory_review_revision({
				revision: record.variant.revision,
			})} · {m.laboratory_review_rules({ version: record.provenance.rulesVersion })} · {record.completeness ===
			'complete'
				? m.laboratory_review_complete()
				: m.laboratory_review_incomplete()}
		</p>
		<div class="lab-game-grid">
			<div class="lab-game-board-column">
				<LaboratoryBoard dfen={position} seat={session.game.seat} />
				<nav class="lab-record-buttons" aria-label={m.laboratory_review_positions()}>
					<button
						class="lab-secondary"
						type="button"
						disabled={index === 0}
						onclick={() => (index = 0)}>{m.laboratory_review_start()}</button
					>
					<button
						class="lab-secondary"
						type="button"
						disabled={index === 0}
						onclick={() => (index -= 1)}
						aria-label={m.laboratory_review_previous_turn()}>←</button
					>
					<span role="status">{index} / {record.turns.length}</span>
					<button
						class="lab-secondary"
						type="button"
						disabled={index === record.turns.length}
						onclick={() => (index += 1)}
						aria-label={m.laboratory_review_next_turn()}>→</button
					>
					<button
						class="lab-secondary"
						type="button"
						disabled={index === record.turns.length}
						onclick={() => (index = record!.turns.length)}>{m.laboratory_review_end()}</button
					>
				</nav>
			</div>
			<div class="lab-action-panel">
				{#if selected}
					<h3>
						{m.laboratory_review_turn({
							number: selected.turnNumber,
							color: selected.activeColor === 'w' ? m.laboratory_white() : m.laboratory_black(),
						})}
					</h3>
					{#each selected.offers as pair, pairIndex (pairIndex)}<p
							class="lab-review-pair"
							class:lab-review-selected={selected.selectedPairIndex === pairIndex}
						>
							{m.laboratory_review_pair({ number: pairIndex + 1 })}: {pair
								.map((die) => names[die])
								.join(' + ')}
							{selected.selectedPairIndex === pairIndex
								? m.laboratory_review_selected_pair()
								: m.laboratory_review_discarded()}
						</p>{/each}
					<p>{selected.moves.length ? selected.moves.join(' · ') : m.laboratory_review_passed()}</p>
				{:else}<h3>{m.laboratory_review_initial_position()}</h3>
					<p>{m.laboratory_review_no_pair_played()}</p>{/if}
				<h3>{m.laboratory_review_latest_turn()}</h3>
				<p>{phaseName(record.currentTurn)}</p>
				{#each record.currentTurn.offers as pair, pairIndex (pairIndex)}<p>
						{m.laboratory_review_pair({ number: pairIndex + 1 })}: {pair
							.map((die) => names[die])
							.join(' + ')}
						{record.currentTurn.selectedPairIndex === pairIndex
							? m.laboratory_review_selected_pair()
							: ''}
					</p>{/each}
				<button type="button" class="lab-secondary" onclick={download}
					>{m.laboratory_review_download()} ↓</button
				>
			</div>
		</div>
	</section>
{/if}

<style>
	.lab-record-controls {
		display: grid;
		gap: 12px;
		margin-top: 24px;
		padding-top: 20px;
		border-top: 1px solid var(--lab-line);
	}
	.lab-record-controls > button {
		justify-self: start;
	}
	.lab-record-buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
	}
	.lab-record-buttons .lab-primary {
		width: auto;
	}
	.lab-review {
		margin-top: 24px;
		padding-top: 24px;
		border-top: 1px solid var(--lab-line);
	}
	.lab-review .lab-game-grid {
		margin-top: 20px;
	}
	.lab-review-pair {
		border: 1px solid var(--lab-line);
		padding: 14px;
		border-radius: 10px;
	}
	.lab-review-selected {
		background: var(--lab-selection);
		border-color: var(--lab-action);
	}
</style>

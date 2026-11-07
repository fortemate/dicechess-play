<script lang="ts">
	// Snapshot identity includes speed, epoch and the exact cutoff. Cancelled/stale requests never
	// replace the selected history with another speed or with the current live board (#124).
	import { m } from '#lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import {
		fetchRatingSnapshots,
		fetchRatingSnapshot,
		type RatingSnapshot,
		type RatingSnapshotSummary,
	} from '#lib/leaderboard/leaderboardApi.js';
	import type { RatingCategory } from '#lib/live/ratingCategory.js';
	import { ratingDate, sameRatingCutoff } from '#lib/ratings/ratingPresentation.js';
	import RatingTable from './RatingTable.svelte';
	let {
		category,
		currentEpoch,
		requested,
	}: {
		category: RatingCategory;
		currentEpoch?: number | null;
		requested?: { epoch: number; cutoff: string } | null;
	} = $props();
	let summaries = $state<RatingSnapshotSummary[]>([]);
	let selected = $state('');
	let listLoading = $state(true);
	let listError = $state<string | null>(null);
	let unsupported = $state(false);
	let snapshot = $state<RatingSnapshot | null>(null);
	let snapshotLoading = $state(false);
	let snapshotError = $state<string | null>(null);
	let listRetry = $state(0);
	let snapshotRetry = $state(0);
	const key = (item: { epoch: number; cutoff: string }) =>
		JSON.stringify([item.epoch, item.cutoff]);

	$effect(() => {
		const wanted = category;
		const target = requested;
		void listRetry;
		const controller = new AbortController();
		let alive = true;
		summaries = [];
		selected = '';
		listLoading = true;
		listError = null;
		unsupported = false;
		fetchRatingSnapshots(wanted, controller.signal)
			.then((items) => {
				if (!alive) return;
				if (items.some((item) => item.category !== wanted))
					throw new Error('Snapshot category mismatch');
				summaries = items;
				selected = target ? key(target) : items[0] ? key(items[0]) : '';
			})
			.catch((error: unknown) => {
				if (!alive) return;
				if (error instanceof Error && error.message.endsWith('404')) unsupported = true;
				else listError = m.leaderboard_history_error();
			})
			.finally(() => {
				if (alive) listLoading = false;
			});
		return () => {
			alive = false;
			controller.abort();
		};
	});

	$effect(() => {
		const wanted = category;
		const selectedKey = selected;
		const target =
			summaries.find((item) => key(item) === selectedKey) ??
			(requested && key(requested) === selectedKey ? requested : null);
		void snapshotRetry;
		snapshot = null;
		snapshotError = null;
		snapshotLoading = false;
		if (!target || !selectedKey) return;
		const controller = new AbortController();
		let alive = true;
		snapshotLoading = true;
		fetchRatingSnapshot(wanted, target.epoch, target.cutoff, controller.signal)
			.then((item) => {
				if (!alive) return;
				if (
					item.category !== wanted ||
					item.epoch !== target.epoch ||
					!sameRatingCutoff(item.cutoff, target.cutoff)
				) {
					throw new Error('Snapshot identity mismatch');
				}
				snapshot = item;
			})
			.catch((error: unknown) => {
				if (alive)
					snapshotError =
						error instanceof Error && error.message.endsWith('404')
							? m.leaderboard_snapshot_missing()
							: m.leaderboard_snapshot_error();
			})
			.finally(() => {
				if (alive) snapshotLoading = false;
			});
		return () => {
			alive = false;
			controller.abort();
		};
	});

	const selectedListed = $derived(summaries.some((item) => key(item) === selected));
	const permalink = $derived(
		snapshot
			? `${new URLSearchParams({
					view: 'history',
					category,
					epoch: String(snapshot.epoch),
					cutoff: snapshot.cutoff,
				})}`
			: '',
	);
</script>

<section class="flex min-w-0 flex-col gap-4" aria-label={m.leaderboard_history()}>
	<p class="text-sm text-content-muted">{m.leaderboard_history_scope()}</p>
	{#if listLoading}
		<p role="status" class="text-sm text-content-muted">{m.leaderboard_loading()}</p>
	{:else if unsupported}
		<p class="rounded-xl border border-border bg-surface p-4 text-content-muted">
			{m.leaderboard_history_unsupported()}
		</p>
	{:else if listError}
		<div role="alert" class="rounded-xl border border-danger/40 p-4 text-danger">
			<p>{listError}</p>
			<button type="button" class="mt-2 underline" onclick={() => listRetry++}
				>{m.leaderboard_retry()}</button
			>
		</div>
	{:else if summaries.length === 0 && !selected}
		<p class="rounded-xl border border-border bg-surface p-4 text-content-muted">
			{m.leaderboard_history_empty()}
		</p>
	{:else}
		<label class="flex min-w-0 flex-col gap-2 text-sm font-semibold text-content">
			{m.leaderboard_snapshot_select()}
			<select
				bind:value={selected}
				class="min-w-0 max-w-full rounded-xl border border-border bg-surface px-3 py-2 text-content"
			>
				{#if requested && !selectedListed}<option value={key(requested)}
						>{m.common_rating_epoch({ epoch: requested.epoch })}</option
					>{/if}
				{#each summaries as item (key(item))}
					<option value={key(item)}
						>{m.leaderboard_snapshot_option({
							epoch: item.epoch,
							date: ratingDate(item.cutoff) ?? item.cutoff,
							count: item.entryCount,
						})}</option
					>
				{/each}
			</select>
		</label>
		{#if snapshotLoading}
			<p role="status" class="text-sm text-content-muted">{m.leaderboard_loading()}</p>
		{:else if snapshotError}
			<div role="alert" class="rounded-xl border border-danger/40 p-4 text-danger">
				<p>{snapshotError}</p>
				<button type="button" class="mt-2 underline" onclick={() => snapshotRetry++}
					>{m.leaderboard_retry()}</button
				>
			</div>
		{:else if snapshot}
			<div
				class="space-y-1 rounded-xl border border-border bg-surface/50 p-4 text-sm text-content-muted"
			>
				<p class="font-semibold text-content">
					{m.common_rating_historical()} · {m.common_rating_epoch({ epoch: snapshot.epoch })}
				</p>
				{#if currentEpoch != null && snapshot.epoch < currentEpoch}<p>
						{m.leaderboard_earlier_epoch()}
					</p>{/if}
				<p>{m.common_rating_cutoff({ date: ratingDate(snapshot.cutoff) ?? snapshot.cutoff })}</p>
				<p>
					{m.common_rating_computed({
						date: ratingDate(snapshot.computedAt) ?? snapshot.computedAt,
					})}
				</p>
				<p>{m.leaderboard_snapshot_saved()}</p>
				<a
					href={resolve(`/leaderboard?${permalink}`)}
					class="inline-block pt-1 font-semibold text-primary underline"
					>{m.leaderboard_snapshot_link()}</a
				>
			</div>
			{#if snapshot.leaders.length}<RatingTable rows={snapshot.leaders} historical />{:else}<p>
					{m.leaderboard_snapshot_empty()}
				</p>{/if}
		{/if}
	{/if}
</section>

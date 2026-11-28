<script lang="ts">
	// Published snapshots of the leaderboard (#124, #261): a choice of saved dates, a line that
	// says the numbers are frozen and cover bots only, and a permanent link to the one on screen.
	//
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
	import { RATING_CATEGORY_LABELS } from '#lib/live/ratingCategory.js';
	import { savedDay, updatedAt } from '#lib/leaderboard/boardView.js';
	import { ratingDate, sameRatingCutoff } from '#lib/ratings/ratingPresentation.js';
	import RatingTable from './RatingTable.svelte';
	import Button from './ui/Button.svelte';
	let {
		category,
		currentEpoch,
		requested,
		query = '',
	}: {
		category: RatingCategory;
		currentEpoch?: number | null;
		requested?: { epoch: number; cutoff: string } | null;
		/** What the visitor typed into the search of the page. */
		query?: string;
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

	// A choice reads "Saved 20 Nov 2026, 06:00 UTC". Two snapshots that would read the same
	// (saved within one minute, or at one moment on different scales) are told apart by the
	// exact time and the epoch, which is their whole identity.
	const plainLabel = (item: { epoch: number; cutoff: string }) =>
		m.leaderboard_snapshot_option({ date: updatedAt(item.cutoff) ?? item.cutoff });
	const listed = $derived(
		requested && !summaries.some((item) => key(item) === key(requested))
			? [requested, ...summaries]
			: summaries,
	);
	const optionLabel = $derived.by(() => {
		const seen: Record<string, number> = {};
		for (const item of listed) seen[plainLabel(item)] = (seen[plainLabel(item)] ?? 0) + 1;
		return (item: { epoch: number; cutoff: string }) =>
			seen[plainLabel(item)] > 1
				? m.leaderboard_snapshot_option_exact({
						date: ratingDate(item.cutoff) ?? item.cutoff,
						epoch: item.epoch,
					})
				: plainLabel(item);
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

<section class="flex min-w-0 flex-col gap-5" aria-label={m.leaderboard_history()}>
	{#if listLoading}
		<p role="status" class="m-0 text-content-muted">{m.leaderboard_loading()}</p>
	{:else if unsupported}
		<p class="m-0 text-content-muted">{m.leaderboard_history_unsupported()}</p>
	{:else if listError}
		<div role="alert" class="flex flex-wrap items-center gap-3 text-danger">
			<p class="m-0">{listError}</p>
			<Button variant="secondary" onclick={() => listRetry++}>{m.leaderboard_retry()}</Button>
		</div>
	{:else if summaries.length === 0 && !selected}
		<p class="m-0 text-content-muted">{m.leaderboard_history_empty()}</p>
	{:else}
		<label class="flex min-w-0 flex-wrap items-center gap-3 text-sm font-semibold text-content">
			{m.leaderboard_snapshot_select()}
			<select
				bind:value={selected}
				class="min-h-11 max-w-full min-w-0 cursor-pointer rounded-control border border-border-strong bg-surface px-3 text-sm font-semibold text-content focus-visible:focus-ring"
			>
				{#if requested && !selectedListed}<option value={key(requested)}
						>{optionLabel(requested)}</option
					>{/if}
				{#each summaries as item (key(item))}
					<option value={key(item)}>{optionLabel(item)}</option>
				{/each}
			</select>
		</label>
		{#if snapshotLoading}
			<p role="status" class="m-0 text-content-muted">{m.leaderboard_loading()}</p>
		{:else if snapshotError}
			<div role="alert" class="flex flex-wrap items-center gap-3 text-danger">
				<p class="m-0">{snapshotError}</p>
				<Button variant="secondary" onclick={() => snapshotRetry++}>{m.leaderboard_retry()}</Button>
			</div>
		{:else if snapshot}
			<div
				class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-card bg-highlight px-4 py-3 text-highlight-content md:flex-nowrap"
			>
				<div class="flex min-w-0 flex-col gap-1">
					<p class="m-0">
						{m.leaderboard_snapshot_banner({
							date: savedDay(snapshot.cutoff) ?? snapshot.cutoff,
						})}
					</p>
					{#if currentEpoch != null && snapshot.epoch < currentEpoch}
						<p class="m-0 text-sm">{m.leaderboard_earlier_epoch()}</p>
					{/if}
				</div>
				<a
					href={resolve(`/leaderboard?${permalink}`)}
					class="font-bold whitespace-nowrap text-highlight-content underline focus-visible:focus-ring"
					>{m.leaderboard_snapshot_link()}</a
				>
			</div>
			{#if snapshot.leaders.length}
				<RatingTable
					rows={snapshot.leaders}
					speed={RATING_CATEGORY_LABELS[category]}
					{query}
					historical
				/>
			{:else}
				<p class="m-0 text-content-muted">{m.leaderboard_snapshot_empty()}</p>
			{/if}
		{/if}
	{/if}
</section>

<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import {
		fetchLeaderboard,
		type BoardScope,
		type Leaderboard,
	} from '#lib/leaderboard/leaderboardApi.js';
	import {
		RATING_CATEGORY_LABELS,
		RATING_CATEGORY_ORDER,
		type RatingCategory,
	} from '#lib/live/ratingCategory.js';
	import { knownEpoch, ratingDate } from '#lib/ratings/ratingPresentation.js';
	import RatingTable from '../../components/RatingTable.svelte';
	import RatingHistory from '../../components/RatingHistory.svelte';
	let scope = $state<BoardScope>('all');
	let category = $state<RatingCategory>('blitz');
	let view = $state<'live' | 'history'>('live');
	let board = $state<Leaderboard | null>(null);
	let loaded = $state(false);
	let error = $state<string | null>(null);
	let retry = $state(0);
	let requested = $state<{ epoch: number; cutoff: string } | null>(null);
	let invalidLink = $state(false);

	// A permalink uses the full immutable identity. Returning via browser history restores it too.
	$effect(() => {
		const params = page.url.searchParams;
		const wantedCategory = params.get('category');
		category = RATING_CATEGORY_ORDER.includes(wantedCategory as RatingCategory)
			? (wantedCategory as RatingCategory)
			: 'blitz';
		view = params.get('view') === 'history' ? 'history' : 'live';
		const epoch = Number(params.get('epoch'));
		const cutoff = params.get('cutoff');
		const hasTarget = params.has('epoch') || params.has('cutoff');
		const validTarget = knownEpoch(epoch) && !!cutoff && ratingDate(cutoff) !== null;
		invalidLink =
			params.get('view') === 'history' &&
			((hasTarget && !validTarget) ||
				(!!wantedCategory && !RATING_CATEGORY_ORDER.includes(wantedCategory as RatingCategory)));
		requested = validTarget && cutoff ? { epoch, cutoff } : null;
	});

	$effect(() => {
		if (!isLiveEnabled() || view !== 'live') return;
		const wanted = scope;
		const wantedCategory = category;
		void retry;
		board = null;
		loaded = false;
		error = null;
		let alive = true;
		fetchLeaderboard(wanted, wantedCategory)
			.then((result) => {
				if (!alive) return;
				if (result.category !== wantedCategory) throw new Error('Leaderboard category mismatch');
				board = result;
				loaded = true;
			})
			.catch(() => {
				if (alive) error = m.leaderboard_live_error();
			});
		return () => {
			alive = false;
		};
	});
	const scopes = $derived([
		{ value: 'all' as const, label: m.leaderboard_all() },
		{ value: 'bots' as const, label: m.leaderboard_bots() },
		{ value: 'players' as const, label: m.leaderboard_players() },
	]);
	const pillClass = (active: boolean) =>
		active
			? 'rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-content'
			: 'rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold text-content-muted hover:text-content';
	function chooseCategory(value: RatingCategory) {
		requested = null;
		invalidLink = false;
		category = value;
	}
	function chooseView(value: 'live' | 'history') {
		invalidLink = false;
		view = value;
	}
</script>

<svelte:head
	><title>{m.leaderboard_page_title()}</title><meta
		name="description"
		content={m.leaderboard_description()}
	/></svelte:head
>

<section class="mx-auto flex min-w-0 max-w-5xl flex-col gap-5">
	<header class="space-y-2">
		<h2 class="text-2xl font-bold text-content">{m.leaderboard_title()}</h2>
		<p class="text-sm text-content-muted">{m.leaderboard_description()}</p>
	</header>
	{#if !isLiveEnabled()}
		<p class="rounded-2xl border border-border bg-surface p-6 text-content-muted">
			{m.leaderboard_disabled()}
		</p>
	{:else}
		<div class="flex flex-wrap gap-2" role="group" aria-label={m.leaderboard_title()}>
			<button
				type="button"
				class={pillClass(view === 'live')}
				aria-pressed={view === 'live'}
				onclick={() => chooseView('live')}>{m.leaderboard_live()}</button
			>
			<button
				type="button"
				class={pillClass(view === 'history')}
				aria-pressed={view === 'history'}
				onclick={() => chooseView('history')}>{m.leaderboard_history()}</button
			>
		</div>
		<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
			{#if view === 'live'}
				<div
					class="flex flex-wrap items-center gap-2"
					role="group"
					aria-label={m.leaderboard_show()}
				>
					<span class="text-xs font-bold uppercase text-content-muted">{m.leaderboard_show()}</span>
					{#each scopes as option (option.value)}<button
							type="button"
							onclick={() => (scope = option.value)}
							aria-pressed={scope === option.value}
							class={pillClass(scope === option.value)}>{option.label}</button
						>{/each}
				</div>
			{/if}
			<div
				class="flex flex-wrap items-center gap-2"
				role="group"
				aria-label={m.leaderboard_speed()}
			>
				<span class="text-xs font-bold uppercase text-content-muted">{m.leaderboard_speed()}</span>
				{#each RATING_CATEGORY_ORDER as option (option)}<button
						type="button"
						onclick={() => chooseCategory(option)}
						aria-pressed={category === option}
						class={pillClass(category === option)}>{RATING_CATEGORY_LABELS[option]}</button
					>{/each}
			</div>
		</div>
		{#if view === 'history'}
			{#if invalidLink}<p role="alert" class="rounded-xl border border-danger/40 p-4 text-danger">
					{m.leaderboard_invalid_link()}
				</p>
			{:else}<RatingHistory
					{category}
					{requested}
					currentEpoch={board?.category === category ? board.epoch : null}
				/>{/if}
		{:else if error}
			<div role="alert" class="rounded-xl border border-danger/40 p-4 text-danger">
				<p>{error}</p>
				<button type="button" class="mt-2 underline" onclick={() => retry++}
					>{m.leaderboard_retry()}</button
				>
			</div>
		{:else if !loaded}
			<p role="status" class="rounded-xl border border-border p-6 text-content-muted">
				{m.leaderboard_loading()}
			</p>
		{:else if board}
			<div
				class="space-y-1 rounded-xl border border-border bg-surface/40 p-4 text-xs text-content-muted"
			>
				<p class="font-semibold text-content">
					{m.common_rating_competitive()} · {RATING_CATEGORY_LABELS[category]}
				</p>
				<p>
					{knownEpoch(board.epoch)
						? m.common_rating_epoch({ epoch: board.epoch })
						: m.common_rating_epoch_unknown()} · {m.common_rating_activity_unknown()}
				</p>
				<p>
					{ratingDate(board.cutoff)
						? m.common_rating_cutoff({ date: ratingDate(board.cutoff)! })
						: m.common_rating_cutoff_unknown()}
				</p>
				<p>
					{ratingDate(board.computedAt)
						? m.common_rating_computed({ date: ratingDate(board.computedAt)! })
						: m.common_rating_computed_unknown()}
				</p>
			</div>
			{#if board.leaders.length}<RatingTable rows={board.leaders} />{:else}<p
					class="rounded-xl border border-border p-6 text-content-muted"
				>
					{m.leaderboard_empty({ speed: RATING_CATEGORY_LABELS[category].toLowerCase() })}
				</p>{/if}
		{/if}
		<details class="rounded-xl border border-border bg-surface/40 p-4 text-xs text-content-muted">
			<summary class="cursor-pointer font-semibold">{m.common_rating_explanation()}</summary>
			<div class="mt-3 space-y-2">
				<p>{m.leaderboard_order_help()}</p>
				<p>{m.common_rating_interval_help()}</p>
				<p>{m.leaderboard_compare_warning()}</p>
				<p>{m.common_rating_scheduling_help()}</p>
			</div>
		</details>
	{/if}
</section>

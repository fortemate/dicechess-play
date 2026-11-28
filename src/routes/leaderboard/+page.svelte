<script lang="ts">
	// The leaderboard (#261): current standings and published snapshots of one rating scale per
	// speed.
	//
	// The page owns what is asked of the server (the speed and who is listed) and the two
	// sections, each with an address of its own: a snapshot link keeps opening the same
	// snapshot. What the visitor types into the search narrows the rows already on screen.
	// How a board is drawn is `RatingTable`; what a row shows is decided by
	// `lib/leaderboard/boardView`, which is pure.
	import { resolve } from '$app/paths';
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
	import { authStore } from '#lib/authStore.svelte.js';
	import { updatedAt } from '#lib/leaderboard/boardView.js';
	import { knownEpoch, ratingDate } from '#lib/ratings/ratingPresentation.js';
	import RatingTable from '../../components/RatingTable.svelte';
	import RatingHistory from '../../components/RatingHistory.svelte';
	import Spinner from '../../components/Spinner.svelte';
	import Button from '../../components/ui/Button.svelte';
	import Chip from '../../components/ui/Chip.svelte';
	import PageHeader from '../../components/ui/PageHeader.svelte';
	import SegmentedControl from '../../components/ui/SegmentedControl.svelte';
	import TabNav from '../../components/ui/TabNav.svelte';

	let scope = $state<BoardScope>('all');
	let category = $state<RatingCategory>('blitz');
	let view = $state<'live' | 'history'>('live');
	let board = $state<Leaderboard | null>(null);
	let loaded = $state(false);
	let error = $state<string | null>(null);
	let retry = $state(0);
	let requested = $state<{ epoch: number; cutoff: string } | null>(null);
	let invalidLink = $state(false);
	let query = $state('');

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
		if (!isLiveEnabled()) return;
		// History needs the current scale too, including when an immutable permalink opens directly.
		const wanted = view === 'history' ? 'bots' : scope;
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
	const speeds = RATING_CATEGORY_ORDER.map((value) => ({
		value,
		label: RATING_CATEGORY_LABELS[value],
	}));
	// Each section keeps the speed on screen in its address.
	const tabs = $derived([
		{
			href: `${resolve('/leaderboard')}${category === 'blitz' ? '' : `?category=${category}`}`,
			label: m.leaderboard_live(),
			current: view === 'live',
		},
		{
			href: `${resolve('/leaderboard')}?view=history&category=${category}`,
			label: m.leaderboard_history(),
			current: view === 'history',
		},
	]);
	const signedOut = $derived(authStore.status === 'signed-out');
	const fieldClass =
		'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-content placeholder:text-content-muted focus-visible:focus-ring';
	function chooseCategory(value: RatingCategory) {
		requested = null;
		invalidLink = false;
		category = value;
	}
</script>

<svelte:head>
	<title>{m.leaderboard_page_title()}</title>
	<meta name="description" content={m.leaderboard_description()} />
</svelte:head>

<div class="flex min-w-0 flex-col gap-5">
	<PageHeader title={m.leaderboard_title()} lead={m.leaderboard_lead()} />

	{#if !isLiveEnabled()}
		<p class="m-0 text-content-muted">{m.leaderboard_disabled()}</p>
	{:else}
		<TabNav label={m.leaderboard_tabs_label()} items={tabs} />

		<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
			<SegmentedControl
				label={m.leaderboard_speed()}
				options={speeds}
				value={category}
				onchange={chooseCategory}
				class="max-sm:w-full"
			/>
			{#if view === 'live'}
				<div role="group" aria-label={m.leaderboard_show()} class="flex flex-wrap gap-2">
					{#each scopes as option (option.value)}
						<Chip pressed={scope === option.value} onclick={() => (scope = option.value)}>
							{option.label}
						</Chip>
					{/each}
				</div>
			{/if}
			<label class="min-w-40 flex-1 sm:ml-auto sm:max-w-56">
				<span class="sr-only">{m.leaderboard_search()}</span>
				<input
					type="search"
					bind:value={query}
					placeholder={m.leaderboard_search()}
					class={fieldClass}
				/>
			</label>
		</div>

		{#if view === 'history'}
			{#if invalidLink}
				<p role="alert" class="m-0 text-danger">{m.leaderboard_invalid_link()}</p>
			{:else}
				<RatingHistory
					{category}
					{requested}
					{query}
					currentEpoch={board?.category === category ? board.epoch : null}
				/>
			{/if}
		{:else}
			{#if signedOut}
				<!-- One line, and only for a visitor the server has said is not signed in. -->
				<div
					class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-card bg-surface-hover px-4 py-3"
				>
					<p class="m-0 text-content">{m.leaderboard_sign_in_line()}</p>
					<Button
						variant="secondary"
						disabled={!authStore.canSignIn}
						onclick={() => authStore.signIn()}
					>
						{m.leaderboard_sign_in()}
					</Button>
				</div>
			{/if}
			{#if error}
				<div role="alert" class="flex flex-wrap items-center gap-3 text-danger">
					<p class="m-0">{error}</p>
					<Button variant="secondary" onclick={() => retry++}>{m.leaderboard_retry()}</Button>
				</div>
			{:else if !loaded}
				<p role="status" class="m-0 flex items-center gap-2 text-content-muted">
					<Spinner />
					{m.leaderboard_loading()}
				</p>
			{:else if board}
				{#if board.leaders.length}
					<RatingTable
						rows={board.leaders}
						speed={RATING_CATEGORY_LABELS[category]}
						{query}
						updated={updatedAt(board.computedAt)}
					/>
				{:else}
					<p class="m-0 text-content-muted">
						{m.leaderboard_empty({ speed: RATING_CATEGORY_LABELS[category].toLowerCase() })}
					</p>
				{/if}
			{/if}
		{/if}

		<details class="text-sm text-content-muted">
			<summary class="cursor-pointer font-semibold text-content focus-visible:focus-ring">
				{m.common_rating_explanation()}
			</summary>
			<div class="mt-3 flex max-w-3xl flex-col gap-2">
				<p class="m-0">{m.leaderboard_order_help()}</p>
				<p class="m-0">{m.common_rating_interval_help()}</p>
				<p class="m-0">{m.leaderboard_compare_warning()}</p>
				<p class="m-0">{m.common_rating_scheduling_help()}</p>
			</div>
		</details>
	{/if}
</div>

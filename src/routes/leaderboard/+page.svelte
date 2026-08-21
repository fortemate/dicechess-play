<script lang="ts">
	import { resolve } from '$app/paths';
	import { isLiveEnabled } from '$lib/live/liveApi';
	import {
		fetchLeaderboard,
		type BoardScope,
		type LeaderRow,
	} from '$lib/leaderboard/leaderboardApi';
	import {
		RATING_CATEGORY_LABELS,
		RATING_CATEGORY_ORDER,
		type RatingCategory,
	} from '$lib/live/ratingCategory';
	import LeaderboardRow from '../../components/LeaderboardRow.svelte';

	// The rating board (D.3, #249): a read-only view over play-api's public GET /leaderboard.
	// One fetch per scope — ratings move on the server's own batch cadence (about a minute),
	// not per-request, so live polling would only reload identical data.
	//
	// Defaults to `all` on purpose. People and bots share ONE Glicko-2 scale (ADR-0017), so
	// ranking them together is the whole point — "how strong am I?" is only answerable against
	// the bots. Lichess does the opposite (BOT accounts are excluded from its leaderboards) but
	// it has thousands of humans and bots would be noise; here bots ARE the population.

	let scope = $state<BoardScope>('all');
	// The second axis (#258): one board per speed. Starts on blitz because that is the server's own
	// default (the ladder's category) — but stated explicitly on every call, like `kind`.
	let category = $state<RatingCategory>('blitz');
	let leaders = $state<LeaderRow[]>([]);
	let loaded = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!isLiveEnabled()) return;
		const wanted = scope; // read inside the effect so a scope change refetches
		const wantedCategory = category; // same for the category tabs
		// Cleared before the request, not after it lands: otherwise switching scope keeps showing the
		// previous population while the new one is in flight — click Players and bots stay on screen,
		// which reads as a filter that did not work. A stale error would linger through a retry the
		// same way. Same reset the bot profile does at the top of its own effect.
		loaded = false;
		error = null;
		let alive = true;
		fetchLeaderboard(wanted, wantedCategory)
			.then((board) => {
				if (alive) {
					leaders = board.leaders;
					loaded = true;
					error = null;
				}
			})
			.catch(() => {
				if (alive) error = 'The leaderboard is unavailable right now — try again in a minute.';
			});
		return () => {
			alive = false;
		};
	});

	const scopes: readonly { value: BoardScope; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'bots', label: 'Bots' },
		{ value: 'players', label: 'Players' },
	];

	// Same pill language as /games' filter bar, so a filter looks like a filter everywhere.
	const pillClass = (active: boolean): string =>
		active
			? 'px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-content transition-colors'
			: 'px-3 py-1 rounded-full text-xs font-bold bg-surface border border-border text-content-muted hover:text-content transition-colors';

	// The empty state names the SPEED, not just the population: an empty bullet board next to a full
	// blitz one is the normal state of a sparse scale, not a bug.
	const emptyMessage = $derived.by(() => {
		const speed = RATING_CATEGORY_LABELS[category].toLowerCase();
		return scope === 'players'
			? `No ranked players at ${speed} yet — a rating joins this board once it settles, after about ten rated ${speed} games.`
			: scope === 'bots'
				? `No rated bots at ${speed} yet — entrants appear once their ${speed} rating converges.`
				: `Nothing on the ${speed} board yet — each speed is its own scale, and a rating appears here once someone settles on it.`;
	});
</script>

<svelte:head>
	<title>Leaderboard — Dice Chess</title>
	<meta
		name="description"
		content="Glicko-2 ratings for Dice Chess players and bots — bullet, blitz and rapid boards on shared scales. See how you rank against the engines."
	/>
</svelte:head>

<!-- Reachable from the top nav now (#211), not only from the lobby/bots/home links, so this
     no longer carries a "back to the lobby" crumb — a visitor may have never been there.
     The app <main> already supplies vertical padding. -->
<section class="mx-auto flex max-w-4xl flex-col gap-5">
	<div class="flex flex-col gap-2">
		<div class="flex flex-col gap-1">
			<h2 class="text-2xl font-bold text-content">Leaderboard</h2>
			<p class="text-sm text-content-muted">
				Glicko-2 ratings — one scale per speed, each shared by people and bots, so a person and a
				bot are directly comparable. A rating joins a board only once it settles — about ten rated
				games at that speed — which is why a new entrant is missing at first rather than sitting at
				the bottom.
			</p>
		</div>
	</div>

	{#if isLiveEnabled()}
		<div class="flex flex-wrap items-center gap-x-5 gap-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs font-bold uppercase tracking-wider text-content-muted">Show</span>
				{#each scopes as option (option.value)}
					<button
						type="button"
						onclick={() => (scope = option.value)}
						aria-pressed={scope === option.value}
						class={pillClass(scope === option.value)}
					>
						{option.label}
					</button>
				{/each}
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs font-bold uppercase tracking-wider text-content-muted">Speed</span>
				{#each RATING_CATEGORY_ORDER as option (option)}
					<button
						type="button"
						onclick={() => (category = option)}
						aria-pressed={category === option}
						class={pillClass(category === option)}
					>
						{RATING_CATEGORY_LABELS[option]}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if !isLiveEnabled()}
		<div class="rounded-2xl border border-border bg-surface p-6 text-center text-content-muted">
			The leaderboard needs a configured play server (<code class="font-mono text-xs"
				>VITE_PLAY_API_URL</code
			>) — it is not available in this build.
		</div>
	{:else if error}
		<div
			class="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-center text-danger"
			role="alert"
		>
			{error}
		</div>
	{:else if !loaded}
		<div
			class="animate-pulse rounded-2xl border border-border bg-surface p-6 text-center text-content-muted"
			aria-live="polite"
		>
			Loading the board…
		</div>
	{:else if leaders.length === 0}
		<div class="rounded-2xl border border-border bg-surface p-6 text-center text-content-muted">
			{emptyMessage}
		</div>
	{:else}
		<div class="overflow-x-auto rounded-2xl border border-border bg-surface">
			<table class="w-full text-sm">
				<caption class="sr-only">Players and bots ranked by Glicko-2 rating, best first</caption>
				<thead>
					<tr
						class="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-content-muted"
					>
						<th scope="col" class="px-4 py-3 text-right">#</th>
						<th scope="col" class="px-4 py-3">{scope === 'players' ? 'Player' : 'Name'}</th>
						<th scope="col" class="px-4 py-3 text-right">Rating</th>
						<th scope="col" class="hidden px-4 py-3 text-right sm:table-cell">Games</th>
						<th scope="col" class="hidden px-4 py-3 text-right sm:table-cell">W · D · L</th>
						<th scope="col" class="px-4 py-3 text-right">Win %</th>
					</tr>
				</thead>
				<tbody>
					{#each leaders as leader (leader.kind + '/' + (leader.team ?? '') + '/' + leader.name)}
						<LeaderboardRow row={leader} />
					{/each}
				</tbody>
			</table>
		</div>
		<p class="text-center text-xs text-content-muted/70">
			Ratings update about once a minute. Want a rating of your own? Sign in and pick
			<b>Rated</b>
			when you
			<a class="text-primary hover:underline" href={resolve('/bots')}>challenge a bot</a>. Want your
			own bot here? Register it via the
			<a class="text-primary hover:underline" href="https://bots.fortemate.com/"> Bot API </a>
			and join the ladder — every game runs on the same
			<a class="text-primary hover:underline" href="https://github.com/fortemate/dicechess-engine">
				dice chess engine
			</a>.
		</p>
	{/if}
</section>

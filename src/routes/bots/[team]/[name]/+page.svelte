<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { isLiveEnabled } from '$lib/live/liveApi';
	import { fetchBotProfile, type BotProfile } from '$lib/leaderboard/leaderboardApi';
	import type { PlayerOpponent } from '$lib/games/gamesApi';
	import { emptyCounts, winRate } from '$lib/stats/playerRecord';
	import CategoryRatings from '../../../../components/CategoryRatings.svelte';
	import WdlSummaryCard from '../../../../components/WdlSummaryCard.svelte';
	import WdlCounts from '../../../../components/WdlCounts.svelte';
	import WdlBar from '../../../../components/WdlBar.svelte';
	import ProfileGameCard from '../../../../components/ProfileGameCard.svelte';
	import BotBadge from '../../../../components/BotBadge.svelte';
	import BotChallengePanel from '../../../../components/BotChallengePanel.svelte';

	// A bot's public profile (#152 Tier 1) — "almost pure assembly": fetchBotProfile/BotProfile/
	// ProfileRecentGame already existed with zero consumers before this route. This repo's first
	// multi-segment dynamic route; follows the same client-side-fetch-in-$effect pattern
	// games/[id] and live/[id] already establish (no +page.ts load function exists anywhere here).
	// Tier 2 (record vs humans, head-to-head vs other models, #165) reuses PlayerOpponent — the
	// same wire shape `/me`'s "Online" section already renders via WdlBar/WdlCounts, just filtered
	// by perspective instead of aggregated by guest. Tier 3 (rating history) stays out of scope.

	let profile = $state<BotProfile | null>(null);
	let loading = $state(false);
	let notFound = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		const team = page.params.team;
		const name = page.params.name;
		profile = null;
		notFound = false;
		error = null;
		if (!team || !name) return;
		if (!isLiveEnabled()) return;
		let alive = true;
		loading = true;
		fetchBotProfile(team, name)
			.then((result) => {
				if (!alive) return;
				profile = result;
			})
			.catch((err: unknown) => {
				if (!alive) return;
				// A 404 means "no such bot" (a stale link, a typo) — a fundamentally different,
				// permanent state from a transient server problem, worth telling apart.
				if (err instanceof Error && err.message.endsWith('404')) notFound = true;
				else error = "This bot's profile isn't available right now.";
			})
			.finally(() => {
				if (alive) loading = false;
			});
		return () => {
			alive = false;
		};
	});

	interface BotOpponent extends PlayerOpponent {
		team: string;
		botName: string;
	}

	// `profile.opponents` defaults to `[]` rather than trusting the field is always present:
	// play-api promotes production manually (a separate step from merging its PR), so this page
	// can deploy — Cloudflare Pages auto-deploys every push to main — before the backend version
	// that added the field does, and an old server's response simply omits it.
	const headToHead = $derived(
		(profile?.opponents ?? []).filter(
			(o): o is BotOpponent => o.team !== null && o.botName !== null,
		),
	);
	const vsHumans = $derived(
		(profile?.opponents ?? []).find((o) => o.team === null) ?? emptyCounts(),
	);
</script>

<svelte:head>
	<title>
		{profile ? `${profile.team} ${profile.name}` : 'Bot profile'} — Dice Chess
	</title>
</svelte:head>

<section class="mx-auto flex max-w-2xl flex-col gap-6">
	{#if !isLiveEnabled()}
		<div class="rounded-2xl border border-border bg-surface p-6 text-center text-content-muted">
			Bot profiles need a configured play server (<code class="font-mono text-xs"
				>VITE_PLAY_API_URL</code
			>) — not available in this build.
		</div>
	{:else if loading}
		<div class="h-64 rounded-2xl bg-surface/40 border border-border animate-pulse"></div>
	{:else if notFound}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<p class="text-content-muted">
				No bot registered as "{page.params.team}/{page.params.name}".
			</p>
		</div>
	{:else if error}
		<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-center text-danger">
			{error}
		</div>
	{:else if profile}
		<div class="flex flex-col gap-1">
			<span class="flex items-center gap-2">
				<h2 class="text-2xl font-bold text-content">{profile.team} {profile.name}</h2>
				<BotBadge sizeClass="text-xs" />
			</span>
			{#if !profile.onLadder}
				<p class="text-sm italic text-content-muted">
					Left the ladder — its ratings are frozen but still listed.
				</p>
			{/if}
		</div>

		<div class="flex flex-col gap-2">
			<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Ratings</h3>
			<!-- One rating per speed (#258); "provisional" is per row. -->
			<CategoryRatings ratings={profile.ratings ?? []} />
		</div>

		<div class="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
			<BotChallengePanel team={profile.team} name={profile.name} />
		</div>

		<div class="flex flex-col gap-2">
			<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Ladder record</h3>
			<!-- The ladder plays one control (blitz), so its record IS the default-category scalars the
			     wire still carries — accurate as long as the ladder's control categorises to the default,
			     which play-api pins with a test. -->
			<WdlSummaryCard
				counts={{ wins: profile.wins, draws: profile.draws, losses: profile.losses }}
			/>
		</div>

		<div class="flex flex-col gap-2">
			<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Vs humans</h3>
			<WdlSummaryCard counts={vsHumans} />
		</div>

		{#if headToHead.length > 0}
			<div class="flex flex-col gap-2">
				<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Head-to-head</h3>
				{#each headToHead as opp (`${opp.team}/${opp.botName}`)}
					<a
						href={resolve('/bots/[team]/[name]', { team: opp.team, name: opp.botName })}
						class="rounded-xl border border-border bg-surface/40 hover:bg-surface-hover/60 hover:border-primary/50 p-4 flex flex-col gap-2 transition-colors"
					>
						<div class="flex items-center justify-between gap-3">
							<span class="font-bold text-content truncate min-w-0">{opp.team} {opp.botName}</span>
							<div class="flex items-center gap-3 shrink-0">
								<WdlCounts counts={opp} />
								<span class="font-mono text-sm font-bold text-content tabular-nums w-12 text-right">
									{Math.round(winRate(opp) * 100)}%
								</span>
							</div>
						</div>
						<WdlBar counts={opp} />
					</a>
				{/each}
			</div>
		{/if}

		<div class="flex flex-col gap-2">
			<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Recent games</h3>
			{#if profile.recent.length === 0}
				<p class="py-8 text-center text-content-muted">No recorded games yet.</p>
			{:else}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{#each profile.recent as game (game.gameId)}
						<ProfileGameCard {game} />
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</section>

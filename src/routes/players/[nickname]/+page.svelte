<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { isLiveEnabled } from '$lib/live/liveApi';
	import { fetchPlayerProfile, type PlayerProfile } from '$lib/leaderboard/leaderboardApi';
	import type { PlayerOpponent } from '$lib/games/gamesApi';
	import { winRate } from '$lib/stats/playerRecord';
	import CategoryRatings from '../../../components/CategoryRatings.svelte';
	import WdlSummaryCard from '../../../components/WdlSummaryCard.svelte';
	import WdlCounts from '../../../components/WdlCounts.svelte';
	import WdlBar from '../../../components/WdlBar.svelte';
	import ProfileGameCard from '../../../components/ProfileGameCard.svelte';

	// An account's public profile (#207). Assembled from the same cards as the bot profile — play-api
	// shapes both responses alike on purpose — following the client-side-fetch-in-$effect pattern
	// bots/[team]/[name] and games/[id] already establish (no +page.ts load exists anywhere here).
	//
	// Keyed on the NICKNAME because that is the only public handle a person has: `user:<uuid>` never
	// appears on the public wire. A renamed account therefore changes its own URL, which is the same
	// trade the leaderboard and every opponent label already make.
	//
	// What is deliberately absent versus a bot's profile: no challenge panel (there is no
	// challenge-a-person flow), no BOT badge, and no ladder state — `onLadder` belongs to the bot
	// pairing scheduler and a person is never on it.

	let profile = $state<PlayerProfile | null>(null);
	let loading = $state(false);
	let notFound = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		const nickname = page.params.nickname;
		profile = null;
		notFound = false;
		error = null;
		if (!nickname) return;
		if (!isLiveEnabled()) return;
		let alive = true;
		loading = true;
		fetchPlayerProfile(nickname)
			.then((result) => {
				if (!alive) return;
				profile = result;
			})
			.catch((err: unknown) => {
				if (!alive) return;
				// A 404 is permanent and means something specific: no such nickname, or an account that
				// deleted itself (play-api #237 answers 404 for a deactivated account exactly as for a
				// missing one). Worth telling apart from a transient server problem.
				if (err instanceof Error && err.message.endsWith('404')) notFound = true;
				else error = "This player's profile isn't available right now.";
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

	// Defaults to `[]` rather than trusting the field is present: play-api is promoted to production
	// manually, a separate step from merging its PR, so this page can deploy before the backend
	// version that added a field does — Cloudflare Pages auto-deploys every push to main.
	const bots = $derived(
		(profile?.opponents ?? []).filter(
			(o): o is BotOpponent => o.team !== null && o.botName !== null,
		),
	);
	/** The collapsed "every human opponent" row, or undefined when there is none. Kept as the row
	 * itself rather than falling back to empty counts: the section is conditional, so presence is the
	 * question — and `OutcomeCounts` has no `games`, only the W/D/L a summary card needs. */
	const vsPeople = $derived((profile?.opponents ?? []).find((o) => o.team === null));
	/** Rated games across every speed. NOT `profile.games` — since play-api #280 phase 2 that scalar
	 * counts the default category (blitz) only, and subtracting it from the all-speeds `totalGames`
	 * would misfile every other speed's rated games as casual. */
	const ratedGames = $derived((profile?.ratings ?? []).reduce((sum, r) => sum + r.games, 0));
	/** Games that were not rated — the gap between every finished game and the rating record. */
	const casualGames = $derived(Math.max(0, (profile?.totalGames ?? 0) - ratedGames));
</script>

<svelte:head>
	<title>{profile ? profile.nickname : 'Player profile'} — Dice Chess</title>
</svelte:head>

<section class="mx-auto flex max-w-2xl flex-col gap-6">
	<a
		href={resolve('/leaderboard')}
		class="w-fit text-sm font-semibold text-content-muted transition-colors hover:text-content"
	>
		← Back to the leaderboard
	</a>

	{#if !isLiveEnabled()}
		<div class="rounded-2xl border border-border bg-surface p-6 text-center text-content-muted">
			Player profiles need a configured play server (<code class="font-mono text-xs"
				>VITE_PLAY_API_URL</code
			>) — not available in this build.
		</div>
	{:else if loading}
		<div class="h-64 animate-pulse rounded-2xl border border-border bg-surface/40"></div>
	{:else if notFound}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<p class="text-content-muted">No player named "{page.params.nickname}".</p>
		</div>
	{:else if error}
		<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-center text-danger">
			{error}
		</div>
	{:else if profile}
		<div class="flex flex-col gap-1">
			<h2 class="text-2xl font-bold text-content">{profile.nickname}</h2>
		</div>

		<div class="flex flex-col gap-2">
			<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Ratings</h3>
			<!-- One rating per speed (#258); "provisional" is per row — a rating joins the leaderboard
			     for its own speed once that deviation converges, after about ten rated games there. -->
			<CategoryRatings ratings={profile.ratings ?? []} />
			<!-- The two counts are kept apart on purpose (play-api #279): before rated play reached
			     people, every game they had played was casual, so collapsing them would make a real
			     rating record look like a total. -->
			<p class="text-xs text-content-muted">
				{ratedGames} rated
				{#if casualGames > 0}· {casualGames} casual{/if}
				· {profile.totalGames} in total
			</p>
		</div>

		{#if vsPeople}
			<div class="flex flex-col gap-2">
				<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Vs people</h3>
				<WdlSummaryCard counts={vsPeople} />
			</div>
		{/if}

		{#if bots.length > 0}
			<div class="flex flex-col gap-2">
				<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Vs bots</h3>
				{#each bots as opp (`${opp.team}/${opp.botName}`)}
					<a
						href={resolve('/bots/[team]/[name]', { team: opp.team, name: opp.botName })}
						class="flex flex-col gap-2 rounded-xl border border-border bg-surface/40 p-4 transition-colors hover:border-primary/50 hover:bg-surface-hover/60"
					>
						<div class="flex items-center justify-between gap-3">
							<span class="min-w-0 truncate font-bold text-content">{opp.team} {opp.botName}</span>
							<div class="flex shrink-0 items-center gap-3">
								<WdlCounts counts={opp} />
								<span class="w-12 text-right font-mono text-sm font-bold tabular-nums text-content">
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

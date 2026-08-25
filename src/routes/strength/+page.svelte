<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { fetchLeaderboard } from '$lib/leaderboard/leaderboardApi';
	import { isLiveEnabled } from '$lib/live/liveApi';
	import { buildBotStrengthRows, type BotStrengthRow } from '$lib/stats/botStrength';
	import { fetchStrengthReport, type StrengthReport } from '$lib/strength/strengthApi';
	import RankingViewTabs from '../../components/RankingViewTabs.svelte';
	import StrengthRow from '../../components/StrengthRow.svelte';

	// The retrospective companion to /leaderboard. The server owns all statistical work; this
	// route only combines its Bradley-Terry report with secondary Glicko/W-D-L context.
	let report = $state<StrengthReport | null>(null);
	let rows = $state<BotStrengthRow[]>([]);
	let loaded = $state(false);
	let error = $state<string | null>(null);
	let ladderUnavailable = $state(false);

	$effect(() => {
		if (!isLiveEnabled()) return;
		let alive = true;

		void (async () => {
			try {
				const nextReport = await fetchStrengthReport();
				if (!alive) return;

				// Bradley-Terry is the primary result. Publish it immediately; the secondary
				// ladder join may be slow, unavailable, or legitimately missing some bots.
				report = nextReport;
				rows = buildBotStrengthRows(nextReport.ranking, []);
				ladderUnavailable = false;
				loaded = true;
				error = null;

				try {
					const board = await fetchLeaderboard('bots', nextReport.category);
					if (alive) rows = buildBotStrengthRows(nextReport.ranking, board.leaders);
				} catch {
					// Bradley-Terry is the page's result. A failed secondary lookup must not hide it.
					if (alive) ladderUnavailable = true;
				}
			} catch {
				if (alive) error = 'The strength report is unavailable right now — try again in a minute.';
			}
		})();

		return () => {
			alive = false;
		};
	});
</script>

<svelte:head>
	<title>Bot strength — Dice Chess</title>
	<meta
		name="description"
		content="Schedule-adjusted Bradley-Terry strength estimates for Dice Chess bots, with asymmetric 95% confidence intervals and rating-ladder context."
	/>
</svelte:head>

<section class="mx-auto flex max-w-4xl flex-col gap-5">
	<div class="flex flex-col gap-2">
		<h2 class="text-2xl font-bold text-content">Bot strength</h2>
		<p class="text-sm text-content-muted">
			Bradley–Terry estimates adjust for who each bot faced by fitting all eligible bot-vs-bot
			results together. That makes them more useful for comparing engines than raw win percentages,
			which can reward an easier schedule.
		</p>
	</div>

	<RankingViewTabs active="strength" />

	<div class="grid gap-3 sm:grid-cols-2">
		<div class="rounded-2xl border border-border bg-surface p-4">
			<h3 class="text-sm font-bold text-content">How to read strength</h3>
			<p class="mt-1 text-xs leading-relaxed text-content-muted">
				Relative Elo is centred on <b>0</b>, the mean of the bots in this report. Its 95% bootstrap
				confidence interval shows uncertainty and can be asymmetric, so both bounds are printed
				instead of a misleading ± value. LOS is the likelihood that a bot is stronger than the one
				immediately below it, not every other bot.
			</p>
		</div>
		<div class="rounded-2xl border border-border bg-surface p-4">
			<h3 class="text-sm font-bold text-content">What it does not mean</h3>
			<p class="mt-1 text-xs leading-relaxed text-content-muted">
				This is not absolute Elo and cannot be compared across different bot pools or report
				snapshots. Glicko-2 represents live rating state; W-D-L and raw win percentage depend on
				which opponents were faced. None of those secondary values determines the order below.
			</p>
		</div>
	</div>

	{#if !isLiveEnabled()}
		<div class="rounded-2xl border border-border bg-surface p-6 text-center text-content-muted">
			Bot strength needs a configured play server (<code class="font-mono text-xs"
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
			Loading bot strength…
		</div>
	{:else if rows.length === 0}
		<div class="rounded-2xl border border-border bg-surface p-6 text-center text-content-muted">
			No bot-vs-bot results are eligible for the strength ranking yet.
		</div>
	{:else}
		{#if ladderUnavailable}
			<p class="text-xs text-content-muted" role="status">
				Live Glicko and W-D-L context is temporarily unavailable; the strength ranking is complete.
			</p>
		{/if}
		<div class="overflow-x-auto rounded-2xl border border-border bg-surface">
			<table class="w-full text-sm">
				<caption class="sr-only">
					Bots ranked by schedule-adjusted Bradley-Terry relative Elo, best first
				</caption>
				<thead>
					<tr
						class="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-content-muted"
					>
						<th scope="col" class="px-4 py-3 text-right">#</th>
						<th scope="col" class="px-4 py-3">Bot</th>
						<th scope="col" class="px-4 py-3 text-right">Strength</th>
						<th scope="col" class="hidden px-4 py-3 text-right sm:table-cell">Glicko-2</th>
						<th scope="col" class="hidden px-4 py-3 text-right md:table-cell">Record</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.player)}
						<StrengthRow {row} />
					{/each}
				</tbody>
			</table>
		</div>
		<p class="text-center text-xs text-content-muted/70">
			{#if report}
				{report.category[0].toUpperCase() + report.category.slice(1)} report ·
				{report.completePairs} paired observations + {report.singles} single games ·
				{report.excludedRows} ineligible or other-speed rows excluded. Updated on the rating batch cadence.
			{/if}
			A dash means no converged Glicko board row matched that bot; the strength estimate is still shown.
		</p>
	{/if}
</section>

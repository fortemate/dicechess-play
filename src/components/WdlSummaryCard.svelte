<script lang="ts">
	import { totalGames, winRate, type OutcomeCounts } from '$lib/stats/playerRecord';
	import WdlBar from './WdlBar.svelte';
	import WdlCounts from './WdlCounts.svelte';

	// The win-rate/WdlCounts/WdlBar card /me inlined twice (on-device overall, lobby overall) —
	// extracted once a third use site (the /games head-to-head header, #151) made it real
	// duplication rather than two coincidentally similar blocks.
	interface Props {
		counts: OutcomeCounts;
	}

	let { counts }: Props = $props();
	const total = $derived(totalGames(counts));
</script>

<div class="rounded-2xl border border-border bg-surface/60 p-6 flex flex-col gap-4">
	<div class="flex items-end justify-between gap-4">
		<div class="flex flex-col">
			<span class="text-4xl font-black text-content tabular-nums">
				{Math.round(winRate(counts) * 100)}%
			</span>
			<span class="text-xs font-bold uppercase tracking-wider text-content-muted">win rate</span>
		</div>
		<div class="flex flex-col items-end gap-1">
			<WdlCounts {counts} />
			<span class="text-xs text-content-muted">{total} games</span>
		</div>
	</div>
	<WdlBar {counts} />
</div>

<script lang="ts">
	// The same server-ranked rows are used for live ratings and immutable snapshots (#124).
	import { m } from '#lib/paraglide/messages.js';
	import type { LeaderRow } from '#lib/leaderboard/leaderboardApi.js';
	import LeaderboardRow from './LeaderboardRow.svelte';
	let { rows, historical = false }: { rows: LeaderRow[]; historical?: boolean } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (The named scrolling region needs focus for keyboard horizontal scrolling.) -->
<div
	class="overflow-x-auto rounded-2xl border border-border bg-surface"
	role="region"
	aria-label={m.leaderboard_title()}
	tabindex="0"
>
	<table class="w-full text-sm">
		<caption class="sr-only">{m.leaderboard_caption()}</caption>
		<thead>
			<tr
				class="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-content-muted"
			>
				<th scope="col" class="px-2 py-3 text-right sm:px-4">#</th>
				<th scope="col" class="px-2 py-3 sm:px-4">{m.leaderboard_name()}</th>
				<th scope="col" class="px-2 py-3 text-right sm:px-4">{m.leaderboard_rating()}</th>
				<th scope="col" class="px-2 py-3 text-right sm:px-4">{m.common_rating_order_score()}</th>
				<th scope="col" class="hidden px-4 py-3 text-right sm:table-cell"
					>{m.leaderboard_games()}</th
				>
				<th scope="col" class="hidden px-4 py-3 text-right md:table-cell"
					>{m.leaderboard_record()}</th
				>
				<th scope="col" class="hidden px-4 py-3 text-right sm:table-cell"
					>{m.leaderboard_win_percent()}</th
				>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (`${row.kind}/${row.team ?? ''}/${row.name}`)}
				<LeaderboardRow {row} {historical} />
			{/each}
		</tbody>
	</table>
</div>

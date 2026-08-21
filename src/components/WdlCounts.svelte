<script lang="ts">
	import type { OutcomeCounts } from '$lib/stats/playerRecord';

	interface Props {
		counts: OutcomeCounts;
	}

	let { counts }: Props = $props();
</script>

<span class="font-mono text-sm text-content-muted whitespace-nowrap">
	<span class="text-primary font-bold">{counts.wins}W</span>
	· {counts.draws}D ·
	<span class="text-danger font-bold">{counts.losses}L</span>
</span>

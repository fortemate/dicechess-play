<script lang="ts">
	import { outcomeShares, type OutcomeCounts } from '$lib/stats/playerRecord';

	interface Props {
		counts: OutcomeCounts;
	}

	let { counts }: Props = $props();

	const shares = $derived(outcomeShares(counts));
</script>

<div class="flex h-2 w-full overflow-hidden rounded-full bg-surface" aria-hidden="true">
	<div class="bg-primary" style="width: {shares.win * 100}%"></div>
	<div class="bg-content-muted/40" style="width: {shares.draw * 100}%"></div>
	<div class="bg-danger" style="width: {shares.loss * 100}%"></div>
</div>

<script lang="ts">
	// TEST-ONLY stand-in for PlayBots in page.test.ts: it shows what the page hands down.
	let { preselect = null }: { preselect?: string | null } = $props();
</script>

<div data-testid="play-bots" data-preselect={preselect ?? ''}></div>

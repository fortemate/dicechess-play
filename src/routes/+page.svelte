<script lang="ts">
	import { showcaseStore } from '$lib/live/showcaseStore.svelte';
	import ShowcaseShell from '../components/showcase/ShowcaseShell.svelte';
	import { chromeStore } from '$lib/stores/chromeStore.svelte';

	$effect(() => {
		chromeStore.zen = true;
		showcaseStore.start();
		return () => {
			chromeStore.zen = false;
			showcaseStore.destroy();
		};
	});
</script>

<ShowcaseShell
	state={showcaseStore.state}
	onIntent={(intent) => showcaseStore.handleIntent(intent)}
/>

<script lang="ts">
	import { showcaseStore } from '$lib/live/showcaseStore.svelte';
	import ShowcaseShell from '../components/showcase/ShowcaseShell.svelte';
	import { chromeStore } from '$lib/stores/chromeStore.svelte';

	$effect(() => {
		chromeStore.zen = true;
		showcaseStore.start();
		return () => {
			chromeStore.zen = false;
			chromeStore.holdReload = false;
			showcaseStore.stop();
		};
	});

	// A service-worker update must not reload the page under a visitor who is in a game: the
	// reload lands mid-move and drops the seat. Hold it while claiming, playing or reconnecting as
	// the player; a finished game or an open table is a fine moment to reload (+layout.svelte).
	$effect(() => {
		const s = showcaseStore.state;
		chromeStore.holdReload =
			s.kind === 'claiming' ||
			s.kind === 'live-player' ||
			(s.kind === 'reconnecting' && s.playerColor !== undefined);
	});
</script>

<ShowcaseShell
	state={showcaseStore.state}
	onIntent={(intent) => showcaseStore.handleIntent(intent)}
/>

<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { showcaseStore } from '$lib/live/showcaseStore.svelte';
	import ShowcaseShell from '../../components/showcase/ShowcaseShell.svelte';
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

<svelte:head>
	<title>Live Table — Dice Chess</title>
	<meta
		name="description"
		content="Play or watch live Dice Chess games in real-time right in your browser."
	/>
</svelte:head>

<ShowcaseShell
	state={showcaseStore.state}
	onIntent={(intent) => showcaseStore.handleIntent(intent)}
/>

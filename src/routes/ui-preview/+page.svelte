<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- developer-only preview of the primitives (#252) */
	// Development-only preview of the interface primitives (#252), in the light and the dark
	// theme at once. `+page.ts` refuses the route outside the dev server.
	import PrimitivesPreview from '../../components/ui/PrimitivesPreview.svelte';
	import { chromeStore } from '#lib/stores/chromeStore.svelte.js';

	// Hide the application chrome and its narrower page width, so the preview shows the
	// primitives on the width the redesigned pages will have.
	$effect(() => {
		chromeStore.zen = true;
		return () => {
			chromeStore.zen = false;
		};
	});
</script>

<svelte:head>
	<title>Interface primitives</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<PrimitivesPreview theme="light" />
<PrimitivesPreview theme="dark" />

<script lang="ts">
	// TEST-ONLY harness for RatedChoice.test.ts — not part of any page, and nothing in src/ imports it.
	//
	// It exists because RatedChoice's most consequential behaviour is what it writes BACK through
	// `bind:rated`: it must never leave a rated request armed for a visitor who cannot play rated, or
	// the client sends a flag play-api will strip and the UI has told a small lie. A bound value is
	// invisible to a test that renders the component directly, so this reflects it into the DOM.
	import RatedChoice from './RatedChoice.svelte';

	let { rated = $bindable(false) }: { rated?: boolean } = $props();
</script>

<output data-testid="bound-rated">{rated}</output>
<RatedChoice bind:rated name="harness" />

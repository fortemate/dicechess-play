<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- developer-only fixture preview harness (#60) */
	import ShowcaseShell from '../../components/showcase/ShowcaseShell.svelte';
	import { allFixtures } from '../../components/showcase/fixtures';
	import type { ShowcaseIntent, ShowcaseState } from '../../components/showcase/types';

	let selectedKey = $state<string>('open-white');
	let customState = $state<ShowcaseState | null>(null);

	const currentState = $derived(
		customState ?? allFixtures[selectedKey] ?? allFixtures['open-white'],
	);

	function selectFixture(key: string) {
		selectedKey = key;
		customState = null;
	}

	function handleIntent(intent: ShowcaseIntent) {
		console.log('[ShowcasePreview] Received intent:', intent);

		switch (intent.type) {
			case 'claim':
				// Simulate claim -> claiming -> live
				selectFixture('claiming');
				setTimeout(() => {
					selectFixture('live-player-white-turn');
				}, 1200);
				break;
			case 'resign':
				selectFixture('finishing-mate');
				break;
			case 'retry':
				selectFixture('live-player-white-turn');
				break;
			case 'reset-now':
				selectFixture('reset');
				break;
			case 'move':
				console.log('[ShowcasePreview] Move:', intent.orig, '->', intent.dest);
				break;
			case 'navigate-play':
				break;
		}
	}
</script>

<!-- Development / Reviewer Fixture Switcher Toolbar -->
<div
	class="sticky top-0 z-50 flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-hover/95 px-3 py-1.5 text-xs backdrop-blur-md"
>
	<span class="font-bold text-primary mr-1">Preview Fixture:</span>
	{#each Object.keys(allFixtures) as key (key)}
		<button
			type="button"
			onclick={() => selectFixture(key)}
			class="rounded px-2 py-0.5 font-mono text-[11px] transition-colors {selectedKey === key &&
			!customState
				? 'bg-primary text-primary-content font-bold shadow-sm'
				: 'bg-surface text-content-muted hover:text-content hover:bg-surface-hover border border-border'}"
		>
			{key}
		</button>
	{/each}
</div>

<ShowcaseShell state={currentState} onIntent={handleIntent} />

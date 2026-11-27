<script lang="ts">
	// A short label next to a name or a row: BOT, PLAYER, RATED, LIVE (#252). Not interactive,
	// and never the only carrier of meaning: it is a word, the colour only groups it.
	//
	//   - `neutral`: a plain fact (BOT);
	//   - `highlight`: the warm surface that sets one thing apart (PLAYER, a casual game);
	//   - `accent`: belongs to the primary action or the visitor ("you");
	//   - `success`: something is going on now (LIVE);
	//   - `danger`: something went wrong or was lost.
	//
	// The label is the content, so the caller owns the wording and its translation.
	import type { Snippet } from 'svelte';

	type Tone = 'neutral' | 'highlight' | 'accent' | 'success' | 'danger';

	interface Props {
		tone?: Tone;
		children: Snippet;
		class?: string;
	}

	let { tone = 'neutral', children, class: className = '' }: Props = $props();

	const TONES: Record<Tone, string> = {
		neutral: 'bg-surface-hover text-content',
		highlight: 'bg-highlight text-highlight-content',
		accent: 'bg-primary/15 text-primary',
		success: 'bg-success/15 text-success',
		danger: 'bg-danger/10 text-danger',
	};
</script>

<span
	class="inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-xs font-bold tracking-wide uppercase {TONES[
		tone
	]} {className}"
>
	{@render children()}
</span>

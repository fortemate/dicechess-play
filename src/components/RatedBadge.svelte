<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// The one way a rated offer or game is marked on the play surfaces (lobby wall, the creator's own
	// waiting table). Deliberately the same accent family as ProfileGameCard's Rated/Casual pill so
	// "rated" reads identically wherever it appears.
	//
	// There is no Casual counterpart on purpose: casual is the default on every path, so labelling it
	// would put a badge on almost every row and say nothing.
	interface Props {
		/** Tailwind text-size class — the badge scales with its host row. */
		sizeClass?: string;
	}

	let { sizeClass = 'text-[10px]' }: Props = $props();
</script>

<span
	class="shrink-0 rounded border border-badge-accent/20 bg-badge-accent/10 px-1 py-px {sizeClass} font-bold uppercase tracking-wide text-badge-accent"
>
	rated
</span>

<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { resolve } from '$app/paths';

	// Shared sub-navigation for the two complementary ranking instruments. Keeping it on both
	// routes makes /strength a visible child of Leaderboard without crowding the global nav.
	interface Props {
		active: 'ratings' | 'strength';
	}

	let { active }: Props = $props();

	const tabClass = (selected: boolean): string =>
		selected
			? 'rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content'
			: 'rounded-lg px-3 py-1.5 text-xs font-bold text-content-muted transition-colors hover:bg-surface-hover hover:text-content';
</script>

<nav
	aria-label="Leaderboard views"
	class="flex w-fit rounded-xl border border-border bg-surface p-1"
>
	<a
		href={resolve('/leaderboard')}
		aria-current={active === 'ratings' ? 'page' : undefined}
		class={tabClass(active === 'ratings')}
	>
		Rating leaderboard
	</a>
	<a
		href={resolve('/strength')}
		aria-current={active === 'strength' ? 'page' : undefined}
		class={tabClass(active === 'strength')}
	>
		Bot strength
	</a>
</nav>

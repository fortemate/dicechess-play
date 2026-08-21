<script lang="ts">
	// The game hub (#217): every way to start a game, in one component. Rendered on the
	// landing page (under the marketing hero) and on /play (the nav's Play target), so the
	// two entry points can never drift apart. Card titles match the destination page's own
	// heading — the Play→"Practice game" mislabel was the original complaint.
	import { resolve } from '$app/paths';

	const ways = [
		{
			path: '/practice',
			title: 'Practice game',
			sub: 'Unrated, against practice levels — instant, works even offline.',
			icon: 'bot',
		},
		{
			path: '/bots',
			title: 'Challenge a rated bot',
			sub: 'Community engines with ratings — they actually think.',
			icon: 'rated',
		},
		{
			path: '/live',
			title: 'Play a friend by link',
			sub: 'Set up a game and share the invite link.',
			icon: 'link',
		},
		{
			path: '/lobby',
			title: 'Open a table',
			sub: 'Play a human — join an open table in the lobby.',
			icon: 'users',
		},
	] as const;
</script>

{#snippet wayIcon(icon: 'bot' | 'rated' | 'link' | 'users')}
	<svg
		viewBox="0 0 24 24"
		class="h-6 w-6"
		fill="none"
		stroke="currentColor"
		stroke-width="1.7"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if icon === 'bot'}
			<rect x="4.5" y="8" width="15" height="11" rx="3" /><path d="M12 4.5v3.5" /><circle
				cx="12"
				cy="4"
				r="1.3"
				fill="currentColor"
				stroke="none"
			/><circle cx="9.3" cy="13" r="1.25" fill="currentColor" stroke="none" /><circle
				cx="14.7"
				cy="13"
				r="1.25"
				fill="currentColor"
				stroke="none"
			/>
		{:else if icon === 'rated'}
			<path
				d="M12 3.5l2.5 5.4 5.8.6-4.4 4 1.3 5.8L12 16.6l-5.2 2.7 1.3-5.8-4.4-4 5.8-.6L12 3.5Z"
				stroke-linejoin="round"
			/>
		{:else if icon === 'link'}
			<path d="M10.5 13.5a4.2 4.2 0 0 0 6 0l2.3-2.3a4.24 4.24 0 0 0-6-6l-1.3 1.3" /><path
				d="M13.5 10.5a4.2 4.2 0 0 0-6 0l-2.3 2.3a4.24 4.24 0 0 0 6 6l1.3-1.3"
			/>
		{:else}
			<circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path
				d="M16 6.4a3 3 0 0 1 0 5.4M17 14.3c2.4.5 4 2.3 4 4.7"
			/>
		{/if}
	</svg>
{/snippet}

<div class="flex w-full flex-col items-center gap-8">
	<div class="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
		{#each ways as w (w.path)}
			<a
				href={resolve(w.path)}
				class="group flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary"
			>
				<span
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					{@render wayIcon(w.icon)}
				</span>
				<span class="flex min-w-0 flex-col gap-0.5">
					<b class="text-[15px] font-semibold text-content">{w.title}</b>
					<small class="text-xs text-content-muted">{w.sub}</small>
				</span>
			</a>
		{/each}
	</div>

	<div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
		<a
			href={resolve('/rules')}
			class="font-semibold text-content-muted transition-colors hover:text-content"
		>
			How to play →
		</a>
		<a
			href={resolve('/lobby')}
			class="font-semibold text-content-muted transition-colors hover:text-content"
		>
			Watch live games →
		</a>
		<a
			href={resolve('/leaderboard')}
			class="font-semibold text-content-muted transition-colors hover:text-content"
		>
			Leaderboard →
		</a>
	</div>
</div>

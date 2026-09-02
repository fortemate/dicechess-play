<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import ShowcaseMark from './ShowcaseMark.svelte';
	import ThemeMenu from '../ThemeMenu.svelte';
</script>

<header class="h-12 w-full border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-40">
	<div class="max-w-5xl mx-auto px-4 md:px-6 h-full flex items-center justify-between gap-3">
		<div class="flex items-center gap-3 sm:gap-4 min-w-0">
			<a
				href={resolve('/')}
				class="flex items-center gap-2 text-content hover:opacity-80 transition-opacity"
				aria-label={m.home_brand_name()}
			>
				<span
					class="flex h-7 w-7 items-center justify-center rounded-lg bg-surface border border-border text-content"
				>
					<ShowcaseMark class="h-4 w-4 text-content" />
				</span>
				<span class="text-sm font-bold tracking-tight text-content whitespace-nowrap">
					{m.home_brand_name()}
				</span>
			</a>

			<div class="hidden xs:flex items-center gap-1.5 min-w-0">
				<span
					class="inline-flex items-center rounded-md border border-border bg-surface-hover/60 px-2 py-0.5 text-[11px] font-semibold text-content-muted"
				>
					{m.home_showcase_title()}
				</span>
				<span
					class="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary"
				>
					{m.home_time_control_blitz()}
				</span>
			</div>
		</div>

		<div class="flex items-center gap-2 sm:gap-4">
			<nav class="flex items-center gap-1 sm:gap-2">
				<a
					href={resolve('/play')}
					class="px-2.5 py-1 rounded-lg text-xs sm:text-[13px] font-semibold text-content-muted hover:text-content hover:bg-surface-hover transition-colors whitespace-nowrap"
				>
					{m.home_nav_play_bots()}
				</a>
				<a
					href={resolve('/rules')}
					class="hidden sm:inline-block px-2.5 py-1 rounded-lg text-xs sm:text-[13px] font-semibold text-content-muted hover:text-content hover:bg-surface-hover transition-colors whitespace-nowrap"
				>
					{m.home_nav_how_to_play()}
				</a>
			</nav>

			<ThemeMenu />
		</div>
	</div>
</header>

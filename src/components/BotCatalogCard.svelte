<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { resolve } from '$app/paths';
	import type { CatalogBot } from '#lib/catalog/catalogApi.js';
	import { m } from '#lib/paraglide/messages.js';
	import RatingEstimate from './RatingEstimate.svelte';
	import BotBadge from './BotBadge.svelte';
	import BotChallengePanel from './BotChallengePanel.svelte';

	let { bot }: { bot: CatalogBot } = $props();
</script>

<div class="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
	<div class="flex flex-col gap-1">
		<span class="flex min-w-0 items-center gap-1.5">
			<a
				href={resolve('/bots/[team]/[name]', { team: bot.team, name: bot.name })}
				class="truncate font-semibold text-content hover:text-primary hover:underline"
			>
				{bot.team}
				{bot.name}
			</a>
			<BotBadge />
		</span>
		<!-- The catalog scalar carries no speed or version metadata. It cannot stand in for the
		     category chosen in the challenge form; the public profile has the per-speed ratings. -->
		<p class="text-xs text-content-muted">
			{m.common_rating_competitive_estimate()} · {m.common_rating_speed_unknown()}
		</p>
		<RatingEstimate estimate={bot} compact />
		<span class="text-xs text-content-muted">
			<!-- Advisory only — read once when the catalog was fetched, not polled — so a card can go
			     stale before a click; `wake`'s own busy check and play-bot's 409 stay authoritative.
			     Tested `=== false`, NOT `!bot.available`: the field is absent on an API version older
			     than #224, and client and API release independently, so `undefined` means "unknown" and
			     must show nothing. `!undefined` badged every card in production. -->
			{#if bot.available === false}<span class="italic">· playing now</span>{/if}
		</span>
		{#if bot.description}
			<p class="text-sm text-content-muted">{bot.description}</p>
		{/if}
	</div>

	<BotChallengePanel team={bot.team} name={bot.name} />
</div>

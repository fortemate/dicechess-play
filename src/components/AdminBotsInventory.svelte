<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// Compact, responsive inventory table and list for `/me/admin/bots` (#47).
	// Displays bot identity, rating, ladder/catalog/ownership state, load utilization,
	// webhook status, and capabilities, with row selection opening the detail drawer.

	import type { AdminBot } from '$lib/bots/adminApi';

	interface Props {
		bots: AdminBot[];
		totalCount: number;
		selectedBot: AdminBot | null;
		onSelect: (bot: AdminBot) => void;
		onClearFilters: () => void;
	}

	let { bots, totalCount, selectedBot, onSelect, onClearFilters }: Props = $props();

	const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

	function isSelected(bot: AdminBot): boolean {
		return selectedBot !== null && selectedBot.team === bot.team && selectedBot.name === bot.name;
	}
</script>

<div class="flex flex-col gap-4">
	{#if totalCount === 0}
		<div
			class="rounded-2xl border border-border bg-surface/60 p-6 text-center text-sm text-content-muted"
		>
			No registered bots were returned by play-api.
		</div>
	{:else if bots.length === 0}
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface/60 p-8 text-center"
		>
			<p class="text-sm text-content-muted">No bots match the current search or filters.</p>
			<button
				type="button"
				onclick={onClearFilters}
				class="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-content shadow-sm transition-colors hover:bg-primary-hover"
			>
				Clear all filters
			</button>
		</div>
	{:else}
		<!-- Desktop / Tablet Table View -->
		<div
			class="hidden md:block overflow-hidden rounded-2xl border border-border bg-surface/60 shadow-sm"
			role="region"
			aria-label="Admin bot inventory"
		>
			<div class="overflow-x-auto">
				<table class="w-full text-left text-xs text-content">
					<thead
						class="border-b border-border bg-surface/80 text-[11px] font-bold uppercase tracking-wider text-content-muted"
					>
						<tr>
							<th scope="col" class="px-4 py-3.5">Bot Identity</th>
							<th scope="col" class="px-3 py-3.5">Rating</th>
							<th scope="col" class="px-3 py-3.5">Status</th>
							<th scope="col" class="px-3 py-3.5">Capacity</th>
							<th scope="col" class="px-3 py-3.5">Webhook</th>
							<th scope="col" class="px-3 py-3.5">Capabilities</th>
							<th scope="col" class="px-4 py-3.5 text-right"
								><span class="sr-only">Actions</span></th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-border/60">
						{#each bots as bot (`${bot.team}/${bot.name}`)}
							<tr
								onclick={() => onSelect(bot)}
								class={`group cursor-pointer transition-colors hover:bg-surface-elevated/70 ${
									isSelected(bot) ? 'bg-primary/10 hover:bg-primary/15' : ''
								}`}
							>
								<!-- Identity -->
								<td class="px-4 py-3.5 font-medium">
									<div
										class="flex items-center gap-1.5 font-semibold text-content group-hover:text-primary transition-colors"
									>
										<span class="text-content-muted text-[11px]">{bot.team}/</span>
										<span class="text-sm font-bold">{bot.name}</span>
									</div>
									{#if bot.description}
										<p class="mt-0.5 line-clamp-1 max-w-xs text-[11px] text-content-muted">
											{bot.description}
										</p>
									{/if}
								</td>

								<!-- Rating -->
								<td class="px-3 py-3.5 font-mono tabular-nums whitespace-nowrap">
									<b class="text-sm font-bold text-content">{wholeNumber.format(bot.rating)}</b>
									<span class="text-content-muted text-[11px]"> ±{wholeNumber.format(bot.rd)}</span>
									{#if bot.provisional}
										<span
											class="ml-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-500"
										>
											Prov
										</span>
									{/if}
								</td>

								<!-- Status Badges -->
								<td class="px-3 py-3.5">
									<div class="flex flex-wrap items-center gap-1 text-[10px] font-bold">
										<span
											class={`rounded-md border px-1.5 py-0.5 ${
												bot.onLadder
													? 'border-primary/30 bg-primary/15 text-primary'
													: 'border-border text-content-muted'
											}`}
										>
											{bot.onLadder ? 'Ladder' : 'Off-ladder'}
										</span>
										<span
											class={`rounded-md border px-1.5 py-0.5 ${
												bot.openToHumans
													? 'border-primary/30 bg-primary/15 text-primary'
													: 'border-border text-content-muted'
											}`}
										>
											{bot.openToHumans ? 'Open' : 'Closed'}
										</span>
										<span class="rounded-md border border-border px-1.5 py-0.5 text-content-muted">
											{bot.owned ? 'Owned' : 'Unclaimed'}
										</span>
									</div>
								</td>

								<!-- Capacity & Utilization -->
								<td class="px-3 py-3.5 font-mono whitespace-nowrap">
									<div class="flex items-center gap-1.5">
										<span
											class={`font-bold ${
												bot.activeGames >= bot.maxConcurrentGames
													? 'text-amber-500'
													: 'text-content'
											}`}
										>
											{bot.activeGames}/{bot.maxConcurrentGames}
										</span>
										{#if bot.activeGames >= bot.maxConcurrentGames}
											<span
												class="rounded-md border border-amber-500/30 bg-amber-500/15 px-1 py-0.2 text-[9px] font-bold text-amber-500"
											>
												Max
											</span>
										{/if}
									</div>
								</td>

								<!-- Webhook -->
								<td class="px-3 py-3.5 text-xs whitespace-nowrap">
									{#if bot.webhook}
										<div class="flex items-center gap-1.5">
											<span
												class="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-sm"
												title="Webhook verified and active"
											></span>
											<span class="max-w-[120px] truncate font-mono text-[11px] text-content-muted">
												{bot.webhook.url.replace(/^https?:\/\//, '')}
											</span>
											{#if bot.webhook.lastFailure}
												<span
													class="rounded-full border border-danger/30 bg-danger/15 px-1.5 text-[9px] font-bold text-danger"
													title={`Failed: ${bot.webhook.lastFailure.reason}`}
												>
													!
												</span>
											{/if}
										</div>
									{:else}
										<span class="text-content-muted/60">—</span>
									{/if}
								</td>

								<!-- Capabilities -->
								<td class="px-3 py-3.5">
									<div class="flex flex-wrap items-center gap-1">
										{#if bot.webhook?.capabilities && bot.webhook.capabilities.length > 0}
											{#each bot.webhook.capabilities.slice(0, 2) as cap (cap)}
												<span
													class="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[9px] font-bold text-content-muted"
												>
													{cap}
												</span>
											{/each}
											{#if bot.webhook.capabilities.length > 2}
												<span class="text-[9px] font-bold text-content-muted">
													+{bot.webhook.capabilities.length - 2}
												</span>
											{/if}
										{:else}
											<span class="text-content-muted/60 text-[11px]">—</span>
										{/if}
									</div>
								</td>

								<!-- Actions -->
								<td class="px-4 py-3.5 text-right whitespace-nowrap">
									<button
										type="button"
										onclick={(e) => {
											e.stopPropagation();
											onSelect(bot);
										}}
										class="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-content-muted transition-colors group-hover:border-primary group-hover:text-primary"
									>
										Inspect →
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Mobile Card List View -->
		<div class="grid gap-3 md:hidden">
			{#each bots as bot (`${bot.team}/${bot.name}`)}
				<div
					tabindex="0"
					role="button"
					aria-label={`Inspect ${bot.team} ${bot.name}`}
					onclick={() => onSelect(bot)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onSelect(bot);
						}
					}}
					class={`flex flex-col gap-3 rounded-xl border p-4 transition-colors cursor-pointer focus:outline-none ${
						isSelected(bot)
							? 'border-primary bg-primary/10'
							: 'border-border bg-surface/60 hover:bg-surface-elevated/70 focus:border-primary'
					}`}
				>
					<div class="flex items-start justify-between gap-2">
						<div>
							<h4 class="font-bold text-content text-sm">
								<span class="text-content-muted font-normal text-xs">{bot.team}/</span>{bot.name}
							</h4>
							<p class="font-mono text-xs tabular-nums text-content-muted mt-0.5">
								<b class="text-content">{wholeNumber.format(bot.rating)}</b> ±{wholeNumber.format(
									bot.rd,
								)}
								{#if bot.provisional}
									<span class="ml-1 text-amber-500 font-bold text-[10px]">prov</span>
								{/if}
							</p>
						</div>

						<div class="flex items-center gap-1.5 font-mono text-xs">
							<span
								class={`rounded-md border px-2 py-0.5 font-bold ${
									bot.activeGames >= bot.maxConcurrentGames
										? 'border-amber-500/30 bg-amber-500/15 text-amber-500'
										: 'border-border bg-surface text-content'
								}`}
							>
								{bot.activeGames}/{bot.maxConcurrentGames} load
							</span>
						</div>
					</div>

					<div class="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
						<span
							class={`rounded border px-2 py-0.5 ${
								bot.onLadder
									? 'border-primary/30 bg-primary/15 text-primary'
									: 'border-border text-content-muted'
							}`}
						>
							{bot.onLadder ? 'On ladder' : 'Off ladder'}
						</span>
						<span
							class={`rounded border px-2 py-0.5 ${
								bot.openToHumans
									? 'border-primary/30 bg-primary/15 text-primary'
									: 'border-border text-content-muted'
							}`}
						>
							{bot.openToHumans ? 'Open' : 'Closed'}
						</span>
						<span class="rounded border border-border px-2 py-0.5 text-content-muted">
							{bot.owned ? 'Owned' : 'Unclaimed'}
						</span>
						{#if bot.webhook}
							<span
								class="rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-emerald-500"
							>
								Webhook
							</span>
							{#if bot.webhook.capabilities && bot.webhook.capabilities.length > 0}
								{#each bot.webhook.capabilities.slice(0, 2) as cap (cap)}
									<span
										class="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[9px] font-bold text-content-muted"
									>
										{cap}
									</span>
								{/each}
								{#if bot.webhook.capabilities.length > 2}
									<span class="text-[9px] font-bold text-content-muted">
										+{bot.webhook.capabilities.length - 2}
									</span>
								{/if}
							{/if}
						{/if}
					</div>

					{#if bot.description}
						<p class="text-xs text-content-muted line-clamp-1 italic">
							{bot.description}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

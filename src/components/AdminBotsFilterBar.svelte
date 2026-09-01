<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// Filter and search bar for `/me/admin/bots` (#47). URL query parameters are the source of truth,
	// managed by the parent page. This component is pure presentation and emits updated query state.
	import {
		countActiveFilters,
		DEFAULT_ADMIN_BOTS_QUERY,
		type AdminBotSortKey,
		type AdminBotsQuery,
		type CapacityFilter,
		type CatalogFilter,
		type LadderFilter,
		type OwnershipFilter,
		type ProvisionalFilter,
		type SortDirection,
		type WebhookFilter,
	} from '$lib/bots/adminBotsFilter';

	interface Props {
		query: AdminBotsQuery;
		capabilities: string[];
		totalCount: number;
		filteredCount: number;
		onChange: (next: AdminBotsQuery) => void;
	}

	let { query, capabilities, totalCount, filteredCount, onChange }: Props = $props();

	const activeFilterCount = $derived(countActiveFilters(query));
	const hasSearchOrFilters = $derived(query.search.trim() !== '' || activeFilterCount > 0);

	function updateSearch(search: string) {
		onChange({ ...query, search });
	}

	function updateLadder(ladder: LadderFilter) {
		onChange({ ...query, ladder });
	}

	function updateCatalog(catalog: CatalogFilter) {
		onChange({ ...query, catalog });
	}

	function updateOwnership(ownership: OwnershipFilter) {
		onChange({ ...query, ownership });
	}

	function updateWebhook(webhook: WebhookFilter) {
		onChange({ ...query, webhook });
	}

	function updateProvisional(provisional: ProvisionalFilter) {
		onChange({ ...query, provisional });
	}

	function updateCapacity(capacity: CapacityFilter) {
		onChange({ ...query, capacity });
	}

	function updateCapability(capability: string) {
		onChange({ ...query, capability });
	}

	function updateSort(sort: AdminBotSortKey) {
		onChange({ ...query, sort });
	}

	function toggleSortDir() {
		const dir: SortDirection = query.dir === 'asc' ? 'desc' : 'asc';
		onChange({ ...query, dir });
	}

	function clearAll() {
		onChange({
			...DEFAULT_ADMIN_BOTS_QUERY,
			sort: query.sort,
			dir: query.dir,
		});
	}
</script>

<div
	class="flex flex-col gap-4 rounded-2xl border border-border bg-surface/50 p-4 shadow-sm backdrop-blur-sm"
>
	<!-- Search row and quick stats -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="relative min-w-0 flex-1">
			<label for="admin-bot-search" class="sr-only">Search bots</label>
			<input
				id="admin-bot-search"
				type="search"
				placeholder="Search by team, bot name, or webhook URL…"
				value={query.search}
				oninput={(e) => updateSearch((e.target as HTMLInputElement).value)}
				class="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-content placeholder-content-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
			/>
		</div>

		<div class="flex shrink-0 items-center justify-between gap-3 text-xs text-content-muted">
			<span class="font-medium">
				Showing <b class="font-bold text-content">{filteredCount}</b> of
				<b class="font-bold text-content">{totalCount}</b> bots
			</span>

			{#if hasSearchOrFilters}
				<button
					type="button"
					onclick={clearAll}
					class="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-content-muted transition-colors hover:border-primary hover:text-primary"
				>
					Clear filters
				</button>
			{/if}
		</div>
	</div>

	<!-- Filter selectors and sorting -->
	<div class="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
		<!-- Ladder -->
		<div class="flex items-center gap-1">
			<label for="filter-ladder" class="font-semibold text-content-muted">Ladder:</label>
			<select
				id="filter-ladder"
				value={query.ladder}
				onchange={(e) => updateLadder((e.target as HTMLSelectElement).value as LadderFilter)}
				class="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-content outline-none transition-colors focus:border-primary"
			>
				<option value="all">All</option>
				<option value="on">On ladder</option>
				<option value="off">Off ladder</option>
			</select>
		</div>

		<!-- Catalog -->
		<div class="flex items-center gap-1">
			<label for="filter-catalog" class="font-semibold text-content-muted">Catalog:</label>
			<select
				id="filter-catalog"
				value={query.catalog}
				onchange={(e) => updateCatalog((e.target as HTMLSelectElement).value as CatalogFilter)}
				class="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-content outline-none transition-colors focus:border-primary"
			>
				<option value="all">All</option>
				<option value="open">Open to humans</option>
				<option value="closed">Closed</option>
			</select>
		</div>

		<!-- Ownership -->
		<div class="flex items-center gap-1">
			<label for="filter-ownership" class="font-semibold text-content-muted">Ownership:</label>
			<select
				id="filter-ownership"
				value={query.ownership}
				onchange={(e) => updateOwnership((e.target as HTMLSelectElement).value as OwnershipFilter)}
				class="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-content outline-none transition-colors focus:border-primary"
			>
				<option value="all">All</option>
				<option value="owned">Owned</option>
				<option value="unowned">Unclaimed</option>
			</select>
		</div>

		<!-- Webhook -->
		<div class="flex items-center gap-1">
			<label for="filter-webhook" class="font-semibold text-content-muted">Webhook:</label>
			<select
				id="filter-webhook"
				value={query.webhook}
				onchange={(e) => updateWebhook((e.target as HTMLSelectElement).value as WebhookFilter)}
				class="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-content outline-none transition-colors focus:border-primary"
			>
				<option value="all">All</option>
				<option value="configured">Configured</option>
				<option value="verified">Verified</option>
				<option value="unverified">Unverified</option>
				<option value="none">No webhook</option>
			</select>
		</div>

		<!-- Provisional -->
		<div class="flex items-center gap-1">
			<label for="filter-provisional" class="font-semibold text-content-muted">Rating:</label>
			<select
				id="filter-provisional"
				value={query.provisional}
				onchange={(e) =>
					updateProvisional((e.target as HTMLSelectElement).value as ProvisionalFilter)}
				class="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-content outline-none transition-colors focus:border-primary"
			>
				<option value="all">All ratings</option>
				<option value="established">Established</option>
				<option value="provisional">Provisional</option>
			</select>
		</div>

		<!-- Capacity -->
		<div class="flex items-center gap-1">
			<label for="filter-capacity" class="font-semibold text-content-muted">Capacity:</label>
			<select
				id="filter-capacity"
				value={query.capacity}
				onchange={(e) => updateCapacity((e.target as HTMLSelectElement).value as CapacityFilter)}
				class="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-content outline-none transition-colors focus:border-primary"
			>
				<option value="all">All loads</option>
				<option value="reached">At capacity</option>
				<option value="available">Has capacity</option>
			</select>
		</div>

		<!-- Capabilities (if available) -->
		{#if capabilities.length > 0}
			<div class="flex items-center gap-1">
				<label for="filter-capability" class="font-semibold text-content-muted">Capability:</label>
				<select
					id="filter-capability"
					value={query.capability}
					onchange={(e) => updateCapability((e.target as HTMLSelectElement).value)}
					class="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-content outline-none transition-colors focus:border-primary"
				>
					<option value="all">All capabilities</option>
					{#each capabilities as cap (cap)}
						<option value={cap}>{cap}</option>
					{/each}
				</select>
			</div>
		{/if}

		<!-- Sort controls -->
		<div class="ml-auto flex items-center gap-1.5">
			<label for="sort-by" class="font-semibold text-content-muted">Sort:</label>
			<select
				id="sort-by"
				value={query.sort}
				onchange={(e) => updateSort((e.target as HTMLSelectElement).value as AdminBotSortKey)}
				class="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-content outline-none transition-colors focus:border-primary"
			>
				<option value="identity">Identity</option>
				<option value="rating">Rating</option>
				<option value="utilization">Utilization</option>
			</select>

			<button
				type="button"
				onclick={toggleSortDir}
				aria-label={`Sort ${query.dir === 'asc' ? 'descending' : 'ascending'}`}
				class="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-bold text-content-muted transition-colors hover:border-primary hover:text-primary"
			>
				{query.dir === 'asc' ? '↑ Asc' : '↓ Desc'}
			</button>

			{#if activeFilterCount > 0}
				<span
					class="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary"
				>
					{activeFilterCount}
					{activeFilterCount === 1 ? 'filter' : 'filters'}
				</span>
			{/if}
		</div>
	</div>
</div>

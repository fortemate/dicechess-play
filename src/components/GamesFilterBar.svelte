<script lang="ts">
	import {
		vsParamValue,
		type GamesFilters,
		type OpponentOption,
		type ResultFilter,
		type SourceFilter,
	} from '$lib/games/gamesFilters';

	// The filter bar for /games (#151): source/result pills plus an opponent search that resolves
	// to a `vs=` value. URL is the source of truth for all of it — this component only ever reads
	// `filters` and reports a proposed next `GamesFilters` via `onChange`; the page owns turning
	// that into a URL (`goto`). Kept presentation-only and given a ready-made `options` list rather
	// than raw game/opponent data, so its own tests don't need LocalGameRecord/PlayerOpponent
	// fixtures — that data-shaping is `gamesFilters.ts`'s job (`opponentOptions`), already tested.
	interface Props {
		filters: GamesFilters;
		options: OpponentOption[];
		onChange: (next: GamesFilters) => void;
	}

	let { filters, options, onChange }: Props = $props();

	let searchText = $state('');

	const hasActiveFilters = $derived(
		filters.vs !== null || filters.result !== null || filters.source !== null,
	);

	// Falls back to a generic label rather than hiding the chip: a bookmarked `vs=` can name an
	// opponent this guest's not-yet-loaded data doesn't have an option for yet (self-corrects once
	// playerOpponentsStore/localGamesStore finish loading).
	const selectedLabel = $derived.by(() => {
		if (!filters.vs) return null;
		const vs = filters.vs;
		return (
			options.find((option) => vsParamValue(option.vs) === vsParamValue(vs))?.label ??
			'Selected opponent'
		);
	});

	function setSource(source: SourceFilter | null): void {
		onChange({ ...filters, source });
	}

	function setResult(result: ResultFilter | null): void {
		onChange({ ...filters, result });
	}

	function selectOpponent(): void {
		const match = options.find((option) => option.label === searchText);
		if (!match) return;
		onChange({ ...filters, vs: match.vs });
		searchText = '';
	}

	function clearOpponent(): void {
		onChange({ ...filters, vs: null });
	}

	function resetAll(): void {
		onChange({ vs: null, result: null, source: null });
	}

	function pillClass(active: boolean): string {
		return active
			? 'px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-content transition-colors'
			: 'px-3 py-1 rounded-full text-xs font-bold bg-surface border border-border text-content-muted hover:text-content transition-colors';
	}
</script>

<div class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-4">
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-xs font-bold uppercase tracking-wider text-content-muted">Show</span>
		<button
			type="button"
			onclick={() => setSource(null)}
			aria-pressed={filters.source === null}
			class={pillClass(filters.source === null)}
		>
			All
		</button>
		<button
			type="button"
			onclick={() => setSource('device')}
			aria-pressed={filters.source === 'device'}
			class={pillClass(filters.source === 'device')}
		>
			On this device
		</button>
		<button
			type="button"
			onclick={() => setSource('lobby')}
			aria-pressed={filters.source === 'lobby'}
			class={pillClass(filters.source === 'lobby')}
		>
			Online
		</button>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-xs font-bold uppercase tracking-wider text-content-muted">Result</span>
		<button
			type="button"
			onclick={() => setResult(null)}
			aria-pressed={filters.result === null}
			class={pillClass(filters.result === null)}
		>
			All
		</button>
		<button
			type="button"
			onclick={() => setResult('win')}
			aria-pressed={filters.result === 'win'}
			class={pillClass(filters.result === 'win')}
		>
			Won
		</button>
		<button
			type="button"
			onclick={() => setResult('draw')}
			aria-pressed={filters.result === 'draw'}
			class={pillClass(filters.result === 'draw')}
		>
			Drawn
		</button>
		<button
			type="button"
			onclick={() => setResult('loss')}
			aria-pressed={filters.result === 'loss'}
			class={pillClass(filters.result === 'loss')}
		>
			Lost
		</button>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<label
			for="games-opponent-search"
			class="text-xs font-bold uppercase tracking-wider text-content-muted"
		>
			Opponent
		</label>
		{#if filters.vs}
			<span
				class="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary"
			>
				{selectedLabel}
				<button
					type="button"
					onclick={clearOpponent}
					aria-label="Clear opponent filter"
					class="hover:text-primary-hover"
				>
					×
				</button>
			</span>
		{:else}
			<input
				id="games-opponent-search"
				list="games-opponent-options"
				bind:value={searchText}
				onchange={selectOpponent}
				placeholder="Search opponent…"
				class="min-w-0 max-w-xs flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-sm text-content outline-none transition-colors focus:border-primary"
			/>
			<datalist id="games-opponent-options">
				{#each options as option (vsParamValue(option.vs))}
					<option value={option.label}></option>
				{/each}
			</datalist>
		{/if}
	</div>

	{#if hasActiveFilters}
		<button
			type="button"
			onclick={resetAll}
			class="self-start text-xs text-content-muted underline hover:text-content"
		>
			Reset filters
		</button>
	{/if}
</div>

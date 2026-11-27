<script lang="ts" generics="T extends string | number | boolean">
	// One choice out of several, as a group of native radio buttons drawn as chips (#253): a
	// time control, a seat colour, rated or casual. The selected option is filled, everywhere.
	//
	// Radios, not toggle buttons, because the options exclude each other: assistive technology
	// announces "3 of 6" and the arrow keys move the choice, for free. The input itself is
	// visually hidden; its label is the 44 px target and shows the selection and the keyboard
	// focus.
	//
	// `name` scopes the group. HTML groups radios by name across the whole document, so two
	// groups on one page (one per bot card, say) need different names.
	//
	// Pass `options` for a flat list or `groups` for rows with a heading each (Blitz, Rapid).
	// The legend and the labels come from the caller, already translated.
	interface Option {
		value: T;
		label: string;
	}

	interface Group {
		label?: string;
		options: readonly Option[];
	}

	interface Props {
		legend: string;
		/** Keep the legend for assistive technology only. */
		hideLegend?: boolean;
		name: string;
		value: T;
		options?: readonly Option[];
		groups?: readonly Group[];
		/** Let the options share the width of the row equally. */
		stretch?: boolean;
		disabled?: boolean;
		class?: string;
	}

	let {
		legend,
		hideLegend = false,
		name,
		value = $bindable(),
		options,
		groups,
		stretch = false,
		disabled = false,
		class: className = '',
	}: Props = $props();

	const rows = $derived<readonly Group[]>(groups ?? [{ options: options ?? [] }]);
</script>

<fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0 {className}" {disabled}>
	<legend
		class={hideLegend
			? 'sr-only'
			: 'mb-2 p-0 text-xs font-bold tracking-widest text-content-muted uppercase'}
	>
		{legend}
	</legend>
	{#each rows as row, index (index)}
		<div class="flex flex-col gap-1.5">
			{#if row.label}
				<span class="text-xs font-semibold text-content-muted">{row.label}</span>
			{/if}
			<div class="flex flex-wrap gap-2">
				{#each row.options as option (option.value)}
					<label
						class="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control border px-4 text-sm font-semibold tabular-nums transition-colors has-focus-visible:focus-ring has-disabled:cursor-not-allowed has-disabled:opacity-50
							{stretch ? 'flex-1' : ''}
							{value === option.value
							? 'border-primary bg-primary text-primary-content'
							: 'border-border-strong bg-transparent text-content hover:bg-surface-hover'}"
					>
						<input type="radio" {name} value={option.value} bind:group={value} class="sr-only" />
						{option.label}
					</label>
				{/each}
			</div>
		</div>
	{/each}
</fieldset>

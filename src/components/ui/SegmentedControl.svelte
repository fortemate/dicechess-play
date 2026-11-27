<script lang="ts" generics="T extends string">
	// One choice out of a few, shown side by side in a single track: System / Light / Dark,
	// List / Boards (#252). Exactly one segment is pressed. The group carries the accessible
	// name (`label`), each segment says "pressed" through `aria-pressed`.
	//
	// `value` is bindable; `onchange` fires only when the choice actually changes. Segments
	// are at least 44 px tall and show the shared focus ring. The labels come from the
	// caller, already translated.
	interface Option {
		value: T;
		label: string;
	}

	interface Props {
		/** The accessible name of the group, e.g. "Appearance". */
		label: string;
		options: readonly Option[];
		value: T;
		onchange?: (value: T) => void;
		disabled?: boolean;
		class?: string;
	}

	let {
		label,
		options,
		value = $bindable(),
		onchange,
		disabled = false,
		class: className = '',
	}: Props = $props();

	function pick(next: T) {
		if (next === value) return;
		value = next;
		onchange?.(next);
	}
</script>

<div
	role="group"
	aria-label={label}
	class="inline-flex gap-1 rounded-xl bg-surface-hover p-1 {className}"
>
	{#each options as option (option.value)}
		<button
			type="button"
			aria-pressed={option.value === value}
			{disabled}
			onclick={() => pick(option.value)}
			class="focus-ring min-h-11 min-w-11 flex-1 cursor-pointer rounded-[0.5rem] px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50
				{option.value === value
				? 'bg-primary text-primary-content'
				: 'bg-transparent text-content hover:bg-surface'}"
		>
			{option.label}
		</button>
	{/each}
</div>

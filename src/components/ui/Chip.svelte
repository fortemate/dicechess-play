<script lang="ts">
	// A choice that stays pressed: a filter ("Bots only"), a time control ("5+3"), a seat
	// colour (#252). It is a toggle button, so assistive technology hears "pressed" through
	// `aria-pressed`, and a sighted visitor sees it filled. One look for every setup form:
	// the selected choice is always filled, never merely outlined.
	//
	// `pill` is the rounded filter chip, `box` the squarer choice of a setup panel. At least
	// 44 px tall, with the shared focus ring. The label is the content.
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props {
		pressed: boolean;
		shape?: 'pill' | 'box';
		disabled?: boolean;
		children: Snippet;
		class?: string;
	}

	let {
		pressed,
		shape = 'pill',
		disabled = false,
		children,
		class: className = '',
		...rest
	}: Props & Omit<HTMLButtonAttributes, keyof Props> = $props();
</script>

<button
	type="button"
	aria-pressed={pressed}
	{disabled}
	class="focus-ring inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 border px-4 text-sm font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50
		{shape === 'pill' ? 'rounded-full' : 'rounded-control'}
		{pressed
		? 'border-primary bg-primary text-primary-content'
		: 'border-border-strong bg-transparent text-content hover:bg-surface-hover'}
		{className}"
	{...rest}
>
	{@render children()}
</button>

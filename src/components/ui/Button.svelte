<script lang="ts">
	// The one button of the redesigned pages (#252). Three kinds, by what pressing it does:
	//
	//   - `primary`: the main action of a page or a panel, filled. A page shows one.
	//   - `secondary`: any other action, outlined.
	//   - `danger`: a destructive action, outlined in the danger colour; `filled` is its armed
	//     state, for the second press of a two-press confirmation.
	//
	// With `href` it renders a link that looks the same, because "Start game" and "Watch" are
	// navigation. It is at least 44 px tall and shows the shared focus ring. It has no text of
	// its own: the label is the content, so the caller owns the wording and its translation.
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'danger';
	type Size = 'md' | 'lg';

	interface Props {
		variant?: Variant;
		/** `lg` is the 52 px button that ends a setup panel. */
		size?: Size;
		/** Only with `danger`: the armed, filled state. */
		filled?: boolean;
		/** Stretch to the width of the container. */
		block?: boolean;
		/** Render a link instead of a button. A disabled link is rendered as a disabled button. */
		href?: string;
		disabled?: boolean;
		children: Snippet;
		class?: string;
	}

	let {
		variant = 'secondary',
		size = 'md',
		filled = false,
		block = false,
		href,
		disabled = false,
		children,
		class: className = '',
		...rest
	}: Props & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, keyof Props> = $props();

	const VARIANTS: Record<Variant, string> = {
		primary:
			'border-primary bg-primary text-primary-content hover:border-primary-hover hover:bg-primary-hover',
		secondary: 'border-border-strong bg-transparent text-content hover:bg-surface-hover',
		danger: 'border-danger bg-transparent text-danger hover:bg-danger/10',
	};
	const SIZES: Record<Size, string> = {
		md: 'min-h-11 px-4 text-sm',
		lg: 'min-h-13 px-5 text-base',
	};

	const classes = $derived(
		[
			'focus-ring inline-flex min-w-11 cursor-pointer items-center justify-center gap-2 rounded-control border font-bold no-underline transition-colors',
			'disabled:cursor-not-allowed disabled:opacity-50',
			SIZES[size],
			variant === 'danger' && filled
				? 'border-danger bg-danger text-danger-content hover:opacity-90'
				: VARIANTS[variant],
			block ? 'w-full' : '',
			className,
		]
			.filter(Boolean)
			.join(' '),
	);
</script>

{#if href && !disabled}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a generic link: the caller passes a path it has resolved, or an external address -->
	<a {href} class={classes} {...rest}>{@render children()}</a>
{:else}
	<button type="button" class={classes} {disabled} {...rest}>{@render children()}</button>
{/if}

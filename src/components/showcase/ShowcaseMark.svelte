<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		class?: string;
	}

	let { class: className = 'h-6 w-6' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 14 14"
	class={className}
	role="img"
	aria-label={m.home_brand_mark_label()}
>
	<path
		fill="currentColor"
		d="M0 0h4v4H0V0Zm5 0h4v4H5V0Zm5 0h4v4h-4V0ZM0 5h4v4H0V5Zm5 0h4v4H5V5ZM0 10h4v4H0v-4Z"
	/>
</svg>

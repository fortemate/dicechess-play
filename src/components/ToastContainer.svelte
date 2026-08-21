<script lang="ts">
	import { toastStore, type ToastType } from '../lib/toastStore.svelte';
	import { fly, fade } from 'svelte/transition';

	// No dedicated "info" token exists, so it stays neutral (surface/border/content) —
	// same convention GameHistoryCard/GameEndModal use for their non-win/loss tone.
	const toneClass: Record<ToastType, string> = {
		success: 'border-success/30 bg-success/10 text-success',
		error: 'border-danger/30 bg-danger/10 text-danger',
		info: 'border-border bg-surface text-content',
	};
</script>

{#snippet toastIcon(type: ToastType)}
	<svg
		viewBox="0 0 24 24"
		class="h-5 w-5 shrink-0"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="9" />
		{#if type === 'success'}
			<path d="M8 12.5l2.5 2.5L16 9" />
		{:else if type === 'error'}
			<path d="M9 9l6 6M15 9l-6 6" />
		{:else}
			<path d="M12 11v5" /><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
		{/if}
	</svg>
{/snippet}

<!-- The always-mounted polite live region: screen readers announce toasts as they are
     appended. aria-atomic=false keeps toasts already on screen from re-announcing. -->
<div
	class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4 md:px-0"
	aria-live="polite"
	aria-atomic="false"
>
	{#each toastStore.toasts as toast (toast.id)}
		<div
			in:fly={{ y: 20, duration: 300 }}
			out:fade={{ duration: 200 }}
			class="pointer-events-auto flex items-center justify-between gap-3 rounded-lg border p-4 font-medium shadow-xl backdrop-blur-md {toneClass[
				toast.type
			]}"
		>
			<div class="flex items-center gap-3">
				{@render toastIcon(toast.type)}
				<span>{toast.text}</span>
			</div>
			<button
				type="button"
				class="shrink-0 opacity-60 transition-opacity hover:opacity-100"
				onclick={() => toastStore.remove(toast.id)}
				aria-label="Close"
			>
				<svg
					viewBox="0 0 24 24"
					class="h-4 w-4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>
	{/each}
</div>

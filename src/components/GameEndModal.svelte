<script lang="ts">
	// Full-screen result overlay shown when a game ends. Dismissable (backdrop, Escape or
	// "View board") so the final position and history stay inspectable — the side-rail
	// result card remains underneath as the fallback, so dismissing never dead-ends.
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		headline: string;
		/** Colors the headline by result. */
		tone?: 'win' | 'loss' | 'neutral';
		/** Caption under the headline (humanized end reason). */
		reason?: string;
		/** Backdrop click, Escape, or the "View board" link. */
		onDismiss: () => void;
		/** Page-specific action buttons. */
		children?: Snippet;
	}

	let { open, headline, tone = 'neutral', reason, onDismiss, children }: Props = $props();

	const toneClass: Record<NonNullable<Props['tone']>, string> = {
		win: 'text-success',
		loss: 'text-danger',
		neutral: 'text-content',
	};

	function onKeydown(event: KeyboardEvent) {
		// <svelte:window> can't live inside {#if open} (Svelte forbids svelte: tags in a block),
		// so the listener is always mounted and gated here instead.
		if (open && event.key === 'Escape') {
			event.preventDefault();
			onDismiss();
		}
	}

	// Backdrop click only — clicks inside the panel bubble up with a different target.
	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) onDismiss();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions
	     (backdrop click is a pointer nicety; Escape and the "View board" button cover keyboard) -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		onclick={onBackdropClick}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="game-end-headline"
			class="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-2xl"
		>
			<p id="game-end-headline" class="text-2xl font-bold {toneClass[tone]}">{headline}</p>
			{#if reason}
				<p class="mt-1.5 text-sm text-content-muted">{reason}</p>
			{/if}
			<div class="mt-5 flex flex-col gap-2.5">
				{@render children?.()}
			</div>
			<button
				type="button"
				onclick={onDismiss}
				class="mt-3 text-sm text-content-muted underline transition-colors hover:text-content"
			>
				View board
			</button>
		</div>
	</div>
{/if}

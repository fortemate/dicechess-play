<script lang="ts">
	// A styled theme picker replacing the native <select>, whose OS-drawn option list
	// couldn't be themed and clashed with the app chrome. Implemented as an
	// aria-activedescendant listbox so it keeps the select's keyboard support:
	// the <ul> holds focus while arrow keys / Home / End move the highlighted option,
	// Enter selects, Escape closes and returns focus to the trigger.
	import { tick } from 'svelte';
	import { themeStore, type Theme } from '$lib/stores/themeStore.svelte';

	const themes: { value: Theme; label: string }[] = [
		{ value: 'dark', label: 'Dark' },
		{ value: 'light', label: 'Light' },
		{ value: 'dracula', label: 'Dracula' },
		{ value: 'nord', label: 'Nord' },
		{ value: 'solarized-dark', label: 'Solarized' },
		{ value: 'tokyo-night', label: 'Tokyo Night' },
		{ value: 'gruvbox', label: 'Gruvbox' },
	];

	let open = $state(false);
	let activeIndex = $state(0);
	let rootEl: HTMLDivElement;
	let triggerEl: HTMLButtonElement;
	let listEl = $state<HTMLUListElement | null>(null);

	const currentLabel = $derived(themes.find((t) => t.value === themeStore.theme)?.label ?? 'Theme');
	const selectedIndex = $derived(themes.findIndex((t) => t.value === themeStore.theme));

	async function openMenu() {
		activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
		open = true;
		await tick(); // the list mounts under {#if open}; focus it once it exists
		listEl?.focus();
	}

	function closeMenu(returnFocus = false) {
		open = false;
		if (returnFocus) triggerEl?.focus();
	}

	function choose(value: Theme) {
		themeStore.setTheme(value);
		closeMenu(true);
	}

	function onTriggerKeydown(event: KeyboardEvent) {
		if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
			event.preventDefault();
			openMenu();
		}
	}

	function onListKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				activeIndex = (activeIndex + 1) % themes.length;
				break;
			case 'ArrowUp':
				event.preventDefault();
				activeIndex = (activeIndex - 1 + themes.length) % themes.length;
				break;
			case 'Home':
				event.preventDefault();
				activeIndex = 0;
				break;
			case 'End':
				event.preventDefault();
				activeIndex = themes.length - 1;
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				choose(themes[activeIndex].value);
				break;
			case 'Escape':
				event.preventDefault();
				closeMenu(true);
				break;
			case 'Tab':
				closeMenu();
				break;
		}
	}

	// Dismiss on a pointer press anywhere outside the widget (no focus return — mouse dismissal).
	$effect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (rootEl && !rootEl.contains(event.target as Node)) closeMenu();
		};
		document.addEventListener('pointerdown', onPointerDown);
		return () => document.removeEventListener('pointerdown', onPointerDown);
	});
</script>

<div class="relative" bind:this={rootEl}>
	<button
		bind:this={triggerEl}
		type="button"
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={() => (open ? closeMenu() : openMenu())}
		onkeydown={onTriggerKeydown}
		class="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs font-bold text-content-muted outline-none transition-colors hover:text-content focus-visible:border-primary"
	>
		<!-- No aria-label: it would override the content and hide the current theme from screen
		     readers. The name is composed from content instead — "Theme: <current>". -->
		<span class="sr-only">Theme:</span>
		<span>{currentLabel}</span>
		<svg
			viewBox="0 0 24 24"
			class="h-3.5 w-3.5 transition-transform {open ? 'rotate-180' : ''}"
			fill="none"
			stroke="currentColor"
			stroke-width="2.4"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M6 9l6 6 6-6" />
		</svg>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions
		     (listbox keyboard handling lives on the <ul> via aria-activedescendant; the option
		     click is the pointer path, which needs no per-option key handler) -->
		<ul
			bind:this={listEl}
			role="listbox"
			aria-label="Theme"
			aria-activedescendant="theme-opt-{activeIndex}"
			tabindex="-1"
			onkeydown={onListKeydown}
			class="absolute right-0 z-50 mt-1.5 min-w-[9rem] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl outline-none"
		>
			{#each themes as t, i (t.value)}
				<li
					id="theme-opt-{i}"
					role="option"
					aria-selected={themeStore.theme === t.value}
					onclick={() => choose(t.value)}
					class="flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-surface-hover hover:text-content {i ===
					activeIndex
						? 'bg-surface-hover text-content'
						: 'text-content-muted'}"
				>
					<span>{t.label}</span>
					{#if themeStore.theme === t.value}
						<svg
							viewBox="0 0 24 24"
							class="h-3.5 w-3.5 shrink-0 text-primary"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M5 12l5 5L20 7" />
						</svg>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<script lang="ts">
	// The appearance control in the header (#249): follow the system, light, or dark. The choices
	// come from the model in `#lib/appearance.ts`; this component only names and renders them.
	//
	// A styled listbox rather than a native <select>, whose OS-drawn option list could not be
	// themed and clashed with the app chrome. Implemented as an aria-activedescendant listbox so
	// it keeps the select's keyboard support: the <ul> holds focus while arrow keys / Home / End
	// move the highlighted option, Enter selects, Escape closes and returns focus to the trigger.
	import { tick } from 'svelte';
	import { APPEARANCE_PREFERENCES, type AppearancePreference } from '#lib/appearance.js';
	import { m } from '#lib/paraglide/messages.js';
	import { themeStore } from '#lib/stores/themeStore.svelte.js';

	// A Record keyed by the preference type, not a list of its own: a value added to the model
	// without a label here is a type error, so the control cannot silently drop a choice.
	const labels: Record<AppearancePreference, () => string> = {
		system: m.nav_theme_system,
		light: m.nav_theme_light,
		dark: m.nav_theme_dark,
	};
	const options = APPEARANCE_PREFERENCES.map((value) => ({ value, label: labels[value] }));

	let open = $state(false);
	let activeIndex = $state(0);
	let rootEl: HTMLDivElement;
	let triggerEl: HTMLButtonElement;
	let listEl = $state<HTMLUListElement | null>(null);

	const currentLabel = $derived(labels[themeStore.preference]());
	const selectedIndex = $derived(APPEARANCE_PREFERENCES.indexOf(themeStore.preference));

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

	function choose(value: AppearancePreference) {
		themeStore.setPreference(value);
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
				activeIndex = (activeIndex + 1) % options.length;
				break;
			case 'ArrowUp':
				event.preventDefault();
				activeIndex = (activeIndex - 1 + options.length) % options.length;
				break;
			case 'Home':
				event.preventDefault();
				activeIndex = 0;
				break;
			case 'End':
				event.preventDefault();
				activeIndex = options.length - 1;
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				choose(options[activeIndex].value);
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
	<!-- The accessible name states the current choice ("Theme: System") and contains the visible
	     label, so speech input can still target the button by the word on screen. One message
	     with a placeholder, not "Theme:" plus a label: a translation must be free to reorder. -->
	<button
		bind:this={triggerEl}
		type="button"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={m.nav_theme_current({ choice: currentLabel })}
		onclick={() => (open ? closeMenu() : openMenu())}
		onkeydown={onTriggerKeydown}
		class="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs font-bold text-content-muted outline-none transition-colors hover:text-content focus-visible:border-primary"
	>
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
		<!-- svelte-ignore a11y_click_events_have_key_events
		     (listbox keyboard handling lives on the <ul> via aria-activedescendant; the option
		     click is the pointer path, which needs no per-option key handler) -->
		<ul
			bind:this={listEl}
			role="listbox"
			aria-label={m.nav_theme_label()}
			aria-activedescendant="theme-opt-{activeIndex}"
			tabindex="-1"
			onkeydown={onListKeydown}
			class="absolute right-0 z-50 mt-1.5 min-w-[9rem] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl outline-none"
		>
			{#each options as option, i (option.value)}
				<li
					id="theme-opt-{i}"
					role="option"
					aria-selected={themeStore.preference === option.value}
					onclick={() => choose(option.value)}
					class="flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-surface-hover hover:text-content {i ===
					activeIndex
						? 'bg-surface-hover text-content'
						: 'text-content-muted'}"
				>
					<span>{option.label()}</span>
					{#if themeStore.preference === option.value}
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

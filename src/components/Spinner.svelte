<script lang="ts">
	// Purely decorative progress affordance for a button that stays in place while an async action
	// runs (#219). It carries no text of its own and is `aria-hidden`: the button's own label already
	// states what is happening ("Waking the bot…"), so announcing the spinner too would only add
	// noise — and letting it into the accessible name would break name-based queries.
	// Inherits colour from the button via `currentColor`, and sizes to the 16px icon used elsewhere
	// (see ToastContainer's close icon); callers only need `inline-flex items-center gap-2`.
</script>

<svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 animate-spin" fill="none" aria-hidden="true">
	<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25" />
	<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
</svg>

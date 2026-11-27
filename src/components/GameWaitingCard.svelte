<script lang="ts">
	// A waiting state of the first card of the rail (#256): the game is set up and somebody else
	// has to come. Two pages use it: a table opened in the lobby waits for an opponent, and a
	// game created by link shows the link to send.
	//
	// It says what is being waited for and, when there is a link, offers to copy it and, on a
	// device that has a share sheet, to share it. It does not know whether anybody came: the
	// page decides when to stop showing it. The one action it carries is the page's way out
	// ("Close the table", "Hide the link").
	//
	// All text comes from the page, already translated; the labels of copy and share are its own.
	import { m } from '#lib/paraglide/messages.js';
	import Button from './ui/Button.svelte';

	interface Props {
		title: string;
		text: string;
		/** A link to send. Shown in a field that selects itself, with "Copy link" and "Share". */
		link?: string;
		/** The label of the way out, and what it does. */
		closeLabel?: string;
		onclose?: () => void;
	}

	let { title, text, link, closeLabel, onclose }: Props = $props();

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	// The share sheet exists on phones and some desktops; where it does not, the button is absent
	// instead of being there and doing nothing.
	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

	async function copy() {
		if (!link || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1500);
		} catch {
			// The clipboard was blocked: the link stays in the field, selected on focus, to copy by hand.
		}
	}

	async function share() {
		if (!link) return;
		try {
			await navigator.share({
				title: m.game_waiting_share_title(),
				text: m.game_waiting_share_text(),
				url: link,
			});
		} catch {
			// The visitor closed the share sheet, or the browser refused: nothing to do.
		}
	}

	$effect(() => () => clearTimeout(copyTimer));
</script>

<section
	aria-label={m.game_waiting_region()}
	class="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-4"
>
	<div class="flex flex-col gap-1">
		<h2 class="m-0 text-xl leading-tight font-bold text-content">{title}</h2>
		<p class="m-0 text-sm text-content-muted">{text}</p>
	</div>

	{#if link}
		<input
			readonly
			value={link}
			aria-label={m.game_waiting_link_label()}
			onfocus={(event) => event.currentTarget.select()}
			class="min-h-11 w-full min-w-0 rounded-control border border-border-strong bg-surface-hover px-3 font-mono text-sm text-content focus-visible:focus-ring"
		/>
		<div class="flex flex-wrap gap-2">
			<Button variant="primary" class="flex-1" onclick={copy}>
				<span aria-live="polite">{copied ? m.game_waiting_copied() : m.game_waiting_copy()}</span>
			</Button>
			{#if canShare}
				<Button variant="secondary" class="flex-1" onclick={share}>{m.game_waiting_share()}</Button>
			{/if}
		</div>
	{/if}

	{#if closeLabel && onclose}
		<Button variant="secondary" block onclick={onclose}>{closeLabel}</Button>
	{/if}
</section>

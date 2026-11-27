<script lang="ts">
	// The friend tab of Play (#258): three steps that say how a game by link works, and the
	// shared setup panel with "Create game".
	//
	// The start is the one the `/live` setup page makes (`friendGame.ts`): the creator goes
	// straight to the board, where the invitation is shown (#256). A game by link is casual,
	// because both seats are registered to the creator; the tab says so and points at the open
	// tables for a rated game against a person.
	//
	// The third step tells the truth about today's server: the game starts by itself a few seconds
	// after it is created, whether or not the friend has joined (play-api#334 will hold it).
	import { resolve } from '$app/paths';
	import { createFriendGame, FRIEND_COLOR_VALUES, type FriendColor } from '#lib/live/friendGame.js';
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import { timeControlChoices, timeControlPresets } from '#lib/live/timeControls.js';
	import { m } from '#lib/paraglide/messages.js';
	import GameSetupPanel from './GameSetupPanel.svelte';
	import Card from './ui/Card.svelte';

	let time = $state(0);
	let color = $state<FriendColor>('random');
	let creating = $state(false);
	let error = $state<string | null>(null);
	const timeGroups = $derived(timeControlChoices());

	const steps = $derived([
		{ title: m.play_friend_step1_title(), text: m.play_friend_step1_text() },
		{ title: m.play_friend_step2_title(), text: m.play_friend_step2_text() },
		{ title: m.play_friend_step3_title(), text: m.play_friend_step3_text() },
	]);

	async function create() {
		if (creating) return;
		creating = true;
		error = null;
		try {
			// Full navigation: the board page connects fresh from the seat token in the address.
			// `creating` stays set on success, so the button cannot make a second game on the way.
			window.location.href = await createFriendGame(
				(timeControlPresets[time] ?? timeControlPresets[0]).value,
				color,
				location.origin,
			);
		} catch {
			// An unreachable server and a malformed answer mean the same to the player.
			error = m.play_friend_failed();
			creating = false;
		}
	}

	// A browser may bring this page back from its cache when the visitor returns from the board.
	function onPageShow(event: PageTransitionEvent) {
		if (event.persisted) creating = false;
	}
</script>

<svelte:window onpageshow={onPageShow} />

<div
	class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start lg:gap-6"
>
	<Card as="section" padding="lg" aria-labelledby="play-friend-how" class="flex flex-col gap-4">
		<h2
			id="play-friend-how"
			class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase"
		>
			{m.play_friend_how()}
		</h2>
		<ol class="m-0 flex list-none flex-col gap-4 p-0">
			{#each steps as step, index (index)}
				<li class="flex gap-3">
					<span
						aria-hidden="true"
						class="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-sm font-bold text-content"
					>
						{index + 1}
					</span>
					<div class="min-w-0">
						<p class="m-0 font-semibold text-content">{step.title}</p>
						<p class="m-0 text-sm text-content-muted">{step.text}</p>
					</div>
				</li>
			{/each}
		</ol>
		<div class="rounded-control bg-surface-hover px-4 py-3">
			<p class="m-0 font-semibold text-content">{m.play_friend_casual_title()}</p>
			<p class="m-0 text-sm text-content-muted">
				{m.play_friend_casual_text()}
				<!-- The path is resolved; the rule does not see through the query added to it. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={`${resolve('/play')}?tab=table`}
					class="rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:focus-ring"
				>
					{m.play_friend_casual_link()}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</p>
		</div>
	</Card>

	<Card
		as="section"
		raised
		padding="lg"
		aria-labelledby="play-friend-title"
		class="flex flex-col gap-4"
	>
		<div>
			<p class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase">
				{m.play_friend_eyebrow()}
			</p>
			<h2 id="play-friend-title" class="m-0 text-2xl font-bold tracking-tight text-content">
				{m.play_friend_title()}
			</h2>
			<p class="m-0 text-sm text-content-muted">{m.play_friend_sub()}</p>
		</div>
		{#if isLiveEnabled()}
			<GameSetupPanel
				name="play-friend"
				{timeGroups}
				bind:time
				colorValues={FRIEND_COLOR_VALUES}
				bind:color
				rating="casual"
				actionLabel={m.play_friend_create()}
				busyLabel={m.play_friend_creating()}
				busy={creating}
				onstart={create}
				{error}
			/>
			<p class="m-0 text-center text-xs text-content-muted">{m.play_friend_note()}</p>
		{:else}
			<p class="m-0 text-sm text-content-muted">{m.play_live_off()}</p>
		{/if}
	</Card>
</div>

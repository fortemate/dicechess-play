<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// The nav's Play target (#217): a hub over every way to start a game, not a game
	// surface itself. The offline practice game this route used to host lives at /practice.
	import GameHub from '../../components/GameHub.svelte';
</script>

<svelte:head>
	<title>Play — Dice Chess</title>
	<meta
		name="description"
		content="Start a Dice Chess game: practice offline, challenge a rated bot, invite a friend by link, or open a table in the lobby."
	/>
</svelte:head>

<section class="flex flex-col items-center gap-8 py-8 sm:py-12">
	<div class="flex flex-col items-center gap-2 text-center">
		<h2 class="text-2xl sm:text-3xl font-bold text-content">Play</h2>
		<p class="max-w-xl text-content-muted leading-relaxed">
			Pick how you want to start — practice is instant and unrated; rated games count on the
			leaderboard.
		</p>
	</div>

	<GameHub />
</section>

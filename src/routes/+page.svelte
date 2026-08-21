<script lang="ts">
	// Landing page — the marketing hero over the same game hub /play renders (#217): the
	// first decision is always "who do I play?", and the two entry points must not drift.
	import GameHub from '../components/GameHub.svelte';
</script>

<section class="flex flex-col items-center gap-8 py-8 sm:py-12">
	<div class="flex flex-col items-center gap-3 text-center">
		<span
			class="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30"
		>
			<span class="text-3xl">🎲</span>
		</span>
		<h2 class="text-3xl sm:text-4xl font-bold text-content">Play Dice Chess</h2>
		<p class="max-w-xl text-content-muted leading-relaxed">
			Roll the dice, move your pieces, capture the king. A full game right in your browser — no
			sign-up, nothing to install. Sign in only if you want a rating on the leaderboard.
		</p>
	</div>

	<GameHub />

	<p class="max-w-md text-center text-xs text-content-muted/70">
		Finished games are recorded anonymously to improve our analytics. You stay a guest — no account
		required.
	</p>
</section>

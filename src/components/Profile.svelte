<script lang="ts">
	// The public profile of a bot or of a person (#262): both addresses render through this one
	// component, which reads the profile for the subject it is given and hands it to
	// `ProfileView`.
	//
	// A person is keyed on the NICKNAME, the only public handle they have: `user:<uuid>` never
	// appears on the public wire, so a renamed account changes its own address. A person's public
	// profile counts the account's own games only, never its claimed guest ids.
	//
	// "No such bot" or "no such player" (404, also what a deleted account answers) is permanent
	// and is told apart from a server that cannot be reached right now.
	//
	// For a bot the public list of live games is read as well, and again every few seconds while
	// the page is shown, to offer "watch" only while it plays. That read is a convenience: when
	// it fails, the profile is shown without the link.
	import {
		fetchBotProfile,
		fetchPlayerProfile,
		type BotProfile,
		type PlayerProfile,
	} from '#lib/leaderboard/leaderboardApi.js';
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import { listGames } from '#lib/live/lobbyApi.js';
	import { m } from '#lib/paraglide/messages.js';
	import { liveGameOf, type Subject } from '#lib/profile/profileView.js';
	import ProfileView from './ProfileView.svelte';
	import Spinner from './Spinner.svelte';

	/** How often a bot's profile asks whether the bot is in a game. */
	const LIVE_POLL_MS = 10_000;

	let { subject }: { subject: Subject } = $props();

	let profile = $state<BotProfile | PlayerProfile | null>(null);
	let loading = $state(false);
	let notFound = $state(false);
	let failed = $state(false);
	let playingGameId = $state<string | null>(null);

	const live = isLiveEnabled();
	const name = $derived(subject.kind === 'bot' ? subject.name : subject.nickname);

	$effect(() => {
		// Read the fields, so that a new address reads a new profile.
		const wanted: Subject =
			subject.kind === 'bot'
				? { kind: 'bot', team: subject.team, name: subject.name }
				: { kind: 'player', nickname: subject.nickname };
		profile = null;
		notFound = false;
		failed = false;
		playingGameId = null;
		if (!live) return;
		let alive = true;
		loading = true;
		const read =
			wanted.kind === 'bot'
				? fetchBotProfile(wanted.team, wanted.name)
				: fetchPlayerProfile(wanted.nickname);
		read
			.then((result) => {
				if (alive) profile = result;
			})
			.catch((error: unknown) => {
				if (!alive) return;
				if (error instanceof Error && error.message.endsWith('404')) notFound = true;
				else failed = true;
			})
			.finally(() => {
				if (alive) loading = false;
			});
		let timer: ReturnType<typeof setInterval> | undefined;
		if (wanted.kind === 'bot') {
			// Asked again while the page is shown, so the link goes when the game ends and comes
			// when one starts. One read at a time; never while the tab is hidden.
			let reading = false;
			const look = () => {
				if (reading || document.hidden) return;
				reading = true;
				listGames()
					.then((answer) => {
						if (alive) playingGameId = liveGameOf(answer.games, wanted);
					})
					.catch(() => {
						// The link is a convenience: without an answer nothing is offered to watch.
						if (alive) playingGameId = null;
					})
					.finally(() => {
						reading = false;
					});
			};
			look();
			timer = setInterval(look, LIVE_POLL_MS);
		}
		return () => {
			alive = false;
			clearInterval(timer);
		};
	});
</script>

<svelte:head>
	<title>
		{profile
			? m.profile_title({ name })
			: subject.kind === 'bot'
				? m.profile_title_bot()
				: m.profile_title_player()}
	</title>
</svelte:head>

{#if !live}
	<p class="m-0 text-content-muted">{m.profile_off()}</p>
{:else if loading}
	<p role="status" class="m-0 flex items-center gap-2 text-content-muted">
		<Spinner />
		{m.profile_loading()}
	</p>
{:else if notFound}
	<p class="m-0 text-content-muted">
		{subject.kind === 'bot'
			? m.profile_bot_missing({ team: subject.team, name: subject.name })
			: m.profile_player_missing({ nickname: subject.nickname })}
	</p>
{:else if failed}
	<p role="alert" class="m-0 text-danger">
		{subject.kind === 'bot' ? m.profile_bot_error() : m.profile_player_error()}
	</p>
{:else if profile}
	<!-- Fields an older server does not send yet default to empty: this page can be deployed
	     before the server version that added them. -->
	<ProfileView
		{subject}
		ratings={profile.ratings ?? []}
		training={'nickname' in profile ? (profile.training ?? undefined) : undefined}
		opponents={profile.opponents ?? []}
		recent={profile.recent ?? []}
		totalGames={'nickname' in profile ? profile.totalGames : undefined}
		offLadder={'onLadder' in profile && !profile.onLadder}
		{playingGameId}
	/>
{/if}

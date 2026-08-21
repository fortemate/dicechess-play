<script lang="ts">
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { getGuestUuid } from '$lib/ingest/guestIdentity';
	import { isLiveEnabled } from '$lib/live/liveApi';
	import {
		listSeeks,
		listGames,
		createSeek,
		seekStatus,
		acceptSeek,
		cancelSeek,
		SeekAcceptError,
	} from '$lib/live/lobbyApi';
	import { buildJoinUrl } from '$lib/live/seatLink';
	import { fullmoveOf } from '$lib/live/boardGrid';
	import { formatClock } from '$lib/live/clockFormat';
	import { seekOffer } from '$lib/live/playerLabel';
	import { timeControlLabel, timeControlPresets } from '$lib/live/timeControls';
	import BotBadge from '../../components/BotBadge.svelte';
	import MiniBoard from '../../components/MiniBoard.svelte';
	import RatedBadge from '../../components/RatedBadge.svelte';
	import RatedChoice from '../../components/RatedChoice.svelte';
	import TimeControlPicker from '../../components/TimeControlPicker.svelte';
	import type { LiveGame, PublicPlayer, Seek } from '$lib/live/liveTypes';

	const LIST_POLL_MS = 3000;
	const STATUS_POLL_MS = 1500;
	const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

	let seeks = $state<Seek[]>([]);
	let games = $state<LiveGame[]>([]);
	let totalGames = $state(0);
	let selected = $state(0);
	// Casual unless the visitor is signed in AND asks for rated — RatedChoice owns that gate (#279).
	let rated = $state(false);
	let error = $state<string | null>(null);
	// When set, we created a seek and are waiting for an opponent (our own table replaces the wall).
	let waiting = $state<{ id: string; secret: string; label: string; rated: boolean } | null>(null);
	let creating = $state(false);
	let accepting = $state(false);
	let createOpen = $state(false);
	let loaded = $state(false); // first successful poll landed — until then, no "empty hall" flash
	const POLL_FAILURES_BEFORE_UNAVAILABLE = 2;
	let unavailable = $state(false); // play-api looks unreachable — shown instead of the wall/loading text
	// Guards accept()'s post-await navigation below: if the page unmounts (visitor navigates away)
	// while acceptSeek is in flight, the resolved/rejected continuation must not redirect or touch
	// state. The waiting-poll effect's own `alive` closure already covers its goToBoard call.
	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
	});

	// The wall: the hottest game becomes the TV tile, the rest follow, open seeks close the row.
	const tvGame = $derived(games.at(0));
	const otherGames = $derived(games.slice(1));

	const playerName = (p: PublicPlayer | undefined | null): string => p?.name ?? 'Anonymous';
	const isBot = (p: PublicPlayer | undefined | null): boolean => p?.kind === 'Bot';

	function goToBoard(gameId: string, token: string, seat: 'White' | 'Black') {
		// Full navigation: the board page connects fresh from the seat token in the URL.
		window.location.href = buildJoinUrl(location.origin, gameId, token, seat);
	}

	// Browse: poll the wall (seeks + live games) while not waiting (and only when live play is configured).
	$effect(() => {
		if (waiting || !isLiveEnabled()) return;
		let alive = true;
		// Consecutive failed polls — one blip doesn't mean the server is down, so a single miss
		// stays silent (keep showing the last-known wall); only a run of them flips `unavailable`.
		let pollFailures = 0;
		const tick = async () => {
			try {
				const [nextSeeks, nextGames] = await Promise.all([listSeeks(), listGames()]);
				if (!alive) return;
				seeks = nextSeeks;
				games = nextGames.games;
				totalGames = nextGames.total;
				loaded = true;
				pollFailures = 0;
				unavailable = false;
			} catch {
				if (!alive) return;
				pollFailures += 1;
				if (pollFailures >= POLL_FAILURES_BEFORE_UNAVAILABLE) unavailable = true;
			}
		};
		tick();
		const timer = setInterval(tick, LIST_POLL_MS);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	});

	// Waiting: poll our seek until it's accepted, then go to the board as whichever seat the
	// server's accept-time coin flip actually gave us (never assume White — see play-api #95).
	$effect(() => {
		const w = waiting;
		if (!w) return;
		let alive = true;
		const tick = async () => {
			try {
				const s = await seekStatus(w.id, w.secret);
				if (alive && s.matched && s.gameId && s.token && s.seat)
					goToBoard(s.gameId, s.token, s.seat);
			} catch {
				/* transient — keep waiting */
			}
		};
		tick(); // check immediately so a match that already happened redirects without a poll-interval delay
		const timer = setInterval(tick, STATUS_POLL_MS);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	});

	async function create() {
		if (creating || accepting) return;
		creating = true;
		error = null;
		try {
			const preset = timeControlPresets[selected];
			const created = await createSeek(getGuestUuid(), preset.value, rated);
			waiting = { id: created.seekId, secret: created.secret, label: preset.label, rated };
		} catch {
			// Any failure here — unreachable server, a bad response — means the same thing to the
			// player: the lobby isn't working right now. One honest, non-technical message instead of
			// a raw fetch exception or status code.
			error = 'The lobby is unavailable right now — try again in a minute.';
		} finally {
			creating = false;
		}
	}

	async function cancel() {
		const w = waiting;
		if (!w) return;
		waiting = null; // stop polling immediately
		try {
			await cancelSeek(w.id, w.secret);
		} catch {
			/* best-effort; the server TTL reaps it anyway */
		}
	}

	async function accept(seek: Seek) {
		if (accepting || creating) return;
		accepting = true;
		error = null;
		try {
			const match = await acceptSeek(seek.id, getGuestUuid());
			if (destroyed) return;
			// Never assume Black: the server coin-flips creator/accepter to White/Black on accept
			// (see play-api #95) — match.seat is the only authoritative source.
			goToBoard(match.gameId, match.token, match.seat);
		} catch (e) {
			if (destroyed) return;
			// A rated table refused an anonymous visitor (#279). It is still standing, so neither the
			// "just taken" message nor a list refresh applies — the only way in is to sign in, and
			// sending them to another row would just repeat the refusal.
			if (e instanceof SeekAcceptError && e.status === 403) {
				error = 'That table plays for rating — sign in to sit down.';
				return; // `finally` still clears `accepting`
			}
			// Lost the race (someone took it) or it expired — refresh the list.
			error = 'That table was just taken — pick another.';
			try {
				const freshSeeks = await listSeeks();
				if (!destroyed) seeks = freshSeeks;
			} catch {
				/* ignore */
			}
		} finally {
			// finally always runs, even after the `if (destroyed) return;` above — don't let it write
			// state on an unmounted component either.
			if (!destroyed) accepting = false;
		}
	}
</script>

{#snippet playerLine(p: PublicPlayer | undefined | null, clockMs: number | undefined)}
	<div class="flex items-center justify-between gap-2 min-w-0">
		<span class="flex items-center gap-1.5 min-w-0 text-sm">
			<b class="truncate text-content">{playerName(p)}</b>
			{#if isBot(p)}
				<BotBadge />
			{/if}
		</span>
		{#if clockMs !== undefined}
			<span class="shrink-0 font-mono text-sm font-bold tabular-nums text-content">
				{formatClock(clockMs)}
			</span>
		{/if}
	</div>
{/snippet}

<section class="mx-auto flex max-w-4xl flex-col gap-5">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-baseline gap-4">
			<h2 class="text-2xl font-bold text-content">Lobby</h2>
			{#if isLiveEnabled() && !waiting}
				<span class="font-mono text-xs uppercase tracking-wider text-content-muted tabular-nums">
					games {totalGames} · tables {seeks.length}
				</span>
			{/if}
		</div>
		{#if isLiveEnabled() && !waiting}
			<!-- Phones stack this as primary-action-first (full-width button, quiet links under it);
			     from sm up it lays out as the usual single row with the button on the right. -->
			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
				<button
					type="button"
					onclick={() => (createOpen = !createOpen)}
					class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-center font-bold text-content-muted transition-colors hover:text-content sm:order-last sm:w-auto sm:py-2"
				>
					{createOpen ? '× Close' : '+ Open a table'}
				</button>
				<div class="flex flex-wrap items-center gap-2 sm:gap-4">
					<a
						href={resolve('/live')}
						class="rounded-xl px-2 py-2 text-sm font-bold text-content-muted transition-colors hover:bg-surface hover:text-content sm:px-4 sm:text-base"
					>
						Play a friend by link →
					</a>
					<a
						href={resolve('/bots')}
						class="rounded-xl px-2 py-2 text-sm font-bold text-content-muted transition-colors hover:bg-surface hover:text-content sm:px-4 sm:text-base"
					>
						Challenge a rated bot →
					</a>
					<a
						href={resolve('/leaderboard')}
						class="rounded-xl px-2 py-2 text-sm font-bold text-content-muted transition-colors hover:bg-surface hover:text-content sm:px-4 sm:text-base"
					>
						Leaderboard →
					</a>
				</div>
			</div>
		{/if}
	</div>

	{#if !isLiveEnabled()}
		<p class="text-content-muted">
			Live play is not configured. Set <code>VITE_PLAY_API_URL</code> to the play-api server.
		</p>
	{:else if waiting}
		<div
			class="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-10"
		>
			<span class="font-mono text-[11px] font-bold uppercase tracking-wider text-primary">
				Your table is open
			</span>
			<p class="flex flex-wrap items-center justify-center gap-1.5 text-content-muted">
				Waiting for an opponent… <span class="font-bold text-content">{waiting.label}</span>
				<!-- Echoes what we asked for; the server is the authority and degrades the flag if the
				     session turns out to be absent, which RatedChoice's own gate already prevents. -->
				{#if waiting.rated}<RatedBadge />{/if}
			</p>
			<button
				type="button"
				onclick={cancel}
				class="rounded-xl border border-border bg-surface px-6 py-3 font-bold text-content-muted hover:text-content"
			>
				Cancel
			</button>
		</div>
	{:else}
		{#if createOpen}
			<div class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/50 p-4">
				<TimeControlPicker bind:selected />
				<RatedChoice bind:rated name="seek" />
				<button
					type="button"
					onclick={create}
					disabled={creating}
					class="rounded-xl bg-primary px-6 py-3 text-lg font-bold text-primary-content shadow-lg shadow-primary/30 transition-colors hover:bg-primary-hover disabled:opacity-60"
				>
					{creating ? 'Opening…' : 'Open a table'}
				</button>
			</div>
		{/if}

		{#if error}<p class="text-sm text-danger">{error}</p>{/if}

		{#if unavailable}
			<div
				class="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-center text-danger"
				role="alert"
			>
				The lobby is unavailable right now — try again in a minute.
			</div>
		{:else if !loaded}
			<p class="px-2 py-14 text-center text-sm text-content-muted">Looking around the hall…</p>
		{:else if games.length === 0 && seeks.length === 0}
			<div
				class="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-6 py-14 text-center"
			>
				<p class="font-bold text-content">The hall is empty right now.</p>
				<p class="text-sm text-content-muted">Open a table above — it will be waiting here.</p>
			</div>
		{:else}
			<div class="board-wall">
				{#if tvGame}
					<a
						href={resolve('/live/[id]', { id: tvGame.gameId })}
						class="tv group flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary"
					>
						<div class="flex items-center justify-between">
							<span
								class="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-success"
							>
								<span class="live-dot"></span>
								live · move {fullmoveOf(tvGame.dfen)}
							</span>
							<span
								class="text-xs text-content-muted opacity-0 transition-opacity group-hover:opacity-100"
							>
								Watch →
							</span>
						</div>
						{@render playerLine(tvGame.players?.black, tvGame.clocks?.black)}
						<MiniBoard fen={tvGame.dfen} />
						{@render playerLine(tvGame.players?.white, tvGame.clocks?.white)}
					</a>
				{/if}

				{#each otherGames as game (game.gameId)}
					<a
						href={resolve('/live/[id]', { id: game.gameId })}
						class="group flex flex-row sm:flex-col gap-3 rounded-2xl border border-border bg-surface p-3 transition-all hover:-translate-y-0.5 hover:border-primary"
					>
						<div class="w-20 h-20 shrink-0 sm:w-full sm:h-auto">
							<MiniBoard fen={game.dfen} />
						</div>
						<div class="flex flex-col justify-between flex-1 min-w-0">
							<div class="flex items-center justify-between gap-2">
								<span
									class="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-success"
								>
									<span class="live-dot"></span>
									live · move {fullmoveOf(game.dfen)}
								</span>
								<span
									class="text-xs text-content-muted opacity-0 transition-opacity group-hover:opacity-100 hidden sm:inline"
								>
									Watch →
								</span>
							</div>
							<div class="flex flex-col gap-1.5 my-1.5 min-w-0">
								<div class="flex items-center justify-between gap-2 min-w-0">
									<span class="flex items-center gap-1.5 min-w-0 text-xs text-content-muted">
										<span
											class="w-2 h-2 rounded-full bg-slate-950 border border-slate-700 shrink-0"
											aria-hidden="true"
										></span>
										<span class="truncate">{playerName(game.players?.black)}</span>
										{#if isBot(game.players?.black)}
											<BotBadge sizeClass="text-[9px]" />
										{/if}
									</span>
								</div>
								<div class="flex items-center justify-between gap-2 min-w-0">
									<span class="flex items-center gap-1.5 min-w-0 text-xs text-content-muted">
										<span
											class="w-2 h-2 rounded-full bg-white border border-slate-300 shrink-0"
											aria-hidden="true"
										></span>
										<span class="truncate">{playerName(game.players?.white)}</span>
										{#if isBot(game.players?.white)}
											<BotBadge sizeClass="text-[9px]" />
										{/if}
									</span>
								</div>
							</div>
							<div class="sm:hidden mt-auto">
								<span class="inline-block text-xs font-semibold text-primary"> Watch game → </span>
							</div>
						</div>
					</a>
				{/each}

				{#each seeks as seek (seek.id)}
					{@const offer = seekOffer(seek)}
					<button
						type="button"
						onclick={() => accept(seek)}
						disabled={accepting || creating}
						class="group flex flex-row sm:flex-col gap-3 rounded-2xl border-2 border-dashed p-3 text-left transition-all hover:-translate-y-0.5 disabled:opacity-60
							{offer.bot
							? 'border-primary/50 bg-primary/5 hover:border-primary'
							: 'border-border bg-surface/50 hover:border-primary/60'}"
					>
						<span class="block w-20 h-20 shrink-0 sm:w-full sm:h-auto">
							<MiniBoard fen={START_FEN} faded />
						</span>
						<span class="flex flex-col justify-between flex-1 min-w-0">
							<span class="flex items-center justify-between gap-2">
								<span
									class="font-mono text-[10px] font-bold uppercase tracking-wider {offer.bot
										? 'text-primary'
										: 'text-content-muted'}"
								>
									open table
								</span>
								<span class="text-xs text-content-muted shrink-0">
									{timeControlLabel(seek.timeControl)}
								</span>
							</span>
							<span class="flex items-center gap-1.5 min-w-0 my-1.5">
								<b class="truncate text-sm text-content">{offer.name}</b>
								{#if offer.bot}
									<BotBadge />
								{/if}
								<!-- Only an explicit `true` badges: on a server that does not send the field at
								     all, saying nothing is the safe direction (see Seek.rated). -->
								{#if seek.rated}
									<RatedBadge />
								{/if}
							</span>
							<span class="block mt-auto sm:mt-2">
								<span
									class="inline-block w-full text-center rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-content shadow-sm transition-colors group-hover:bg-primary-hover"
								>
									Sit down
								</span>
							</span>
						</span>
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</section>

<style>
	.board-wall {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 16px;
		align-items: start;
	}
	.tv {
		grid-column: span 2;
		grid-row: span 2;
	}
	@media (max-width: 640px) {
		.board-wall {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.tv {
			grid-column: auto;
			grid-row: auto;
		}
	}
	.live-dot {
		width: 7px;
		height: 7px;
		border-radius: 9999px;
		background: currentColor;
	}
	@media (prefers-reduced-motion: no-preference) {
		.live-dot {
			animation: live-pulse 2s ease-in-out infinite;
		}
	}
	@keyframes live-pulse {
		50% {
			opacity: 0.35;
		}
	}
</style>

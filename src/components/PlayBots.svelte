<script lang="ts">
	// The bot tab of Play (#257): one list of every bot a visitor can play, and the setup of the
	// game against the bot that is chosen.
	//
	// The list has three sources (see `lib/play/botList.ts`): the bots that run in the browser,
	// play-api's catalog, and the bots that wait at an open table. Each kind starts its game in its
	// own way, and this component keeps those three ways apart:
	//
	//   - a starter bot: the game starts in the browser store and the practice page shows it. No
	//     request is made, so it works without a connection;
	//   - an arena bot: the bot is woken first (its endpoint may be scaled to zero), then the game
	//     is created with the same request the catalog page sends (`BotChallengePanel`), and the
	//     same choices are remembered for next time;
	//   - a table bot: the visitor sits down at its table, the way the lobby does it. The table
	//     decides the time control and whether the game is rated, so there is nothing to choose
	//     but the table, and no colour: the seats are drawn when someone sits down.
	//
	// The catalog is read once per visit. The open tables are polled, because "Ready now" is a
	// promise about this moment.
	import { onDestroy, onMount } from 'svelte';
	import { goto, preloadCode } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authStore } from '#lib/authStore.svelte.js';
	import { describeStartFailure, startBotGame } from '#lib/catalog/botChallenge.js';
	import {
		fetchCatalog,
		wakeBot,
		type CatalogBot,
		type WakeResponse,
	} from '#lib/catalog/catalogApi.js';
	import { rememberBotGame } from '#lib/catalog/lastBotGame.js';
	import { getGuestUuid } from '#lib/ingest/guestIdentity.js';
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import type { Seek } from '#lib/live/liveTypes.js';
	import { acceptSeek, listSeeks, SeekAcceptError } from '#lib/live/lobbyApi.js';
	import { buildJoinUrl } from '#lib/live/seatLink.js';
	import {
		botTimeControlChoices,
		botTimeControlPresets,
		defaultBotTimeControlIndex,
		timeControlLabel,
	} from '#lib/live/timeControls.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		BOT_FILTERS,
		findBot,
		matchesFilter,
		onlineBots,
		starterBots,
		type ArenaBot,
		type BotEntry,
		type BotFilter,
		type OnlineBot,
		type TableBot,
	} from '#lib/play/botList.js';
	import {
		PRACTICE_COLOR_VALUES,
		PRACTICE_TIME_PRESETS,
		practiceTimeGroups,
		practiceTimeLabel,
		startPracticeGame,
		storedPracticeTimeIndex,
		type PracticeColor,
	} from '#lib/playWithBot/practiceSetup.js';
	import { preferencesStore } from '#lib/preferencesStore.svelte.js';
	import { formatWholeNumber } from '../utils/formatters';
	import GameSetupPanel from './GameSetupPanel.svelte';
	import Spinner from './Spinner.svelte';
	import Card from './ui/Card.svelte';
	import Chip from './ui/Chip.svelte';
	import Tag from './ui/Tag.svelte';

	interface Props {
		/** The bot a link asks for (`/play?bot=…`): see `findBot` for the forms it may take. */
		preselect?: string | null;
	}

	let { preselect = null }: Props = $props();

	/** How often the open tables are read again. */
	const SEEKS_POLL_MS = 5000;
	const DEFAULT_BOT = 'greedy';

	// --- The list -----------------------------------------------------------------------------

	const starters = starterBots();
	let catalog = $state<CatalogBot[]>([]);
	// 'off': this build has no play server. The starter bots do not need one.
	let catalogState = $state<'off' | 'loading' | 'ready' | 'failed'>(
		isLiveEnabled() ? 'loading' : 'off',
	);
	let seeks = $state<Seek[]>([]);
	let seeksRead = $state(false);

	const online = $derived<OnlineBot[]>(onlineBots(catalog, seeks));
	const entries = $derived<BotEntry[]>([...starters, ...online]);

	let filter = $state<BotFilter>('all');
	const FILTER_LABELS: Record<BotFilter, () => string> = {
		all: m.play_filter_all,
		ready: m.play_filter_ready,
		browser: m.play_filter_browser,
		rated: m.play_filter_rated,
	};
	const shownStarters = $derived(starters.filter((bot) => matchesFilter(bot, filter)));
	const shownOnline = $derived(online.filter((bot) => matchesFilter(bot, filter)));
	// The arena group is worth its heading whenever the filter could show an arena bot at all.
	const arenaGroupShown = $derived(filter !== 'browser');
	const starterGroupShown = $derived(filter === 'all' || filter === 'browser');

	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
	});

	onMount(() => {
		// The practice page shows a starter bot game. Fetch its code now, while there is a
		// connection, so that starting the game later does not need one.
		preloadCode('/practice').catch(() => {
			/* offline already: the service worker's cache is the only source left */
		});
		if (!isLiveEnabled()) return;

		fetchCatalog()
			.then((result) => {
				if (destroyed) return;
				catalog = result.bots;
				catalogState = 'ready';
			})
			.catch(() => {
				if (!destroyed) catalogState = 'failed';
			});

		const readSeeks = async () => {
			if (document.hidden) return;
			try {
				const next = await listSeeks();
				if (destroyed) return;
				seeks = next;
			} catch {
				// A missed poll keeps the last list: one blip must not empty the "Ready now" rows.
			} finally {
				if (!destroyed) seeksRead = true;
			}
		};
		void readSeeks();
		const timer = setInterval(readSeeks, SEEKS_POLL_MS);
		return () => clearInterval(timer);
	});

	// --- The choice ---------------------------------------------------------------------------

	let selectedKey = $state(DEFAULT_BOT);
	// A line about the choice itself: the bot of a link is not there, or the chosen bot has left.
	let notice = $state<string | null>(null);
	const selected = $derived<BotEntry>(
		entries.find((entry) => entry.key === selectedKey) ??
			starters.find((bot) => bot.key === DEFAULT_BOT) ??
			starters[0],
	);

	// A link's bot may be an online one, which is only known once its source has answered. Wait
	// for it, then choose it once; if every source has answered without it, say so.
	let pendingPreselect: string | null = null;
	$effect.pre(() => {
		// Only the first value counts: a link is followed once.
		pendingPreselect ??= preselect?.trim() || null;
	});
	$effect(() => {
		if (pendingPreselect === null) return;
		const found = findBot(entries, pendingPreselect);
		if (found) {
			selectedKey = found.key;
			pendingPreselect = null;
			return;
		}
		const sourcesAnswered = catalogState !== 'loading' && (seeksRead || catalogState === 'off');
		if (sourcesAnswered) {
			pendingPreselect = null;
			notice = m.play_bot_unknown();
		}
	});

	// An online bot can leave the list: a table bot whose seat was just taken. The setup must not
	// silently turn into a game against another bot, so say who left.
	let chosenOnlineLabel: string | null = null;
	$effect(() => {
		const found = entries.find((entry) => entry.key === selectedKey);
		if (found) {
			chosenOnlineLabel = found.kind === 'starter' ? null : found.label;
			return;
		}
		if (chosenOnlineLabel !== null) notice = m.play_bot_gone({ name: chosenOnlineLabel });
		chosenOnlineLabel = null;
		selectedKey = DEFAULT_BOT;
	});

	function choose(key: string) {
		selectedKey = key;
		notice = null;
		error = null;
	}

	// --- The setup, one set of choices per kind of bot ----------------------------------------

	let practiceTime = $state(storedPracticeTimeIndex());
	let practiceColor = $state<PracticeColor>(preferencesStore.playerColorPreference);
	const practiceGroups = $derived(practiceTimeGroups());

	type ArenaColor = 'random' | 'White' | 'Black';
	// The setup panel speaks of three colours; the request names a seat or leaves it out.
	const ARENA_COLOR_VALUES = { random: 'random', white: 'White', black: 'Black' } as const;
	// Looked up by id, not by a stored index (#20): a reordered preset list must fall back to the
	// default, not point at another time control.
	const storedArenaTime = () => {
		const index = botTimeControlPresets.findIndex(
			(preset) => preset.id === preferencesStore.botChallengeTimeControl,
		);
		return index >= 0 ? index : defaultBotTimeControlIndex;
	};
	let arenaTime = $state(storedArenaTime());
	let arenaColor = $state<ArenaColor>(preferencesStore.botChallengeColor);
	// Casual unless the visitor is signed in AND asks for rated: `RatedChoice` owns that gate.
	let arenaRated = $state(preferencesStore.botChallengeRated);
	const arenaGroups = $derived(botTimeControlChoices());

	// The chosen table of a table bot, as an index into its tables. A bot posts a new seek after
	// every game, so the index is clamped each time it is read.
	let tableChoice = $state(0);
	const chosenTable = $derived(
		selected.kind === 'table' ? (selected.tables[tableChoice] ?? selected.tables[0]) : undefined,
	);
	const tableGroups = $derived(
		selected.kind === 'table'
			? [
					{
						options: selected.tables.map((table, index) => ({
							value: index,
							label: table.rated
								? m.play_table_option_rated({ time: timeControlLabel(table.timeControl) })
								: timeControlLabel(table.timeControl),
						})),
					},
				]
			: [],
	);
	const signedIn = $derived(authStore.status === 'signed-in');
	const tableRatingNote = $derived(
		!chosenTable?.rated
			? m.play_rating_table_casual()
			: signedIn
				? m.play_rating_table_rated()
				: m.play_rating_table_rated_guest(),
	);

	// --- Starting -----------------------------------------------------------------------------

	type Phase = 'idle' | 'waking' | 'starting';
	let phase = $state<Phase>('idle');
	let error = $state<string | null>(null);
	const busy = $derived(phase !== 'idle');
	const busyLabel = $derived(
		phase === 'waking' ? m.bots_challenge_waking() : m.bots_challenge_starting(),
	);

	function startStarter(algorithm: string) {
		startPracticeGame({ algorithm, color: practiceColor, timeIndex: practiceTime });
		void goto(resolve('/practice'));
	}

	async function startArena(bot: ArenaBot) {
		phase = 'waking';
		try {
			let woken: WakeResponse;
			try {
				woken = await wakeBot(bot.team, bot.name);
			} catch {
				woken = { alive: false };
			}
			if (destroyed) return;
			if (woken.busy) {
				error = m.bots_challenge_busy();
				return;
			}
			if (!woken.alive) {
				error = m.bots_challenge_dead();
				return;
			}

			phase = 'starting';
			// Remember the setup for the next bot (#212). `rated` only for a signed-in account: the
			// gate may have just forced it to false for a guest, and that is not a choice to store.
			if (authStore.status === 'signed-in') preferencesStore.setBotChallengeRated(arenaRated);
			preferencesStore.setBotChallengeTimeControl(botTimeControlPresets[arenaTime].id);
			preferencesStore.setBotChallengeColor(arenaColor);
			const timeControl = botTimeControlPresets[arenaTime].value;
			const preferredColor = arenaColor;
			const rated = arenaRated;
			const { match, url } = await startBotGame(
				{
					guestId: getGuestUuid(),
					team: bot.team,
					name: bot.name,
					timeControl,
					...(preferredColor === 'random' ? {} : { preferredColor }),
					// Sent even when false: casual is a statable choice, unlike a random seat.
					rated,
				},
				location.origin,
			);
			if (destroyed) return;
			// The board offers a rematch on the same terms (#215), and only this place knows them.
			rememberBotGame({
				gameId: match.gameId,
				team: bot.team,
				name: bot.name,
				timeControl,
				preferredColor,
				rated,
			});
			// Full navigation: the board page connects fresh from the seat token in the address.
			window.location.href = url;
		} catch (e) {
			if (!destroyed) error = describeStartFailure(e);
		} finally {
			if (!destroyed) phase = 'idle';
		}
	}

	async function startAtTable(bot: TableBot) {
		const table = bot.tables[tableChoice] ?? bot.tables[0];
		if (!table) return;
		phase = 'starting';
		try {
			const match = await acceptSeek(table.seekId, getGuestUuid());
			if (destroyed) return;
			// Never assume a colour: the server draws the seats when the table is taken.
			window.location.href = buildJoinUrl(location.origin, match.gameId, match.token, match.seat);
		} catch (e) {
			if (destroyed) return;
			// A rated table refuses a guest (play-api #279). It is still standing, so "just taken"
			// would be wrong: the only way in is to sign in.
			if (e instanceof SeekAcceptError && e.status === 403) {
				error = m.play_table_refused();
				return;
			}
			error = m.play_table_taken();
			try {
				const next = await listSeeks();
				if (!destroyed) seeks = next;
			} catch {
				/* the next poll will catch up */
			}
		} finally {
			if (!destroyed) phase = 'idle';
		}
	}

	function start() {
		// The button is disabled while busy, but a second click can land before that is drawn.
		if (busy) return;
		error = null;
		notice = null;
		const bot = selected;
		if (bot.kind === 'starter') startStarter(bot.id);
		else if (bot.kind === 'arena') void startArena(bot);
		else void startAtTable(bot);
	}

	// --- Words --------------------------------------------------------------------------------

	const ratingText = (bot: ArenaBot) => formatWholeNumber(bot.rating);
	const arenaLine = (bot: ArenaBot) =>
		bot.state === 'ready'
			? m.play_bot_waiting_plain()
			: bot.state === 'busy'
				? m.play_bot_busy()
				: m.play_bot_asleep();
	const tableLine = (bot: TableBot) =>
		m.play_bot_waiting({
			terms: bot.tables.map((table) => timeControlLabel(table.timeControl)).join(', '),
		});

	const selectedSub = $derived(
		selected.kind === 'starter'
			? m.play_setup_starter_sub({ level: selected.level })
			: selected.kind === 'table'
				? m.play_setup_table_sub()
				: selected.provisional
					? m.play_setup_arena_sub_provisional({ rating: ratingText(selected) })
					: m.play_setup_arena_sub({ rating: ratingText(selected) }),
	);
	const colorWord = (color: 'random' | 'white' | 'black') =>
		color === 'random'
			? m.play_summary_color_random()
			: color === 'white'
				? m.common_seat_white()
				: m.common_seat_black();
	// What the phone bar says after the name while the choices are folded away:
	// "Greedy · 5 + 3 · Random color".
	const summary = $derived.by(() => {
		const parts: string[] = [];
		if (selected.kind === 'starter') {
			const preset = PRACTICE_TIME_PRESETS[practiceTime] ?? PRACTICE_TIME_PRESETS[0];
			parts.push(practiceTimeLabel(preset), colorWord(practiceColor));
		} else if (selected.kind === 'arena') {
			const preset = botTimeControlPresets[arenaTime] ?? botTimeControlPresets[0];
			parts.push(
				preset.label,
				colorWord(arenaColor === 'random' ? 'random' : arenaColor === 'White' ? 'white' : 'black'),
			);
		} else if (chosenTable) {
			parts.push(timeControlLabel(chosenTable.timeControl));
		}
		return parts.map((part) => ` · ${part}`).join('');
	});
	const startNote = $derived(
		selected.kind === 'starter'
			? m.play_note_starter()
			: selected.kind === 'table'
				? m.play_note_table()
				: selected.state === 'busy'
					? m.play_note_arena_busy()
					: m.play_note_arena(),
	);

	// On a phone the setup is a bar that stays in view, with the choices folded away.
	let expanded = $state(false);
	const choicesClass = $derived(expanded ? '' : 'max-lg:hidden');
	// The radio is drawn here, not left to the browser: a native one ignores the theme and shows
	// a white disc on the dark surface, which reads as "chosen".
	const radioClass =
		'size-4 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border-strong bg-transparent transition-colors checked:border-primary checked:bg-primary checked:shadow-[inset_0_0_0_3px_var(--color-surface)] focus-visible:outline-none';
	const rowClass = (chosen: boolean) =>
		`flex min-h-14 cursor-pointer items-center gap-3 rounded-control border px-4 py-2 transition-colors has-focus-visible:focus-ring ${
			chosen
				? 'border-primary bg-primary/10'
				: 'border-border-strong bg-transparent hover:bg-surface-hover'
		}`;
</script>

<div
	class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start lg:gap-6"
>
	<Card as="section" padding="lg" aria-labelledby="play-bots-title" class="flex flex-col gap-4">
		<h2 id="play-bots-title" class="sr-only">{m.play_bots_title()}</h2>

		<div
			role="group"
			aria-label={m.play_filter_label()}
			class="-mx-1 flex gap-2 overflow-x-auto px-1 py-1"
		>
			{#each BOT_FILTERS as option (option)}
				<Chip pressed={filter === option} class="shrink-0" onclick={() => (filter = option)}>
					{FILTER_LABELS[option]()}
				</Chip>
			{/each}
		</div>

		{#if starterGroupShown}
			<fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
				<legend
					class="mb-2 flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-0"
				>
					<span class="text-xs font-bold tracking-widest text-content-muted uppercase">
						{m.play_group_starter()}
					</span>
					<span class="text-xs font-normal text-content-muted">
						{m.play_group_starter_hint()}
					</span>
				</legend>
				{#each shownStarters as bot (bot.key)}
					<label class={rowClass(selected.key === bot.key)}>
						<input
							type="radio"
							name="play-bot"
							value={bot.key}
							checked={selected.key === bot.key}
							onchange={() => choose(bot.key)}
							class={radioClass}
						/>
						<span class="min-w-0 flex-1 truncate font-semibold text-content">{bot.label}</span>
						<span class="shrink-0 text-sm text-content-muted">
							{m.game_practice_level({ level: bot.level })}
						</span>
					</label>
				{/each}
			</fieldset>
		{/if}

		{#if arenaGroupShown}
			<fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
				<legend
					class="mb-2 flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-0"
				>
					<span class="text-xs font-bold tracking-widest text-content-muted uppercase">
						{m.play_group_arena()}
					</span>
					<span class="text-xs font-normal text-content-muted">{m.play_group_arena_hint()}</span>
				</legend>
				{#each shownOnline as bot (bot.key)}
					<label class={rowClass(selected.key === bot.key)}>
						<input
							type="radio"
							name="play-bot"
							value={bot.key}
							checked={selected.key === bot.key}
							onchange={() => choose(bot.key)}
							class={radioClass}
						/>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="truncate font-semibold text-content">{bot.label}</span>
							<span class="truncate text-xs text-content-muted">
								{bot.kind === 'table' ? tableLine(bot) : arenaLine(bot)}
							</span>
						</span>
						{#if bot.kind === 'table' || bot.state === 'ready'}
							<Tag tone="highlight">{m.play_bot_ready()}</Tag>
						{/if}
						{#if bot.kind === 'arena'}
							<span class="shrink-0 text-sm font-semibold text-content tabular-nums">
								<span class="sr-only">
									{bot.provisional
										? m.play_bot_rating_provisional({ rating: ratingText(bot) })
										: m.play_bot_rating({ rating: ratingText(bot) })}
								</span>
								<span aria-hidden="true">{ratingText(bot)}{bot.provisional ? '?' : ''}</span>
							</span>
						{/if}
					</label>
				{/each}

				{#if catalogState === 'off'}
					<p class="m-0 text-sm text-content-muted">{m.play_arena_off()}</p>
				{:else if catalogState === 'failed'}
					<p class="m-0 text-sm text-danger" role="alert">{m.play_arena_failed()}</p>
				{:else if catalogState === 'loading'}
					<p class="m-0 flex items-center gap-2 text-sm text-content-muted" role="status">
						<Spinner />
						{m.play_arena_loading()}
					</p>
				{:else if shownOnline.length === 0}
					<p class="m-0 text-sm text-content-muted">
						{filter === 'ready' ? m.play_filter_empty_ready() : m.play_filter_empty()}
					</p>
				{/if}
			</fieldset>
		{/if}
	</Card>

	<!-- The setup. A column of its own on a wide screen; on a phone a bar that stays above the
	     bottom navigation, so the button is in reach wherever the list is scrolled to. The offset
	     is the height of that navigation in the current shell (57 px); the new navigation (#264)
	     brings its own. -->
	<Card
		as="section"
		raised
		padding="lg"
		aria-labelledby="play-setup-title"
		class="sticky max-sm:rounded-b-none bottom-[calc(3.5625rem+env(safe-area-inset-bottom))] z-30 flex max-h-[calc(100dvh-9rem)] flex-col gap-4 overflow-y-auto sm:bottom-4 lg:top-20 lg:bottom-auto lg:max-h-none lg:overflow-visible"
	>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0 {expanded ? '' : 'max-lg:hidden'}">
				<p class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase">
					{m.play_setup_eyebrow()}
				</p>
				<h2
					id="play-setup-title"
					class="m-0 truncate text-2xl font-bold tracking-tight text-content"
				>
					{selected.label}
				</h2>
				<p class="m-0 flex flex-wrap items-baseline gap-x-3 text-sm text-content-muted">
					<span>{selectedSub}</span>
					{#if selected.kind === 'arena'}
						<a
							href={resolve('/bots/[team]/[name]', { team: selected.team, name: selected.name })}
							class="rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:focus-ring"
						>
							{m.play_setup_profile()}
						</a>
					{/if}
				</p>
				{#if selected.kind === 'arena' && selected.description}
					<p class="mt-2 mb-0 text-sm text-content-muted">{selected.description}</p>
				{/if}
			</div>
			<!-- The phone bar: what will be played, and the way to the choices. -->
			{#if !expanded}
				<p class="m-0 min-w-0 flex-1 self-center truncate text-sm text-content-muted lg:hidden">
					<b class="font-semibold text-content">{selected.label}</b>
					{summary}
				</p>
			{/if}
			<button
				type="button"
				aria-expanded={expanded}
				aria-controls="play-setup-choices"
				onclick={() => (expanded = !expanded)}
				class="-my-1 min-h-11 shrink-0 cursor-pointer rounded-control px-2 text-sm font-semibold text-primary focus-visible:focus-ring lg:hidden"
			>
				{expanded ? m.play_setup_done() : m.play_setup_change()}
			</button>
		</div>

		{#if notice}<p class="m-0 text-sm text-content" role="status">{notice}</p>{/if}

		<div id="play-setup-choices" class="flex flex-col gap-3">
			{#if selected.kind === 'starter'}
				<GameSetupPanel
					name="play-starter"
					timeGroups={practiceGroups}
					bind:time={practiceTime}
					colorValues={PRACTICE_COLOR_VALUES}
					bind:color={practiceColor}
					rating="unrated"
					ratingNote={m.play_rating_starter()}
					actionLabel={m.play_start()}
					onstart={start}
					{error}
					{choicesClass}
				/>
			{:else if selected.kind === 'arena'}
				<GameSetupPanel
					name="play-arena"
					timeGroups={arenaGroups}
					bind:time={arenaTime}
					colorValues={ARENA_COLOR_VALUES}
					bind:color={arenaColor}
					rating="choice"
					bind:rated={arenaRated}
					actionLabel={m.play_start()}
					{busyLabel}
					{busy}
					onstart={start}
					{error}
					{choicesClass}
				/>
			{:else}
				<GameSetupPanel
					name="play-table"
					timeGroups={tableGroups}
					bind:time={tableChoice}
					rating="casual"
					colorNote={m.play_table_color()}
					ratingNote={tableRatingNote}
					actionLabel={m.play_start()}
					{busyLabel}
					{busy}
					onstart={start}
					{error}
					{choicesClass}
				/>
			{/if}
			<p class="m-0 text-center text-xs text-content-muted {choicesClass}">{startNote}</p>
		</div>
	</Card>
</div>

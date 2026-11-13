<script lang="ts">
	// Standalone create/invite/wait surface. Appearance is local presentation, never room state.
	import { onMount, tick } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import type { Seat, TimeControl } from '#lib/live/liveTypes.js';
	import { LaboratoryApi } from '#lib/laboratory/api.js';
	import { LaboratorySession, type JourneyError } from '#lib/laboratory/session.svelte.js';
	import {
		setupAppearance,
		type AppearanceController,
		type AppearancePreference,
	} from '#lib/laboratory/appearance.js';
	import LaboratoryBoard from './LaboratoryBoard.svelte';
	import LaboratoryGame from './LaboratoryGame.svelte';
	import LaboratoryReview from './LaboratoryReview.svelte';

	let { api }: { api: LaboratoryApi } = $props();
	let session = $state<LaboratorySession | null>(null);
	let bootError = $state<JourneyError | null>(null);
	let appearance = $state<AppearancePreference>('system');
	let appearanceController: AppearanceController | undefined;
	let selectedTime = $state(3);
	let selectedColor = $state<Seat | 'random'>('random');
	let rulesOpen = $state(false);
	let copied = $state(false);
	let copyPending = $state(false);
	let shareAvailable = $state(false);
	let announcement = $state('');
	let invitationInput = $state<HTMLInputElement>();
	let heading = $state<HTMLHeadingElement>();

	const presets = [
		{ minutes: 3, increment: 2 },
		{ minutes: 5, increment: 3 },
		{ minutes: 10, increment: 5 },
		{ minutes: 10, increment: 10 },
		{ minutes: 15, increment: 10 },
		{ minutes: 0, increment: 0 },
	];
	const colors: (Seat | 'random')[] = ['random', 'White', 'Black'];
	const currentSeat: Seat = $derived(
		session?.access?.mine.seat ?? session?.candidate?.seat ?? 'White',
	);
	const otherSeat: Seat = $derived(currentSeat === 'White' ? 'Black' : 'White');
	const displayError = $derived(session?.error ?? bootError);
	const blockingError = $derived(
		displayError !== null && (displayError !== 'connection' || !session?.state),
	);
	const ownStatus = $derived(
		session?.ended
			? m.laboratory_game_finished()
			: session?.connectionStatus === 'open'
				? m.laboratory_connected()
				: session?.connectionStatus === 'closed'
					? m.laboratory_reconnecting()
					: m.laboratory_connecting(),
	);

	function storage(kind: 'sessionStorage' | 'localStorage'): Storage | null {
		try {
			return window[kind];
		} catch {
			return null;
		}
	}
	function colorName(seat: Seat | 'random'): string {
		return seat === 'White'
			? m.laboratory_white()
			: seat === 'Black'
				? m.laboratory_black()
				: m.laboratory_random();
	}
	function presetControl(index: number): TimeControl {
		const preset = presets[index];
		return preset.minutes
			? { Fischer: { initialSeconds: preset.minutes * 60, incrementSeconds: preset.increment } }
			: { Unlimited: {} };
	}
	function timeLabel(control: TimeControl): string {
		if ('Unlimited' in control) return m.laboratory_unlimited();
		if ('Fischer' in control)
			return m.laboratory_fischer_short({
				minutes: String(control.Fischer.initialSeconds / 60),
				seconds: String(control.Fischer.incrementSeconds),
			});
		if ('SuddenDeath' in control)
			return m.laboratory_minutes({ minutes: String(control.SuddenDeath.initialSeconds / 60) });
		return m.laboratory_seconds({ seconds: String(control.PerMove.secondsPerMove) });
	}
	function clock(seat: Seat): string {
		const clocks = session?.state?.clocks;
		if (!clocks) return '∞';
		const seconds = Math.ceil((seat === 'White' ? clocks.white : clocks.black) / 1000);
		return `${Math.floor(seconds / 60)
			.toString()
			.padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
	}
	function boardNote(): string {
		if (session?.ended) return m.laboratory_finished_note();
		return session?.started ? m.laboratory_ready_board_note() : m.laboratory_waiting_board_note();
	}
	function timingNote(): string {
		if (session?.ended) return m.laboratory_finished_note();
		return session?.started ? m.laboratory_running_note() : m.laboratory_clock_note();
	}
	function errorTitle(error: JourneyError | null): string {
		switch (error) {
			case 'expired':
				return m.laboratory_closed_title();
			case 'occupied':
				return m.laboratory_occupied_title();
			case 'incompatible':
				return m.laboratory_incompatible_title();
			case 'connection':
				return m.laboratory_connection_title();
			case 'unavailable':
				return m.laboratory_unavailable_title();
			default:
				return m.laboratory_invalid_title();
		}
	}
	function errorBody(error: JourneyError | null): string {
		switch (error) {
			case 'expired':
				return m.laboratory_closed_body();
			case 'occupied':
				return m.laboratory_occupied_body();
			case 'incompatible':
				return m.laboratory_incompatible_body();
			case 'connection':
				return m.laboratory_connection_body();
			case 'unavailable':
				return m.laboratory_unavailable_body();
			default:
				return m.laboratory_invalid_body();
		}
	}
	async function focusHeading(): Promise<void> {
		await tick();
		const scroller = document.scrollingElement ?? document.documentElement;
		scroller.scrollTop = 0;
		heading?.focus({ preventScroll: true });
	}
	async function create(): Promise<void> {
		copied = false;
		await session?.create(presetControl(selectedTime), selectedColor);
		if (session?.route.kind !== 'home') await focusHeading();
	}
	function openBoard(event?: MouseEvent): void {
		if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0)) return;
		event?.preventDefault();
		session?.showBoard();
		void focusHeading();
	}
	function join(): void {
		session?.join();
		void focusHeading();
	}
	function home(): void {
		session?.home();
		copied = false;
		announcement = '';
		void focusHeading();
	}
	async function copyInvitation(): Promise<void> {
		const url = session?.invitationUrl;
		if (!url || copyPending) return;
		copyPending = true;
		try {
			await navigator.clipboard.writeText(url);
			if (session?.invitationUrl === url) {
				copied = true;
				announcement = m.laboratory_copied();
			}
		} catch {
			invitationInput?.focus();
			invitationInput?.select();
			announcement = m.laboratory_manual_copy();
		} finally {
			copyPending = false;
		}
	}
	async function shareInvitation(): Promise<void> {
		const url = session?.invitationUrl;
		if (!url) return;
		try {
			await navigator.share({ title: m.laboratory_share_title(), url });
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) await copyInvitation();
		}
	}
	onMount(() => {
		appearanceController = setupAppearance(undefined, (value) => (appearance = value));
		appearance = appearanceController.preference;
		shareAvailable = typeof navigator.share === 'function';
		try {
			session = new LaboratorySession(api, {
				origin: window.location.origin,
				url: () => new URL(window.location.href),
				navigate: (url, replace) =>
					replace ? history.replaceState(null, '', url) : history.pushState(null, '', url),
				storage: storage('sessionStorage'),
				identityStorage: storage('localStorage'),
			});
			void session.open();
		} catch {
			bootError = 'unavailable';
		}
		const onPopState = () => {
			void session?.open();
			copied = false;
		};
		window.addEventListener('popstate', onPopState);
		return () => {
			window.removeEventListener('popstate', onPopState);
			session?.destroy();
			appearanceController?.destroy();
		};
	});
</script>

<svelte:head>
	<title>{m.laboratory_page_title()}</title>
	<meta name="description" content={m.laboratory_page_description()} />
</svelte:head>

<div class="lab-surface" class:lab-at-board={session?.route.kind === 'board'}>
	<header class="lab-header">
		<button class="lab-brand" type="button" onclick={home} disabled={session?.pending}>
			<img src="/favicon.svg" alt="" width="34" height="34" />
			<span>{m.laboratory_brand()}<span class="lab-brand-sub">{m.laboratory_wordmark()}</span></span
			>
		</button>
		<span class="lab-experiment">{m.laboratory_experiment()}</span>
		<div class="lab-header-controls">
			<button
				class="lab-text-button"
				type="button"
				aria-expanded={rulesOpen}
				aria-controls="lab-rules"
				onclick={() => (rulesOpen = !rulesOpen)}
				>{m.laboratory_how_to_play()} <span aria-hidden="true">↗</span></button
			>
			<label class="lab-appearance"
				><span class="lab-sr">{m.laboratory_appearance()}</span>
				<select
					aria-label={m.laboratory_appearance()}
					value={appearance}
					onchange={(event) =>
						appearanceController?.setPreference(event.currentTarget.value as AppearancePreference)}
				>
					<option value="light">{m.laboratory_light()}</option><option value="dark"
						>{m.laboratory_dark()}</option
					><option value="system">{m.laboratory_system()}</option>
				</select>
			</label>
		</div>
	</header>
	{#if rulesOpen}<section class="lab-rules" id="lab-rules" aria-labelledby="lab-rules-title">
			<div>
				<h2 id="lab-rules-title">{m.laboratory_rules_title()}</h2>
				<p>{m.laboratory_rules()}</p>
			</div>
			<button type="button" class="lab-text-button" onclick={() => (rulesOpen = false)}
				>{m.laboratory_close_rules()}</button
			>
		</section>{/if}

	<main id="lab-content">
		{#if session?.route.kind === 'home' && !bootError}
			<div class="lab-create-layout">
				<section class="lab-intro">
					<p class="lab-eyebrow">{m.laboratory_eyebrow()}</p>
					<h1 class="lab-display" bind:this={heading} tabindex="-1">
						{m.laboratory_hero_first()}<br /><em>{m.laboratory_hero_second()}</em>
					</h1>
					<p class="lab-lead">{m.laboratory_lead()}</p>
					<div class="lab-art" aria-hidden="true">
						<div class="lab-art-pair">
							<span class="lab-die"><img src="/pieces/cburnett/wP.svg" alt="" /></span><span
								class="lab-die"><img src="/pieces/cburnett/wB.svg" alt="" /></span
							>
						</div>
						<span class="lab-art-arrow">→</span>
						<div class="lab-art-pair">
							<span class="lab-die"><img src="/pieces/cburnett/wP.svg" alt="" /></span><span
								class="lab-die"><img src="/pieces/cburnett/wR.svg" alt="" /></span
							>
						</div>
					</div>
				</section>
				<form
					class="lab-form"
					onsubmit={(event) => {
						event.preventDefault();
						void create();
					}}
				>
					<div>
						<div class="lab-form-top">
							<h2>{m.laboratory_new_game()}</h2>
							<span class="lab-mode-tag">{m.laboratory_mode()}</span>
						</div>
						<p class="lab-mode-desc">{m.laboratory_mode_description()}</p>
					</div>
					<fieldset disabled={session.pending}>
						<legend>{m.laboratory_time_control()}</legend>
						<div class="lab-time-grid">
							{#each presets as _preset, index (index)}<button
									class="lab-option"
									type="button"
									aria-pressed={selectedTime === index}
									onclick={() => (selectedTime = index)}
									>{timeLabel(presetControl(index))}{#if selectedTime === index}<span
											class="lab-option-check"
											aria-hidden="true">✓</span
										>{/if}</button
								>{/each}
						</div>
						<p class="lab-hint">
							{presets[selectedTime].minutes
								? m.laboratory_time_description({
										minutes: String(presets[selectedTime].minutes),
										seconds: String(presets[selectedTime].increment),
									})
								: m.laboratory_unlimited_description()}
						</p>
					</fieldset>
					<fieldset disabled={session.pending}>
						<legend>{m.laboratory_your_color()}</legend>
						<div class="lab-color-grid">
							{#each colors as color (color)}<button
									type="button"
									class="lab-option lab-color-option"
									aria-pressed={selectedColor === color}
									onclick={() => (selectedColor = color)}
									>{#if color === 'random'}<span aria-hidden="true">⇄</span>{:else}<img
											src={`/pieces/cburnett/${color === 'White' ? 'w' : 'b'}K.svg`}
											alt=""
										/>{/if}{colorName(color)}{#if selectedColor === color}<span
											class="lab-option-check"
											aria-hidden="true">✓</span
										>{/if}</button
								>{/each}
						</div>
					</fieldset>
					{#if displayError}<div class="lab-alert" role="alert">
							<strong>{errorTitle(displayError)}</strong>
							<p>{errorBody(displayError)}</p>
						</div>{/if}
					<div>
						<button class="lab-primary" type="submit" disabled={session.pending}
							>{session.pending ? m.laboratory_creating() : m.laboratory_create()}<span
								aria-hidden="true">→</span
							></button
						>
						<p class="lab-under-button">{m.laboratory_private()}</p>
					</div>
				</form>
			</div>
		{:else if blockingError}
			<section class="lab-error-layout">
				<div class="lab-error-mark" aria-hidden="true">↗</div>
				<p class="lab-eyebrow">{m.laboratory_invitation()}</p>
				<h1 class="lab-page-title" bind:this={heading} tabindex="-1">{errorTitle(displayError)}</h1>
				<p class="lab-lead">{errorBody(displayError)}</p>
				<div class="lab-error-actions">
					{#if displayError === 'occupied' && session?.boardUrl}<a
							class="lab-primary"
							href={session.boardUrl}
							onclick={openBoard}>{m.laboratory_return_board()} <span aria-hidden="true">→</span></a
						>{:else if displayError === 'connection'}<button
							class="lab-primary"
							type="button"
							onclick={() => session?.retry()}>{m.laboratory_retry()}</button
						>{/if}<button class="lab-secondary" type="button" onclick={home}
						>{m.laboratory_start_another()}</button
					>
				</div>
			</section>
		{:else if !session || session.loading || !session.state}
			<div class="lab-loading" role="status">{m.laboratory_loading()}</div>
		{:else}
			{#if displayError === 'connection'}<div class="lab-alert lab-connection-alert" role="status">
					<strong>{m.laboratory_reconnecting()}</strong>
					<p>{m.laboratory_connection_body()}</p>
					<button type="button" class="lab-text-button" onclick={() => session?.retry()}
						>{m.laboratory_retry()}</button
					>
				</div>{/if}
			{#if session.route.kind === 'invite'}
				<div class="lab-invite-layout">
					<section class="lab-invite-main">
						{#if session.invitationUrl}<div class="lab-check" aria-hidden="true">✓</div>
							<p class="lab-eyebrow">{m.laboratory_created()}</p>
							<h1 class="lab-page-title" bind:this={heading} tabindex="-1">
								{m.laboratory_invite_title()}
							</h1>
							<p class="lab-lead">{m.laboratory_invite_lead()}</p>
							<div class="lab-link-box">
								<label for="lab-invitation">{m.laboratory_friend_link()}</label><input
									id="lab-invitation"
									bind:this={invitationInput}
									value={session.invitationUrl}
									readonly
									onclick={(event) => event.currentTarget.select()}
									spellcheck="false"
								/><button
									type="button"
									class="lab-primary"
									onclick={copyInvitation}
									disabled={copyPending}
									>{copyPending
										? m.laboratory_copying()
										: copied
											? m.laboratory_copied()
											: m.laboratory_copy()}<span aria-hidden="true">{copied ? '✓' : '↗'}</span
									></button
								>
								<p class="lab-hint">
									{m.laboratory_seat_assignment({
										mine: colorName(currentSeat),
										theirs: colorName(otherSeat),
									})}
								</p>
								{#if shareAvailable}<button
										class="lab-text-button"
										type="button"
										onclick={shareInvitation}>{m.laboratory_share()}</button
									>{/if}
							</div>
							<a class="lab-open-board" href={session.boardUrl!} onclick={openBoard}
								>{m.laboratory_open_board()} <span aria-hidden="true">→</span></a
							>
						{:else}<p class="lab-eyebrow">{m.laboratory_invitation()}</p>
							<h1 class="lab-page-title" bind:this={heading} tabindex="-1">
								{m.laboratory_join_title()}
							</h1>
							<p class="lab-lead">{m.laboratory_join_lead()}</p>
							<div class="lab-agreed">
								<span>{m.laboratory_agreed_settings()}</span><strong
									>{m.laboratory_revision()}</strong
								><span>{timeLabel(session.state.timeControl)} · {colorName(currentSeat)}</span>
							</div>
							<button class="lab-primary" type="button" onclick={join}
								>{m.laboratory_join_as({ color: colorName(currentSeat) })}<span aria-hidden="true"
									>→</span
								></button
							>{/if}
						{#if !session.persisted && session.boardUrl}<div class="lab-storage-note">
								<p>{m.laboratory_keep_link()}</p>
								<a href={session.boardUrl}>{m.laboratory_private_board_link()}</a>
							</div>{/if}
					</section>
					<aside class="lab-waiting-panel">
						<h2>{m.laboratory_at_table()}</h2>
						{#each [currentSeat, otherSeat] as seat, index (seat)}<div class="lab-seat-row">
								<span class="lab-seat-avatar"
									><img
										src={`/pieces/cburnett/${seat === 'White' ? 'w' : 'b'}P.svg`}
										alt=""
									/></span
								>
								<div>
									<p class="lab-seat-name">
										{index === 0 ? m.laboratory_you() : m.laboratory_friend()} · {colorName(seat)}
									</p>
									<p class="lab-seat-status">
										{index === 0
											? session.access
												? ownStatus
												: m.laboratory_not_joined()
											: session.started
												? m.laboratory_ready()
												: m.laboratory_waiting_readiness()}
									</p>
								</div>
								<span class="lab-ready-check" aria-hidden="true"
									>{(index === 0 && session.connectionStatus === 'open' && session.access) ||
									(index === 1 && session.started)
										? '✓'
										: '···'}</span
								>
							</div>{/each}
						<div class="lab-settings-line">
							<span>{m.laboratory_mode()}</span><strong
								>{timeLabel(session.state.timeControl)}</strong
							>
						</div>
						<p class="lab-clock-note">{timingNote()}</p>
						{#if session.started && session.access}<a
								class="lab-primary"
								href={session.boardUrl!}
								onclick={openBoard}>{m.laboratory_open_board()} <span aria-hidden="true">→</span></a
							>{/if}
					</aside>
				</div>
			{:else if session.started || session.ended}
				<LaboratoryGame game={session.game} />
				<LaboratoryReview {api} {session} />
			{:else}
				<div class="lab-board-layout">
					<section class="lab-board-column">
						<div class="lab-player">
							<div>
								<p class="lab-seat-name">{m.laboratory_friend()} · {colorName(otherSeat)}</p>
								<p class="lab-seat-status">
									{session.started ? m.laboratory_ready() : m.laboratory_waiting_readiness()}
								</p>
							</div>
							<span
								class="lab-clock"
								aria-label={m.laboratory_clock_label({ color: colorName(otherSeat) })}
								>{clock(otherSeat)}</span
							>
						</div>
						<LaboratoryBoard dfen={session.state.dfen} seat={currentSeat} />
						<div class="lab-player">
							<div>
								<p class="lab-seat-name">{m.laboratory_you()} · {colorName(currentSeat)}</p>
								<p class="lab-seat-status">{ownStatus}</p>
							</div>
							<span
								class="lab-clock"
								aria-label={m.laboratory_clock_label({ color: colorName(currentSeat) })}
								>{clock(currentSeat)}</span
							>
						</div>
					</section>
					<section class="lab-board-status">
						<p class="lab-eyebrow">{m.laboratory_table()}</p>
						<h1 class="lab-board-title" bind:this={heading} tabindex="-1">
							{session.ended
								? m.laboratory_game_finished()
								: session.started
									? m.laboratory_both_ready()
									: m.laboratory_waiting_board()}
						</h1>
						<p class="lab-lead">{boardNote()}</p>
						<div class="lab-settings-line">
							<span>{m.laboratory_mode()}</span><strong
								>{timeLabel(session.state.timeControl)}</strong
							>
						</div>
						<p class="lab-clock-note">{timingNote()}</p>
						{#if session.invitationUrl}<div class="lab-link-box">
								<label for="lab-invitation">{m.laboratory_friend_link()}</label><input
									id="lab-invitation"
									bind:this={invitationInput}
									value={session.invitationUrl}
									readonly
									onclick={(event) => event.currentTarget.select()}
								/><button
									type="button"
									class="lab-primary"
									onclick={copyInvitation}
									disabled={copyPending}
									>{copied ? m.laboratory_copied() : m.laboratory_copy()}<span aria-hidden="true"
										>{copied ? '✓' : '↗'}</span
									></button
								>
							</div>{/if}
					</section>
				</div>
			{/if}
		{/if}
	</main>
	<footer class="lab-footer">
		<span>{m.laboratory_footer()}</span><span>{m.laboratory_unrated()}</span>
	</footer>
	<div class="lab-sr" role="status" aria-live="polite">{announcement}</div>
</div>

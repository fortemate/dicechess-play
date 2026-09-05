<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { ShowcaseState } from './types';

	interface Props {
		state: ShowcaseState;
	}

	let { state }: Props = $props();

	const badgeConfig = $derived.by(() => {
		switch (state.kind) {
			case 'open':
				return {
					text: m.home_status_open(),
					dotClass: 'bg-emerald-500',
					badgeBorder:
						'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
					pulse: false,
				};
			case 'claiming':
				return {
					text: m.home_status_claiming(),
					dotClass: 'bg-blue-500',
					badgeBorder: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
					pulse: true,
				};
			case 'live-player':
				return {
					text: m.home_status_live(),
					dotClass: 'bg-rose-500',
					badgeBorder: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
					pulse: true,
				};
			case 'live-spectator':
				return {
					text: m.home_status_in_play(),
					dotClass: 'bg-amber-500',
					badgeBorder: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
					pulse: false,
				};
			case 'reconnecting':
				return {
					text: m.home_status_offline(),
					dotClass: 'bg-amber-500',
					badgeBorder: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
					pulse: false,
				};
			case 'finishing':
				return {
					text: m.home_status_finished(),
					dotClass: 'bg-slate-500',
					badgeBorder: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400',
					pulse: false,
				};
			case 'reset':
				return {
					text: m.home_status_resetting(),
					dotClass: 'bg-blue-500',
					badgeBorder: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
					pulse: true,
				};
			case 'unavailable':
				return {
					text: m.home_status_unavailable(),
					dotClass: 'bg-slate-500',
					badgeBorder: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400',
					pulse: false,
				};
		}
	});

	const messageText = $derived.by(() => {
		switch (state.kind) {
			case 'open':
				return m.home_open_body();
			case 'claiming':
				return m.home_player_reserving();
			case 'live-player':
				return state.activeColor === state.playerColor
					? m.home_cue_your_move()
					: m.home_cue_opponent_thinking();
			case 'live-spectator':
				return m.home_spectator_body();
			case 'reconnecting':
				return m.home_reconnecting_body({
					attempt: state.attempt,
					maxAttempts: state.maxAttempts,
				});
			case 'finishing':
				if (state.winner === 'draw') {
					return m.home_outcome_draw({ reason: state.reason ?? 'agreement' });
				}
				return m.home_outcome_winner({
					winner: state.winnerName ?? (state.winner === 'w' ? 'White' : 'Black'),
					reason: state.reason ?? 'checkmate',
				});
			case 'reset':
				return m.home_resetting_countdown({ seconds: state.countdownSeconds });
			case 'unavailable':
				switch (state.reason) {
					case 'disabled':
						return m.home_unavailable_disabled();
					case 'maintenance':
						return m.home_unavailable_maintenance();
					case 'bot_unavailable':
						return m.home_unavailable_bot_unavailable();
					default:
						return m.home_unavailable_generic();
				}
		}
	});

	// Phones. The badge sits in the dice row (the rail card's flex-wrap flow, see ShowcaseShell) for
	// every state but live play, where the resign control takes that slot and the running clocks
	// already say the game is live. The message gets a row of its own only where it adds something:
	// the claim button speaks for the open table, and in live play the seat strip already carries the
	// turn cue — there the message is kept for screen readers only.
	const badgeOnPhone = $derived(state.kind !== 'live-player');
	const messageClass = $derived.by(() => {
		switch (state.kind) {
			case 'live-player':
				return 'sr-only md:not-sr-only';
			case 'open':
			case 'claiming':
				return 'hidden md:block';
			default:
				return 'order-3 w-full truncate md:order-none md:w-auto md:whitespace-normal';
		}
	});
</script>

<!-- Phones: `contents`, so the badge and the message become items of the rail card's flow (the
     shell orders them: badge beside the dice, message on a row of its own). md+: a status card. -->
<div
	class="contents md:order-1 md:flex md:min-h-16 md:flex-col md:items-stretch md:justify-center md:gap-1.5 md:rounded-xl md:border md:border-border md:bg-surface md:p-3 md:transition-colors"
>
	<div class="contents md:flex md:items-center md:justify-between md:gap-2">
		<span
			class="{badgeOnPhone
				? 'inline-flex'
				: 'hidden md:inline-flex'} order-2 shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap md:order-none md:text-xs {badgeConfig.badgeBorder}"
		>
			<span
				class="h-2 w-2 rounded-full {badgeConfig.dotClass} {badgeConfig.pulse
					? 'motion-safe:animate-pulse'
					: ''}"
				aria-hidden="true"
			></span>
			{badgeConfig.text}
		</span>
		<span class="hidden text-[11px] font-semibold text-content-muted md:inline-block">
			{m.home_time_control_blitz()}
		</span>
	</div>
	<p
		class="{messageClass} text-[11px] leading-relaxed text-content-muted md:text-xs"
		role="status"
		aria-live="polite"
	>
		{messageText}
	</p>
</div>

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
		}
	});
</script>

<!-- Responsive Status Slot: mobile single row h-7, desktop fixed min-h-[64px] card -->
<div
	class="flex h-7 md:h-auto md:min-h-[64px] flex-row md:flex-col items-center md:items-stretch justify-between md:justify-center gap-1.5 rounded-xl md:border md:border-border md:bg-surface px-1 md:p-3 transition-colors"
	role="status"
	aria-live="polite"
>
	<div class="flex items-center justify-between gap-2">
		<span
			class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] md:text-xs font-bold tracking-wider uppercase {badgeConfig.badgeBorder}"
		>
			<span
				class="h-2 w-2 rounded-full {badgeConfig.dotClass} {badgeConfig.pulse
					? 'motion-safe:animate-pulse'
					: ''}"
				aria-hidden="true"
			></span>
			{badgeConfig.text}
		</span>
		<span class="hidden md:inline-block text-[11px] font-semibold text-content-muted">
			{m.home_time_control_blitz()}
		</span>
	</div>
	<p
		class="truncate md:whitespace-normal text-[11px] md:text-xs text-content-muted leading-relaxed"
	>
		{messageText}
	</p>
</div>

// Shared sound service: one preloaded element per effect, so repeated plays
// don't re-fetch or re-decode. Playback is best-effort — browsers block audio
// until the user's first gesture, so the element is also "unlocked" on the
// first pointer/key interaction (muted play+pause), letting later programmatic
// plays through even when they aren't gesture-triggered (e.g. the opponent's
// roll arriving over the wire).
//
// Levels. The roll asset is mastered soft on purpose (the original clipped at
// 0 dBFS with a hard top end and read as loud): -27 LUFS integrated, -7 dBTP,
// low-pass 7 kHz + high shelf -6 dB above 2.5 kHz, ~50 ms lead-in, 1.15 s long.
// Rebuild from the original (git 327c594) with:
//   ffmpeg -i orig.mp3 -af "silenceremove=start_periods=1:start_threshold=-38dB:start_silence=0.05,
//     lowpass=f=7000:p=2,highshelf=f=2500:g=-6,alimiter=limit=0.5:attack=5:release=50:level=false,
//     afade=t=in:d=0.008,atrim=0:1.15,afade=t=out:st=0.95:d=0.2,volume=-0.7dB"
//     -ac 1 -ar 48000 -c:a libmp3lame -b:a 128k dice-roll-natural.mp3
// DICE_ROLL_VOLUME then trims it further against the WebAudio chime below.

import { logger } from './utils/logger';
import { preferencesStore } from './preferencesStore.svelte';

const DICE_ROLL_SRC = '/sounds/dice-roll-natural.mp3';

/** Playback gain for the roll (~-3 dB on top of the soft master). iOS Safari ignores
 * `HTMLMediaElement.volume` (always 1), so the asset's own level is the floor there. */
export const DICE_ROLL_VOLUME = 0.7;

let diceAudio: HTMLAudioElement | null = null;

function hasAudio(): boolean {
	return typeof window !== 'undefined' && typeof Audio !== 'undefined';
}

function ensureDiceAudio(): HTMLAudioElement {
	if (!diceAudio) {
		diceAudio = new Audio(DICE_ROLL_SRC);
		diceAudio.preload = 'auto';
		diceAudio.volume = DICE_ROLL_VOLUME;
		installUnlock(diceAudio);
	}
	return diceAudio;
}

/** A muted play+pause on the first user gesture whitelists the element for
 * future programmatic playback under browser autoplay policies. */
function installUnlock(audio: HTMLAudioElement): void {
	const unlock = () => {
		window.removeEventListener('pointerdown', unlock);
		window.removeEventListener('keydown', unlock);
		if (!audio.paused) return; // a real play is already in flight — nothing to unlock
		audio.muted = true;
		const attempt = audio.play();
		if (!attempt) {
			audio.muted = false;
			return;
		}
		attempt
			.then(() => {
				// The same gesture may have triggered a real play right after this probe
				// (it unmutes the element) — only wind back the silent probe, never
				// actual playback.
				if (audio.muted) {
					audio.pause();
					audio.currentTime = 0;
				}
			})
			.catch(() => {
				// Still blocked — the next play after a real interaction succeeds anyway.
			})
			.finally(() => {
				audio.muted = false;
			});
	};
	window.addEventListener('pointerdown', unlock);
	window.addEventListener('keydown', unlock);
}

/** Preload the audio (and arm the gesture unlock) ahead of the first roll. */
export function preloadSounds(): void {
	if (!hasAudio()) return;
	ensureDiceAudio();
}

export function playDiceSound(): void {
	if (!hasAudio() || !preferencesStore.soundEnabled) return;
	try {
		const audio = ensureDiceAudio();
		// The gesture carrying this roll may have just fired the muted unlock probe.
		audio.muted = false;
		audio.currentTime = 0;
		const attempt = audio.play();
		if (attempt) {
			attempt.catch(() => {
				// Autoplay blocked before the first user gesture — drop this one silently.
			});
		}
	} catch (e) {
		logger.error('Failed to play dice roll sound', e as Error);
	}
}

/** Soft notification chime when receiving a draw offer. */
export function playDrawOfferSound(): void {
	if (!hasAudio() || !preferencesStore.soundEnabled) return;
	try {
		const AudioCtx =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		if (!AudioCtx) return;
		const ctx = new AudioCtx();
		const now = ctx.currentTime;

		const osc1 = ctx.createOscillator();
		const osc2 = ctx.createOscillator();
		const gain = ctx.createGain();

		osc1.type = 'sine';
		osc1.frequency.setValueAtTime(523.25, now); // C5
		osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5

		osc2.type = 'sine';
		osc2.frequency.setValueAtTime(659.25, now + 0.15); // E5
		osc2.frequency.exponentialRampToValueAtTime(783.99, now + 0.3); // G5

		gain.gain.setValueAtTime(0.08, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

		osc1.connect(gain);
		osc2.connect(gain);
		gain.connect(ctx.destination);

		osc1.start(now);
		osc1.stop(now + 0.15);
		osc2.start(now + 0.15);
		osc2.stop(now + 0.45);

		setTimeout(() => {
			ctx.close().catch(() => {});
		}, 500);
	} catch (e) {
		logger.error('Failed to play draw offer notification sound', e as Error);
	}
}

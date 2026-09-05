// Presentation pacing shared by the live (HvH) and offline bot-game stores, so
// both game surfaces feel the same. Values agreed in the UI/UX polish plan.

/** Dice-spin duration for any roll — the player's own included. */
export const ROLL_ANIMATION_MS = 600;

/** Delay between one die starting its tumble and the next. The CSS tumble itself runs
 * 460ms (`--animate-dice-tumble` in app.css), so the third die lands at exactly
 * 460 + 2 × 70 = ROLL_ANIMATION_MS — keep the three in step when changing any of them. */
export const DICE_STAGGER_MS = 70;

/** Pause on the old position before each revealed opponent micro-move. */
export const MOVE_STEP_MS = 1000;

/** Dwell on a no-legal-moves turn (dice shown, notice up) before play moves on. */
export const PASS_DWELL_MS = 1500;

/** Beat between the final move landing on the board and the result being announced. */
export const GAME_END_SUSPENSE_MS = 800;

/** Window after a first press of Resign in which a second press confirms it; the button disarms
 * itself when the window lapses. Two presses because a resignation is irreversible, and the
 * same window on every game surface (/live, /practice, the showcase table). */
export const RESIGN_CONFIRM_MS = 3000;

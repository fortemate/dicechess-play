# Fixed Single-Table Homepage State System — Specification

**Issue**: [#59](https://github.com/fortemate/dicechess-play/issues/59)  
**Status**: Approved Specification (Ready for Implementation)

---

## 1. Context & Objective

### 1.1 Context

The public root route (`/`) currently presents a marketing hero section followed by the game hub (`GameHub.svelte`), identical to `/play`. The approved product direction replaces the root route with **one shared, full-size showcase table** while `/play` and all other existing pages (`/lobby`, `/games`, `/me`, `/rules`, `/licenses`) remain completely unchanged.

The board must feel **physically persistent**: it cannot jump, resize, or be replaced as the table transitions between open, claiming, live, reconnecting, finishing, and reset-to-open states.

Crucially, the root route deliberately has **no move history surface**: result announcements and error recovery occupy pre-reserved space to ensure a zero Cumulative Layout Shift ($\text{CLS} = 0$).

### 1.2 Objective

Provide the authoritative, implementation-ready visual and interaction specification for the fixed single-table homepage across desktop and narrow-screen breakpoints, using approved Fortemate identity assets and existing game component language.

### 1.3 Constraints

- **Single Public Table**: Preserve exactly one shared public showcase table across all visitors.
- **Server-Owned Facts**: Treat first-claim-wins, color alternation, and `5+3` time control as server-authoritative facts.
- **i18n Coordination**: Coordinate all user-facing copy with `fortemate/dicechess-play#8` (`messages/home.en.json`).
- **Isolation**: Root-only tokens and styling must not bleed into or restyle existing routes.

### 1.4 Non-goals

- Modifying `/play`, `/lobby`, `/games`, or `/me`.
- Adding move history, PGN notation, move scrubbing, or move lists to the root route.
- Adding a queue, spectator reservations, rating changes, or custom time/color selectors to the showcase table.
- Changing logos, piece sets, or board themes outside approved design system tokens.

---

## 2. The 7-State Matrix

| #     | State             | Status Badge                  | Top Player Strip                                             | Bottom Player Strip                                             | Clocks (Top / Bottom)                                                              | Primary Action Slot                                      | Board Orientation & Interaction                                                        | Dice Slot                                                 | Recovery & Status Message                                                                                   |
| :---- | :---------------- | :---------------------------- | :----------------------------------------------------------- | :-------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :------------------------------------------------------- | :------------------------------------------------------------------------------------- | :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **1** | **Open**          | `TABLE OPEN`<br>(Emerald dot) | Name: _Waiting for challenger_<br>Sub: _Open seat_           | Name: _You (Guest)_<br>Sub: _Assigned color · Claimable_        | `05:00` / `05:00`<br>(Static unstarted)                                            | **Claim [Color] Seat**<br>(Primary blue, 5+3 indicator)  | Assigned color POV.<br>Standard initial setup.<br>Interaction: None                    | Pre-reserved empty slots<br>(3 dim outlines, 25% opacity) | _"Public Showcase Table. Claim your seat to play a 5+3 Blitz game against any challenger."_                 |
| **2** | **Claiming**      | `CLAIMING…`<br>(Blue ping)    | Name: _Waiting for challenger_<br>Sub: _Connecting…_         | Name: _You (Guest)_<br>Sub: _Reserving seat…_                   | `05:00` / `05:00`<br>(Static)                                                      | **Claiming Seat…**<br>(Disabled button, spinner)         | Assigned color POV.<br>Standard initial setup.<br>Interaction: Locked                  | Pre-reserved empty slots                                  | _"Connecting to server. Reserving seat… (First claim wins)."_                                               |
| **3** | **Seated Player** | `LIVE GAME`<br>(Rose pulse)   | Name: Opponent name/ID<br>Sub: _Playing as [Color]_          | Name: _You ([Color])_<br>Sub: _Your move_ / _Opponent thinking_ | Active ticking (5+3).<br>Active border highlight.<br>Danger tone if $< 30\text{s}$ | **Resign Game**<br>(Outline button; confirmation gate)   | Player's color POV.<br>Live board position.<br>Interaction: Legal moves on select/drag | Active piece dice.<br>Dimmed/grayscale when used.         | In-rail turn prompt:<br>_"Your turn to move"_ / _"Opponent is thinking…"_                                   |
| **4** | **Spectator**     | `IN PLAY`<br>(Amber dot)      | Name: Black player<br>Sub: _Black Seat_                      | Name: White player<br>Sub: _White Seat_                         | Active ticking for players.<br>Border highlights active turn                       | **Play on /play instead**<br>(Secondary link to `/play`) | White POV (broadcast view).<br>Live board position.<br>Interaction: View-only          | Active piece dice of current active player                | _"Table claimed by another visitor. Watching live. The next game will open automatically without a queue."_ |
| **5** | **Reconnecting**  | `OFFLINE`<br>(Amber dot)      | Dimmed strips with offline/reconnecting indicator            | Dimmed strips with offline/reconnecting indicator               | Paused at last received timestamp                                                  | **Retry Connection**<br>(Amber button) + link to `/play` | Frozen on last known position.<br>Interaction: Disabled                                | Retains last known state (frozen)                         | In-rail alert banner:<br>_"Connection interrupted. Reconnecting (attempt 1/5)…"_                            |
| **6** | **Finished**      | `GAME OVER`<br>(Slate dot)    | Name: Opponent<br>Sub: _Checkmated / Resigned / Out of time_ | Name: You (or player)<br>Sub: _Victor / Defeated / Drawn_       | Clocks frozen at end timestamp                                                     | **Reset Table Now**<br>(Auto-countdown indicator)        | Final board position.<br>Checkmate square highlighted.<br>Interaction: View-only       | Final turn dice (dimmed)                                  | Outcome banner in rail:<br>_"White won by checkmate. Next game opens in 15s."_                              |
| **7** | **Reset-to-Open** | `RESETTING…`<br>(Blue pulse)  | Name: _Resetting table…_<br>Sub: _Alternating seat_          | Name: _Next game_<br>Sub: _Readying pieces_                     | Resetting to `05:00` / `05:00`                                                     | **Opening soon…**<br>(Disabled during reset)             | Board resets to standard starting position                                             | Fading out last dice, fading in empty placeholders        | _"Table reset complete. Alternating assigned color for the next visitor."_                                  |

---

## 3. Geometry Budget & Zero-CLS Layout

To eliminate layout shifts across transitions between open, active, spectating, reconnecting, and finished states, all dimensions are strictly budgeted:

```
+-------------------------------------------------------------------------+
| Restrained Showcase Header (48px): Fortemate Mark | 5+3 Blitz | Links   |
+-------------------------------------------------------------------------+
|                                           |                             |
|  Top Player Strip (56px fixed)            |  Showcase Rail (320px fixed)|
|  +-------------------------------------+  |  +-----------------------+  |
|  | Opponent Identity         |   05:00 |  |  | Status / Alert Slot   |  |
|  +-------------------------------------+  |  | (min-h: 64px)         |  |
|                                           |  +-----------------------+  |
|  Showcase Board (1:1 Aspect Ratio)        |                             |
|  +-------------------------------------+  |  +-----------------------+  |
|  |                                     |  |  | Dice Slot             |  |
|  |        Physical Chessboard          |  |  | (fixed h: 104px)       |  |
|  |        (max 560 x 560px)            |  |  | [ D1 ] [ D2 ] [ D3 ]  |  |
|  |                                     |  |  +-----------------------+  |
|  +-------------------------------------+  |                             |
|                                           |  +-----------------------+  |
|  Bottom Player Strip (56px fixed)         |  | Action Slot           |  |
|  +-------------------------------------+  |  | (fixed h: 56px)       |  |
|  | You (Guest)               |   05:00 |  |  | [ Claim / Resign ]    |  |
|  +-------------------------------------+  |  +-----------------------+  |
|                                           |                             |
|                                           |  +-----------------------+  |
|                                           |  | /play Alternative     |  |
|                                           |  | (h: 52px)             |  |
|                                           |  +-----------------------+  |
+-------------------------------------------------------------------------+
| Footer Bar (32px): Anonymous play info · Rules · Licenses                |
+-------------------------------------------------------------------------+
```

### 3.1 Desktop Breakpoint ($\ge 1024\text{px}$)

- **Outer Shell**: `max-w-5xl` (1024px), centered, padding `px-4 md:px-6`.
- **Grid Setup**: `grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6`.
- **Board Column (Left)**:
  - Top Player Strip: Height locked to `h-14` ($56\text{px}$). Width matches board.
  - Board Container: Square `aspect-square`, `max-w-[min(560px, calc(100dvh - 200px))]`.
  - Bottom Player Strip: Height locked to `h-14` ($56\text{px}$).
  - Total Board Column height: $56\text{px} + 560\text{px} + 56\text{px} + 20\text{px (gaps)} = 692\text{px}$.
- **Showcase Rail (Right)**:
  - Fixed Width: `w-[320px] shrink-0`.
  - Header Card: `h-[48px]`.
  - Status/Alert Slot: Pre-reserved `min-h-[64px]`.
  - Dice Slot: Pre-reserved `h-[104px]`.
  - Primary Action Slot: Pre-reserved `h-[56px]`.
  - Escape Hatch Card: Pre-reserved `h-[52px]`.
  - Total Rail height: $\approx 360\text{px}$, comfortably shorter than the board column.

### 3.2 Tablet Breakpoint ($768\text{px} - 1023\text{px}$)

- **Grid Setup**: `grid grid-cols-[minmax(0,1fr)_280px] gap-4`.
- **Board Column**: `max-w-[min(480px, calc(100dvh - 180px))]`.
- **Rail Column**: Fixed `280px` width.
- Slot heights remain identical to desktop.

### 3.3 Narrow Screen / Mobile Breakpoint ($< 768\text{px}$, e.g. 375px – 430px)

- **Layout**: Single vertical stack engineered to avoid vertical scrolling:
  - Sticky Top Nav: `48px`.
  - Top Player Strip: `h-12` ($48\text{px}$).
  - Board: `w-full max-w-[min(100vw - 24px, calc(100dvh - 320px))] aspect-square mx-auto`.
  - Bottom Player Strip: `h-12` ($48\text{px}$).
  - Unified Bottom Control Card: Pre-allocated `h-[160px]`:
    - Row 1: Dice & Turn Indicator (`h-12` / $48\text{px}$, 3 mini dice $40\times 40\text{px}$).
    - Row 2: Status / Alert text (`h-[36px]`).
    - Row 3: Action Button (`h-11` / $44\text{px}$ touch target).
- **Zero-Shift Mobile Rule**: Every component in the vertical flow has an explicit height or aspect ratio. Transitions never alter scroll position or viewport bounding boxes.

---

## 4. Interaction & Behavior Specifications

### 4.1 Open State & Single Claim Action

- Board displays standard starting position.
- Clocks read `05:00` (static).
- The open seat color (White or Black) is server-assigned via alternating rotation.
- A single high-contrast primary CTA is displayed: `"Claim White Seat"` or `"Claim Black Seat"`.
- No time control selection, no color choice picker, no lobby modal.

### 4.2 Claiming & Race Conditions (First-Claim-Wins)

- Clicking the Claim CTA triggers the `claiming` state immediately.
- The button becomes disabled, showing an animated spinner and `"Claiming seat…"`.
- **Success**: Server grants the seat $\rightarrow$ smooth transition to `seated_player`.
- **Race Lost**: Another visitor's claim was registered first $\rightarrow$ server returns seat taken $\rightarrow$ seamless transition to `spectator` state without page reloads or jarring error modals.

### 4.3 Spectator State & Queue-Free Waiting

- Displays clear, non-blaming explanatory copy:
  - _"Table claimed by another visitor."_
  - _"Watching live as spectator. When this game concludes, the table will open for new claims — no queue or reservation needed."_
- Prominent alternative CTA: `"Start your own game on /play →"` linking to the full game hub.
- Board orientation is White-at-bottom (standard broadcast perspective).
- Interactive board moves are disabled.

### 4.4 Pre-Reserved Dice Space

- Pre-allocated $104\text{px}$ high container in the rail.
- In Open, Claiming, Reconnecting, and Resetting states: displays 3 outlined dice slots with `opacity-25`.
- In Live games: active dice fade in smoothly ($200\text{ms}$ CSS opacity). When a piece is moved, the used die dims to $30\%$ opacity with grayscale.
- Dice container height is completely immutable across all states.

### 4.5 Recovery & Reconnection

- If the WebSocket connection drops, the board **remains in place** displaying the last confirmed position.
- An alert banner renders in the pre-reserved status slot: _"Connection interrupted. Reconnecting… (attempt X of 5)"_.
- Provides a `"Retry Connection"` action and an escape hatch `"Play bots offline on /play"`.

### 4.6 Game End & Table Reset

- On checkmate, resignation, timeout, or draw, the board freezes on the final position.
- The pre-reserved status slot displays the outcome:
  - e.g., _"White won by checkmate"_, _"Black won on time"_, _"Drawn by agreement"_.
- A $15$-second dwell timer begins with an unobtrusive visual progress countdown.
- Action slot offers an immediate `"Reset Table Now"` button.
- On expiry or click, the board transitions to `reset-to-open`: pieces glide or reset to initial ranks, assigned color alternates, and state returns to `open`.

---

## 5. Brand Identity & Restrained Navigation

- **Master Mark**: Uses the approved Fortemate Six-Cell master mark (modular F, $14\times 14$ master canvas, 4:1 cell-to-gap ratio, monochrome ink) from `/Users/jegors/Fortemate/brand/src/identity/fortemate-mark.svg`.
- **Wordmark & Badges**: `"Fortemate"` with `"Showcase Table"` and `"5+3 Blitz"` indicators.
- **Restrained Navigation Links**:
  - `/play` (Prominent: _"Play Bots & Friends"_, unchanged alternative).
  - `/rules` (_"How to Play"_).
- The root route avoids cluttering the showcase table with marketing hero banners, ratings tables, or deep lobby card grids.

---

## 6. Accessibility (a11y) & Usability

1. **Focus Management**:
   - Initial load: focus remains at document body / skip link.
   - On clicking "Claim": focus stays on the loading button (announcing busy state).
   - On transitioning to Seated: focus moves smoothly to the board container or turn announcer.
   - On game end: focus shifts to the outcome card.
2. **Screen Reader Announcements**:
   - Status slot has `role="status"` and `aria-live="polite"`.
   - Dice rolls announced via `aria-label`: _"Rolled: Knight, Bishop, Pawn"_.
   - Clock low-time announced once at 30 seconds.
3. **Reduced Motion**:
   - Honors `@media (prefers-reduced-motion: reduce)`:
     - Board piece transitions are instantaneous ($0\text{ms}$).
     - Dice spin/tumble animations disabled (instant fade).
     - Pulsing status dots become static solid colors.
4. **Color Contrast**:
   - All text complies with WCAG 2.1 AA ($4.5:1$ for regular text, $3:1$ for large text/UI components).
   - Validated across all 7 supported themes (`dark`, `light`, `dracula`, `nord`, `retro`, `matrix`, `midnight`).
5. **Touch Targets**:
   - All interactive elements (Claim button, Resign button, navigation links) have a minimum touch target of $44\times 44\text{px}$ (iOS HIG) and $48\times 48\text{px}$ (Material guidelines).

---

## 7. Token & Style Isolation

All showcase-specific dimensions, animation timings, and layout rules are scoped strictly under `[data-surface="showcase"]`:

```css
[data-surface='showcase'] {
	--showcase-board-max: min(560px, calc(100dvh - 200px));
	--showcase-rail-width: 320px;
	--showcase-strip-height: 56px;
	--showcase-dice-slot-height: 104px;
	--showcase-action-slot-height: 56px;
	--showcase-status-slot-height: 64px;
}
```

Existing routes (`/play`, `/lobby`, `/live/[id]`, `/me`, `/rules`) do not share these tokens and remain completely unaffected.

---

## 8. i18n Strings Catalog (`messages/home.en.json`)

To coordinate with Epic [#8](https://github.com/fortemate/dicechess-play/issues/8) and pass the `no-untranslated-text` regression guard, all strings are cataloged in `messages/home.en.json`:

```json
{
	"$schema": "https://inlang.com/schema/inlang-message-format",
	"home_showcase_title": "Showcase Table",
	"home_time_control_blitz": "5 + 3 Blitz",
	"home_claim_seat_white": "Claim White Seat",
	"home_claim_seat_black": "Claim Black Seat",
	"home_claiming": "Claiming seat…",
	"home_waiting_challenger": "Waiting for challenger",
	"home_open_subtitle": "Public showcase table · 5+3 Blitz",
	"home_open_body": "The table is open. Claim your seat to start a 5+3 game against any challenger.",
	"home_spectator_title": "Table claimed by another visitor",
	"home_spectator_body": "Watching live. The next game will open automatically without a queue.",
	"home_spectator_play_alt": "Want to play right now? Open /play for instant games.",
	"home_reconnecting_title": "Connection interrupted",
	"home_reconnecting_body": "Reconnecting to showcase table…",
	"home_reconnect_retry": "Retry connection",
	"home_play_redirect": "Play with bots on /play",
	"home_outcome_winner": "{winner} wins by {reason}",
	"home_outcome_draw": "Game drawn by {reason}",
	"home_resetting_countdown": "Next game opens in {seconds}s",
	"home_reset_now": "Reset table now"
}
```

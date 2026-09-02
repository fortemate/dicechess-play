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

All text labels, status badges, and messages map 1:1 to keys in `messages/home.en.json` to satisfy the `no-untranslated-text` guard and support future localized catalogs:

| #     | State             | Status Badge                                          | Top Player Strip                                                         | Bottom Player Strip                                                                      | Clocks (Top / Bottom)                                                              | Primary Action Slot                                                           | Board Orientation & Interaction                                                        | Dice Slot                                                          | Recovery & Status Message                                                                                                              |
| :---- | :---------------- | :---------------------------------------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Open**          | `home_status_open`<br>(`TABLE OPEN`, Emerald dot)     | Name: `home_player_waiting_challenger`<br>Sub: `home_player_open_seat`   | Name: `home_player_guest`<br>Sub: `home_player_claimable`                                | `05:00` / `05:00`<br>(Static unstarted)                                            | `home_action_claim_white` or `home_action_claim_black`<br>(Primary blue, 5+3) | Assigned color POV.<br>Standard initial setup.<br>Interaction: None                    | Pre-reserved empty slots<br>(`home_cue_dice_reserved`, 3 outlines) | `home_open_body`<br>(_"The table is open. Claim your seat to start a 5+3 game against any challenger."_)                               |
| **2** | **Claiming**      | `home_status_claiming`<br>(`CLAIMING…`, Blue ping)    | Name: `home_player_waiting_challenger`<br>Sub: `home_player_connecting`  | Name: `home_player_guest`<br>Sub: `home_player_reserving`                                | `05:00` / `05:00`<br>(Static)                                                      | `home_action_claiming`<br>(`aria-disabled="true"`, spinner)                   | Assigned color POV.<br>Standard initial setup.<br>Interaction: Locked                  | Pre-reserved empty slots<br>(`home_cue_dice_reserved`)             | `home_player_reserving`<br>(_"Connecting to server. Reserving seat… (First claim wins)."_)                                             |
| **3** | **Seated Player** | `home_status_live`<br>(`LIVE GAME`, Rose pulse)       | Name: Opponent name/ID<br>Sub: `home_player_playing_black` (or white)    | Name: `You ([Color])`<br>Sub: `home_player_your_turn` or `home_player_opponent_thinking` | Active ticking (5+3).<br>Active border highlight.<br>Danger tone if $< 30\text{s}$ | `home_action_resign`<br>(`Resign Game`, outline button)                       | Player's color POV.<br>Live board position.<br>Interaction: Legal moves on select/drag | Active piece dice.<br>Dimmed/grayscale when used.                  | In-rail turn prompt:<br>`home_cue_your_move` / `home_cue_opponent_thinking`                                                            |
| **4** | **Spectator**     | `home_status_in_play`<br>(`IN PLAY`, Amber dot)       | Name: Black player<br>Sub: `home_player_seat_black`                      | Name: White player<br>Sub: `home_player_seat_white`                                      | Active ticking for players.<br>Border highlights active turn                       | `home_action_play_alt`<br>(`Play on /play instead`, secondary button)         | White POV (broadcast view).<br>Live board position.<br>Interaction: View-only          | Active piece dice of current active player                         | `home_spectator_body`<br>(_"Table claimed by another visitor. Watching live. The next game will open automatically without a queue."_) |
| **5** | **Reconnecting**  | `home_status_offline`<br>(`OFFLINE`, Amber dot)       | Dimmed strips with offline/reconnecting indicator                        | Dimmed strips with offline/reconnecting indicator                                        | Paused at last received timestamp                                                  | `home_action_retry`<br>(`Retry connection`) + link to `/play`                 | Frozen on last known position.<br>Interaction: Disabled                                | Retains last known state (frozen)                                  | In-rail alert banner:<br>`home_reconnecting_body`<br>(_"Reconnecting to showcase table… (attempt X of Y)"_)                            |
| **6** | **Finished**      | `home_status_finished`<br>(`GAME OVER`, Slate dot)    | Name: Opponent<br>Sub: `home_player_checkmated` / `resigned` / `timeout` | Name: You (or player)<br>Sub: `home_player_victor` / `defeated` / `drawn`                | Clocks frozen at end timestamp                                                     | `home_action_reset_now`<br>(Auto-countdown indicator)                         | Final board position.<br>Checkmate square highlighted.<br>Interaction: View-only       | Final turn dice (dimmed)                                           | Outcome banner in rail:<br>`home_outcome_winner` or `home_outcome_draw`                                                                |
| **7** | **Reset-to-Open** | `home_status_resetting`<br>(`RESETTING…`, Blue pulse) | Name: `home_player_resetting`<br>Sub: _Alternating seat_                 | Name: `home_player_next_game`<br>Sub: _Readying pieces_                                  | Resetting to `05:00` / `05:00`                                                     | `home_action_opening_soon`<br>(`aria-disabled="true"`)                        | Board resets to standard starting position                                             | Fading out last dice (`home_cue_dice_clearing`)                    | `home_resetting_countdown`<br>(_"Next game opens in Xs"_)                                                                              |

---

## 3. Geometry Budget & Zero-CLS Layout

To eliminate layout shifts across transitions between open, active, spectating, reconnecting, and finished states, all dimensions are strictly budgeted:

```text
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

To strictly satisfy the zero-scroll guarantee on mobile devices down to compact viewports ($375\times 667\text{px}$, iPhone SE), the vertical budget accounts for every element and gap:

- **Vertical Budget Breakdown**:
  - Sticky App Header: `48px`
  - Top Player Strip: `h-12` ($48\text{px}$)
  - Bottom Player Strip: `h-12` ($48\text{px}$)
  - Unified Compact Control Card: `h-[152px]` containing:
    - Row 1: Dice & Turn Row (`h-11` / $44\text{px}$, 3 mini dice $36\times 36\text{px}$)
    - Row 2: Status / Alert Row (`h-7` / $28\text{px}$)
    - Row 3: Action Button (`h-12` / $48\text{px}$ touch target)
  - Footer Bar: `32px`
  - Flow Gaps (5 gaps between stacked elements): $5 \times 8\text{px} = 40\text{px}$
  - **Total Non-Board Chrome**: $48 + 48 + 48 + 152 + 32 + 40 = 368\text{px}$
- **Board Sizing Formula**:
  ```css
  max-w-[min(100vw - 24px, calc(100dvh - 380px))] aspect-square mx-auto
  ```
  In a $375\times 667\text{px}$ viewport:
  $$\text{Remaining height for board} = 667\text{px} - 380\text{px} = 287\text{px}$$
  The board renders at $287\times 287\text{px}$ (since $287\text{px} < 351\text{px}$ width).
  $$\text{Total Stack Height} = 368\text{px} + 287\text{px} = 655\text{px} \le 667\text{px}$$
- **Zero-Shift Mobile Rule**: Every component in the vertical flow has a fixed height or aspect ratio. Transitions never alter scroll position or element bounding boxes.

---

## 4. Interaction & Behavior Specifications

### 4.1 Open State & Single Claim Action

- Board displays standard starting position.
- Clocks read `05:00` (static).
- The open seat color (White or Black) is server-assigned via alternating rotation.
- A single high-contrast primary CTA is displayed: `"Claim White Seat"` or `"Claim Black Seat"`.
- No time control selection, no color choice picker, no lobby modal.

### 4.2 Claiming & Focus Preservation (First-Claim-Wins)

- Clicking the Claim CTA triggers the `claiming` state immediately.
- **Accessible Busy State**: To prevent browser focus dropping to the document root, the button does **not** use the native HTML `disabled` attribute. Instead, it applies:
  - `aria-disabled="true"`
  - `aria-busy="true"`
  - Pointer events none (`pointer-events-none`)
  - Keydown activation guard (ignores Enter and Space)
- Focus is preserved on the CTA while announcing the busy state to assistive technologies, or optionally shifted to the `role="status"` announcer.
- **Success**: Server grants the seat $\rightarrow$ smooth transition to `seated_player`. Focus moves to the board.
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
- An alert banner renders in the pre-reserved status slot: _"Connection interrupted. Reconnecting to showcase table (attempt X of Y)…"_.
- Provides a `"Retry Connection"` action and an escape hatch `"Play with bots on /play"`.

### 4.6 Game End & Reset Countdown

- On checkmate, resignation, timeout, or draw, the board freezes on the final position.
- The pre-reserved status slot displays the outcome:
  - e.g., _"White won by checkmate"_, _"Black won on time"_, _"Drawn by agreement"_.
- A $15$-second server-synchronized dwell countdown begins.
- Action slot offers an immediate `"Reset Table Now"` button.

### 4.7 Server-Authoritative Reset Protocol

To guarantee that all concurrent visitors converge on the exact same table state without split-brain or stale claim races:

1. **Server-Owned Lifecycle**: The transition from `finished` to `open` is authoritative on the server. Clients do not execute an autonomous local state mutation.
2. **Server Dwell & Auto-Reset**: Upon game termination (`GameEnded`), the server starts a 15-second dwell timer. When the timer elapses, the server generates a new table epoch and broadcasts `TableReset(generationId, assignedColor)`.
3. **Idempotent Client Reset Command**: If a visitor clicks `"Reset Table Now"`, the client sends `ClientCommand.ResetTable(generationId)`. The server verifies that the game is in `Ended` state and the `generationId` matches. If valid, the server short-circuits the dwell timer and broadcasts `TableReset`. If invalid or already reset, it responds with the current room snapshot.
4. **Synchronized Transition**: Upon receiving `TableReset`, all connected clients simultaneously transition from `finished` $\rightarrow$ `reset-to-open` $\rightarrow$ `open`, resetting piece positions, resetting clocks to `05:00`, and enabling the new Claim CTA.
5. **Reconnection Resynchronization**: Reconnecting clients fetch the room snapshot containing `generationId`. If the client holds a stale generation, it immediately resynchronizes to the server's current generation.

---

## 5. Brand Identity & Restrained Navigation

- **Master Mark**: Uses the approved Fortemate Six-Cell master mark (modular F, $14\times 14$ master canvas, 4:1 cell-to-gap ratio, monochrome ink) referenced via design-system identifier `@fortemate/brand/dist/identity/fortemate-mark.svg` (or repository asset path `brand/src/identity/fortemate-mark.svg`).
- **Wordmark & Badges**: `"Fortemate"` with `"Showcase Table"` and `"5+3 Blitz"` indicators.
- **Restrained Navigation Links**:
  - `/play` (Prominent: _"Play Bots & Friends"_, unchanged alternative).
  - `/rules` (_"How to Play"_).
- The root route avoids cluttering the showcase table with marketing hero banners, ratings tables, or deep lobby card grids.

---

## 6. Accessibility (a11y) & Usability

1. **Focus Management**:
   - Initial load: focus remains at document body / skip link.
   - On clicking "Claim": focus is preserved on the CTA with `aria-busy="true"` and `aria-disabled="true"`.
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
   - All interactive controls (Claim button, Resign button, Reset button, navigation links) adhere to the standard $48\times 48\text{px}$ (`h-12`) touch target, satisfying both WCAG 2.5.5 ($44\times 44\text{px}$) and Android Material guidelines ($48\times 48\text{px}$).

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
	"home_status_open": "TABLE OPEN",
	"home_status_claiming": "CLAIMING…",
	"home_status_live": "LIVE GAME",
	"home_status_in_play": "IN PLAY",
	"home_status_offline": "OFFLINE",
	"home_status_finished": "GAME OVER",
	"home_status_resetting": "RESETTING…",
	"home_player_waiting_challenger": "Waiting for challenger",
	"home_player_open_seat": "Open seat",
	"home_player_connecting": "Connecting…",
	"home_player_guest": "You (Guest)",
	"home_player_reserving": "Reserving seat…",
	"home_player_claimable": "Assigned color · Claimable",
	"home_player_your_turn": "Your turn to move",
	"home_player_opponent_thinking": "Opponent thinking",
	"home_player_playing_white": "Playing as White",
	"home_player_playing_black": "Playing as Black",
	"home_player_seat_white": "White Seat",
	"home_player_seat_black": "Black Seat",
	"home_player_disconnected": "Disconnected",
	"home_player_checkmated": "Checkmated",
	"home_player_resigned": "Resigned",
	"home_player_timeout": "Out of time",
	"home_player_victor": "Victor",
	"home_player_defeated": "Defeated",
	"home_player_drawn": "Drawn",
	"home_player_resetting": "Resetting table…",
	"home_player_next_game": "Next game",
	"home_action_claim_white": "Claim White Seat",
	"home_action_claim_black": "Claim Black Seat",
	"home_action_claiming": "Claiming seat…",
	"home_action_resign": "Resign Game",
	"home_action_play_alt": "Play on /play instead",
	"home_action_retry": "Retry connection",
	"home_action_reset_now": "Reset table now",
	"home_action_opening_soon": "Opening soon…",
	"home_cue_your_move": "Your turn to move",
	"home_cue_opponent_thinking": "Opponent is thinking…",
	"home_cue_spectator_turn": "{player} to move",
	"home_cue_dice_reserved": "Reserved",
	"home_cue_dice_clearing": "Clearing",
	"home_dice_rolled": "Rolled: {dice}",
	"home_open_subtitle": "Public showcase table · 5+3 Blitz",
	"home_open_body": "The table is open. Claim your seat to start a 5+3 game against any challenger.",
	"home_spectator_title": "Table claimed by another visitor",
	"home_spectator_body": "Watching live. The next game will open automatically without a queue.",
	"home_spectator_play_alt": "Want to play right now? Open /play for instant games.",
	"home_reconnecting_title": "Connection interrupted",
	"home_reconnecting_body": "Reconnecting to showcase table (attempt {attempt} of {maxAttempts})…",
	"home_reconnect_retry": "Retry connection",
	"home_play_redirect": "Play with bots on /play",
	"home_outcome_winner": "{winner} wins by {reason}",
	"home_outcome_draw": "Game drawn by {reason}",
	"home_resetting_countdown": "Next game opens in {seconds}s",
	"home_reset_now": "Reset table now"
}
```

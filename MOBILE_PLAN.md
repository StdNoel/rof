# Mobile Playstyle Plan

Goal: make the minigame menu and all three minigames fully playable on phones
and tablets in portrait and landscape, without regressing desktop or keyboard
play.

## Decisions

- **Midnight Runner:** keep swipe-to-steer and the boost button. Add a visible
  pause button and touch-specific hints.
- **Last Call (darts):** drag to aim, release to lock, then tap to stop the
  horizontal and vertical timing bars.
- **Orientation:** support portrait and short/landscape phone viewports.
- **Input detection:** use `(any-hover: none)` / `(any-pointer: coarse)` in CSS
  and a touch check in JS so hybrid touch laptops also get controls.
- **Hints:** hide keyboard-only hints on coarse pointers and show touch
  instructions instead.
- **Targets:** keep interactive controls at least 44 px tall/wide.

## Audit

| Area | Current state | Gap |
|---|---|---|
| Minigame menu | Responsive grid collapses at 560 px | Hover sticks on touch, no `viewport-fit=cover`, no short-landscape tuning |
| Last Call | Tap locks aim immediately; mouse-only aim preview | No touch aim preview; keyboard-only copy; landscape layout can scroll |
| Midnight Runner | Swipe steering, manual boost button | No mobile pause button; keyboard-only hints; boost uses `hover: none`; no safe-area padding |
| Tetris Protocol | Per-player touch pads | Pads are 3 rows tall; no pause button; keyboard-only hints; 2P phone layout can clip |

## 1. Shared Mobile Conventions

- Add a touch helper per game using `matchMedia("(any-pointer: coarse)")` and
  `navigator.maxTouchPoints`.
- Switch CSS gates from `(hover: none)` / `(pointer: coarse)` to
  `(any-hover: none)` / `(any-pointer: coarse)`.
- Hide `.key-hint` on coarse pointers and show touch hint spans.
- Add safe-area padding around full-screen views and floating buttons.
- Add `overscroll-behavior: none` to active game views.

## 2. Minigame Menu

Files: `minigames/index.html`, `style.css`

- Add `viewport-fit=cover` and a CRT `theme-color` meta tag.
- Move `.minigame-card:hover` into
  `@media (hover: hover) and (pointer: fine)`.
- Keep `:active`; keep a clear `:focus-visible` state.
- Add `aria-disabled="true"` to the "Coming soon" card.
- Add short-landscape spacing rules so cards stay reachable.
- Verify at 320 px, 360 px, and landscape widths.

## 3. Last Call (Darts)

Files: `darts/index.html`, `darts/darts.js`, `darts/darts.css`,
`darts/README.md`

### Input

- Rework `bindBoardInput()`:
  - Mouse: pointer move previews aim; click locks aim.
  - Touch/pen: `pointerdown` starts a drag and shows the reticle;
    `pointermove` updates it; `pointerup` locks aim; `pointercancel` clears
    without locking.
  - Use `setPointerCapture()`, track one `pointerId`, and ignore secondary
    touches.
  - Keep pointer-down during `timing` stopping the current bar.
- Replace `event.offsetX/offsetY` in `eventPoint()` with
  `getBoundingClientRect()` + `clientX/clientY` (offset fallback).
- Prevent context menus and scrolling on the board.
- Do not lock aim from the same `pointerup` that ended a timing tap.

### Copy and UI

- Update `updateHud()` for touch:
  - "Drag to aim, release to lock. N darts left."
  - "Tap to stop the horizontal/vertical bar."
- Add keyboard and touch hint blocks in `darts/index.html`.
- Update the board `aria-label` for drag/tap.

### Layout

- Add `touch-action: none`, `user-select: none`, and
  `-webkit-user-select: none` to the board/stage.
- Add a short-landscape three-column match layout at
  `(orientation: landscape) and (max-height: 560px)`, sizing the board from
  viewport height and shrinking panel padding.
- Verify timing bars and overlays remain usable.

### Docs

- Update README controls with drag/release/tap behavior.

## 4. Midnight Runner

Files: `midnight-runner/index.html`, `midnight-runner/runner.js`,
`midnight-runner/runner.css`, `midnight-runner/README.md`

### Controls

- Keep swipe steering and manual boost.
- Add an in-game HUD pause button wired to the existing `pauseGame()` path.
  Hide/disable it after game over and while paused.
- Make `updateTouchBoost()` use the shared touch helper.

### Copy and UI

- Add separate keyboard and touch hint blocks in the lobby.
- Touch hint: "Swipe to steer / Tap BOOST / Pause button".
- Hide `.key-hint` on coarse pointers.
- Add an `aria-label` to the pause button.

### Layout

- Add safe-area padding to `#screen-game` and the boost button.
- Add `overscroll-behavior: none`.
- Verify HUD, canvas, overlays, and settings fit short viewports.

### Docs

- Update README controls for the mobile pause button.

## 5. Tetris Protocol

Files: `tetris-protocol/index.html`, `tetris-protocol/tetris.js`,
`tetris-protocol/tetris.css`, `tetris-protocol/README.md`

### Touch Pads

- Restructure `.touch-pad` into two compact rows:
  - Row 1: Left, Soft Drop, Right, Hold.
  - Row 2: Rotate CCW, Rotate CW, Hard Drop (span 2).
- Show pads with `(any-hover: none), (any-pointer: coarse)`.
- Keep pointer down/up/cancel/leave handling; confirm hold-to-repeat and soft
  drop work.
- Keep buttons at least 44 px tall where space allows.

### Pause and Copy

- Add a match-HUD pause button wired to `openPause()`.
- Add keyboard and touch hint blocks; hide `.key-hint` on coarse pointers.

### Layout

- Reduce duo board height at narrow widths, tighten pad spacing, and confirm
  both boards plus both pads fit in portrait without clipping.
- Add safe-area padding and `overscroll-behavior: none` on the match screen.
- Verify solo and 2P in portrait and short landscape.

### Docs

- Update README touch-control notes for the pad layout and pause button.

## 6. Verification

Serve with `python -m http.server 8000` and test at:

- `360x640` portrait phone
- `390x844` portrait phone
- `812x375` landscape phone
- `768x1024` tablet

Manual checklist:

- Menu cards are tappable with active feedback.
- Darts drag-aim/release-lock and both timing taps work.
- Runner swipe, boost, pause, and retry work.
- Tetris pads, pause, solo, and 2P fit and work.
- Keyboard and mouse behavior is unchanged.

## Out of Scope

- Online multiplayer, saved runs, or new game features.
- Changing game rules, scoring, or difficulty.
- Adding automated browser tests unless requested later.

## Status

Implemented across the minigame menu, Last Call, Midnight Runner, and Tetris
Protocol. Verified in headless Edge at 360x640, 812x375, and desktop widths:
no horizontal overflow, touch hint copy switches on coarse pointers, Last
Call drag/release locks aim and taps stop both timing bars, and the Runner and
Tetris HUD pause buttons show, pause, and resume correctly.

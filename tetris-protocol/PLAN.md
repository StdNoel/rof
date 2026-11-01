# Tetris Protocol: Overload — Implementation Plan

## Concept

A cyberpunk neon-grid drop puzzle where tetrominoes are **Data Packets** and
clearing lines compiles security subroutines. The board suffers from escalating
**System Heat** as you stack higher, clear more lines, or take too long without
a clear.

- Deep black background (`#191A1B`) with neon purple (`#BF00FF`), cyan, and
  magenta highlights.
- CRT scanlines and vignette, with a **Reduce glitch effects** toggle.
- Reactive screen shake, chromatic aberration, row flicker, and data corruption
  as heat rises.
- Zero build step: Vanilla HTML, CSS, Canvas 2D, one IIFE script.

## Locked Decisions

| Decision | Choice |
|---|---|
| Solo mode | Rising firewall meter beside the board |
| 2P mode | Simultaneous split-screen, independent boards |
| Extras | Minigames lobby card + local README + root README tree update |

---

## 1. File Changes

| File | Action |
|---|---|
| `tetris-protocol/index.html` | Create: lobby, match screen, HUD, canvases, overlays |
| `tetris-protocol/tetris.css` | Create: neon/CRT styling, responsive split-screen layout, touch controls |
| `tetris-protocol/tetris.js` | Create: engine, heat/firewall, rendering, UI, persistence |
| `tetris-protocol/README.md` | Create: rules, controls, persistence, architecture notes |
| `minigames/index.html` | Edit: replace the disabled TBA card with a Tetris Protocol card |
| `README.md` | Edit: add `tetris-protocol/` to the Project Structure tree |

No changes are needed to root `index.html`, `main.js`, `style.css`, or
`credits.html`; the existing Minigame button already routes to `minigames/`.

---

## 2. HTML Structure

### Lobby

- Topbar: `← Minigames`, `TETRIS / PROTOCOL` brand, mute chip.
- Mode cards: `Solo vs Firewall`, `2 Players`.
- Pressure selector: `Chill / Standard / Critical` (controls firewall rise rate
  and base gravity).
- Accessibility toggle: `Reduce glitch effects`.
- Start button, records line, reset-records button.
- Rules panel and controls hint, matching the darts lobby pattern.

### Match

- Header: quit, mode/status label, mute.
- Solo: one playfield canvas, firewall meter, HUD, hold/next canvases.
- 2P: two playfields side by side, each with its own HUD, hold/next, heat pips,
  and mobile pad; stacked vertically on narrow screens.
- Live region for accessibility announcements.
- Overlays: pause, game over, quit-confirm; 2P result shows winner and rematch.

---

## 3. Engine Spec

### Board

- 10 × 20 visible grid, 2 hidden spawn rows.
- 7-bag randomizer, 3-piece next queue.
- Hold once per piece; swapping resets orientation.
- SRS-lite wall kicks; lock delay 500 ms with max 15 move resets.
- DAS 150 ms, ARR 40 ms; soft drop at roughly 45 ms per cell; hard drop instant.
- Ghost piece enabled; dimmed at Heat 3+.
- Top-out when a spawned piece cannot enter or the stack breaches the ceiling.

### Scoring

- Single 100, Double 300, Triple 500, Tetris 800, multiplied by `(heat + 1)`.
- Soft drop +1 per cell, hard drop +2 per cell.
- Combo bonus `50 × combo × (heat + 1)`.
- Best score, best lines, and max heat are stored per solo run.

### Heat

- Permanent tier from total lines: 10 / 25 / 40 / 55 → Heat 1 / 2 / 3 / 4.
- Temporary stack tier raises heat as the stack climbs past defined fill
  thresholds.
- Time tier rises every roughly 45 s without a line clear; resets on any clear.
- `currentHeat = max(permanent, stack, time)`.
- Heat 5 is not playable; it maps to the `Core Dump` game-over state.

### Heat Effects

| Heat | Gameplay | Visuals |
|---|---|---|
| 1 | Faster gravity | Slight chromatic aberration |
| 2 | Faster gravity | Row flicker, subtle sway, 80 ms lateral input buffer |
| 3 | Corruption garbage injections | Dim ghost, grid glitches, stronger shake |
| 4 | Fastest gravity | Blur/distortion, heavy glitch artifacts |

`reducedEffects` and `prefers-reduced-motion` remove shake, aberration, blur,
flicker, and scanline animation, but keep speed, input delay, and garbage
mechanics.

### Solo Firewall

- Vertical 20-cell meter beside the board; starts empty.
- Rises one cell every ~10 s (Chill 14 s, Critical 7 s), accelerated slightly by
  heat.
- Clears push it back: Single 1, Double 2, Triple 3, Tetris 5; combo adds 1.
- Warning state at 15+ cells; reaching 20 ends the run as `Core Dump`.
- Heat 3+ also injects limited corrupted rows (2–4 holes each) on a cooldown.

### 2P VS

- Two independent boards, simultaneous play.
- Garbage: Double 1 row, Triple 2, Tetris 4; combo adds 1.
- Incoming garbage cancels outgoing first, then remaining rows are sent after a
  short delay.
- Garbage holes shift per row; rows render as `CORRUPTED` blocks.
- Win by opponent top-out. Records track P1/P2 win totals.
- Each player has independent heat based on their own board.

---

## 4. Controls

| Action | Player 1 / Solo | Player 2 |
|---|---|---|
| Move | `A` / `D`, `←` / `→` | `←` / `→` |
| Soft drop | `S` / `↓` | `↓` |
| Hard drop | `Space` | `Enter` |
| Rotate CW | `W` / `↑` | `↑` |
| Rotate CCW | `Q` / `Z` | `,` (comma) |
| Hold | `C` / `Shift` | `.` (period) |
| Pause | `Esc` | `Esc` |

- Prevent page scroll for gameplay keys while the match screen is active.
- Mobile: on-screen pad with Left, Right, Soft Drop, Hard Drop, Rotate CW,
  Rotate CCW, and Hold. In 2P, each board gets its own compact pad.
- Pause automatically on window blur or tab hidden.

---

## 5. Rendering

- Canvas 2D, DPR-scaled to `min(devicePixelRatio, 2.5)`, resized via
  `ResizeObserver` and window resize.
- Shared block renderer: neon outline, inner grid texture, per-piece color, and
  a distinct garbage style.
- Piece colors: cyan, magenta, purple, amber, green, red, and blue on a
  `#191A1B` background.
- Effects: afterimage trail during soft drop, line-clear flash and particles,
  canvas shake, heat-based chromatic offsets, and glitch slice draws.
- CRT scanlines and vignette via CSS pseudo-elements; disabled under reduced
  effects.
- Hold and next pieces are drawn into small dedicated canvases.

---

## 6. Persistence, Audio, Accessibility

### localStorage

```js
"tp-settings-v1": { muted, reducedEffects }
"tp-best-v1": {
  solo: { bestScore, bestLines, maxHeat },
  duo:  { p1Wins, p2Wins }
}
```

- Guarded read/write with defaults.
- Reset records clears only `tp-best-v1`, after confirmation.

### Audio

- Small procedural WebAudio SFX module: move, rotate, lock, clear, tetris,
  garbage, heat-up, game-over, and UI click.
- AudioContext is created on the first user gesture; mute persists.

### Accessibility

- Canvas labels and a polite live region announcing clears, heat changes,
  firewall warnings, garbage, and results.
- Keyboard-reachable controls, visible focus rings, 44 px touch targets.
- Pieces differ by shape as well as color; reduced-motion support.

---

## 7. Integration

- Replace the TBA card in `minigames/index.html` with:
  - Tag: `A neon drop puzzle`
  - Title: `Tetris Protocol`
  - Description referencing compiling subroutines, firewall pressure, and local
    VS.
  - Link: `../tetris-protocol/`
- Add the new folder and files to the root `README.md` project tree.
- Add `tetris-protocol/README.md` documenting rules, controls, heat table, keys,
  and architecture.

---

## 8. Verification

- `node --check tetris-protocol/tetris.js` for syntax.
- Serve locally and manually test:
  - All 7 pieces, rotations, wall kicks, 7-bag, hold-once.
  - Line clears, combos, scoring, soft/hard drop.
  - Heat transitions and each visual tier.
  - Firewall rise, pushback, warning, and loss.
  - 2P simultaneous input, garbage send/cancel, holes, win detection.
  - Pause, blur-pause, resume, quit, rematch.
  - Persistence and reset behavior.
  - Reduced effects and `prefers-reduced-motion`.
  - Layout at 360 px, 768 px, and 1440 px; portrait and landscape.
  - 2P stacked boards and touch pads on mobile.
  - Firewall/heat warnings via live region.
  - No console errors; keyboard does not scroll the page.

---

## 9. Default Balance Values

Tunable after playtesting.

| Setting | Chill | Standard | Critical |
|---|---|---|---|
| Firewall rise | 14 s/cell | 10 s/cell | 7 s/cell |
| Base gravity | 900 ms | 800 ms | 700 ms |
| Heat gravity scaling | ×0.82/level | ×0.78/level | ×0.72/level |
| Garbage injections | Disabled | From Heat 3 | From Heat 2 |

- Lock delay: 500 ms.
- Time-heat step: 45 s without a clear.
- Firewall pushback: 1 / 2 / 3 / 5 cells.
- Heat milestones: 10 / 25 / 40 / 55 lines.

---

## 10. Implementation Order

1. Scaffold `index.html` and `tetris.css` with lobby, HUD, overlays, and
   responsive shells.
2. Build the core engine: pieces, 7-bag, collision, rotation/kicks, lock/clear,
   scoring.
3. Add heat engine, firewall pressure, and corruption injections.
4. Add 2P garbage, incoming queue, and win detection.
5. Add canvas rendering, effects, hold/next previews, and mobile controls.
6. Wire persistence, audio, settings, records, and accessibility announcements.
7. Integrate the minigames card and documentation.
8. Run the syntax check and manual test matrix.

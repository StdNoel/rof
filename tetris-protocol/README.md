# Tetris Protocol: Overload

A cyberpunk neon-grid drop puzzle. Tetrominoes are **data packets**; completing
a row compiles a security subroutine and pushes back the firewall. The longer
you stall and the higher you stack, the hotter the system runs — until the core
dumps.

Standalone static minigame in `tetris-protocol/`. Vanilla HTML, CSS, and
JavaScript with Canvas 2D. No build step, libraries, or external assets.

Access it at `/tetris-protocol/` after serving the repository root, or from the
Tetris Protocol card on the `../minigames/` page. Use the `← Minigames` link at
the top left of the lobby to return.

```bash
python -m http.server 8000
# open http://localhost:8000/tetris-protocol/
```

## Controls

| Action | Player 1 / Solo | Player 2 (VS) |
|---|---|---|
| Move | `A` / `D`, `←` / `→` | `←` / `→` |
| Soft drop | `S` / `↓` | `↓` |
| Hard drop | `Space` | `Enter` |
| Rotate CW | `W` / `↑` | `↑` |
| Rotate CCW | `Q` / `Z` | `,` |
| Hold | `C` / `Shift` | `.` |
| Pause / resume | `Esc` / HUD pause button | `Esc` / HUD pause button |

In local VS, Player 1 uses `A`/`D`/`S`/`W`/`Q`/`Z`/`C`/`Space` so both boards
can be played at once. On touch devices, each board gets its own two-row
on-screen pad, and the match HUD includes a pause button.

Player 1 / Solo binds are remappable from the lobby. Select a key in the
**Key binds** field, then press the replacement key. Bindings use physical key
codes, so they stay stable across keyboard layouts. `Escape` cancels capture,
and reserved keys (`Escape`, `Enter`, `Tab`, `Space`, arrows, `,`, `.`,
`CapsLock`, and modifier keys) are rejected with an inline warning so local VS
Player 2 controls keep working. A key already assigned to another action is also
rejected with an inline warning, and capture stays open so you can try again.
`Z` and `Shift` remain accessibility fallbacks for rotate CCW and
hold; arrow keys remain a fallback in solo.

The page pauses automatically when the window loses focus or the tab is hidden.

## Modes

| Mode | Description |
|---|---|
| Solo vs Firewall | Hold back the rising firewall meter beside the board. |
| 2 Players | Local split-screen, two independent boards, garbage attacks. |

The pressure selector sets the firewall rise rate, base gravity, and when
corruption rows start appearing.

## Rules

1. Stack packets and fill complete rows to compile them out.
2. A clear pushes the solo firewall back and resets the stall timer.
3. Heat is permanent for the run once earned: every ten lines raises it.
   A tall stack or a long time without a clear can raise it temporarily too.
4. In solo, the firewall consumes one cell every few seconds. At twenty cells
   the core dumps. Heat 3+ (Heat 2+ on Critical) injects corrupted rows.
5. In VS, doubles, triples, and tetrises send garbage rows. Incoming garbage
   cancels outgoing garbage first, then the remainder drops after a delay.
6. Topping out or reaching Heat 5 ends a solo run; in VS it hands the match to
   the opponent.

## Scoring

| Clear | Points |
|---|---|
| Single | 100 |
| Double | 300 |
| Triple | 500 |
| Tetris | 800 |

- All line clears are multiplied by `(heat + 1)`.
- Soft drop: +1 per cell. Hard drop: +2 per cell.
- Combo bonus: `50 × (combo − 1) × (heat + 1)`.
- Best score, best lines, and max heat are stored for solo runs.

## Heat

Permanent heat is based on total lines cleared: 10 / 25 / 40 / 55 lines map to
Heat 1 / 2 / 3 / 4. Stack height and time without a clear add temporary tiers.
The current heat is the highest of the three. Heat 5 is the `Core Dump` state.

| Heat | Gameplay | Visuals |
|:---:|---|---|
| 1 | Faster gravity | Slight chromatic drift |
| 2 | Faster gravity | Row flicker, subtle sway, slower lateral repeat |
| 3 | Corruption rows | Bright ghost target, grid glitches, stronger shake |
| 4 | Fastest gravity | Distortion, heavy glitch artifacts |

## Solo firewall

The firewall meter has twenty cells and starts empty.

- It rises one cell every 14 s (Chill), 10 s (Standard), or 7 s (Critical),
  slightly faster as heat climbs.
- Clears push it back: Single 1, Double 2, Triple 3, Tetris 5, plus 1 for a
  combo.
- At 15 cells it warns. At 20 the run ends as `Core Dump`.

## VS garbage

| Clear | Rows sent |
|---|---|
| Single | 0 |
| Double | 1 |
| Triple | 2 |
| Tetris | 4 |
| Combo | +1 |

Garbage rows contain two to four holes, and the hole position shifts row to
row. Incoming garbage is applied after about a second, so a clear made in that
window can still cancel it.

## Balance defaults

| Setting | Chill | Standard | Critical |
|---|---|---|---|
| Firewall rise | 14 s/cell | 10 s/cell | 7 s/cell |
| Base gravity | 900 ms | 800 ms | 700 ms |
| Heat gravity scaling | ×0.82/level | ×0.78/level | ×0.72/level |
| Corruption injections | Disabled | From Heat 3 | From Heat 2 |

Lock delay is 500 ms with up to 15 move resets.

## Settings & persistence

| Key | Contents |
|---|---|
| `tp-settings-v1` | `{ muted, reducedEffects, binds: { left, right, soft, cw, ccw, hold, drop } }` |
| `tp-best-v1` | `{ solo: { bestScore, bestLines, maxHeat }, duo: { p1Wins, p2Wins } }` |

Default binds are `KeyA`, `KeyD`, `KeyS`, `KeyW`, `KeyQ`, `KeyC`, and `Space`.
Saved binds are merged over those defaults, so older settings or malformed
values fall back gracefully.

- **Reduce glitch effects** removes shake, chromatic aberration, blur, flicker,
  and scanline animation, but keeps speed, input delay, and garbage mechanics.
  `prefers-reduced-motion` does the same.
- Mute, reduce-effects, and Player 1 key binds are remembered across sessions.
- **Reset records** clears only `tp-best-v1`, after confirmation.
- Runs and matches are never saved or resumed, and there is no online
  leaderboard.

## Accessibility

- Board canvases are labelled, and pieces differ by shape as well as colour.
- A polite live region announces clears, heat changes, firewall warnings,
  garbage, and match results.
- Every control is keyboard reachable with visible focus rings, and touch
  targets are at least 44 px.
- Sound is optional and can be muted at any time.

## Files

- `index.html` — lobby, match boards, HUD, overlays, and touch pads
- `tetris.css` — neon/CRT styling, split-screen layout, heat effects, responsive
  styles
- `tetris.js` — engine, heat/firewall systems, rendering, input, audio, UI, and
  persistence
- `PLAN.md` — implementation plan and design notes
- `README.md` — this file

# Midnight Runner — Implementation Plan

A minimalist endless maze-runner inspired by NIKKE's *Midnight Phantom Runner* / *Pac-Man 256*.

## 1. Scope & Placement

- Standalone static game in `midnight-runner/`, served at `/midnight-runner/`.
- Existing Real or Fake files remain unchanged except for a menu link to the minigame.
- Vanilla HTML, CSS, and JavaScript with Canvas 2D.
- No build step, libraries, or external assets.
- All characters are chromatic filled circles. No black/white entities.
- Obstacles and wall decorations are procedurally generated SVGs.

```
midnight-runner/
├── index.html
├── runner.css
├── runner.js
├── PLAN.md
└── README.md
```

`runner.js` is self-contained with clearly separated sections: config, state, input, maze, SVG sprites, entities, boost, render, UI, and persistence.

---

## 2. Screens

### Lobby

- Title, short controls hint, and best score.
- Three large circular character buttons:
  - **Vela** — cyan — longer boost and a small speed bonus.
  - **Rho** — magenta — boost emits a shockwave that clears nearby enemies.
  - **Sol** — amber — boost magnetizes nearby pickups.
- Each character card shows color, name, boost description, and personal best.
- Start button.
- Reset progress button below Start; it clears personal bests only.
- Settings gear in the top-right corner.

### Game

- Canvas fills most of the viewport.
- HUD shows HP pips, score, distance, and boost gauge.
- Settings gear remains in the top-right corner.
- Pause overlay.
- Game-over overlay.
- Manual-boost button on touch devices.

### Settings Panel

- Boost mode: **Auto** / **Manual**.
- Manual boost key capture.
- Persisted in `localStorage`.
- Opening settings during a run pauses it.

---

## 3. Core Gameplay

### Movement

- Top-down endless maze with vertical camera scrolling.
- Logical view: 15 columns × 22 rows, 32px tiles.
- Player auto-runs in the current direction.
- Player turns at junctions.
- Keyboard or swipe sets a queued direction.
- If blocked, the player stops until a valid direction is provided.
- Movement is smoothly interpolated between tiles.

### Survival

- 3 HP.
- Enemy, hazard, or projectile contact: −1 HP and 1.2 seconds of invulnerability with a flash.
- Healing pickup restores 1 HP, capped at 3.
- Collapse zone is always lethal, even during boost.

### Collapse Zone

- Starts after a 12-second grace period.
- Rises from behind the player and speeds up over time.
- Touching it ends the run immediately.
- Visualized as a generated corruption band using chromatic colors, not grayscale.

### Scoring

- Distance points.
- Coins, chests, and boost kills add bonus points.
- Best score saved per character in `localStorage`.
- No combo or upgrade systems in v1.

### Pickups

- **Coin** — small score and boost gauge increase.
- **Chest** — larger gauge fill and score; works during boost.
- **Heal** — restores 1 HP; rare.
- Pickups never spawn inside walls or on the guaranteed route's choke points.

---

## 4. Characters & Boost

| Character | Color | Boost Effect |
|---|---|---|
| Vela | Cyan | 6.5s immunity, +8% movement speed |
| Rho | Magenta | 5s immunity, periodic shockwave destroys nearby enemies and projectiles |
| Sol | Amber | 5s immunity, pulls nearby pickups |

### Shared Boost Rules

- Gauge fills from coins and chests.
- **Auto mode**: triggers immediately at 100%.
- **Manual mode**: gauge holds at 100% and pulses until the boost key or on-screen button is pressed.
- During boost:
  - Immune to enemies, hazards, and projectiles.
  - Destroys enemies on contact for bonus score.
  - Phases through hazards and projectiles; walls still block.
  - Screen gets a full-screen hue of the character's color.
  - HUD accents switch to that character's color.
  - Collapse remains lethal.
- Coins do not refill the gauge during boost; chests do.

---

## 5. Enemies, Hazards & Maze

### Enemies

All enemies are colored circles with distinct ring or notch patterns:

- **Chaser** — slow pursuit.
- **Drifter** — horizontal bouncer.
- **Sentinel** — fires slow SVG projectiles at the player.

Enemy spawn rate and count increase gradually with distance. During boost, contact destroys enemies.

### Hazards

Generated SVG sprites:

- Spiked block.
- Saw blade.
- Broken barricade.
- Sentinel projectile.

Hazards are placed only on floor tiles and never block the only valid path.

### Maze Generation

- Chunked generation, approximately 12 rows ahead.
- Pillar-style open maze with 2-tile-wide corridors and randomized loops.
- Guaranteed connected upward route.
- No fully blocked rows.
- Wall tiles are also generated SVG variants with random notches or cracks.

### SVG Generation

- Seeded PRNG per run for deterministic variants.
- Each sprite is built as an SVG string, converted to a data URL, and preloaded into an image cache.
- Only visible tiles and entities are drawn.
- Hazard and enemy palettes use saturated colors; no grayscale fills.

---

## 6. Controls & Keybindings

### Default Controls

| Action | Binding |
|---|---|
| Move | `W A S D` or arrow keys |
| Manual boost | `E` (remappable) |
| Pause / resume | `Esc` |
| Start / retry | `Enter` |
| Mobile movement | Swipe on canvas |
| Mobile manual boost | On-screen circular button |

- Arrow keys, Space, and WASD are prevented from scrolling the page during play.
- Manual boost key is captured through the settings panel.
- Invalid keys are rejected with a visible warning.

### Reserved In-Game Keys

These cannot be assigned to manual boost:

- `W`, `A`, `S`, `D` — movement.
- Arrow keys — movement.
- `Escape` — pause/resume.
- `Enter`, `NumpadEnter` — start/retry.
- `E` — default manual boost key, but remappable.

### Rejected Browser/OS Keys

- `Tab` — focus navigation.
- `Space` — page scroll and button activation.
- `Backspace` — browser navigation.
- `F1`–`F12` — browser help, devtools, fullscreen, and other functions.
- `PrintScreen`, `ScrollLock`, `Pause/Break`.
- `Insert`, `Delete`, `Home`, `End`, `PageUp`, `PageDown`.
- `CapsLock`, `NumLock` — sticky state.
- `Windows` / `Meta` / `Cmd`, `ContextMenu`.
- Standalone `Alt`, `Ctrl`, `Shift` — modifier-only keys.
- Any key combined with `Ctrl`, `Alt`, or `Meta`.
- `Ctrl+W`, `Ctrl+R`, `Ctrl+T`, `Ctrl+N`.
- `Alt+F4`, `Alt+Tab`.
- `F5`, `F11`, `F12`.

### Safe Key Suggestions

`Q`, `F`, `C`, `V`, `B`, `G`, `H`, `J`, `K`, `L`, `U`, `I`, `O`, `N`, `X`, `Z`.

Because this is a standalone page, there is no conflict with Real or Fake's `Tab` focus trap.

---

## 7. Settings & Persistence

- Gear button in the top-right corner of both the lobby and game screens.
- Settings:
  - Boost mode: `Auto` / `Manual`.
  - Manual boost key: press-to-capture with reserved-key rejection.
  - Defaults: Auto + `E`.
- Opening settings during a run pauses it.
- On touch devices, selecting Manual shows a large circular Boost button.
- Stored in `localStorage` under `mr-settings-v1`.
- Best scores stored under `mr-best-v1`, one entry per character.
- Reset Progress in the lobby clears all three best scores; settings and the last character are preserved.
- No server, accounts, or online leaderboard.

Suggested settings shape:

```json
{
  "boostMode": "auto",
  "boostKey": "KeyE",
  "lastCharacter": "vela",
  "reducedEffects": false
}
```

Suggested best-score shape:

```json
{
  "vela": 1240,
  "rho": 980,
  "sol": 1510
}
```

---

## 8. Visual, Accessibility & Responsiveness

- Background: deep indigo rather than pure black.
- Characters and enemies use saturated colors only, with ring or notch patterns so they are distinguishable without color alone.
- Boost:
  - Canvas radial wash plus a full-screen CSS overlay in the character's color.
  - HUD accent changes to the same hue.
  - `prefers-reduced-motion` reduces pulsing, particles, and screen shake.
- Canvas scales with device pixel ratio and fits mobile and desktop.
- Touch targets are at least 44px.
- Canvas has an accessible label; lobby and buttons are keyboard reachable.
- Pause automatically when the tab is hidden or the page loses focus.
- No off-screen drawing; particle count is capped.

---

## 9. Implementation Order

1. Create `midnight-runner/` scaffold, lobby layout, and palette.
2. Canvas sizing, DPR scaling, game loop, and state machine.
3. Input system: keyboard, swipe, queued turns.
4. Maze chunk generator and SVG sprite factory/cache.
5. Player movement, walls, camera, HP, and HUD.
6. Pickups, boost gauge, auto/manual activation, tint, and immunity.
7. Characters and their boost modifiers.
8. Enemies, projectiles, hazards, and collapse zone.
9. Settings panel, keybinding capture, and persistence.
10. Responsive/touch polish, reduced motion, and accessibility.
11. README and smoke tests.

---

## 10. Test Checklist

- Serve with `python -m http.server` and open `/midnight-runner/`.
- Each character's color and boost modifier works.
- Auto and Manual boost modes behave correctly and persist.
- Manual key capture rejects conflicting keys and persists a valid key.
- Boost blocks enemy, hazard, and projectile damage.
- Collapse kills during boost.
- HP loss, healing, i-frames, game over, and retry work.
- Score and best scores persist per character.
- Tab-hidden pause and resume work.
- Canvas resizes correctly; mobile swipe and boost button work.
- Reduced-motion mode remains playable.
- No console errors.
- Root Real or Fake game remains untouched.

---

## 11. Out of Scope for v1

- Meta upgrades, training logs, and currency.
- Combo system.
- Audio and music.
- Multiple maps or boss fights.
- Online leaderboards.
- Saved or resumable runs.

---

## 12. Defaults Unless Changed

- Manual boost key: `E`.
- Character names: Vela / Rho / Sol.
- No audio in v1.
- A `Minigame` button in the root Real or Fake menu opens `/midnight-runner/`; the game itself remains standalone.
- Boost immunity excludes the collapse zone.



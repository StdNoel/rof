# Midnight Runner

A minimalist endless maze-runner inspired by NIKKE's *Midnight Phantom Runner* and *Pac-Man 256*. Vanilla HTML, CSS, and Canvas 2D. No build step, libraries, or external assets.

Access it at `/midnight-runner/` after serving the repository root, or open it from the `Minigame` button in the main menu, which leads to the minigames page. Use the `← Minigames` link at the top-left of the lobby to return to that page.

```bash
python -m http.server 8000
# open http://localhost:8000/midnight-runner/
```

## Controls

| Action | Binding |
|---|---|
| Move | `W A S D` or arrow keys |
| Manual boost | `E` (remappable) |
| Pause / resume | `Esc` |
| Start / retry | `Enter` |
| Mobile move | Swipe on the canvas |
| Mobile boost | On-screen button (Manual mode) |
| Mobile pause | Pause button in the game HUD |

Fast direction taps are buffered (up to two), and mid-tile reversals are instant.

## Characters

| Character | Color | Boost |
|---|---|---|
| Vela | Cyan | 6.5 s immunity, +8% movement speed |
| Rho | Magenta | 5 s immunity, periodic shockwaves clear nearby enemies and projectiles. The shockwave is drawn from the same function that tests collisions, so the ring is exactly the hitbox. |
| Sol | Amber | 5 s immunity, magnetizes nearby pickups |

## Rules

- Every generated row keeps at least two open lanes with frequent cross-connections, plus occasional single-cell clutter, so you can weave around hazards instead of being funneled down one corridor.
- 3 HP. Enemy, hazard, and projectile contact costs 1 HP and grants 1.2 s of invulnerability.
- Coins, chests, and heal pickups spawn on open floor. Coins and chests fill the boost gauge.
- Boost pickups extend the active boost instead of filling the gauge. The gauge shows remaining boost time while boosting.
- Boost makes you immune to enemies, hazards, and projectiles, and destroys enemies on contact. Walls still block. The collapse is always lethal.
- After a 12-second grace period, the collapse rises from behind and accelerates over time.
- Score comes from distance plus pickups and boost kills. Best scores are saved per character.

## Settings

Open the gear button from the lobby or during a run. Settings pause an active run.

- Boost mode: Auto fires at a full gauge; Manual holds at 100% until the boost key or touch button is pressed. Pickups during a boost extend it (up to 1.5× the base duration).
- Manual boost key: click the key field, then press a letter or number key. Movement keys, browser shortcuts, and modifier combos are rejected with a warning.
- Sound: toggles all game sound effects. The lobby and game HUD also have quick mute buttons.
- Reduced effects cuts particles, screen shake, and pulsing animations.

## Persistence

- Settings: `localStorage["mr-settings-v1"]` (`{ boostMode, boostKey, lastCharacter, reducedEffects, muted }`)
- Personal bests: `localStorage["mr-best-v1"]`

The lobby's Reset Progress button clears all three personal bests after confirmation. Settings and the selected character are kept.

No server, accounts, or online leaderboard. Runs are not saved or resumed.

## Files

- `index.html` — lobby, game, and settings markup
- `runner.css` — layout, palette, overlays, responsive and reduced-motion styles
- `runner.js` — config, state, input, maze generator, SVG sprite factory, entities, boost, render, UI, and persistence

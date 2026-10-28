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

## Characters

| Character | Color | Boost |
|---|---|---|
| Vela | Cyan | 6.5 s immunity, +8% movement speed |
| Rho | Magenta | 5 s immunity, periodic shockwaves clear nearby enemies and projectiles |
| Sol | Amber | 5 s immunity, magnetizes nearby pickups |

## Rules

- 3 HP. Enemy, hazard, and projectile contact costs 1 HP and grants 1.2 s of invulnerability.
- Coins, chests, and heal pickups spawn on open floor. Coins and chests fill the boost gauge.
- Boost makes you immune to enemies, hazards, and projectiles, and destroys enemies on contact. Walls still block. The collapse is always lethal.
- After a 12-second grace period, the collapse rises from behind and accelerates over time.
- Score comes from distance plus pickups and boost kills. Best scores are saved per character.

## Settings

Open the gear button from the lobby or during a run. Settings pause an active run.

- Boost mode: Auto triggers at a full gauge; Manual holds at 100% until the boost key or touch button is pressed.
- Manual boost key: click the key field, then press a letter or number key. Movement keys, browser shortcuts, and modifier combos are rejected with a warning.
- Reduced effects cuts particles, screen shake, and pulsing animations.

## Persistence

- Settings: `localStorage["mr-settings-v1"]`
- Personal bests: `localStorage["mr-best-v1"]`

The lobby's Reset Progress button clears all three personal bests after confirmation. Settings and the selected character are kept.

No server, accounts, or online leaderboard. Runs are not saved or resumed.

## Files

- `index.html` — lobby, game, and settings markup
- `runner.css` — layout, palette, overlays, responsive and reduced-motion styles
- `runner.js` — config, state, input, maze generator, SVG sprite factory, entities, boost, render, UI, and persistence

# Lux

A survivor-style glow arena. You are a small orb of light in a dark, bounded
arena. Your glow is your health, your vision, and your weapon range all at once.
It drains constantly. Killing enemies feeds it. Let it reach zero and the run is
over.

Standalone static minigame in `lux/`. Vanilla HTML, CSS, and JavaScript with
Canvas 2D. No build step, libraries, or external assets.

Access it at `/lux/` after serving the repository root, or from the Lux card on
the `../minigames/` page. Use the `← Minigames` link at the top left of the
lobby to return.

```bash
python -m http.server 8000
# open http://localhost:8000/lux/
```

## Controls

| Action | Binding |
|---|---|
| Move | `WASD` / arrow keys |
| Move toward cursor | Hold the left mouse button and aim |
| Move (touch) | Drag on the arena |
| Dash | `Space`, `Shift`, or right-click |
| Dash (touch) | `DASH` button in the arena |
| Choose an upgrade | Click a card, or press `1`, `2`, or `3` |
| Pause / resume | `Esc` or the HUD pause button |
| Start / retry / resume | `Enter` |

Dash is your only defensive verb. It is a short burst with brief invulnerability
and a cooldown. Attacking is automatic; focus on positioning and feeding the
light.

The page pauses automatically when the window loses focus or the tab is hidden.

## The Light

- Light starts at `100` and drains at `2/sec`.
- Glow radius is `60 + light × 2.4 px` (plus any radius upgrades).
- Light is also weapon range. A weapon can only hit enemies inside the same
  radius that you can see. The dashed ring in the arena is that exact boundary.
- Basic kills restore `3–11` light depending on the enemy. Bosses restore `25`.
- At `0` light the run ends.
- The arena floor outside the glow is covered by a heavy vignette, so enemies
  that are outside your light are invisible. Some will only appear when they
  cross into it.

## Weapons

Every weapon auto-fires at the nearest enemy inside your glow, each on its own
cooldown. Levels 1–2 improve it; level 3 is its evolution.

| Weapon | Evolution at level 3 | Behaviour |
|---|---|---|
| Halo | Twin Halo | Blades orbit your body and cut anything near the light. |
| Lance | Sun Lance | A focused bolt fired at the nearest target. Evolved: twin piercing bolts. |
| Nova | Supernova | A periodic shockwave around you. Evolved: reaches the full glow radius. |
| Link | Storm Link | Lightning chains through nearby targets inside the glow. |
| Scatter | Sunburst | A short fan of burning shards aimed at the nearest foe. |

You begin with Lance level 1. New weapons and weapon levels appear in level-up
choices.

## Upgrades

Each upgrade can be taken up to 5 times. Level-ups pause the run and offer three
random choices from the weapons and upgrades you have not maxed.

| Upgrade | Effect |
|---|---|
| Ember Core | Max light +20. Current light +20. |
| Steady Flame | Light drain −0.18/sec. |
| Swift Ash | Move speed +8%. |
| Keen Light | All weapon damage +15%. |
| Wide Halo | Glow radius +14 px. Vision and weapon range grow together. |
| Quick Step | Dash cooldown −12%. |

If everything is maxed, a repeatable Overcharge card grants +5% weapon damage.

## Enemies & bosses

Spawn rate ramps with time. Enemies enter just outside the light radius and
chase you; only those inside the glow are drawn.

| Enemy | Behaviour |
|---|---|
| Chaser | Medium speed, medium health, straightforward pursuit. |
| Swarmer | Small, fast, and fragile. Weaves as it closes in. |
| Tank | Large, slow, heavily armoured, hits hard on contact. |
| Ranged | Keeps its distance and fires slow projectiles. |
| Boss | Much larger, high health, restores a big chunk of light. |

Bosses spawn at roughly **1:00**, **2:00**, and **3:00**, giving the run a clear
three-act shape. Surviving past three minutes is the unofficial target.

## Settings & persistence

| Key | Contents |
|---|---|
| `lux-settings-v1` | `{ muted, reducedEffects }` |
| `lux-best-v1` | `{ bestSeconds }` — longest survival time in whole seconds |

- **Reduced effects** cuts particles, removes screen shake, and stops the light
  from pulsing. `prefers-reduced-motion` does the same.
- Mute and reduced-effects are remembered across sessions.
- **Reset Progress** clears only `lux-best-v1`, after confirmation.
- Runs are never saved or resumed, and there is no online leaderboard.

## Accessibility

- The arena canvas is labelled with its controls.
- The level-up overlay is a modal dialog. Cards are real buttons, focusable with
  `Tab`, and can be picked with `Enter` or the `1` / `2` / `3` keys.
- Pause and run-over overlays are labelled dialogs with trapped focus.
- The light bar exposes its value as a progress bar.
- A polite live region announces bosses, level-ups, and the end of a run.
- Sound is optional and can be muted at any time.
- Touch targets are at least 44 px.

## Files

- `index.html` — lobby, game HUD, level-up cards, overlays, and settings
- `lux.css` — warm gold-on-black styling, light bar, upgrade cards, responsive
  layout, reduced-motion rules
- `lux.ts` — game loop, light mechanic, enemies, bosses, weapons, upgrades,
  rendering, input, audio, UI, and persistence
- `README.md` — this file

# Last Call

A neon-pub darts drinking game. Throw three darts, beat your opponent's round
total, and make them drink. Every drink blurs the board and speeds up the
precision-timing bars. Five counted drinks is a blackout.

Standalone static minigame in `darts/`. Vanilla HTML, CSS, and JavaScript with
Canvas 2D. No build step, libraries, or external assets.

Access it at `/darts/` after serving the repository root, or from the Last
Call card on the `../minigames/` page. Use the `← Minigames` link at the top
left of the lobby to return.

```bash
python -m http.server 8000
# open http://localhost:8000/darts/
```

## Controls

| Action | Binding |
|---|---|
| Aim (mouse / keyboard) | Move the mouse over the board or use the arrow keys |
| Aim (touch) | Drag on the board; release to lock the aim |
| Lock aim | Click, release a touch drag, `Space`, or `Enter` |
| Stop horizontal bar | Click, tap, `Space`, or `Enter` |
| Stop vertical bar | Click, tap, `Space`, or `Enter` |
| Quit during play / cancel quit | `Esc` |
| Ready / next round / rematch | `Enter` |

A throw takes three steps: aim at the target, lock the aim, then stop the
horizontal and vertical precision-timing bars. On touch screens, drag the
reticle into place and lift your finger to lock it, then tap once for each
timing bar.

### Timing step

Every throw is aim → lock → stop the horizontal timing bar → stop the vertical
timing bar. Click / tap / `Space` / `Enter` advances each stage.

If the pointer is away from the board and no keyboard aim is active, the
reticle is hidden and throws are ignored. The page does not scroll or zoom
while you are aiming on the board.

## Modes

| Mode | Description |
|---|---|
| Solo vs Bot | Play against Rookie, Regular, or Legend. |
| 2 Players | Local pass-and-play on one device. |

Both modes use the same rules. In 2-player mode, a pass-device card appears
before each turn so the right player takes the board.

## Rules

1. Everyone takes one free sip before round 1. It does not count toward the
   five-drink limit and has no effect on aim or blur.
2. Each player throws three darts per turn.
3. Both turns are compared as one round.
4. The lower round score drinks 1. A tie means both players drink 1.
5. Five counted drinks is a blackout and a loss.
6. If both players black out on the same round, the higher match total wins.
   If the totals are equal, the match is a draw.
7. The starting player alternates every round; Player 1 starts round 1.

## Board & scoring

A classic 20-sector board:

| Landing | Score |
|---|---|
| Single | Sector number |
| Double ring | 2 × sector |
| Triple ring | 3 × sector |
| Outer bull | 25 |
| Bullseye | 50 |
| Off board | 0 |

Sectors run clockwise from the top: 20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19,
7, 16, 8, 11, 14, 9, 12, 5.

## Drunk system

Each drink raises a player's drunk level. It affects both the human's screen
and the accuracy of every player. The bot gets drunk too.

| Drinks | Label | Aim error | Board blur |
|:---:|---|---|---|
| 0 | Sober | 0.018R | none |
| 1 | Tipsy | 0.028R | 1 px |
| 2 | Buzzed | 0.045R | 2 px |
| 3 | Wasted | 0.070R | 5 px |
| 4 | Seeing Double | 0.100R | 7 px |
| 5 | Blackout | match over | — |

`R` is the board radius. A random "big slip" can add an extra 0.05R–0.12R of
error, with a higher chance at higher levels. The board also sways, and from
the third drink onward shows afterimages. Timing period = max(500 ms, 1150 ms ×
0.86^drinks).

Blur is applied as a layer over the board, so the aim reticle stays sharp and
interactive. From the third drink onward the board blur deepens and the
timing tracks blur slightly too; a dark backing strip keeps the bars legible.
At four drinks a rotating dizziness vignette spins over the board, extends just
past its rim, and the frame tilts gently. The vignette is non-interactive, so
clicking or tapping still locks aim and stops both timing bars. Drunk visuals follow the active human shooter. The bot's drunkenness affects
its accuracy and hidden timing, so your view stays clear on the bot's turn. In
2-player mode, the blur follows whichever player is throwing.

## Bot

| Difficulty | Name | Base error | Targets |
|---|---|---|---|
| Easy | Rookie | 0.085R | Random high singles, occasional bull |
| Normal | Regular | 0.050R | Treble 20, treble 19, bull, singles |
| Hard | Legend | 0.025R | Mostly treble 20 |

The bot throws through the same scoring path and accumulates drinks exactly
like a human player. Its timing stops are simulated internally, so no timing
bars appear during its turn.

## Settings & persistence

| Key | Contents |
|---|---|
| `lc-settings-v1` | `{ muted, reducedEffects }` |
| `lc-best-v1` | Solo wins/losses and best win per difficulty; duo wins and best win per player |

- **Reduce drunk effects** keeps the accuracy and timing penalties but softens
  blur and removes sway, the level-4 spin/tilt, afterimages, and pulsing; the
  dizziness layer stays as a calm static vignette. `prefers-reduced-motion`
  does the same.
- Mute and reduce-effects are remembered across sessions.
- **Reset records** clears only `lc-best-v1`, after confirmation.
- Matches are never saved or resumed, and there is no online leaderboard.

## Accessibility

- The board canvas has a text label; arrow keys aim, and `Space`/`Enter` locks
  the aim and stops each timing bar.
- A polite live region announces turns, dart scores, round results, and the
  winner.
- Darts differ by shape as well as colour: Player 1 uses square tips, Player 2
  uses round tips.
- Sip meters have text labels, and every control is keyboard reachable.
- Touch targets are at least 44 px.
- Sound is optional and can be muted at any time.

## Files

- `index.html` — lobby, match board, score panels, and overlays
- `darts.css` — neon-pub layout, board stage, drunk effects, responsive styles
- `darts.js` — config, board renderer, throw engine, match state machine, bot,
  audio, UI, and persistence
- `PLAN.md` — implementation plan and design notes
- `README.md` — this file

## Responsible play

Sips are a suggestion. Water or any non-alcoholic drink counts too. Please
drink responsibly, and take a break if you need one.


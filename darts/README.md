# Last Call

A neon-pub darts drinking game. Throw three darts, beat your opponent's round
total, and make them drink. Every drink blurs the board and softens their aim.
Five drinks is a blackout.

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
| Aim | Move the mouse over the board |
| Throw | Click or tap the board |
| Keyboard aim | Arrow keys |
| Keyboard throw | `Space` or `Enter` |
| Quit during play / cancel quit | `Esc` |
| Ready / next round / rematch | `Enter` |

On touch screens, tap the board to throw. The page does not scroll or zoom
while you are aiming on the board.

## Modes

| Mode | Description |
|---|---|
| Solo vs Bot | Play against Rookie, Regular, or Legend. |
| 2 Players | Local pass-and-play on one device. |

Both modes use the same rules. In 2-player mode, a pass-device card appears
before each turn so the right player takes the board.

## Rules

1. Each player throws three darts per turn.
2. Both turns are compared as one round.
3. The lower round score drinks 1. A tie means both players drink 1.
4. Five drinks is a blackout and a loss.
5. If both players black out on the same round, the higher match total wins.
   If the totals are equal, the match is a draw.
6. The starting player alternates every round; Player 1 starts round 1.

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
| 1 | Tipsy | 0.028R | 0.6 px |
| 2 | Buzzed | 0.045R | 1.4 px |
| 3 | Wasted | 0.070R | 2.4 px |
| 4 | Seeing Double | 0.100R | 3.5 px |
| 5 | Blackout | match over | — |

`R` is the board radius. A random "big slip" can add an extra 0.05R–0.12R of
error, with a higher chance at higher levels. The board also sways and shows
a double-vision reticle.

Drunk visuals follow the active human shooter. The bot's drunkenness affects
only its accuracy, so your view stays clear on the bot's turn. In 2-player
mode, the blur follows whichever player is throwing.

## Bot

| Difficulty | Name | Base error | Targets |
|---|---|---|---|
| Easy | Rookie | 0.085R | Random high singles, occasional bull |
| Normal | Regular | 0.050R | Treble 20, treble 19, bull, singles |
| Hard | Legend | 0.025R | Mostly treble 20 |

The bot throws through the same scoring path and accumulates drinks exactly
like a human player.

## Settings & persistence

| Key | Contents |
|---|---|
| `lc-settings-v1` | `{ muted, reducedEffects }` |
| `lc-best-v1` | Solo wins/losses and best win per difficulty; duo wins and best win per player |

- **Reduce drunk effects** keeps the accuracy penalty but softens blur, sway,
  and pulsing. `prefers-reduced-motion` also disables sway and animation.
- Mute and reduce-effects are remembered across sessions.
- **Reset records** clears only `lc-best-v1`, after confirmation.
- Matches are never saved or resumed, and there is no online leaderboard.

## Accessibility

- The board canvas has a text label; arrow keys aim and `Space`/`Enter` throw.
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


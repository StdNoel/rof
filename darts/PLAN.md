# Last Call — Implementation Plan

A neon-pub darts drinking game. Throw three darts, beat your opponent's round
total, and make them drink. Every drink blurs their vision and worsens their
aim. Five drinks and they black out.

Standalone static minigame in `darts/`, served at `/darts/`. Vanilla HTML,
CSS, and JavaScript with Canvas 2D. No build step, libraries, or external
assets.

```
darts/
├── index.html
├── darts.css
├── darts.js
├── PLAN.md
└── README.md
```

---

## 1. Scope & Placement

- Standalone static game in `darts/`, linked from `minigames/index.html`.
- Existing Real or Fake files remain unchanged except for the hub card and
  the root `README.md` project structure.
- Vanilla HTML, CSS, and JavaScript with Canvas 2D.
- No build step, libraries, or external assets.
- The board is drawn procedurally on canvas; no image or audio files.
- All sound is synthesized with WebAudio and initialized on the first user
  gesture.

`darts.js` is self-contained with clearly separated sections: config,
helpers, persistence, state/DOM, audio, board renderer, throw engine, bot,
match state machine, UI, and boot.

---

## 2. Screens

### Lobby

- Top bar: back link to Minigames, brand **LAST CALL / DARTS**, mute button.
- Mode selector: **Solo vs Bot** / **2 Players**.
- Difficulty selector, visible only in Solo: **Easy** / **Normal** / **Hard**.
- Start Match button.
- Rules summary:
  - Three darts per turn.
  - Compare round totals.
  - Lower score drinks; ties mean both drink.
  - Five drinks is a blackout and a loss.
- Records: solo wins/losses and best win per difficulty; duo wins and best
  win per player.
- Reset Records button with confirmation.
- Responsible-drinking note: sips are a suggestion, water counts too.

### Match

- Top HUD: round number, whose turn, darts remaining, quit button with a
  confirmation prompt.
- Two score panels: player name, total score, current round score, and five
  sip pips. The active player's panel is highlighted.
- Canvas board centered on screen; scoreboard sits above or beside it.
- Status line: whose throw, darts left, and a short control hint.
- Dart colors: Player 1 amber with a square tip; Player 2 teal with a round
  tip. Shape differs as well as color.
- Bot names by difficulty: Rookie (Easy), Regular (Normal), Legend (Hard).

### Overlays

- **Pass device** (2-player): "Player 2, take the board" before each turn.
- **Round result**: "Player 2 takes it, 87-64 - Player 1 drinks." Animated
  sip-pip fill and glug sound. On a tie: "Dead even. Both drink."
- **Blackout**: winner or draw, drinks taken, darts thrown, total score,
  Rematch and Lobby buttons.
- **Quit confirm**: leaving mid-match loses it.

---

## 3. Core Gameplay

### Match Flow

1. Lobby settings choose mode and difficulty.
2. Round 1 begins. The starting player alternates each round.
3. A turn is three darts, thrown one at a time.
4. After both players have thrown, round totals are compared.
5. The lower score drinks 1. A tie means both drink 1.
6. A player at 5 drinks blacks out and loses immediately.
7. If both reach 5 drinks on the same tie round, the higher match total wins;
   if still equal, the match is a draw.
8. Otherwise the next round starts with the other player throwing first.

State phases:

```
lobby -> turnStart -> aim -> flight -> turnEnd
      -> roundEnd -> drink -> nextRound | blackout
```

### Throwing

- The active player clicks or taps anywhere on the board canvas.
- The final landing point is the aim point plus drunken jitter.
- Tapping outside the scoring rings scores 0 (a miss).
- A dart flight animates for roughly 260 ms, leaves a short trail, and lands
  with a thunk and a score popup.
- Input is locked while a dart is in flight.
- A desktop hover reticle previews the aim point.
- Keyboard: arrow keys move the reticle; `Space` or `Enter` throws.
- Touch: tap to throw; `touch-action: none` prevents scrolling and zooming.
- After three darts, the turn passes automatically.
- The bot throws automatically after a short delay.
- Darts stick visibly on the board until the start of the next round.

---

## 4. Board & Scoring

Classic 20-sector dartboard.

### Geometry

Normalized to the board radius `R`:

| Band | Radius |
|---|---|
| Bullseye | `< 0.037R` |
| Outer bull | `0.037R - 0.093R` |
| Inner single | `0.093R - 0.58R` |
| Triple | `0.58R - 0.63R` |
| Outer single | `0.63R - 0.95R` |
| Double | `0.95R - 1.0R` |
| Off board | `> 1.0R` |

### Sector Order

Clockwise from the top: `20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16,
8, 11, 14, 9, 12, 5`.

Each sector spans 18 degrees. Wedges are offset by 9 degrees so sector 20 is
centered at 12 o'clock.

### Score Values

- Single: sector number.
- Double: 2 x sector number.
- Triple: 3 x sector number.
- Outer bull: 25.
- Bullseye: 50.
- Miss: 0.

### Rendering

- Board pre-rendered once to an offscreen canvas at device-pixel ratio capped
  at 2, then redrawn on resize.
- Cream and charcoal wedges, red and green doubles/triples, red and green
  bull.
- Thin metal spider wires, number ring around the rim, and an amber neon rim
  glow.
- Darts, reticle, flight animation, and score popups are drawn every frame on
  the live canvas.
- The animation loop runs only while the match screen is active.

---

## 5. Drunk System

Each player has a drink level from 0 to 5. Level 5 ends the match.

`R` is the board radius. Jitter is applied to the landing point at the moment
of release.

| Drinks | Label | Aim jitter | Board blur | Sway |
|:---:|---|---|---|---|
| 0 | Sober | 0.018R | none | none |
| 1 | Tipsy | 0.028R | 0.6 px | 0.3 deg |
| 2 | Buzzed | 0.045R | 1.4 px | 0.6 deg |
| 3 | Wasted | 0.070R | 2.4 px | 1.0 deg |
| 4 | Seeing Double | 0.100R | 3.5 px | 1.6 deg |
| 5 | Blackout | match over | - | - |

- Each drink adds a random "big slip" chance of 6% + 4% per drink, applying an
  extra 0.05R-0.12R offset. This keeps comebacks possible.
- Jitter uses a roughly normal distribution, clamped to a sensible range.
- Bot accuracy uses the same drunk multipliers on top of its difficulty
  baseline.

### Visual Rules

- Drunk visuals apply to the board stage only.
- They follow the active human shooter: if that player is drunk, the board
  blurs, sways, and gains a double-vision ghost and warm vignette.
- The bot's drunkenness affects only its accuracy; the human's view stays
  clear on the bot's turn.
- In 2-player mode the blur follows whichever player is throwing.
- The scoreboard and HUD are never blurred.
- A persisted **Reduce effects** toggle plus `prefers-reduced-motion` removes
  sway and pulsing and caps blur at 0.6 px, while keeping the accuracy
  penalty unchanged.

---

## 6. Bot

| Difficulty | Name | Base sigma | Target selection |
|---|---|---|---|
| Easy | Rookie | 0.085R | random high singles, occasional bull |
| Normal | Regular | 0.050R | mix of treble 20, treble 19, and bull |
| Hard | Legend | 0.025R | mostly treble 20 |

- The bot picks a target, shows a reticle drift toward it, then throws.
- The bot accumulates drinks and suffers the same accuracy multipliers, so
  it can choke late.
- Bot throws resolve through the same scoring path as human throws.
- Difficulty changes only the base sigma and target mix; match rules are
  identical.

---

## 7. Audio

All sound is synthesized with WebAudio and initialized on the first user
gesture.

| Cue | Synthesis |
|---|---|
| UI click | short square blip |
| Throw whoosh | filtered noise burst |
| Dart thunk | low triangle plus noise click |
| Score tick | short sine ping |
| Bullseye | two rising sine notes |
| Drink glug | three descending blips |
| Round-loss sting | low descending tone |
| Blackout | long low drone with wobble |

- Mute toggle in the lobby and match HUD.
- Mute state persists.
- No audio files.

---

## 8. Persistence

| Key | Contents |
|---|---|
| `lc-settings-v1` | `{ muted, reducedEffects }` |
| `lc-best-v1` | solo wins/losses and best win per difficulty; duo wins and best win per player |

- Lobby **Reset Records** clears only `lc-best-v1`, after confirmation.
- Settings are preserved on reset.
- Matches are never saved or resumed.
- All reads are wrapped in try/catch so unavailable storage falls back to
  defaults.

---

## 9. Visual, Accessibility & Responsiveness

### Palette

- Background: near-black warm brown with a smoky vignette.
- Primary accent: amber neon (`#ffb347` and friends).
- Player 1: amber. Player 2: teal (`#2ee6d0`).
- Board: cream and charcoal wedges, red and green rings, amber neon rim.
- Text: warm cream; muted tan for secondary copy.
- Font: Courier New / ui-monospace, matching the rest of the repository.

### Accessibility

- Canvas has an accessible label describing the board and controls.
- Arrow keys move the reticle; `Space`/`Enter` throws; `Esc` opens quit
  confirm.
- Live region announces the current turn, dart score, round result, drinks,
  and winner.
- Darts differ by shape as well as color; sip pips are labelled.
- Focus-visible styles on every button and toggle.
- Touch targets at least 44 px.
- Reduce-effects toggle and `prefers-reduced-motion` reduce blur and remove
  sway; gameplay jitter is unchanged so the game stays fair.
- The page does not require audio.
- No flashing above 3 Hz.

### Responsiveness

- Desktop: board centered with score panels above or beside it.
- Mobile: score panels stack above the board; the canvas stays square and
  fits the viewport width.
- Canvas scales with device pixel ratio, capped at 2.
- Lobby scrolls if it overflows; the match screen fits the viewport.
- `touch-action: none` on the canvas prevents scroll and pinch-zoom during
  throws.

---

## 10. Implementation Order

1. Scaffold `darts/` with lobby layout, brand, and palette.
2. Canvas sizing, offscreen board renderer, hit detection and scoring.
3. Throw input, reticle, dart flight, stuck darts, score popups.
4. Match state machine, turn order, score panels, HUD, status line.
5. Drunk accumulation, jitter, board blur and sway.
6. Bot AI, difficulty, target selection, auto-throw.
7. Round-result, pass-device, blackout, and quit overlays.
8. WebAudio cues and mute.
9. Persistence, records, reset, reduced-effects toggle.
10. Responsive, keyboard, ARIA, reduced-motion polish.
11. `minigames/index.html` card, root `README.md` update, `darts/README.md`.
12. Smoke tests.

---

## 11. Test Checklist

- Serve with `python -m http.server` and open `/darts/`.
- No console errors on load or during play.
- Board mapping spot-checks: 20 at top, 18 clockwise-left, 25 outer bull,
  50 bullseye, doubles and triples score correctly.
- All three difficulties play; the bot throws only on its turn and never
  while a dart is in flight.
- 2-player pass-and-play alternates turns and rounds correctly.
- Round loser drinks; tie makes both drink; 5 drinks triggers blackout.
- Simultaneous blackout applies the higher-total tie-break or draw.
- Input locks during flight; misses score 0; reticle stays inside the canvas.
- Mute, reduce-effects, and records persist across reload.
- Reset Records clears records only.
- Mobile touch works without page scrolling or zoom.
- Keyboard-only play works, and the live region announces key events.
- Reduced-motion mode remains playable and legible.
- The root Real or Fake game and the minigames hub still work.
- No changes leak into `main.js`, `style.css`, or the quiz data.

---

## 12. Out of Scope for v1

- Online or network multiplayer.
- Real alcohol, wagers, or purchase prompts.
- Saved or resumable matches.
- 501 checkout rules and professional darts formats.
- Online leaderboards or accounts.
- Unlocks, upgrades, or persistent progression beyond records.
- Custom player names or avatars.
- Multiple boards or game variants.

---

## 13. Defaults Unless Changed

- Working title: **Last Call**; folder `darts/`.
- Mode default: Solo vs Bot.
- Difficulty default: Normal.
- Drink limit: 5.
- Darts per turn: 3.
- Round tie: both drink 1.
- Starting player alternates each round; Player 1 starts round 1.
- Player names: Player 1 / Player 2; bot names Rookie / Regular / Legend.
- Mute default: off. Reduce effects default: off.
- No audio files; all sound synthesized.
- No changes to the root quiz game beyond the hub card and README.

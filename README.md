# Real or Fake

A browser-based quiz game that challenges players to spot misinformation,
misleading edits, and out-of-context media — and to practise the habits of
fact-checking. Built with vanilla HTML, CSS, and JavaScript, and intended
to be wrapped with **Tauri** (Rust backend) later for a native desktop
release.

---

## How the Game Works

1. **Menu** — Start the game, browse unlocked facts, view credits, or reset
   progress.
2. **A run** lasts **15 levels**. Level 1 starts when you click Start Game;
   level 15 ends with a Game Complete card.
3. **Each level** presents a *question*: one or more media items (images
   and/or videos) plus a set of answer buttons that depend on the question's
   **mode** (see table below).
4. **Answer** — the player picks one option (or, for Mode 4, checks every
   item they believe is misleading and presses **Submit**). A timer bar
   runs across the top of the game screen.
   - **Correct** → +10 score
   - **Wrong or timed out** → −1 heart
5. **Reveal** — after answering, every item is outlined:
   - **Green outline** → item is trustworthy / unmanipulated
   - **Red outline** → item is misleading, fabricated, or out of context
6. **Interlude** — after each level, one or more cards appear:
   - A **torn note** (only on levels 6–13, and only if a note is still
     undiscovered in this session)
   - A **fact/hint** for that level
   - On level 15, a **Game Complete** card in place of the fact
7. **Hearts** — 3 hearts per session, shown top-left of the game screen.
   Losing all 3 triggers a jumpscare, then the interlude still shows, then
   the run resets and returns to the menu.
8. **Facts & Secrets** — anything you've seen in an interlude is stored in
   the Facts & Hints screen. Facts unlock as you reach their level; torn
   notes unlock as you find them. Progress persists across sessions in
   `localStorage` (key `real-or-fake-progress`). Score, level, and hearts
   do **not** persist — every run starts at level 1, score 0, 3 hearts.

---

## Media Setup

Every image and video goes into **one flat folder**, and every filename
follows a strict pattern so the game can find it.

### Where files go

```
rof/
└── data/
    └── assets/               ← ALL images and videos live here
        ├── set1_q1.jpg
        ├── set1_q2.jpg
        ├── set1_q3.mp4
        ├── set1_q4_a.jpg
        ├── set1_q4_b.jpg
        └── ...
```

No subfolders, no per-set folders. Flat.

### Naming pattern

| Pattern | Use |
|---|---|
| `set<N>_q<M>.jpg` | One image for question M in set N |
| `set<N>_q<M>.mp4` | One video for question M in set N |
| `set<N>_q<M>_a.jpg` | First item of a multi-item question |
| `set<N>_q<M>_b.jpg` | Second item |
| `set<N>_q<M>_c.mp4` | Third item, this one a video |

- `N` = set number (matches `questions_<N>.json`)
- `M` = question number inside that set (1–20)
- Suffix `_a` / `_b` / `_c` / `_d` only when a question needs **more than
  one** media item (Modes 2, 3, 4)

Examples:

```
set1_q1.jpg       # single image, question 1 of set 1
set1_q7_a.jpg     # first item of a 2-item question
set1_q7_b.mp4     # second item, a video
set2_q4.mp4       # video for question 4 of set 2
```

### Format rules

| Type | Allowed format | Extension |
|------|----------------|-----------|
| Image | JPEG only | `.jpg` |
| Video | MP4 (H.264) only | `.mp4` |

`.png`, `.webp`, `.gif`, `.avif`, `.svg`, `.mov`, `.webm`, `.mkv`, `.avi`
are **not supported**. Anything else is skipped and logged as a warning in
the browser console.

**Why only these two:**
- `.jpg` — universal support and small files.
- `.mp4` (H.264) — the only video format that plays identically in every
  modern browser without fallbacks.

### Recommended specs

**Images:**
- Square (1:1). The grid uses `object-fit: cover`, so non-square images
  are cropped.
- 512×512 or 800×800 is plenty. Larger works but loads slower.
- Export as JPEG, quality 80–85. Under 300 KB each is ideal.

**Videos:**
- MP4 with H.264 video and AAC audio (or no audio).
- 1:1 aspect ratio to match the image grid.
- 3–8 seconds. Under 3 MB each.
- Quick ffmpeg recipe to crop, scale, and compress:
  ```bash
  ffmpeg -i input.mov \
    -vf "crop=min(iw\,ih):min(iw\,ih),scale=640:640" \
    -c:v libx264 -crf 28 -preset slow -an \
    output.mp4
  ```

### How each mode uses the files

**Mode 1 — single item: trustworthy or misleading?** (1 item)
```
set1_q1.jpg
```
```json
{
  "id": "q_001",
  "level": 1,
  "mode": 1,
  "images": [{ "id": "img1", "src": "data/assets/set1_q1.jpg" }],
  "answer": "fake",
  "explanation": "The sign's letters are misspelled and don't match any real street."
}
```

**Mode 2 — pick which of N is misleading** (2–4 items, exactly one is)
```
set1_q2_a.jpg
set1_q2_b.jpg
set1_q2_c.jpg
```
```json
{
  "id": "q_002",
  "level": 2,
  "mode": 2,
  "images": [
    { "id": "a", "src": "data/assets/set1_q2_a.jpg" },
    { "id": "b", "src": "data/assets/set1_q2_b.jpg" },
    { "id": "c", "src": "data/assets/set1_q2_c.jpg" }
  ],
  "answer": "b",
  "explanation": "B shows the same photo as A, cropped to hide the original crowd."
}
```

**Mode 3 — pick the misleading item, or All Real / All Fake**
Same file layout as Mode 2, but `answer` can also be `"all_real"` or
`"all_fake"`.
```json
{
  "id": "q_003",
  "level": 3,
  "mode": 3,
  "images": [
    { "id": "a", "src": "data/assets/set1_q3_a.jpg" },
    { "id": "b", "src": "data/assets/set1_q3_b.jpg" }
  ],
  "answer": "all_real",
  "explanation": "Both photos match the original source; neither was edited."
}
```

**Mode 4 — pick every misleading item** (multi-select, more than one)
```json
{
  "id": "q_004",
  "level": 5,
  "mode": 4,
  "images": [
    { "id": "a", "src": "data/assets/set1_q4_a.jpg" },
    { "id": "b", "src": "data/assets/set1_q4_b.jpg" },
    { "id": "c", "src": "data/assets/set1_q4_c.jpg" }
  ],
  "answer": ["a", "c"],
  "explanation": "A is a crop that changes the meaning; C is a flipped photo. B is the original."
}
```

**Video question** — just `.mp4` in `src`
```json
{
  "id": "q_005",
  "level": 6,
  "mode": 1,
  "images": [{ "id": "img1", "src": "data/assets/set1_q5.mp4" }],
  "answer": "fake",
  "explanation": "The clip is sped up — the crowd's motion doesn't match the ambient audio."
}
```

**Mixed image + video** — allowed, mix freely
```json
"images": [
  { "id": "a", "src": "data/assets/set1_q6_a.jpg" },
  { "id": "b", "src": "data/assets/set1_q6_b.mp4" }
]
```

### Media type detection

No `type` field is needed in JSON. The renderer picks the element by
file extension:

- `src` ends in `.jpg` → `<img>`
- `src` ends in `.mp4` → `<video autoplay muted playsinline>` (no loop)

If a question contains a video, the timer **starts when the video ends**
rather than when the question appears.

### Two things that will bite you

1. **Paths are relative to `index.html`, not to the JSON file.** Write
   `data/assets/set1_q1.jpg`, **not** `assets/set1_q1.jpg`, even though
   the JSON file lives in `data/`.
2. **Case sensitivity.** `Set1_Q1.JPG` ≠ `set1_q1.jpg` on Linux and in
   the Tauri build. Stick to lowercase, underscores, no spaces.

---

## Game Modes

Modes are identified by **number** in the question JSON files.

| Mode | Name | Media items | Answer Buttons | `answer` shape |
|:----:|------|:-----------:|----------------|----------------|
|  1   | Single: Trustworthy or Misleading | 1   | `Real`, `Fake`                              | `"real"` or `"fake"` |
|  2   | Pick the misleading item (one of N) | 2–4 | `A is misleading`, `B is misleading`, … | item `id` |
|  3   | Pick the misleading item, or All Real / All Fake | 2–4 | Mode 2 buttons + `All real`, `All fake`     | item `id`, `"all_real"`, `"all_fake"` |
|  4   | Pick every misleading item (multi-select) | 2–4 | Per-item toggles + `Submit`                 | array of item `id`s |

Adding a new mode is a three-line change: one branch in
`choicesForMode()`, one in `isCorrect()`, one in `aiImageIds()`.

> The labels on the buttons (`"Real"` / `"Fake"` / `"A is AI"`) are
> controlled in the `choicesForMode()` function in `main.js`. If you want
> the wording to read differently for the new topic — e.g. `"Trustworthy"`
> / `"Misleading"`, or `"A is misleading"` instead of `"A is AI"` — that's
> a one-line edit per button.

---

## Question Schema

Every question lives in one of the `data/questions_<set>.json` files.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique, e.g. `q_001` |
| `level` | number | Informational — the game shuffles rather than reading this |
| `mode` | 1 \| 2 \| 3 \| 4 | Answer style |
| `images` | array | Always an array, even for Mode 1 |
| `images[].id` | string | Internal id used in `answer` |
| `images[].src` | string | Path to a `.jpg` or `.mp4` |
| `answer` | varies | Depends on mode |
| `explanation` | string | Shown after answering — the clue |
| `timer` | number (optional) | Override the default timer, in seconds |

> The key is named `images` for legacy reasons, but each entry can be
> either an image or a video. See **Media Setup** above.

### Default timer rule

- 1–2 items: 10 seconds
- 3–4 items: 15 seconds
- Video question: timer starts when the video ends, duration follows the
  same 10/15 rule
- Per-question override: add `"timer": 20` to the JSON

### Media grid layout

| Count | Columns |
|:-----:|:-------:|
| 1 | 1 (centered) |
| 2 | 2 |
| 3 | 3 |
| 4 | 2 (2×2) |

Below 700px viewport width everything collapses to one column.

---

## Hearts & Timer

- **3 hearts** per session, shown next to the level counter.
- **Wrong answer** or **timeout** → −1 heart.
- At **0 hearts**: jumpscare plays, the interlude for that level still
  shows, then the run resets and returns to the menu.
- Hearts are **not persisted** across sessions.
- The timer bar drains across the top of the game screen. It pauses when
  the player leaves the game screen or tabs away, and resumes when they
  return.

---

## Facts & Torn Notes

Two kinds of collectible content.

**Facts** (`data/facts.json`) — practical tips and general knowledge
about spotting misinformation: manipulated images, out-of-context
photos, cropped or flipped media, misleading headlines, doctored
screenshots, and the like. Each has an `unlockedAtLevel`; the interlude
for that level shows the fact, and it becomes readable in the Facts
screen afterward.

**Torn notes** (`data/secrets.json`) — fragments of a longer, real story
about the harms caused by online misinformation. These appear as
torn-paper cards **before** the fact slide, on levels **6–13**, one per
level, drawn in a random order from whatever the player hasn't yet
found.

Torn notes are intentionally hidden content. On a fresh save, they show
as `???` in the Facts screen. Only the fact at level 5 ("There's
something else") hints that they exist at all.

Types:

| `type` | Card style |
|--------|------------|
| `hint` | green accent, normal panel |
| `fact` | blue accent, normal panel |
| `incident` | red accent, torn-paper style |

Add a new fact by appending to `data/facts.json`. Add a new note by
appending to `data/secrets.json` (and extending the `NOTE_LEVELS` array
in `main.js` if you need more levels to hold them).

---

## Project Structure

```
rof/
├── index.html
├── main.js
├── style.css
├── README.md
└── data/
    ├── facts.json
    ├── secrets.json
    ├── questions_1.json      # first set (up to 20 questions)
    ├── questions_2.json      # optional, loaded if present
    ├── questions_3.json      # optional
    ├── questions_4.json      # optional
    └── assets/               # all media files
        ├── set1_q1.jpg
        ├── set1_q2.mp4
        ├── set2_q1.jpg
        └── ...
```

---

## Running Locally

The game fetches JSON, so you need a local server — opening
`index.html` directly will fail on CORS.

```bash
# Python 3
python3 -m http.server 8000

# or Node
npx serve
```

Then open <http://localhost:8000>.

### Quick smoke test

To verify your setup works after adding a media file:

1. Drop any square JPEG at `data/assets/set1_q1.jpg`
2. Create `data/questions_1.json` with a single Mode 1 question pointing
   at it
3. Serve and open the page
4. Click **Start Game** — the image should appear with `Real` / `Fake`
   buttons

If you see "No questions loaded", open the browser console — it will
name the exact fetch that failed.

---

## Adding Content

### New question

1. Drop the media into `data/assets/` using the naming pattern
2. Add an entry to `data/questions_<N>.json` with a unique `id`, `mode`,
   `images`, `answer`, and `explanation`
3. Reload — no build step

### New set

1. Create `data/questions_<N+1>.json` with the same top-level shape
2. Put its media in `data/assets/` as `set<N+1>_q1.jpg`, etc.
3. The loader already tries `QUESTION_SETS = [1, 2, 3, 4]`; missing files
   are skipped with a warning, so set 2–4 will just start being picked up
   the moment the file exists

### New fact

Append to `data/facts.json` with `type`, `unlockedAtLevel`, `title`,
`body`, and optionally `source`.

### New torn note

Append to `data/secrets.json` with `type: "incident"`, a `fragmentIndex`,
a `title`, and a `body`. If you add more than 8 notes, extend
`NOTE_LEVELS` in `main.js` to cover more levels.

### New mode (future)

1. Add a `case` to `choicesForMode()` returning an array of
   `{ value, text }` buttons (or a custom renderer if the UI is
   fundamentally different, like Mode 4)
2. Add a `case` to `isCorrect()`
3. Add a `case` to `aiImageIds()` so the reveal outline knows what to
   mark red

---

## Loading Multiple Question Sets

`main.js` fetches every file in:

```js
const QUESTION_SETS = [1, 2, 3, 4];
```

Each is fetched independently. A missing file is logged as a warning and
skipped — the game still runs with whatever sets exist.

For a Tauri build, you'd instead scan `data/` at runtime from the Rust
side and pass the file list to the frontend, so adding a set becomes
"drop the file in and rebuild."

---

## Randomization

- The whole pool is **shuffled once at the start of each session**
  (Fisher–Yates).
- The game walks the pool in order, one question per level.
- On a new game, if the shuffled pool's first question happens to be the
  same as the previous run's first question, the pool is rotated by one
  position so the two runs start on different questions.
- Torn notes are separately shuffled each session from the set of notes
  the player hasn't yet unlocked.

---

## Roadmap

- [x] Menu, Game, Facts, Credits screens
- [x] Modes 1–4 with dynamic media counts
- [x] Local progress persistence (unlocked content only)
- [x] Multi-file question-set loader (missing sets are skipped)
- [x] Randomization strategy (Fisher–Yates shuffle at session start)
- [x] Video (`.mp4`) rendering support (timer waits for video to end)
- [x] Facts and torn notes in `data/facts.json` and `data/secrets.json`
- [x] Hearts system (3 hearts, −1 on wrong/timeout, jumpscare at 0)
- [x] Per-question timer with draining bar, pause on tab-away
- [x] Between-level interlude cards (note first, then fact)
- [x] Game Complete screen after level 15
- [x] Session-based run: 15 levels, score resets on each new game
- [ ] Populate `data/questions_1.json` through `questions_4.json` with real content
- [ ] Rewrite `data/facts.json` around misinformation and fact-checking
- [ ] Rewrite `data/secrets.json` around real misinformation incidents
- [ ] Update the answer-button labels in `main.js` to match the new topic
- [ ] Animation polish (card transitions, score pop, heart-loss shake)
- [ ] Port to Tauri (Rust-side persistence + asset bundling)

---

## Credits

- **Design & code** — Lim Young Liang (Noel Lim)
- **Game idea** — Tan Yong Le & Khor Teng Yuan & Lim Guan Ting
- **Images** — found by Ong Jian Yun & Ooi Yu Jin
- **Built with** — vanilla HTML, CSS, JavaScript
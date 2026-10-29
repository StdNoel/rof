// ============================================================
// State
// ============================================================
const STORAGE_KEY = "real-or-fake-progress";
const LAST_QUESTION_KEY = "real-or-fake-last-q";

// Load every set file that exists. Missing files are skipped.
const QUESTION_SETS = [1, 2, 3, 4];

const MAX_HEARTS = 3;
const MAX_LEVEL = 9;
const MAX_SCORE = 100;
const SCORE_ACCURACY_WEIGHT = 0.8;
const SCORE_SPEED_WEIGHT = 0.2;
const NOTE_LEVELS = [6, 7, 8, 9, 10, 11, 12, 13];

const state = {
    score: 0,
    level: 1,
    hearts: MAX_HEARTS,
    currentQuestion: null,
    answered: false,
    unlockedFactIds: [],
    unlockedSecretIds: [],
    facts: [],
    secrets: [],
    questions: [],
    sessionNotesOrder: [],
    pendingInterlude: [],

    // Guards
    sessionActive: false,
    interludeBusy: false,
    jumpscareInProgress: false,

    // Timer
    timerId: null,
    timerStart: 0,
    timerDurationMs: 0,
    timerStartRemainingMs: 0,
    timerPaused: false,
    timerRemainingMs: 0,
    warnTimeoutId: null,
    timerTickerId: null,
};

// ============================================================
// Persistence — only unlocked facts and notes are persisted.
// Score, level, and hearts are session-only.
// ============================================================
function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        unlockedFactIds: state.unlockedFactIds,
        unlockedSecretIds: state.unlockedSecretIds,
    }));
}

function loadProgress() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        state.unlockedFactIds = data.unlockedFactIds ?? [];
        state.unlockedSecretIds = data.unlockedSecretIds ?? [];
    } catch { }
}

function resetProgress() {
    localStorage.removeItem(STORAGE_KEY);
    state.score = 0;
    state.level = 1;
    state.hearts = MAX_HEARTS;
    state.currentQuestion = null;
    state.answered = false;
    state.unlockedFactIds = [];
    state.unlockedSecretIds = [];
    state.pendingInterlude = [];
    state.sessionActive = false;
    state.interludeBusy = false;
}

// ============================================================
// Shuffle helpers
// ============================================================
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function shuffleQuestions() {
    if (state.questions.length === 0) return;
    shuffleArray(state.questions);

    // Ensure this run's first question differs from the previous run's.
    const lastFirst = localStorage.getItem(LAST_QUESTION_KEY);
    if (lastFirst && state.questions.length > 1 && state.questions[0].id === lastFirst) {
        state.questions.push(state.questions.shift());
    }
    localStorage.setItem(LAST_QUESTION_KEY, state.questions[0].id);
}

// ============================================================
// Screen navigation
// ============================================================
function showScreen(name) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById("screen-" + name).classList.add("active");

    if (name === "facts") renderFacts();

    if (name === "game") {
        if (state.sessionActive) resumeTimer();
    } else {
        pauseTimer();
    }

    scrollToTop();
}

// ============================================================
// Responsive scroll helpers
// ============================================================
function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMobileLayout() {
    return window.matchMedia("(max-width: 700px)").matches;
}

function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

// Freeze the page behind a modal while preserving its scroll offset.
// On iOS, overflow:hidden alone doesn't stop the page from moving.
let modalScrollY = 0;

function lockBodyScroll() {
    if (document.body.classList.contains("modal-open")) return;
    modalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${modalScrollY}px`;
    document.body.classList.add("modal-open");
}

function unlockBodyScroll() {
    if (!document.body.classList.contains("modal-open")) return;
    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, modalScrollY);
}

// After answering, make sure the feedback and Next button are reachable.
// Only scroll when they are off-screen so desktop play is unaffected.
function revealNextAction() {
    if (!isMobileLayout()) return;

    const next = document.getElementById("btn-next");
    if (next.classList.contains("hidden")) return;

    const vv = window.visualViewport;
    const viewTop = vv ? vv.offsetTop : 0;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;

    const rect = next.getBoundingClientRect();
    const fullyVisible = rect.top >= viewTop && rect.bottom <= viewBottom;
    if (fullyVisible) return;

    next.scrollIntoView({
        block: "end",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
}

document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => {
        if (state.jumpscareInProgress) return;
        const target = btn.dataset.goto;

        if (target === "game") {
            // Start a fresh session only from the menu, not when re-entering
            // the game screen from Facts/Credits mid-run.
            const goingToMenu = !state.sessionActive;
            // Show the screen first so the timer bar is rendered before the
            // timer starts; otherwise the CSS width transition never runs.
            showScreen(target);
            if (goingToMenu) {
                startSession();
            }
            return;
        }

        showScreen(target);
    });
});

document.getElementById("btn-reset-progress").addEventListener("click", () => {
    if (confirm("Reset all progress?")) {
        resetProgress();
        updateFactsBadge();
        updateHearts();
        alert("Progress reset.");
    }
});

// ============================================================
// Load data
// ============================================================
async function loadData() {
    const questionPromises = QUESTION_SETS.map(async n => {
        try {
            const res = await fetch(`data/questions_${n}.json`);
            if (!res.ok) {
                console.warn(`Skipping missing question set: questions_${n}.json`);
                return [];
            }
            const json = await res.json();
            return json.questions ?? [];
        } catch (err) {
            console.warn(`Failed to load questions_${n}.json`, err);
            return [];
        }
    });

    const [factRes, secretsRes] = await Promise.all([
        fetch("data/facts.json"),
        fetch("data/secrets.json"),
    ]);

    const questionArrays = await Promise.all(questionPromises);
    state.questions = questionArrays.flat();

    state.facts = (await factRes.json()).facts ?? [];
    state.secrets = (await secretsRes.json()).fragments ?? [];
}

// ============================================================
// Session lifecycle
// ============================================================
function startSession() {
    // Fresh run
    state.score = 0;
    state.level = 1;
    state.hearts = MAX_HEARTS;
    state.answered = false;
    state.pendingInterlude = [];
    state.sessionActive = true;
    state.interludeBusy = false;

    // Shuffle the pool once per session.
    shuffleQuestions();

    // Prepare this run's note order (all notes not yet unlocked, shuffled).
    state.sessionNotesOrder = state.secrets
        .filter(s => !state.unlockedSecretIds.includes(s.id))
        .map(s => s.id);
    shuffleArray(state.sessionNotesOrder);

    updateHearts();
    updateScoreDisplay();
    hideGameComplete();
    startLevel();
}

function endSession() {
    state.answered = false;
    state.sessionActive = false;

    const finalScore = Math.round(Math.min(MAX_SCORE, state.score));
    document.getElementById("game-complete-score").textContent = `${finalScore} / ${MAX_SCORE}`;
    const overlay = document.getElementById("game-complete");
    overlay.classList.remove("hidden");
    clearTimer();
    setTimerReadoutText("--");

    lockBodyScroll();
    overlay.scrollTop = 0;

    // Focus the overlay for keyboard users without nudging the page
    overlay.focus({ preventScroll: true });
}

function hideGameComplete() {
    document.getElementById("game-complete").classList.add("hidden");
    unlockBodyScroll();
}

document.getElementById("game-complete-return").addEventListener("click", () => {
    hideGameComplete();
    state.score = 0;
    state.level = 1;
    state.hearts = MAX_HEARTS;
    state.pendingInterlude = [];
    state.sessionActive = false;
    updateHearts();
    showScreen("menu");
});

// ============================================================
// Question selection
// ============================================================
function pickQuestionForLevel(level) {
    if (state.questions.length === 0) return null;
    const index = (level - 1) % state.questions.length;
    return state.questions[index];
}

// ============================================================
// Helpers
// ============================================================
function labelFor(i) {
    return String.fromCharCode(65 + i);
}

function colsFor(n) {
    if (n <= 1) return 1;
    if (n === 2) return 2;
    if (n === 3) return 3;
    return 2;
}

function mediaIsVideo(src) {
    return src.toLowerCase().endsWith(".mp4");
}

function questionHasVideo(q) {
    return q.images.some(img => mediaIsVideo(img.src));
}

function updateScoreDisplay() {
    const el = document.getElementById("game-score");
    if (el) {
        const score = Math.round(Math.min(MAX_SCORE, state.score));
        el.textContent = `Score: ${score} / ${MAX_SCORE}`;
    }
}

// ============================================================
// Hearts
// ============================================================
function updateHearts() {
    const hearts = document.querySelectorAll("#hearts .heart");
    hearts.forEach((el, i) => {
        el.classList.toggle("lost", i >= state.hearts);
    });
}

function loseHeart() {
    if (state.hearts <= 0) return;
    state.hearts -= 1;
    updateHearts();
}

// ============================================================
// Timer
// ============================================================
function timerDurationForQuestion(q) {
    if (typeof q.timer === "number" && q.timer > 0) return q.timer * 1000;
    return (q.images.length <= 2 ? 10 : 20) * 1000;
}

function getAnswerRemainingMs() {
    if (state.timerPaused) return state.timerRemainingMs;
    if (!state.timerId) return null;
    const elapsed = performance.now() - state.timerStart;
    return Math.max(0, state.timerStartRemainingMs - elapsed);
}

function scoreForCorrectAnswer(remainingMs) {
    const timeFraction = remainingMs !== null && state.timerDurationMs > 0
        ? Math.max(0, Math.min(1, remainingMs / state.timerDurationMs))
        : 0;
    return (MAX_SCORE / MAX_LEVEL) *
        (SCORE_ACCURACY_WEIGHT + SCORE_SPEED_WEIGHT * timeFraction);
}

function setTimerReadoutText(text) {
    const el = document.getElementById("timer-seconds");
    if (el) el.textContent = text;
}

function updateTimerReadout() {
    const seconds = Math.ceil(Math.max(0, state.timerRemainingMs) / 1000);
    setTimerReadoutText(seconds + "s");
}

function tickTimerReadout() {
    if (state.timerPaused || state.answered) return;
    const elapsed = performance.now() - state.timerStart;
    state.timerRemainingMs = Math.max(0, state.timerStartRemainingMs - elapsed);
    updateTimerReadout();
}

function startTimer(durationMs, remainingMs = durationMs) {
    clearTimer();

    const startFraction = durationMs > 0
        ? Math.max(0, Math.min(1, remainingMs / durationMs))
        : 0;

    const bar = document.getElementById("timer-bar");
    bar.classList.remove("warn");
    bar.style.transition = "none";
    bar.style.width = `${startFraction * 100}%`;
    void bar.offsetWidth;

    state.timerDurationMs = durationMs;
    state.timerStartRemainingMs = remainingMs;
    state.timerStart = performance.now();
    state.timerPaused = false;
    state.timerRemainingMs = remainingMs;
    updateTimerReadout();
    state.timerTickerId = setInterval(tickTimerReadout, 200);

    bar.style.transition = `width ${remainingMs}ms linear, background 0.3s, box-shadow 0.3s`;
    requestAnimationFrame(() => {
        bar.style.width = "0%";
    });

    const warnDelay = Math.max(0, remainingMs - 3000);
    state.warnTimeoutId = setTimeout(() => {
        if (!state.answered) bar.classList.add("warn");
    }, warnDelay);

    state.timerId = setTimeout(() => {
        if (!state.answered) onTimeout();
    }, remainingMs);
}

function clearTimer() {
    if (state.timerId) { clearTimeout(state.timerId); state.timerId = null; }
    if (state.warnTimeoutId) { clearTimeout(state.warnTimeoutId); state.warnTimeoutId = null; }
    if (state.timerTickerId) { clearInterval(state.timerTickerId); state.timerTickerId = null; }
}

function pauseTimer() {
    if (!state.timerId || state.timerPaused || state.answered) return;
    state.timerPaused = true;
    clearTimeout(state.timerId);
    state.timerId = null;
    if (state.warnTimeoutId) { clearTimeout(state.warnTimeoutId); state.warnTimeoutId = null; }
    if (state.timerTickerId) { clearInterval(state.timerTickerId); state.timerTickerId = null; }

    const bar = document.getElementById("timer-bar");
    const computed = getComputedStyle(bar).width;
    bar.style.transition = "none";
    bar.style.width = computed;

    const elapsed = performance.now() - state.timerStart;
    state.timerRemainingMs = Math.max(0, state.timerStartRemainingMs - elapsed);
    updateTimerReadout();
}

function resumeTimer() {
    if (!state.timerPaused || state.answered) return;
    state.timerPaused = false;
    if (state.timerRemainingMs > 0) {
        startTimer(state.timerDurationMs, state.timerRemainingMs);
    }
}

// ============================================================
// Game — render
// ============================================================
function startLevel() {
    state.answered = false;
    clearTimer();
    scrollToTop();

    if (state.questions.length === 0) {
        document.getElementById("game-level").textContent = "Level " + state.level;
        updateScoreDisplay();
        document.getElementById("image-grid").innerHTML =
            '<p style="text-align:center;color:var(--muted);grid-column:1/-1">No questions loaded.</p>';
        document.getElementById("choices").innerHTML = "";
        document.getElementById("feedback").classList.add("hidden");
        document.getElementById("btn-next").classList.add("hidden");
        document.getElementById("timer-bar").style.width = "100%";
        setTimerReadoutText("--");
        return;
    }

    state.currentQuestion = pickQuestionForLevel(state.level);
    if (!state.currentQuestion) {
        console.warn("No question available for level", state.level);
        return;
    }

    document.getElementById("game-level").textContent = "Level " + state.level;
    updateScoreDisplay();

    renderImages(state.currentQuestion);
    renderChoices(state.currentQuestion);
    updateHearts();

    const fb = document.getElementById("feedback");
    fb.className = "feedback hidden";
    fb.innerHTML = "";
    document.getElementById("btn-next").classList.add("hidden");

    if (questionHasVideo(state.currentQuestion)) {
        const bar = document.getElementById("timer-bar");
        bar.style.transition = "none";
        bar.style.width = "100%";
        bar.classList.remove("warn");
        state.timerRemainingMs = 0;
        setTimerReadoutText("--");
    } else {
        startTimer(timerDurationForQuestion(state.currentQuestion));
    }
}

function renderImages(q) {
    const grid = document.getElementById("image-grid");
    grid.innerHTML = "";
    grid.dataset.count = q.images.length;
    grid.style.setProperty("--cols", colsFor(q.images.length));

    q.images.forEach((img, i) => {
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.imageId = img.id;

        const lower = img.src.toLowerCase();
        const isVideo = lower.endsWith(".mp4");
        const isImage = lower.endsWith(".jpg");

        if (!isVideo && !isImage) {
            console.warn(`Unsupported media format: ${img.src}`);
        }

        if (isVideo) {
            card.innerHTML = `
                <video src="${img.src}" autoplay muted playsinline></video>
                <div class="label">${labelFor(i)}</div>
            `;
            const video = card.querySelector("video");
            video.addEventListener("ended", () => {
                if (state.answered || state.timerId) return;
                startTimer(timerDurationForQuestion(q));
            });
        } else {
            card.innerHTML = `
                <img src="${img.src}" alt="Option ${labelFor(i)}" />
                <div class="label">${labelFor(i)}</div>
            `;
        }

        grid.appendChild(card);
    });
}

function renderChoices(q) {
    const container = document.getElementById("choices");
    container.innerHTML = "";
    container.classList.remove("multiselect");

    if (q.mode === 4) {
        renderMultiSelectChoices(q, container);
        return;
    }

    const buttons = choicesForMode(q);
    buttons.forEach(({ value, text }) => {
        const b = document.createElement("button");
        b.className = "choice";
        b.textContent = text;
        b.dataset.value = value;
        b.addEventListener("click", () => handleAnswer(value));
        container.appendChild(b);
    });
}

function choicesForMode(q) {
    switch (q.mode) {
        case 1:
            return [
                { value: "real", text: "Real" },
                { value: "fake", text: "Fake" },
            ];
        case 2:
            return q.images.map((img, i) => ({
                value: img.id,
                text: `${labelFor(i)} is Fake`,
            }));
        case 3:
            return [
                ...q.images.map((img, i) => ({
                    value: img.id,
                    text: `${labelFor(i)} is Fake`,
                })),
                { value: "all_real", text: "All real" },
                { value: "all_fake", text: "All fake" },
            ];
        default:
            return [];
    }
}

function renderMultiSelectChoices(q, container) {
    container.classList.add("multiselect");

    q.images.forEach((img, i) => {
        const b = document.createElement("button");
        b.className = "choice toggle";
        b.textContent = `${labelFor(i)} is Fake`;
        b.dataset.imageId = img.id;
        b.addEventListener("click", () => b.classList.toggle("selected"));
        container.appendChild(b);
    });

    const submit = document.createElement("button");
    submit.className = "choice submit";
    submit.textContent = "Submit";
    submit.addEventListener("click", () => {
        const picked = [...container.querySelectorAll(".choice.toggle.selected")]
            .map(el => el.dataset.imageId);
        handleAnswer(picked);
    });
    container.appendChild(submit);
}

// ============================================================
// Game — grading
// ============================================================
async function handleAnswer(value) {
    if (state.answered) return;
    state.answered = true;

    const remainingMs = getAnswerRemainingMs();
    clearTimer();

    const q = state.currentQuestion;
    const correct = isCorrect(q, value);
    const fb = document.getElementById("feedback");

    if (correct) {
        state.score = Math.min(MAX_SCORE, state.score + scoreForCorrectAnswer(remainingMs));
        fb.className = "feedback good";
        fb.innerHTML = `<h3>Correct ✓</h3><p>${q.explanation}</p>`;
    } else {
        loseHeart();
        fb.className = "feedback bad";
        fb.innerHTML = `<h3>Not quite ✗</h3><p>${q.explanation}</p>`;
    }
    fb.classList.remove("hidden");
    document.getElementById("btn-next").classList.remove("hidden");
    updateScoreDisplay();

    freezeTimerBar();
    revealAnswer(q);

    buildInterludeForLevel(state.level);

    if (state.hearts <= 0) {
        state.jumpscareInProgress = true;
        await playJumpscare();
        state.jumpscareInProgress = false;
        document.getElementById("btn-next").textContent = "Continue →";
    }

    revealNextAction();
}

async function onTimeout() {
    if (state.answered) return;
    state.answered = true;
    clearTimer();
    state.timerRemainingMs = 0;
    updateTimerReadout();

    const q = state.currentQuestion;
    const fb = document.getElementById("feedback");

    loseHeart();
    fb.className = "feedback bad";
    fb.innerHTML = `<h3>Time's up ⏱</h3><p>${q.explanation}</p>`;
    fb.classList.remove("hidden");

    document.getElementById("btn-next").classList.remove("hidden");

    document.querySelectorAll("#choices .choice").forEach(el => {
        el.classList.add("disabled");
        el.disabled = true;
    });

    freezeTimerBar();
    revealAnswer(q);

    buildInterludeForLevel(state.level);

    if (state.hearts <= 0) {
        state.jumpscareInProgress = true;
        await playJumpscare();
        state.jumpscareInProgress = false;
        document.getElementById("btn-next").textContent = "Continue →";
    }

    revealNextAction();
}

function freezeTimerBar() {
    const bar = document.getElementById("timer-bar");
    const computed = getComputedStyle(bar).width;
    bar.style.transition = "none";
    bar.style.width = computed;
}

function isCorrect(q, value) {
    switch (q.mode) {
        case 1:
        case 2:
        case 3:
            return value === q.answer;
        case 4: {
            const picked = new Set(value);
            const truth = new Set(q.answer);
            if (picked.size !== truth.size) return false;
            for (const id of picked) if (!truth.has(id)) return false;
            return true;
        }
        default:
            return false;
    }
}

function aiImageIds(q) {
    switch (q.mode) {
        case 1:
            return q.answer === "fake" ? new Set([q.images[0].id]) : new Set();
        case 2:
            return new Set([q.answer]);
        case 3:
            if (q.answer === "all_fake") return new Set(q.images.map(i => i.id));
            if (q.answer === "all_real") return new Set();
            return new Set([q.answer]);
        case 4:
            return new Set(q.answer);
        default:
            return new Set();
    }
}

function revealAnswer(q) {
    const aiIds = aiImageIds(q);
    document.querySelectorAll(".card").forEach(card => {
        const id = card.dataset.imageId;
        card.classList.add(aiIds.has(id) ? "is-ai" : "is-real");
    });
}

// ============================================================
// Interlude builder
// ============================================================
function buildInterludeForLevel(level) {
    state.pendingInterlude = [];

    if (NOTE_LEVELS.includes(level) && state.sessionNotesOrder.length > 0) {
        const nextId = state.sessionNotesOrder.shift();
        const note = state.secrets.find(s => s.id === nextId);
        if (note && !state.unlockedSecretIds.includes(note.id)) {
            state.pendingInterlude.push({ kind: "note", data: note });
        }
    }

    const fact = state.facts.find(f => f.unlockedAtLevel === level);
    if (fact && !state.unlockedFactIds.includes(fact.id)) {
        state.pendingInterlude.push({ kind: "fact", data: fact });
    }

    if (level >= MAX_LEVEL) {
        state.pendingInterlude.push({ kind: "complete" });
    }
}

// ============================================================
// Interlude display
// ============================================================
function showInterlude() {
    const item = state.pendingInterlude[0];
    if (!item) {
        advanceAfterInterlude();
        return;
    }

    if (item.kind === "complete") {
        state.pendingInterlude.shift();
        hideInterlude(false);
        endSession();
        return;
    }

    const el = document.getElementById("interlude");
    const card = document.getElementById("interlude-card");
    const label = document.getElementById("interlude-label");
    const title = document.getElementById("interlude-title");
    const body = document.getElementById("interlude-body");
    const source = document.getElementById("interlude-source");

    card.classList.remove("note");

    if (item.kind === "fact") {
        label.textContent = item.data.teaser ? "A hint of something more" : "New Fact Unlocked";
        label.classList.remove("interlude-label-note");
    } else if (item.kind === "note") {
        label.textContent = "Torn Note Found";
        label.classList.add("interlude-label-note");
        card.classList.add("note");
    }

    title.textContent = item.data.title;
    body.textContent = item.data.body;

    if (item.data.source) {
        source.href = item.data.source;
        source.classList.remove("hidden");
    } else {
        source.classList.add("hidden");
        source.href = "";
    }

    el.classList.remove("hidden");
    lockBodyScroll();
    el.scrollTop = 0;
    el.focus({ preventScroll: true });
}

function hideInterlude(unlock = true) {
    document.getElementById("interlude").classList.add("hidden");
    if (unlock) unlockBodyScroll();
}

function onInterludeContinue() {
    if (state.interludeBusy) return;
    state.interludeBusy = true;

    const item = state.pendingInterlude.shift();
    if (!item) {
        state.interludeBusy = false;
        hideInterlude();
        advanceAfterInterlude();
        return;
    }

    if (item.kind === "fact") {
        if (!state.unlockedFactIds.includes(item.data.id)) {
            state.unlockedFactIds.push(item.data.id);
        }
    } else if (item.kind === "note") {
        if (!state.unlockedSecretIds.includes(item.data.id)) {
            state.unlockedSecretIds.push(item.data.id);
        }
    }
    updateFactsBadge();
    saveProgress();

    if (state.pendingInterlude.length > 0) {
        hideInterlude(false);
        setTimeout(() => {
            state.interludeBusy = false;
            showInterlude();
        }, 200);
        return;
    }

    hideInterlude();
    state.interludeBusy = false;
    advanceAfterInterlude();
}

document.getElementById("interlude-continue").addEventListener("click", onInterludeContinue);

// ============================================================
// Advance after the interlude
// ============================================================
function advanceAfterInterlude() {
    if (state.hearts <= 0) {
        // Death path
        state.score = 0;
        state.level = 1;
        state.hearts = MAX_HEARTS;
        state.pendingInterlude = [];
        state.answered = false;
        state.sessionActive = false;
        updateHearts();
        document.getElementById("btn-next").textContent = "Next →";
        document.getElementById("image-grid").innerHTML = "";
        document.getElementById("choices").innerHTML = "";
        document.getElementById("feedback").classList.add("hidden");
        document.getElementById("btn-next").classList.add("hidden");
        setTimerReadoutText("--");
        showScreen("menu");
        return;
    }

    if (state.level >= MAX_LEVEL) {
        endSession();
        return;
    }

    state.level += 1;
    startLevel();
}

// ============================================================
// Next button
// ============================================================
document.getElementById("btn-next").addEventListener("click", () => {
    if (state.answered === false) return;

    if (state.pendingInterlude.length > 0) {
        showInterlude();
        return;
    }

    advanceAfterInterlude();
});

// ============================================================
// Jumpscare
// ============================================================
function playJumpscare() {
    const app = document.getElementById("app");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) return Promise.resolve();

    app.classList.add("jumpscare");
    return new Promise(resolve => {
        setTimeout(() => {
            app.classList.remove("jumpscare");
            resolve();
        }, 500);
    });
}

// ============================================================
// Facts + Secrets
// ============================================================
function updateFactsBadge() {
    const total = state.facts.length + state.secrets.length;
    const unlocked = state.unlockedFactIds.length + state.unlockedSecretIds.length;
    document.getElementById("facts-badge").textContent = `${unlocked}/${total}`;
}

function renderFacts() {
    const list = document.getElementById("facts-list");
    list.innerHTML = "";

    state.facts.forEach(f => {
        const unlocked = state.unlockedFactIds.includes(f.id);
        const div = document.createElement("div");
        div.className = `fact ${f.type} ${unlocked ? "" : "locked"}`;
        div.innerHTML = unlocked
            ? `<h3>${f.title}</h3>
               <p>${f.body}</p>
               ${f.source ? `<a class="source" href="${f.source}" target="_blank" rel="noopener">Source</a>` : ""}`
            : `<h3>???</h3><p>Unlocks at level ${f.unlockedAtLevel}.</p>`;
        list.appendChild(div);
    });

    if (state.secrets.length > 0) {
        const heading = document.createElement("h2");
        heading.className = "section-heading";
        heading.textContent = "Torn Notes";
        list.appendChild(heading);

        const ordered = [...state.secrets].sort(
            (a, b) => (a.fragmentIndex ?? 0) - (b.fragmentIndex ?? 0)
        );

        ordered.forEach(s => {
            const unlocked = state.unlockedSecretIds.includes(s.id);
            const div = document.createElement("div");
            div.className = `fact ${s.type} note ${unlocked ? "" : "locked"}`;
            div.innerHTML = unlocked
                ? `<h3>${s.title}</h3>
                   <p>${s.body}</p>
                   ${s.source ? `<a class="source" href="${s.source}" target="_blank" rel="noopener">Source</a>` : ""}`
                : `<h3>???</h3><p>A note you haven't found yet.</p>`;
            list.appendChild(div);
        });
    }
}

// ============================================================
// Focus trap for modals
// ============================================================
function trapFocus(container, event) {
    if (event.key !== "Tab") return;
    const focusables = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

document.getElementById("interlude").addEventListener("keydown", e => {
    trapFocus(document.getElementById("interlude"), e);
});
document.getElementById("game-complete").addEventListener("keydown", e => {
    trapFocus(document.getElementById("game-complete"), e);
});

// ============================================================
// Tab visibility: pause the timer when the tab is hidden
// ============================================================
document.addEventListener("visibilitychange", () => {
    const gameVisible = document.getElementById("screen-game").classList.contains("active");
    if (!gameVisible) return;

    if (document.hidden) {
        pauseTimer();
    } else {
        resumeTimer();
    }
});

// ============================================================
// Boot
// ============================================================
(async function init() {
    loadProgress();
    await loadData();
    updateFactsBadge();
    updateHearts();
    showScreen("menu");
})();
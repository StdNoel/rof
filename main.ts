import type { Fact, InterludeItem, Question, SecretFragment } from "./types";

// ============================================================
// DOM helper
// ============================================================
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el as T;
}

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
const NOTE_LEVELS = [6, 7, 8, 9];

interface QuizState {
    score: number;
    level: number;
    hearts: number;
    currentQuestion: Question | null;
    answered: boolean;
    unlockedFactIds: string[];
    unlockedSecretIds: string[];
    facts: Fact[];
    secrets: SecretFragment[];
    questions: Question[];
    sessionNotesOrder: string[];
    pendingInterlude: InterludeItem[];

    // Guards
    sessionActive: boolean;
    interludeBusy: boolean;
    jumpscareInProgress: boolean;

    // Timer
    timerId: ReturnType<typeof setTimeout> | null;
    timerStart: number;
    timerDurationMs: number;
    timerStartRemainingMs: number;
    timerPaused: boolean;
    timerRemainingMs: number;
    warnTimeoutId: ReturnType<typeof setTimeout> | null;
    timerTickerId: ReturnType<typeof setInterval> | null;
}

const state: QuizState = {
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
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            unlockedFactIds: state.unlockedFactIds,
            unlockedSecretIds: state.unlockedSecretIds,
        }),
    );
}

function loadProgress() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
        const data = JSON.parse(raw) as Partial<{
            unlockedFactIds: string[];
            unlockedSecretIds: string[];
        }>;
        state.unlockedFactIds = data.unlockedFactIds ?? [];
        state.unlockedSecretIds = data.unlockedSecretIds ?? [];
    } catch {}
}

function resetProgress() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_QUESTION_KEY);
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
    updateScoreDisplay();
    setTimerReadoutText("--");
}

// ============================================================
// Shuffle helpers
// ============================================================
function shuffleArray<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
}

function shuffleQuestions(): void {
    if (state.questions.length === 0) return;
    shuffleArray(state.questions);

    // Ensure this run's first question differs from the previous run's.
    const lastFirst = localStorage.getItem(LAST_QUESTION_KEY);
    if (
        lastFirst &&
        state.questions.length > 1 &&
        state.questions[0]!.id === lastFirst
    ) {
        state.questions.push(state.questions.shift()!);
    }
    localStorage.setItem(LAST_QUESTION_KEY, state.questions[0]!.id);
}

// ============================================================
// Screen navigation
// ============================================================
function showScreen(name: string): void {
    document
        .querySelectorAll(".screen")
        .forEach((s) => s.classList.remove("active"));
    byId("screen-" + name).classList.add("active");

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
function prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMobileLayout(): boolean {
    return window.matchMedia("(max-width: 700px)").matches;
}

function scrollToTop(): void {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

// Freeze the page behind a modal while preserving its scroll offset.
// On iOS, overflow:hidden alone doesn't stop the page from moving.
let modalScrollY = 0;

function lockBodyScroll(): void {
    if (document.body.classList.contains("modal-open")) return;
    modalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${modalScrollY}px`;
    document.body.classList.add("modal-open");
}

function unlockBodyScroll(): void {
    if (!document.body.classList.contains("modal-open")) return;
    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, modalScrollY);
}

// After answering, make sure the feedback and Next button are reachable.
// Only scroll when they are off-screen so desktop play is unaffected.
function revealNextAction(): void {
    if (!isMobileLayout()) return;

    const next = byId("btn-next");
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

document.querySelectorAll<HTMLElement>("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
        if (state.jumpscareInProgress) return;
        const target = btn.dataset.goto;
        if (!target) return;

        if (target === "minigame") {
            window.location.href = "minigames/";
            return;
        }

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

byId("btn-reset-progress").addEventListener("click", () => {
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
async function loadData(): Promise<void> {
    const questionPromises = QUESTION_SETS.map(async (n) => {
        try {
            const res = await fetch(`data/questions_${n}.json`);
            if (!res.ok) {
                console.warn(
                    `Skipping missing question set: questions_${n}.json`,
                );
                return [] as Question[];
            }
            const json = (await res.json()) as { questions?: Question[] };
            return json.questions ?? [];
        } catch (err) {
            console.warn(`Failed to load questions_${n}.json`, err);
            return [] as Question[];
        }
    });

    const [facts, secrets] = await Promise.all([
        (async (): Promise<Fact[]> => {
            try {
                const res = await fetch("data/facts.json");
                if (!res.ok) {
                    console.warn("Skipping missing facts: facts.json");
                    return [];
                }
                return ((await res.json()) as { facts?: Fact[] }).facts ?? [];
            } catch (err) {
                console.warn("Failed to load facts.json", err);
                return [];
            }
        })(),
        (async (): Promise<SecretFragment[]> => {
            try {
                const res = await fetch("data/secrets.json");
                if (!res.ok) {
                    console.warn("Skipping missing secrets: secrets.json");
                    return [];
                }
                return (
                    ((await res.json()) as { fragments?: SecretFragment[] })
                        .fragments ?? []
                );
            } catch (err) {
                console.warn("Failed to load secrets.json", err);
                return [];
            }
        })(),
    ]);

    const questionArrays = await Promise.all(questionPromises);
    state.questions = questionArrays.flat();
    state.facts = facts;
    state.secrets = secrets;
}

// ============================================================
// Session lifecycle
// ============================================================
function startSession(): void {
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
        .filter((s) => !state.unlockedSecretIds.includes(s.id))
        .map((s) => s.id);
    shuffleArray(state.sessionNotesOrder);

    updateHearts();
    updateScoreDisplay();
    hideGameComplete();
    startLevel();
}

function endSession(): void {
    state.answered = false;
    state.sessionActive = false;

    const finalScore = Math.round(Math.min(MAX_SCORE, state.score));
    byId("game-complete-score").textContent = `${finalScore} / ${MAX_SCORE}`;
    const overlay = byId("game-complete");
    overlay.classList.remove("hidden");
    clearTimer();
    setTimerReadoutText("--");

    lockBodyScroll();
    overlay.scrollTop = 0;

    // Focus the overlay for keyboard users without nudging the page
    overlay.focus({ preventScroll: true });
}

function hideGameComplete(): void {
    byId("game-complete").classList.add("hidden");
    unlockBodyScroll();
}

byId("game-complete-return").addEventListener("click", () => {
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
function pickQuestionForLevel(level: number): Question | null {
    if (state.questions.length === 0) return null;
    const index = (level - 1) % state.questions.length;
    return state.questions[index] ?? null;
}

// ============================================================
// Helpers
// ============================================================
function labelFor(i: number): string {
    return String.fromCharCode(65 + i);
}

function colsFor(n: number): number {
    if (n <= 1) return 1;
    if (n === 2) return 2;
    if (n === 3) return 3;
    return 2;
}

function mediaIsVideo(src: string): boolean {
    return src.toLowerCase().endsWith(".mp4");
}

function questionHasVideo(q: Question): boolean {
    return q.images.some((img) => mediaIsVideo(img.src));
}

const preloadedMedia = new Set<string>();
const preloadedVideos: HTMLVideoElement[] = [];

function preloadMedia(q: Question): void {
    for (const media of q.images) {
        if (preloadedMedia.has(media.src)) continue;
        preloadedMedia.add(media.src);
        if (mediaIsVideo(media.src)) {
            const video = document.createElement("video");
            video.preload = "auto";
            video.muted = true;
            video.src = media.src;
            video.load();
            preloadedVideos.push(video);
        } else {
            const img = new Image();
            img.decoding = "async";
            img.src = media.src;
        }
    }
}

function updateScoreDisplay(): void {
    const el = byId("game-score");
    if (el) {
        const score = Math.round(Math.min(MAX_SCORE, state.score));
        el.textContent = `Score: ${score} / ${MAX_SCORE}`;
    }
}

// ============================================================
// Hearts
// ============================================================
function updateHearts(): void {
    const hearts = document.querySelectorAll("#hearts .heart");
    hearts.forEach((el, i) => {
        el.classList.toggle("lost", i >= state.hearts);
    });
}

function loseHeart(): void {
    if (state.hearts <= 0) return;
    state.hearts -= 1;
    updateHearts();
}

// ============================================================
// Timer
// ============================================================
function timerDurationForQuestion(q: Question): number {
    if (typeof q.timer === "number" && q.timer > 0) return q.timer * 1000;
    return (q.images.length <= 2 ? 10 : 20) * 1000;
}

function getAnswerRemainingMs(): number | null {
    if (state.timerPaused) return state.timerRemainingMs;
    if (!state.timerId) return null;
    const elapsed = performance.now() - state.timerStart;
    return Math.max(0, state.timerStartRemainingMs - elapsed);
}

function scoreForCorrectAnswer(remainingMs: number | null): number {
    const timeFraction =
        remainingMs !== null && state.timerDurationMs > 0
            ? Math.max(0, Math.min(1, remainingMs / state.timerDurationMs))
            : 0;
    return (
        (MAX_SCORE / MAX_LEVEL) *
        (SCORE_ACCURACY_WEIGHT + SCORE_SPEED_WEIGHT * timeFraction)
    );
}

function setTimerReadoutText(text: string): void {
    const el = byId("timer-seconds");
    if (el) el.textContent = text;
}

function updateTimerReadout(): void {
    const seconds = Math.ceil(Math.max(0, state.timerRemainingMs) / 1000);
    setTimerReadoutText(seconds + "s");
}

function tickTimerReadout(): void {
    if (state.timerPaused || state.answered) return;
    const elapsed = performance.now() - state.timerStart;
    state.timerRemainingMs = Math.max(0, state.timerStartRemainingMs - elapsed);
    updateTimerReadout();
}

function startTimer(
    durationMs: number,
    remainingMs: number = durationMs,
): void {
    clearTimer();

    const startFraction =
        durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0;

    const bar = byId("timer-bar");
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

function clearTimer(): void {
    if (state.timerId) {
        clearTimeout(state.timerId);
        state.timerId = null;
    }
    if (state.warnTimeoutId) {
        clearTimeout(state.warnTimeoutId);
        state.warnTimeoutId = null;
    }
    if (state.timerTickerId) {
        clearInterval(state.timerTickerId);
        state.timerTickerId = null;
    }
}

function pauseTimer(): void {
    if (!state.timerId || state.timerPaused || state.answered) return;
    state.timerPaused = true;
    clearTimeout(state.timerId);
    state.timerId = null;
    if (state.warnTimeoutId) {
        clearTimeout(state.warnTimeoutId);
        state.warnTimeoutId = null;
    }
    if (state.timerTickerId) {
        clearInterval(state.timerTickerId);
        state.timerTickerId = null;
    }

    const bar = byId("timer-bar");
    const computed = getComputedStyle(bar).width;
    bar.style.transition = "none";
    bar.style.width = computed;

    const elapsed = performance.now() - state.timerStart;
    state.timerRemainingMs = Math.max(0, state.timerStartRemainingMs - elapsed);
    updateTimerReadout();
}

function resumeTimer(): void {
    if (!state.timerPaused || state.answered) return;
    state.timerPaused = false;
    if (state.timerRemainingMs > 0) {
        startTimer(state.timerDurationMs, state.timerRemainingMs);
    }
}

// ============================================================
// Game — render
// ============================================================
function startLevel(): void {
    state.answered = false;
    clearTimer();
    scrollToTop();

    if (state.questions.length === 0) {
        byId("game-level").textContent = "Level " + state.level;
        updateScoreDisplay();
        byId("image-grid").innerHTML =
            '<p style="text-align:center;color:var(--muted);grid-column:1/-1">No questions loaded.</p>';
        byId("choices").innerHTML = "";
        byId("feedback").classList.add("hidden");
        byId("btn-next").classList.add("hidden");
        byId("timer-bar").style.width = "100%";
        setTimerReadoutText("--");
        return;
    }

    state.currentQuestion = pickQuestionForLevel(state.level);
    if (!state.currentQuestion) {
        console.warn("No question available for level", state.level);
        return;
    }

    byId("game-level").textContent = "Level " + state.level;
    updateScoreDisplay();

    renderImages(state.currentQuestion);
    const nextQuestion = pickQuestionForLevel(state.level + 1);
    if (nextQuestion) preloadMedia(nextQuestion);
    renderChoices(state.currentQuestion);
    updateHearts();

    const fb = byId("feedback");
    fb.className = "feedback hidden";
    fb.innerHTML = "";
    byId("btn-next").classList.add("hidden");

    if (questionHasVideo(state.currentQuestion)) {
        const bar = byId("timer-bar");
        bar.style.transition = "none";
        bar.style.width = "100%";
        bar.classList.remove("warn");
        state.timerRemainingMs = 0;
        setTimerReadoutText("--");
    } else {
        startTimer(timerDurationForQuestion(state.currentQuestion));
    }
}

function renderImages(q: Question): void {
    const grid = byId("image-grid");
    grid.innerHTML = "";
    grid.dataset.count = String(q.images.length);
    grid.style.setProperty("--cols", String(colsFor(q.images.length)));

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
            video?.addEventListener("ended", () => {
                if (state.answered || state.timerId) return;
                startTimer(timerDurationForQuestion(q));
            });
        } else {
            card.innerHTML = `
                <img src="${img.src}" alt="Option ${labelFor(i)}" decoding="async" />
                <div class="label">${labelFor(i)}</div>
            `;
        }

        grid.appendChild(card);
    });
}

function renderChoices(q: Question): void {
    const container = byId("choices");
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

interface ChoiceOption {
    value: string;
    text: string;
}

function choicesForMode(q: Question): ChoiceOption[] {
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

function renderMultiSelectChoices(q: Question, container: HTMLElement): void {
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
        const picked = [
            ...container.querySelectorAll<HTMLElement>(
                ".choice.toggle.selected",
            ),
        ].map((el) => el.dataset.imageId!);
        handleAnswer(picked);
    });
    container.appendChild(submit);
}

// ============================================================
// Game — grading
// ============================================================
type AnswerValue = string | string[];

async function handleAnswer(value: AnswerValue): Promise<void> {
    if (state.answered) return;
    state.answered = true;

    const remainingMs = getAnswerRemainingMs();
    clearTimer();

    const q = state.currentQuestion!;
    const correct = isCorrect(q, value);
    markChoiceButtons(q, value, correct);
    const fb = byId("feedback");

    if (correct) {
        state.score = Math.min(
            MAX_SCORE,
            state.score + scoreForCorrectAnswer(remainingMs),
        );
        fb.className = "feedback good";
        fb.innerHTML = `<h3>Correct ✓</h3><p>${q.explanation}</p>`;
    } else {
        loseHeart();
        fb.className = "feedback bad";
        fb.innerHTML = `<h3>Not quite ✗</h3><p>${q.explanation}</p>`;
    }
    fb.classList.remove("hidden");
    byId("btn-next").classList.remove("hidden");
    updateScoreDisplay();

    freezeTimerBar();
    revealPlayerImageFeedback(q, value);

    buildInterludeForLevel(state.level);

    if (state.hearts <= 0) {
        state.jumpscareInProgress = true;
        await playJumpscare();
        state.jumpscareInProgress = false;
        byId("btn-next").textContent = "Continue →";
    }

    revealNextAction();
}

async function onTimeout(): Promise<void> {
    if (state.answered) return;
    state.answered = true;
    clearTimer();
    state.timerRemainingMs = 0;
    updateTimerReadout();

    const q = state.currentQuestion!;
    const fb = byId("feedback");

    loseHeart();
    fb.className = "feedback bad";
    fb.innerHTML = `<h3>Time's up ⏱</h3><p>${q.explanation}</p>`;
    fb.classList.remove("hidden");

    byId("btn-next").classList.remove("hidden");

    markChoiceButtonsOnTimeout(q);

    freezeTimerBar();

    buildInterludeForLevel(state.level);

    if (state.hearts <= 0) {
        state.jumpscareInProgress = true;
        await playJumpscare();
        state.jumpscareInProgress = false;
        byId("btn-next").textContent = "Continue →";
    }

    revealNextAction();
}

function freezeTimerBar(): void {
    const bar = byId("timer-bar");
    const computed = getComputedStyle(bar).width;
    bar.style.transition = "none";
    bar.style.width = computed;
}

function isCorrect(q: Question, value: AnswerValue): boolean {
    switch (q.mode) {
        case 1:
        case 2:
        case 3:
            return value === q.answer;
        case 4: {
            const picked = new Set(value as string[]);
            const truth = new Set(q.answer);
            if (picked.size !== truth.size) return false;
            for (const id of picked) if (!truth.has(id)) return false;
            return true;
        }
        default:
            return false;
    }
}

function revealPlayerImageFeedback(q: Question, value: AnswerValue): void {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".card"));

    // Mode 1: single image, player said "real" or "fake".
    if (q.mode === 1) {
        const isFake = q.answer === "fake";
        const playerSaidFake = value === "fake";
        cards.forEach((card) => {
            card.classList.add(
                playerSaidFake === isFake ? "pick-correct" : "pick-wrong",
            );
        });
        return;
    }

    // Modes 2 and 3: player picked a single image id, OR (mode 3 only)
    // "all_real" / "all_fake".
    if (q.mode === 2 || q.mode === 3) {
        // Special "all" answers (mode 3 only).
        if (value === "all_real" || value === "all_fake") {
            // If the player's all-real/all-fake read is correct, every
            // card agrees with their judgment → mark them all green.
            // If wrong, they didn't judge individual images, so leave
            // the cards neutral; the button + feedback box carry it.
            if (value === q.answer) {
                cards.forEach((card) => card.classList.add("pick-correct"));
            }
            return;
        }

        // Single-image pick: mark only the chosen card. On a wrong pick,
        // also reveal the true fake card in green so the player learns
        // which one actually was fake.
        const correct = value === q.answer;
        cards.forEach((card) => {
            const id = card.dataset.imageId;
            if (id === value) {
                card.classList.add(correct ? "pick-correct" : "pick-wrong");
            } else if (!correct && id === q.answer) {
                card.classList.add("pick-correct");
            }
        });
        return;
    }

    // Mode 4: multiselect — per-image correctness.
    if (q.mode === 4) {
        const truth = new Set(q.answer);
        const picked = new Set(value as string[]);
        cards.forEach((card) => {
            const id = card.dataset.imageId!;
            const playerFlagged = picked.has(id);
            const isFake = truth.has(id);
            card.classList.add(
                playerFlagged === isFake ? "pick-correct" : "pick-wrong",
            );
        });
        return;
    }
}

function markChoiceButtons(
    q: Question,
    value: AnswerValue,
    correct: boolean,
): void {
    const container = byId("choices");

    if (q.mode === 4) {
        const truth = new Set(q.answer);
        const picked = new Set(value as string[]);
        container
            .querySelectorAll<HTMLButtonElement>(".choice.toggle")
            .forEach((btn) => {
                const id = btn.dataset.imageId!;
                const wasPicked = picked.has(id);
                const isFake = truth.has(id);
                if (wasPicked && isFake) btn.classList.add("correct");
                else if (wasPicked && !isFake) btn.classList.add("wrong");
                else if (!wasPicked && isFake) btn.classList.add("missed");
                btn.disabled = true;
            });
        const submit =
            container.querySelector<HTMLButtonElement>(".choice.submit");
        if (submit) submit.disabled = true;
        return;
    }

    container.querySelectorAll<HTMLButtonElement>(".choice").forEach((btn) => {
        if (btn.dataset.value === value) {
            btn.classList.add(correct ? "correct" : "wrong");
        }
        btn.disabled = true;
    });

    if (!correct) {
        const truthBtn = container.querySelector<HTMLButtonElement>(
            `.choice[data-value="${q.answer}"]`,
        );
        if (truthBtn) truthBtn.classList.add("correct");
    }
}

function markChoiceButtonsOnTimeout(q: Question): void {
    const container = byId("choices");

    if (q.mode === 4) {
        const truth = new Set(q.answer);
        container
            .querySelectorAll<HTMLButtonElement>(".choice.toggle")
            .forEach((btn) => {
                if (truth.has(btn.dataset.imageId!))
                    btn.classList.add("correct");
                btn.disabled = true;
            });
        const submit =
            container.querySelector<HTMLButtonElement>(".choice.submit");
        if (submit) submit.disabled = true;
        return;
    }

    container.querySelectorAll<HTMLButtonElement>(".choice").forEach((btn) => {
        if (btn.dataset.value === q.answer) btn.classList.add("correct");
        btn.disabled = true;
    });
}

// ============================================================
// Interlude builder
// ============================================================
function buildInterludeForLevel(level: number): void {
    state.pendingInterlude = [];

    if (NOTE_LEVELS.includes(level) && state.sessionNotesOrder.length > 0) {
        const nextId = state.sessionNotesOrder.shift();
        const note = state.secrets.find((s) => s.id === nextId);
        if (note && !state.unlockedSecretIds.includes(note.id)) {
            state.pendingInterlude.push({ kind: "note", data: note });
        }
    }

    const fact = state.facts.find((f) => f.unlockedAtLevel === level);
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
function showInterlude(): void {
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

    const el = byId("interlude");
    const card = byId("interlude-card");
    const label = byId("interlude-label");
    const title = byId("interlude-title");
    const body = byId("interlude-body");
    const source = byId<HTMLAnchorElement>("interlude-source");

    card.classList.remove("note");

    if (item.kind === "fact") {
        label.textContent = item.data.teaser
            ? "A hint of something more"
            : "New Fact Unlocked";
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

function hideInterlude(unlock: boolean = true): void {
    byId("interlude").classList.add("hidden");
    if (unlock) unlockBodyScroll();
}

function onInterludeContinue(): void {
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

byId("interlude-continue").addEventListener("click", onInterludeContinue);

// ============================================================
// Advance after the interlude
// ============================================================
function advanceAfterInterlude(): void {
    if (state.hearts <= 0) {
        // Death path
        state.score = 0;
        state.level = 1;
        state.hearts = MAX_HEARTS;
        state.pendingInterlude = [];
        state.answered = false;
        state.sessionActive = false;
        updateHearts();
        byId("btn-next").textContent = "Next →";
        byId("image-grid").innerHTML = "";
        byId("choices").innerHTML = "";
        byId("feedback").classList.add("hidden");
        byId("btn-next").classList.add("hidden");
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
byId("btn-next").addEventListener("click", () => {
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
function playJumpscare(): Promise<void> {
    const app = byId("app");
    const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) return Promise.resolve();

    app.classList.add("jumpscare");
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            app.classList.remove("jumpscare");
            resolve();
        }, 500);
    });
}

// ============================================================
// Facts + Secrets
// ============================================================
function updateFactsBadge(): void {
    const total = state.facts.length + state.secrets.length;
    const unlocked =
        state.unlockedFactIds.length + state.unlockedSecretIds.length;
    byId("facts-badge").textContent = `${unlocked}/${total}`;
}

function renderFacts(): void {
    const list = byId("facts-list");
    list.innerHTML = "";

    state.facts.forEach((f) => {
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
            (a, b) => (a.fragmentIndex ?? 0) - (b.fragmentIndex ?? 0),
        );

        ordered.forEach((s) => {
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
function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
    if (event.key !== "Tab") return;
    const focusables = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

byId("interlude").addEventListener("keydown", (e) => {
    trapFocus(byId("interlude"), e);
});
byId("game-complete").addEventListener("keydown", (e) => {
    trapFocus(byId("game-complete"), e);
});

// ============================================================
// Tab visibility: pause the timer when the tab is hidden
// ============================================================
document.addEventListener("visibilitychange", () => {
    const gameVisible = byId("screen-game").classList.contains("active");
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
(async function init(): Promise<void> {
    loadProgress();
    await loadData();
    updateFactsBadge();
    updateHearts();
    showScreen("menu");
})();

// ============================================================
// HMR: a quiz run holds timers and DOM listeners, so the safe
// path is to tear down timers and reload the page on update.
// ============================================================
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        clearTimer();
    });
    import.meta.hot.accept(() => {
        location.reload();
    });
}

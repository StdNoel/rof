/* Last Call - standalone darts drinking game */

import { createSfxEngine, type NoiseOptions, type ToneOptions } from "../sfx";

// ============================================================
// Types
// ============================================================
type DartsMode = "solo" | "duo";
type Difficulty = "easy" | "normal" | "hard";
type Screen = "lobby" | "match";
type TimingQuality = "perfect" | "good" | "off";

interface Point { x: number; y: number; }
interface DartThrow { x: number; y: number; score: number; label: string; }
interface DartPlayer { index: 0 | 1; name: string; isBot: boolean; color: string; total: number; roundScore: number; drinks: number; darts: DartThrow[]; dartsThrown: number; }
interface TimingStage { start: number; pos: number; marker: number; offset: number | null; }
type MatchPhase = "toast" | "turnStart" | "pass" | "aim" | "timing" | "flight" | "turnEnd" | "roundEnd" | "drink" | "end";
interface TimingState { stage: "horizontal" | "vertical" | "done"; finalAim: Point | null; horizontal: TimingStage; vertical: TimingStage; }
interface DartsMatch { mode: DartsMode; difficulty: Difficulty; round: number; starter: 0 | 1; active: 0 | 1; turnsTaken: number; dartsLeft: number; phase: MatchPhase; players: [DartPlayer, DartPlayer]; winner: number | null; blacked: number[]; lockedAim: Point | null; timing: TimingState | null; recorded?: boolean; lastLosers?: number[]; }
interface Flight { from: Point; to: Point; start: number; player: 0 | 1; color: string; isP2: boolean; }
interface ScoreResult { score: number; label: string; ring: "miss" | "bull" | "outer-bull" | "single" | "triple" | "double"; sector: number; mult: number; }
interface Popup { x: number; y: number; text: string; color: string; age: number; life: number; }
interface BotPlan { aim: Point; targetAt: number; }
interface SoloRecord { wins: number; losses: number; best: number | null; }
interface DuoRecord { p1: number; p2: number; bestP1: number | null; bestP2: number | null; }
interface Records { solo: Record<Difficulty, SoloRecord>; duo: DuoRecord; }
interface Settings { muted: boolean; reducedEffects: boolean; }
interface GameState { mode: DartsMode; difficulty: Difficulty; settings: Settings; records: Records; screen: Screen; match: DartsMatch | null; timers: ReturnType<typeof setTimeout>[]; paused: boolean; pendingResume: boolean; pausedAt: number; }
interface DrunkLevel { label: string; sigma: number; sway: number; }
interface DifficultyConfig { name: string; baseSigma: number; }
interface RawSoloRecord { wins: number; losses: number; best: number; }
interface RawDuoRecord { p1: number; p2: number; best: number; bestP1: number; bestP2: number; }
interface RawRecords { solo?: Record<string, RawSoloRecord>; duo?: RawDuoRecord; }

interface DomCache {
    screenLobby: HTMLElement; screenMatch: HTMLElement; lobbyMute: HTMLElement; matchMute: HTMLElement;
    difficultyField: HTMLElement; effectsToggle: HTMLElement; startBtn: HTMLElement; recordsLine: HTMLElement; resetRecords: HTMLElement;
    quitBtn: HTMLElement; hudRound: HTMLElement; hudTurn: HTMLElement; board: HTMLCanvasElement; fx: HTMLCanvasElement;
    boardStage: HTMLElement; boardFrame: HTMLElement; turnBanner: HTMLElement; dartsLeft: HTMLElement; statusLine: HTMLElement; live: HTMLElement;
    timingUi: HTMLElement; timingH: HTMLElement; timingV: HTMLElement; timingHMarker: HTMLElement; timingVMarker: HTMLElement; timingCaption: HTMLElement;
    startOverlay: HTMLElement; startTitle: HTMLElement; startContinue: HTMLElement;
    passOverlay: HTMLElement; passKicker: HTMLElement; passTitle: HTMLElement; passSub: HTMLElement; passContinue: HTMLElement;
    roundOverlay: HTMLElement; roundKicker: HTMLElement; roundTitle: HTMLElement; roundSub: HTMLElement; drinkRow: HTMLElement;
    roundContinue: HTMLElement; endOverlay: HTMLElement; endKicker: HTMLElement; endTitle: HTMLElement; endSub: HTMLElement;
    endRematch: HTMLElement; endLobby: HTMLElement; quitOverlay: HTMLElement; quitCancel: HTMLElement; quitConfirm: HTMLElement;
    modeCards: HTMLElement[]; difficultyButtons: HTMLElement[];
    panels: [HTMLElement, HTMLElement]; turnChips: [HTMLElement, HTMLElement]; names: [HTMLElement, HTMLElement];
    totals: [HTMLElement, HTMLElement]; roundScores: [HTMLElement, HTMLElement]; sips: [HTMLElement, HTMLElement];
    roundNames: [HTMLElement, HTMLElement]; roundVals: [HTMLElement, HTMLElement];
    endNames: [HTMLElement, HTMLElement]; endDrinks: [HTMLElement, HTMLElement];
    endDarts: [HTMLElement, HTMLElement]; endTotals: [HTMLElement, HTMLElement];
    ctx: CanvasRenderingContext2D; fxCtx: CanvasRenderingContext2D;
}

interface ViewState { size: number; dpr: number; cx: number; cy: number; R: number; }
interface InputState {
    pointer: Point | null;
    hover: Point | null;
    keyboard: Point | null;
    lastDevice: "touch" | "pointer";
}
interface DragState { active: boolean; pointerId: number | null; point: Point | null; }

// ============================================================
    // Config
    // ============================================================
    const SETTINGS_KEY = "lc-settings-v1";
    const RECORDS_KEY = "lc-best-v1";
    const DRINK_LIMIT = 5;
    const DARTS_PER_TURN = 3;
const FLIGHT_MS = 260;
const TURN_PAUSE_MS = 520;
const BOT_PAUSE_MS = 640;
const TIMING_BASE_PERIOD = 1150;
const TIMING_MIN_PERIOD = 500;
const TIMING_MAX_OFFSET = 0.13;
const TIMING_STOP_MS = 260;

    const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

    const RINGS = {
        bull: 0.037,
        outerBull: 0.093,
        tripleIn: 0.58,
        tripleOut: 0.63,
        doubleIn: 0.95,
        doubleOut: 1,
    };

    const DRUNK: DrunkLevel[] = [
        { label: "Sober", sigma: 0.018, sway: 0 },
        { label: "Tipsy", sigma: 0.028, sway: 0.3 },
        { label: "Buzzed", sigma: 0.045, sway: 0.6 },
        { label: "Wasted", sigma: 0.07, sway: 1 },
        { label: "Seeing Double", sigma: 0.1, sway: 1.6 },
        { label: "Blackout", sigma: 0.1, sway: 1.6 },
    ];

    const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
        easy: { name: "Rookie", baseSigma: 0.085 },
        normal: { name: "Regular", baseSigma: 0.05 },
        hard: { name: "Legend", baseSigma: 0.025 },
    };

    const COLORS = { p1: "#ffb347", p2: "#2ee6d0" };
    const PLAYER_NAMES: [string, string] = ["Player 1", "Player 2"];
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointerQuery = window.matchMedia("(any-pointer: coarse)");

    function isTouchDevice(): boolean {
        return coarsePointerQuery.matches || navigator.maxTouchPoints > 0;
    }

    function prefersTouchUi(): boolean {
        return input.lastDevice === "touch";
    }

    // ============================================================
    // Helpers
    // ============================================================
    function clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    function rand(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    function pick<T>(list: readonly T[]): T {
        return list[Math.floor(Math.random() * list.length)]!;
    }

    function gauss(): number {
        let u = 0;
        let v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function rad(degrees: number): number {
        return (degrees * Math.PI) / 180;
    }

function adjustSigma(sigma: number, drinks: number): number {
    return sigma * (DRUNK[drinks]!.sigma / DRUNK[0]!.sigma);
}

function timingPeriod(drinks: number): number {
    return Math.max(TIMING_MIN_PERIOD, TIMING_BASE_PERIOD * Math.pow(0.86, drinks));
}

function timingPosition(start: number, now: number, period: number): number {
    const phase = ((now - start) / period) % 1;
    return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

function timingQuality(offset: number): TimingQuality {
    const distance = Math.abs(offset);
    if (distance <= 0.08) return "perfect";
    if (distance <= 0.22) return "good";
    return "off";
}

    function makeRecord(): SoloRecord {
        return { wins: 0, losses: 0, best: null };
    }

    function makeDuoRecord(): DuoRecord {
        return { p1: 0, p2: 0, bestP1: null, bestP2: null };
    }

    // ============================================================
    // Persistence
    // ============================================================
    function loadSettings(): Settings {
        const defaults: Settings = { muted: false, reducedEffects: false };
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return defaults;
            const data = JSON.parse(raw) as Record<string, unknown>;
            return {
                muted: Boolean(data.muted),
                reducedEffects: Boolean(data.reducedEffects),
            };
        } catch (err) {
            return defaults;
        }
    }

    function saveSettings(): void {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
        } catch (err) { /* storage unavailable */ }
    }

    function loadRecords(): Records {
        const defaults: Records = {
            solo: { easy: makeRecord(), normal: makeRecord(), hard: makeRecord() },
            duo: makeDuoRecord(),
        };
        try {
            const raw = localStorage.getItem(RECORDS_KEY);
            if (!raw) return defaults;
            const data = JSON.parse(raw) as RawRecords;
            for (const key of ["easy", "normal", "hard"] as const) {
                const record = data && data.solo && data.solo[key];
                if (record && typeof record === "object") {
                    defaults.solo[key] = {
                        wins: Number.isFinite(record.wins) ? Math.max(0, Math.floor(record.wins)) : 0,
                        losses: Number.isFinite(record.losses) ? Math.max(0, Math.floor(record.losses)) : 0,
                        best: Number.isFinite(record.best) && record.best > 0 ? Math.floor(record.best) : null,
                    };
                }
            }
            if (data && data.duo && typeof data.duo === "object") {
                const duo = data.duo;
                const hasBestP1 = Object.prototype.hasOwnProperty.call(duo, "bestP1");
                const hasBestP2 = Object.prototype.hasOwnProperty.call(duo, "bestP2");
                const legacyBest = Number.isFinite(duo.best) && duo.best > 0
                    ? Math.floor(duo.best)
                    : null;
                defaults.duo.p1 = Number.isFinite(duo.p1) ? Math.max(0, Math.floor(duo.p1)) : 0;
                defaults.duo.p2 = Number.isFinite(duo.p2) ? Math.max(0, Math.floor(duo.p2)) : 0;
                defaults.duo.bestP1 = hasBestP1
                    ? (Number.isFinite(duo.bestP1) && duo.bestP1 > 0 ? Math.floor(duo.bestP1) : null)
                    : legacyBest;
                defaults.duo.bestP2 = hasBestP2
                    ? (Number.isFinite(duo.bestP2) && duo.bestP2 > 0 ? Math.floor(duo.bestP2) : null)
                    : legacyBest;
            }
        } catch (err) { /* use defaults */ }
        return defaults;
    }

    function saveRecords(): void {
        try {
            localStorage.setItem(RECORDS_KEY, JSON.stringify(state.records));
        } catch (err) { /* storage unavailable */ }
    }

    // ============================================================
    // State & DOM
    // ============================================================
    const state: GameState = {
        mode: "solo",
        difficulty: "normal",
        settings: loadSettings(),
        records: loadRecords(),
        screen: "lobby",
        match: null,
        timers: [],
        paused: false,
        pendingResume: false,
        pausedAt: 0,
    };

    const dom = {} as DomCache;
    const view: ViewState = { size: 0, dpr: 1, cx: 0, cy: 0, R: 0 };
    const input: InputState = {
        pointer: null,
        hover: null,
        keyboard: null,
        lastDevice: isTouchDevice() ? "touch" : "pointer",
    };
    const drag: DragState = { active: false, pointerId: null, point: null };
    const popups: Popup[] = [];
    const sfxEngine = createSfxEngine(state.settings.muted);

    let boardBuffer: HTMLCanvasElement | null = null;
    let boardDirty = true;
    let sceneLevel = -1;
    let sceneReduced = false;
    let forceRender = false;
    let timingCaptionCache = "";
    let timingStageCache = "";
    let timingMarkerCacheH = NaN;
    let timingMarkerCacheV = NaN;
    let flight: Flight | null = null;
    let botPlan: BotPlan | null = null;
    let lastFrame = 0;
    let rafId = 0;

    function byId<T extends HTMLElement = HTMLElement>(id: string): T {
        const el = document.getElementById(id);
        if (!el) throw new Error(`Missing element #${id}`);
        return el as T;
    }

    function cacheDom(): void {
        dom.screenLobby = byId("screen-lobby");
        dom.screenMatch = byId("screen-match");
        dom.lobbyMute = byId("lobby-mute");
        dom.matchMute = byId("match-mute");
        dom.difficultyField = byId("difficulty-field");
        dom.effectsToggle = byId("effects-toggle");
        dom.startBtn = byId("start-btn");
        dom.recordsLine = byId("records-line");
        dom.resetRecords = byId("reset-records");
        dom.quitBtn = byId("quit-btn");
        dom.hudRound = byId("hud-round");
        dom.hudTurn = byId("hud-turn");
        dom.board = byId<HTMLCanvasElement>("board");
        dom.fx = byId<HTMLCanvasElement>("fx");
        dom.boardStage = byId("board-stage");
        dom.boardFrame = byId("board-frame");
        dom.turnBanner = byId("turn-banner");
        dom.dartsLeft = byId("darts-left");
        dom.statusLine = byId("status-line");
        dom.live = byId("live");
        dom.timingUi = byId("timing-ui");
        dom.timingH = byId("timing-h");
        dom.timingV = byId("timing-v");
        dom.timingHMarker = byId("timing-h-marker");
        dom.timingVMarker = byId("timing-v-marker");
        dom.timingCaption = byId("timing-caption");
        dom.startOverlay = byId("start-overlay");
        dom.startTitle = byId("start-title");
        dom.startContinue = byId("start-continue");
        dom.passOverlay = byId("pass-overlay");
        dom.passKicker = byId("pass-kicker");
        dom.passTitle = byId("pass-title");
        dom.passSub = byId("pass-sub");
        dom.passContinue = byId("pass-continue");
        dom.roundOverlay = byId("round-overlay");
        dom.roundKicker = byId("round-kicker");
        dom.roundTitle = byId("round-title");
        dom.roundSub = byId("round-sub");
        dom.drinkRow = byId("drink-row");
        dom.roundContinue = byId("round-continue");
        dom.endOverlay = byId("end-overlay");
        dom.endKicker = byId("end-kicker");
        dom.endTitle = byId("end-title");
        dom.endSub = byId("end-sub");
        dom.endRematch = byId("end-rematch");
        dom.endLobby = byId("end-lobby");
        dom.quitOverlay = byId("quit-overlay");
        dom.quitCancel = byId("quit-cancel");
        dom.quitConfirm = byId("quit-confirm");

        dom.modeCards = Array.from(document.querySelectorAll<HTMLElement>("[data-mode]"));
        dom.difficultyButtons = Array.from(document.querySelectorAll<HTMLElement>("[data-difficulty]"));
        dom.panels = [byId("panel-0"), byId("panel-1")];
        dom.turnChips = [byId("turn-chip-0"), byId("turn-chip-1")];
        dom.names = [byId("name-0"), byId("name-1")];
        dom.totals = [byId("total-0"), byId("total-1")];
        dom.roundScores = [byId("round-score-0"), byId("round-score-1")];
        dom.sips = [byId("sips-0"), byId("sips-1")];
        dom.roundNames = [byId("round-name-0"), byId("round-name-1")];
        dom.roundVals = [byId("round-val-0"), byId("round-val-1")];
        dom.endNames = [byId("end-name-0"), byId("end-name-1")];
        dom.endDrinks = [byId("end-drinks-0"), byId("end-drinks-1")];
        dom.endDarts = [byId("end-darts-0"), byId("end-darts-1")];
        dom.endTotals = [byId("end-total-0"), byId("end-total-1")];
        dom.ctx = dom.board.getContext("2d") as CanvasRenderingContext2D;
        dom.fxCtx = dom.fx.getContext("2d") as CanvasRenderingContext2D;
    }

    function announce(text: string): void {
        if (dom.live) dom.live.textContent = text;
    }

    function focusBoard(): void {
        if (dom.board && typeof dom.board.focus === "function") {
            dom.board.focus({ preventScroll: true });
        }
    }

    function clearTimers(): void {
        for (const id of state.timers) clearTimeout(id);
        state.timers = [];
    }

    function later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
        const id = setTimeout(() => {
            state.timers = state.timers.filter((timer) => timer !== id);
            if (state.paused) {
                state.pendingResume = true;
                return;
            }
            fn();
        }, ms);
        state.timers.push(id);
        return id;
    }

    // ============================================================
    // Audio (shared WebAudio engine)
    // ============================================================
    function ensureAudio(): void {
        sfxEngine.resume();
    }

    function tone(freq: number, duration: number, type?: OscillatorType, gain?: number, slideTo?: number | null, delay?: number, extra?: ToneOptions): void {
        sfxEngine.tone(freq, duration, { type, gain, slideTo, delay, ...extra });
    }

    function noiseBurst(duration: number, gain?: number, filterFreq?: number, delay?: number, extra?: NoiseOptions): void {
        sfxEngine.noise(duration, { gain, filterFreq, delay, ...extra });
    }

    function sfx(name: string): void {
        switch (name) {
            case "click":
                tone(340, 0.06, "square", 0.028, null, 0, { reverb: 0.08 });
                break;
            case "whoosh":
                noiseBurst(0.18, 0.055, 1200, 0, { reverb: 0.16 });
                break;
            case "thunk":
                tone(150, 0.2, "triangle", 0.12, 58, 0, { sub: true, drive: 0.2 });
                noiseBurst(0.07, 0.04, 500, 0, { reverb: 0.18 });
                break;
            case "tick":
                tone(620, 0.09, "sine", 0.055, null, 0, { reverb: 0.08 });
                break;
            case "bull":
                tone(660, 0.14, "sine", 0.08, null, 0, { detune: 8, reverb: 0.24 });
                tone(990, 0.24, "sine", 0.07, null, 0.09, { detune: 8, reverb: 0.26 });
                break;
            case "glug":
                tone(300, 0.12, "triangle", 0.07, 190, 0, { reverb: 0.14 });
                tone(260, 0.12, "triangle", 0.06, 160, 0.1, { reverb: 0.14 });
                tone(220, 0.16, "triangle", 0.055, 130, 0.2, { reverb: 0.14 });
                break;
            case "sting":
                tone(220, 0.4, "sawtooth", 0.06, 90, 0, { sub: true, drive: 0.2, reverb: 0.24 });
                break;
            case "blackout":
                tone(78, 1.35, "sine", 0.13, 38, 0, { sub: true, reverb: 0.3 });
                tone(117, 1.05, "triangle", 0.05, 55, 0.05, { detune: 6, reverb: 0.28 });
                tone(82, 1.3, "sine", 0.06, 44, 0.18, { sub: true, reverb: 0.3 });
                noiseBurst(0.95, 0.035, 240, 0, { reverb: 0.28 });
                break;
            case "win":
                tone(523, 0.17, "sine", 0.07, null, 0, { detune: 8, reverb: 0.26 });
                tone(659, 0.17, "sine", 0.07, null, 0.12, { detune: 8, reverb: 0.28 });
                tone(784, 0.3, "sine", 0.08, null, 0.24, { detune: 8, reverb: 0.3 });
                break;
            default:
                break;
        }
    }

    // ============================================================
    // Board geometry, rendering & scoring
    // ============================================================
    const BOARD = {
        black: "#1b1510",
        cream: "#ecdfc4",
        red: "#b8342f",
        green: "#2f8a58",
        wire: "rgba(225, 235, 245, 0.5)",
        rim: "#ffb347",
    };

    function annularSector(ctx: CanvasRenderingContext2D, cx: number, cy: number, inner: number, outer: number, start: number, end: number): void {
        ctx.beginPath();
        ctx.arc(cx, cy, outer, start, end);
        ctx.arc(cx, cy, inner, end, start, true);
        ctx.closePath();
    }

    function drawBoard(ctx: CanvasRenderingContext2D, size: number, cx: number, cy: number, R: number): void {
        ctx.clearRect(0, 0, size, size);

        const backdrop = ctx.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R * 1.2);
        backdrop.addColorStop(0, "#2a1d12");
        backdrop.addColorStop(0.62, "#140d08");
        backdrop.addColorStop(1, "rgba(6, 4, 3, 0)");
        ctx.fillStyle = backdrop;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.17, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < 20; i += 1) {
            const start = rad(-90 + i * 18 - 9);
            const end = start + rad(18);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, R, start, end);
            ctx.closePath();
            ctx.fillStyle = i % 2 === 0 ? BOARD.black : BOARD.cream;
            ctx.fill();
        }

        for (let i = 0; i < 20; i += 1) {
            const start = rad(-90 + i * 18 - 9);
            const end = start + rad(18);
            const color = i % 2 === 0 ? BOARD.red : BOARD.green;
            ctx.fillStyle = color;
            annularSector(ctx, cx, cy, R * RINGS.tripleIn, R * RINGS.tripleOut, start, end);
            ctx.fill();
            annularSector(ctx, cx, cy, R * RINGS.doubleIn, R * RINGS.doubleOut, start, end);
            ctx.fill();
        }

        ctx.fillStyle = BOARD.green;
        ctx.beginPath();
        ctx.arc(cx, cy, R * RINGS.outerBull, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = BOARD.red;
        ctx.beginPath();
        ctx.arc(cx, cy, R * RINGS.bull, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = BOARD.wire;
        ctx.lineWidth = Math.max(1, size * 0.0018);

        for (let i = 0; i < 20; i += 1) {
            const angle = rad(-90 + i * 18 - 9);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * R * RINGS.outerBull, cy + Math.sin(angle) * R * RINGS.outerBull);
            ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
            ctx.stroke();
        }

        for (const ring of [RINGS.bull, RINGS.outerBull, RINGS.tripleIn, RINGS.tripleOut, RINGS.doubleIn, RINGS.doubleOut]) {
            ctx.beginPath();
            ctx.arc(cx, cy, R * ring, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.save();
        ctx.strokeStyle = BOARD.rim;
        ctx.shadowColor = "rgba(255, 179, 71, 0.85)";
        ctx.shadowBlur = Math.max(8, size * 0.026);
        ctx.lineWidth = Math.max(2, size * 0.005);
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.015, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = BOARD.cream;
        ctx.font = "600 " + Math.round(R * 0.105) + "px " + '"Courier New", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(255, 179, 71, 0.5)";
        ctx.shadowBlur = Math.max(3, size * 0.008);
        for (let i = 0; i < 20; i += 1) {
            const angle = rad(-90 + i * 18);
            const nx = Math.cos(angle) * R * 1.085;
            const ny = Math.sin(angle) * R * 1.085;
            ctx.fillText(String(SECTORS[i]!), cx + nx, cy + ny);
        }
        ctx.shadowBlur = 0;
    }

    function scoreAt(nx: number, ny: number): ScoreResult {
        const r = Math.hypot(nx, ny);
        if (r > RINGS.doubleOut) {
            return { score: 0, label: "MISS", ring: "miss", sector: 0, mult: 0 };
        }
        if (r <= RINGS.bull) {
            return { score: 50, label: "BULL", ring: "bull", sector: 0, mult: 1 };
        }
        if (r <= RINGS.outerBull) {
            return { score: 25, label: "25", ring: "outer-bull", sector: 0, mult: 1 };
        }
        let angle = Math.atan2(nx, -ny) * 180 / Math.PI;
        if (angle < 0) angle += 360;
        const index = Math.floor(((angle + 9) % 360) / 18);
        const sector = SECTORS[index]!;
        let mult = 1;
        let ring: ScoreResult["ring"] = "single";
        if (r >= RINGS.tripleIn && r <= RINGS.tripleOut) {
            mult = 3;
            ring = "triple";
        } else if (r >= RINGS.doubleIn && r <= RINGS.doubleOut) {
            mult = 2;
            ring = "double";
        }
        return {
            score: sector * mult,
            label: (mult === 3 ? "T" : mult === 2 ? "D" : "") + sector,
            ring,
            sector,
            mult,
        };
    }

    function resizeCanvas(): void {
        const size = Math.round(dom.board.clientWidth);
        if (!size) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        view.size = size;
        view.dpr = dpr;
        view.cx = size / 2;
        view.cy = size / 2;
        view.R = size * 0.385;
        dom.board.width = Math.round(size * dpr);
        dom.board.height = Math.round(size * dpr);
        dom.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        dom.fx.width = Math.round(size * dpr);
        dom.fx.height = Math.round(size * dpr);
        dom.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        boardBuffer = document.createElement("canvas");
        boardBuffer.width = Math.round(size * dpr);
        boardBuffer.height = Math.round(size * dpr);
        const bctx = boardBuffer.getContext("2d")!;
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawBoard(bctx, size, view.cx, view.cy, view.R);
        boardDirty = true;
    }

    function targetPoint(sector: number, ring: "single" | "triple" | "double" | "outerBull" | "bull"): Point {
        const index = Math.max(0, SECTORS.indexOf(sector));
        const angle = rad(-90 + index * 18);
        let radius = 0.78;
        if (ring === "triple") radius = (RINGS.tripleIn + RINGS.tripleOut) / 2;
        if (ring === "double") radius = (RINGS.doubleIn + RINGS.doubleOut) / 2;
        if (ring === "outerBull") radius = (RINGS.bull + RINGS.outerBull) / 2;
        if (ring === "bull") radius = 0;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    }

    function pickBotTarget(): Point {
        const difficulty = state.match ? state.match.difficulty : state.difficulty;
        const roll = Math.random();
        const highs = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 16, 14, 12, 11];
        if (difficulty === "easy") {
            if (roll < 0.14) return targetPoint(0, "bull");
            return targetPoint(pick(highs), "single");
        }
        if (difficulty === "hard") {
            if (roll < 0.68) return targetPoint(20, "triple");
            if (roll < 0.82) return targetPoint(19, "triple");
            if (roll < 0.92) return targetPoint(0, "bull");
            return targetPoint(pick([20, 19, 18, 17, 16, 15]), "single");
        }
        if (roll < 0.45) return targetPoint(20, "triple");
        if (roll < 0.7) return targetPoint(19, "triple");
        if (roll < 0.85) return targetPoint(0, "bull");
        return targetPoint(pick([20, 19, 18, 17, 16, 15, 14, 13]), "single");
    }

    function botTimingOffsets(player: DartPlayer): { x: number; y: number } {
        const difficulty = state.match ? state.match.difficulty : state.difficulty;
        const base = difficulty === "easy" ? 0.055 : difficulty === "hard" ? 0.018 : 0.035;
        const sigma = base * (1 + player.drinks * 0.18);
        return { x: gauss() * sigma, y: gauss() * sigma };
    }

    function eventPoint(event: PointerEvent): Point {
        const rect = dom.board.getBoundingClientRect();
        let px;
        let py;
        if (rect.width && rect.height && Number.isFinite(event.clientX) &&
            Number.isFinite(event.clientY)) {
            px = (event.clientX - rect.left) * (view.size / rect.width);
            py = (event.clientY - rect.top) * (view.size / rect.height);
        } else {
            const layout = dom.board.clientWidth || view.size;
            const scale = view.size / layout;
            px = event.offsetX * scale;
            py = event.offsetY * scale;
        }
        return { x: (px - view.cx) / view.R, y: (py - view.cy) / view.R };
    }

    function landingPoint(aim: Point, drinks: number, baseSigma: number): Point {
        const sigma = adjustSigma(baseSigma || DRUNK[0]!.sigma, drinks);
        let x = aim.x + gauss() * sigma;
        let y = aim.y + gauss() * sigma;
        const bigSlip = 0.06 + drinks * 0.04;
        if (Math.random() < bigSlip) {
            const angle = rand(0, Math.PI * 2);
            const distance = rand(0.05, 0.12);
            x += Math.cos(angle) * distance;
            y += Math.sin(angle) * distance;
        }
        return { x: clamp(x, -1.35, 1.35), y: clamp(y, -1.35, 1.35) };
    }

    // ============================================================
    // Canvas overlay drawing
    // ============================================================
    function addPopup(nx: number, ny: number, text: string, color: string): void {
        popups.push({
            x: nx,
            y: ny,
            text,
            color: color || "#f6e9d4",
            age: 0,
            life: 950,
        });
    }

    function drawDart(ctx: CanvasRenderingContext2D, nx: number, ny: number, color: string, slide: number, isP2: boolean): void {
        const x = view.cx + nx * view.R;
        const y = view.cy + ny * view.R + (slide || 0);
        ctx.save();
        ctx.translate(x, y);

        ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
        ctx.lineWidth = Math.max(3, view.size * 0.008);
        ctx.beginPath();
        ctx.moveTo(2, 2);
        ctx.lineTo(16, 18);
        ctx.stroke();

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.6, view.size * 0.0032);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-16, 18);
        ctx.stroke();

        ctx.fillStyle = color;
        if (isP2) {
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(3.4, view.size * 0.0075), 0, Math.PI * 2);
            ctx.fill();
        } else {
            const half = Math.max(3, view.size * 0.0065);
            ctx.fillRect(-half, -half, half * 2, half * 2);
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-16, 18);
        ctx.lineTo(-24, 15);
        ctx.lineTo(-19, 24);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(3, view.size * 0.0065), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawPopups(ctx: CanvasRenderingContext2D, dt: number): void {
        for (let i = popups.length - 1; i >= 0; i -= 1) {
            const popup = popups[i];
            if (!popup) continue;
            popup.age += dt;
            if (popup.age >= popup.life) {
                popups.splice(i, 1);
                continue;
            }
            const progress = popup.age / popup.life;
            const alpha = 1 - progress * progress;
            const x = view.cx + popup.x * view.R;
            const y = view.cy + popup.y * view.R - progress * 26;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = popup.color;
            ctx.font = "700 " + Math.round(view.R * 0.085) + 'px "Courier New", monospace';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 5;
            ctx.fillText(popup.text, x, y);
            ctx.restore();
        }
    }

    function currentAim(): Point | null {
        if (input.keyboard) return input.keyboard;
        if (input.hover) return input.hover;
        return null;
    }

    function effectsReduced(): boolean {
        return state.settings.reducedEffects || reducedMotionQuery.matches;
    }

    function visualDrunkLevel(): number {
        const match = state.match;
        if (!match) return 0;
        if (match.phase === "drink" && match.lastLosers) {
            let level = 0;
            for (const index of match.lastLosers) {
                const player = match.players[index];
                if (player && !player.isBot) level = Math.max(level, Math.min(4, player.drinks));
            }
            return level;
        }
        const active = match.players[match.active];
        if (!active || active.isBot) return 0;
        return Math.min(4, active.drinks);
    }

    function drawReticle(ctx: CanvasRenderingContext2D, aim: Point, drinks: number, time: number, color: string): void {
        const sway = DRUNK[drinks]!.sway;
        const amp = sway * 0.0032;
        const sx = Math.sin(time / 430) * amp;
        const sy = Math.cos(time / 370) * amp * 0.7;
        const x = view.cx + (aim.x + sx) * view.R;
        const y = view.cy + (aim.y + sy) * view.R;
        const r = Math.max(10, view.size * 0.028);

        ctx.save();
        ctx.strokeStyle = color || "#ffb347";
        ctx.fillStyle = color || "#ffb347";
        ctx.lineWidth = Math.max(1.2, view.size * 0.0022);

        if (drinks >= 3) {
            const ghost = (drinks - 1) * view.size * 0.004;
            ctx.globalAlpha = 0.22;
            for (const offset of [-ghost, ghost]) {
                ctx.beginPath();
                ctx.arc(x + offset, y, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - r * 1.5, y);
        ctx.lineTo(x + r * 1.5, y);
        ctx.moveTo(x, y - r * 1.5);
        ctx.lineTo(x, y + r * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, view.size * 0.003), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function updateTimingVisual(now: number): void {
        const match = state.match;
        const timing = match && match.timing;
        if (!match || match.phase !== "timing" || !timing || !dom.timingUi) {
            if (dom.timingUi) dom.timingUi.classList.add("hidden");
            return;
        }

        dom.timingUi.classList.remove("hidden");
        const player = match.players[match.active];
        const period = timingPeriod(player.drinks);
        const frameNow = state.paused ? state.pausedAt : now;

        let stage: "h" | "v" | "none" = "none";
        if (timing.stage === "horizontal") {
            timing.horizontal.pos = timingPosition(timing.horizontal.start, frameNow, period);
            timing.horizontal.marker = timing.horizontal.pos;
            stage = "h";
        } else if (timing.stage === "vertical") {
            timing.vertical.pos = timingPosition(timing.vertical.start, frameNow, period * 0.86);
            timing.vertical.marker = timing.vertical.pos;
            stage = "v";
        }

        if (stage !== timingStageCache) {
            dom.timingH.classList.toggle("active", stage === "h");
            dom.timingV.classList.toggle("active", stage === "v");
            timingStageCache = stage;
        }

        const caption = state.paused
            ? "Timing paused"
            : stage === "h"
                ? "Stop the horizontal bar"
                : stage === "v"
                    ? "Stop the vertical bar"
                    : "Dart away!";
        if (caption !== timingCaptionCache) {
            dom.timingCaption.textContent = caption;
            timingCaptionCache = caption;
        }

        if (timing.horizontal.marker !== timingMarkerCacheH) {
            dom.timingH.style.setProperty("--timing-pos", String(timing.horizontal.marker));
            timingMarkerCacheH = timing.horizontal.marker;
        }
        if (timing.vertical.marker !== timingMarkerCacheV) {
            dom.timingV.style.setProperty("--timing-pos", String(timing.vertical.marker));
            timingMarkerCacheV = timing.vertical.marker;
        }
    }

    function drawFlight(ctx: CanvasRenderingContext2D, now: number): void {
        const activeFlight = flight;
        if (!activeFlight) return;
        const progress = clamp((now - activeFlight.start) / FLIGHT_MS, 0, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const x = activeFlight.from.x + (activeFlight.to.x - activeFlight.from.x) * ease;
        const y = activeFlight.from.y + (activeFlight.to.y - activeFlight.from.y) * ease;
        const lift = Math.sin(progress * Math.PI) * view.R * 0.05;
        drawDart(ctx, x, y, activeFlight.color, -lift, activeFlight.isP2);
    }

    function renderFrame(now: number): void {
        const frameNow = state.paused ? state.pausedAt : now;
        const dt = state.paused ? 0 : (lastFrame ? Math.min(64, now - lastFrame) : 16);
        lastFrame = now;

        if (state.screen !== "match") {
            rafId = requestAnimationFrame(renderFrame);
            return;
        }

        if (state.paused && !forceRender) {
            rafId = requestAnimationFrame(renderFrame);
            return;
        }
        forceRender = false;

        if (dom.ctx && dom.board) {
            if (!boardBuffer || view.size === 0) resizeCanvas();
            if (view.size) {
                const level = visualDrunkLevel();
                const reduced = effectsReduced();
                const match = state.match;

                // The board and landed darts are static between throws, so
                // repaint that layer only when something actually changes.
                if (boardDirty || level !== sceneLevel || reduced !== sceneReduced) {
                    dom.ctx.clearRect(0, 0, view.size, view.size);

                    if (boardBuffer && level >= 3 && !reduced) {
                        const spread = level >= 4 ? view.size * 0.012 : view.size * 0.008;
                        const alpha = level >= 4 ? 0.2 : 0.13;
                        const ghosts: [number, number][] = [
                            [-spread, 0],
                            [spread, 0],
                            [0, -spread * 0.65],
                        ];
                        for (const offset of ghosts) {
                            dom.ctx.globalAlpha = alpha;
                            dom.ctx.drawImage(boardBuffer, offset[0], offset[1], view.size, view.size);
                        }
                        dom.ctx.globalAlpha = 1;
                    }

                    if (boardBuffer) dom.ctx.drawImage(boardBuffer, 0, 0, view.size, view.size);

                    if (match) {
                        for (const player of match.players) {
                            for (const dart of player.darts) {
                                drawDart(dom.ctx, dart.x, dart.y, player.color, 0, player.index === 1);
                            }
                        }
                    }

                    sceneLevel = level;
                    sceneReduced = reduced;
                    boardDirty = false;
                }

                dom.fxCtx.clearRect(0, 0, view.size, view.size);

                if (match) {
                    if (flight) {
                        if (frameNow - flight.start >= FLIGHT_MS) {
                            if (!state.paused) {
                                const finished = flight;
                                flight = null;
                                resolveThrow(finished);
                            } else {
                                drawFlight(dom.fxCtx, frameNow);
                            }
                        } else {
                            drawFlight(dom.fxCtx, frameNow);
                        }
                    }

                    if (match.phase === "aim") {
                        const active = match.players[match.active];
                        if (active.isBot && botPlan) {
                            drawReticle(dom.fxCtx, botPlan.aim, active.drinks, frameNow, COLORS.p2);
                            drawReticle(dom.fxCtx, botPlan.aim, active.drinks, frameNow + 170, COLORS.p2);
                        } else if (!active.isBot) {
                            const aim = currentAim();
                            if (aim) drawReticle(dom.fxCtx, aim, active.drinks, frameNow, active.color);
                        }
                    } else if (match.phase === "timing" && match.lockedAim) {
                        const active = match.players[match.active];
                        drawReticle(dom.fxCtx, match.lockedAim, active.drinks, frameNow, active.color);
                    }

                    updateTimingVisual(frameNow);
                    drawPopups(dom.fxCtx, dt);
                }
            }
        }

        rafId = requestAnimationFrame(renderFrame);
    }

    // ============================================================
    // Match engine
    // ============================================================
    function showScreen(name: "lobby" | "match"): void {
        state.screen = name;
        dom.screenLobby.classList.toggle("active", name === "lobby");
        dom.screenMatch.classList.toggle("active", name === "match");
        if (name === "match") {
            requestAnimationFrame(() => {
                resizeCanvas();
            });
        }
    }

    function hideOverlays(): void {
        for (const overlay of [dom.startOverlay, dom.passOverlay, dom.roundOverlay, dom.endOverlay, dom.quitOverlay]) {
            overlay.classList.add("hidden");
        }
    }

    function updateMuteButtons(): void {
        const enabled = !state.settings.muted;
        for (const button of [dom.lobbyMute, dom.matchMute]) {
            button.setAttribute("aria-pressed", String(enabled));
            button.setAttribute("aria-label", enabled ? "Sound on" : "Sound off");
            button.setAttribute("title", enabled ? "Sound on" : "Sound off");
        }
    }

    function startMatch(): void {
        ensureAudio();
        clearTimers();
        hideOverlays();
        state.paused = false;
        state.pendingResume = false;
        sfx("click");
        const difficulty = state.difficulty;
        const match: DartsMatch = {
            mode: state.mode,
            difficulty,
            round: 1,
            starter: 0,
            active: 0,
            turnsTaken: 0,
            dartsLeft: DARTS_PER_TURN,
            phase: "turnStart",
            players: [
                {
                    index: 0,
                    name: PLAYER_NAMES[0],
                    isBot: false,
                    color: COLORS.p1,
                    total: 0,
                    roundScore: 0,
                    drinks: 0,
                    darts: [],
                    dartsThrown: 0,
                },
                {
                    index: 1,
                    name: state.mode === "solo" ? DIFFICULTY[difficulty].name : PLAYER_NAMES[1],
                    isBot: state.mode === "solo",
                    color: COLORS.p2,
                    total: 0,
                    roundScore: 0,
                    drinks: 0,
                    darts: [],
                    dartsThrown: 0,
                },
            ],
            winner: null,
            blacked: [],
            lockedAim: null,
            timing: null,
        };
        state.match = match;

        flight = null;
        botPlan = null;
        popups.length = 0;
        input.pointer = null;
        input.hover = null;
        input.keyboard = null;
        boardDirty = true;

        for (let i = 0; i < 2; i += 1) {
            dom.names[i]!.textContent = match.players[i]!.name;
        }
        updateMuteButtons();
        updateScoreboard();
        updateDrunkVisuals();
        showScreen("match");
        requestAnimationFrame(() => {
            resizeCanvas();
            showStartToast();
        });
    }

    function showStartToast(): void {
        const match = state.match;
        if (!match) return;
        match.phase = "toast";
        updateHud();
        dom.startOverlay.classList.remove("hidden");
        dom.startContinue.focus();
        sfx("click");
    }

    function dismissStartToast(): void {
        const match = state.match;
        if (!match || match.phase !== "toast") return;
        dom.startOverlay.classList.add("hidden");
        sfx("click");
        startRound();
    }

    function startRound(): void {
        const match = state.match;
        if (!match) return;
        clearTimers();
        match.turnsTaken = 0;
        match.active = match.starter;
        match.dartsLeft = DARTS_PER_TURN;
        match.phase = "turnStart";
        match.blacked = [];
        match.lockedAim = null;
        match.timing = null;
        flight = null;
        botPlan = null;
        popups.length = 0;
        input.keyboard = null;
        if (dom.timingUi) dom.timingUi.classList.add("hidden");

        for (const player of match.players) {
            player.roundScore = 0;
            player.darts = [];
        }
        boardDirty = true;

        updateScoreboard();
        updateDrunkVisuals();
        beginTurn();
    }

    function beginTurn(): void {
        const match = state.match;
        if (!match) return;
        const player = match.players[match.active];
        match.phase = "turnStart";
        match.dartsLeft = DARTS_PER_TURN;
        match.lockedAim = null;
        match.timing = null;
        botPlan = null;
        input.keyboard = null;
        if (dom.timingUi) dom.timingUi.classList.add("hidden");
        updateScoreboard();
        updateDrunkVisuals();
        updateHud();

        if (player.isBot) {
            dom.statusLine.textContent = player.name + " is stepping up...";
            later(() => {
                if (!state.match || state.match !== match || match.phase !== "turnStart") return;
                match.phase = "aim";
                botPlan = { aim: pickBotTarget(), targetAt: performance.now() };
                updateHud();
                scheduleBotThrow();
            }, BOT_PAUSE_MS);
            return;
        }

        if (match.mode === "duo") {
            showPassOverlay(player);
            return;
        }

        match.phase = "aim";
        updateHud();
        announce(player.name + " to throw. Three darts.");
        focusBoard();
    }

    function showPassOverlay(player: DartPlayer): void {
        const match = state.match;
        if (!match) return;
        match.phase = "pass";
        dom.passKicker.textContent = "Round " + match.round;
        dom.passTitle.textContent = player.name + ", take the board.";
        dom.passSub.textContent = player.drinks > 0
            ? "You have " + player.drinks + " drink" + (player.drinks === 1 ? "" : "s") +
              " in you. The board is blurry. Aim, lock in, then stop both bars."
            : "The board is clear. Aim, lock in, then stop both bars.";
        dom.passOverlay.classList.remove("hidden");
        updateHud();
        dom.passContinue.focus();
    }

    function beginThrow(aim: Point, player: DartPlayer): void {
        const match = state.match;
        if (!match || flight) return;
        const baseSigma = player.isBot ? DIFFICULTY[match.difficulty].baseSigma : DRUNK[0]!.sigma;
        const to = landingPoint(aim, player.drinks, baseSigma);
        match.phase = "flight";
        botPlan = null;
        flight = {
            from: { x: 0, y: 1.34 },
            to,
            start: performance.now(),
            player: player.index,
            color: player.color,
            isP2: player.index === 1,
        };
        sfx("whoosh");
        updateHud();
    }

    function lockHumanAim(aim: Point): void {
        const match = state.match;
        if (!match || match.phase !== "aim" || flight || !aim) return;
        const player = match.players[match.active];
        if (player.isBot) return;
        ensureAudio();
        const locked = { x: clamp(aim.x, -1.1, 1.1), y: clamp(aim.y, -1.1, 1.1) };
        match.lockedAim = locked;
        match.phase = "timing";
        match.timing = {
            stage: "horizontal",
            finalAim: null,
            horizontal: { start: performance.now(), pos: 0.5, marker: 0.5, offset: null },
            vertical: { start: 0, pos: 0.5, marker: 0.5, offset: null },
        };
        for (const track of [dom.timingH, dom.timingV]) {
            track.classList.remove("perfect", "good", "off");
        }
        sfx("tick");
        updateHud();
        updateTimingVisual(performance.now());
        announce("Aim locked. Stop the horizontal bar.");
    }

    function applyTimingFeedback(track: HTMLElement, offset: number): void {
        track.classList.remove("perfect", "good", "off");
        track.classList.add(timingQuality(offset));
        sfx(timingQuality(offset) === "off" ? "sting" : "tick");
    }

    function stopTiming(): void {
        const match = state.match;
        if (!match || match.phase !== "timing" || !match.timing || !match.lockedAim) return;
        const timing = match.timing;
        const player = match.players[match.active];
        const now = performance.now();
        const period = timingPeriod(player.drinks);

        if (timing.stage === "horizontal") {
            const pos = timingPosition(timing.horizontal.start, now, period);
            const offset = (pos - 0.5) * 2;
            timing.horizontal.marker = pos;
            timing.horizontal.offset = offset;
            applyTimingFeedback(dom.timingH, offset);
            timing.stage = "vertical";
            timing.vertical.start = now;
            updateHud();
            updateTimingVisual(now);
            announce("Horizontal bar stopped. Stop the vertical bar.");
            return;
        }

        if (timing.stage === "vertical") {
            const pos = timingPosition(timing.vertical.start, now, period * 0.86);
            const offset = (pos - 0.5) * 2;
            timing.vertical.marker = pos;
            timing.vertical.offset = offset;
            applyTimingFeedback(dom.timingV, offset);
            timing.stage = "done";
            timing.finalAim = {
                x: match.lockedAim.x + (timing.horizontal.offset || 0) * TIMING_MAX_OFFSET,
                y: match.lockedAim.y + (timing.vertical.offset || 0) * TIMING_MAX_OFFSET,
            };
            const quality = timingQuality(((timing.horizontal.offset || 0) + (timing.vertical.offset || 0)) / 2);
            announce("Vertical bar stopped. " + quality.toUpperCase() + " timing.");
            updateHud();
            updateTimingVisual(now);
            later(() => {
                if (!state.match || state.match !== match || match.phase !== "timing" || !timing.finalAim) return;
                beginThrow(timing.finalAim, player);
            }, TIMING_STOP_MS);
        }
    }

    function scheduleBotThrow(): void {
        const match = state.match;
        if (!match || !botPlan) return;
        later(() => {
            if (!state.match || state.match !== match || match.phase !== "aim") return;
            const player = match.players[match.active];
            const plan = botPlan;
            if (!player.isBot || !plan) return;
            const offsets = botTimingOffsets(player);
            beginThrow({
                x: plan.aim.x + offsets.x,
                y: plan.aim.y + offsets.y,
            }, player);
        }, 760);
    }

    function resolveThrow(finished: Flight): void {
        const match = state.match;
        if (!match) return;
        const player = match.players[finished.player];
        const result = scoreAt(finished.to.x, finished.to.y);

        player.darts.push({
            x: finished.to.x,
            y: finished.to.y,
            score: result.score,
            label: result.label,
        });
        boardDirty = true;
        player.roundScore += result.score;
        player.total += result.score;
        player.dartsThrown += 1;
        match.dartsLeft -= 1;

        addPopup(finished.to.x, finished.to.y, result.label, result.score >= 50 ? "#ffd166" : player.color);

        if (result.ring === "bull") {
            sfx("bull");
        } else {
            sfx("thunk");
            if (result.score >= 40) sfx("tick");
        }

        const left = match.dartsLeft;
        announce(player.name + " scores " + result.score + ". " + left + " dart" + (left === 1 ? "" : "s") + " left.");
        updateScoreboard();

        if (left > 0) {
            match.phase = "aim";
            match.lockedAim = null;
            match.timing = null;
            if (dom.timingUi) dom.timingUi.classList.add("hidden");
            updateHud();
            if (player.isBot) {
                botPlan = { aim: pickBotTarget(), targetAt: performance.now() };
                scheduleBotThrow();
            }
        } else {
            match.phase = "turnEnd";
            updateHud();
            later(endTurn, TURN_PAUSE_MS);
        }
    }

    function endTurn(): void {
        const match = state.match;
        if (!match) return;
        match.turnsTaken += 1;

        if (match.turnsTaken === 1) {
            match.active = (1 - match.starter) as 0 | 1;
            beginTurn();
            return;
        }

        match.phase = "roundEnd";
        computeRound();
    }

    function computeRound(): void {
        const match = state.match;
        if (!match) return;
        const p1 = match.players[0];
        const p2 = match.players[1];
        let losers;

        if (p1.roundScore < p2.roundScore) {
            losers = [p1];
        } else if (p2.roundScore < p1.roundScore) {
            losers = [p2];
        } else {
            losers = [p1, p2];
        }

        for (const player of losers) {
            player.drinks = Math.min(DRINK_LIMIT, player.drinks + 1);
        }

        const blacked = match.players.filter((player) => player.drinks >= DRINK_LIMIT);
        match.blacked = blacked.map((player) => player.index);

        if (blacked.length === 2) {
            if (p1.total > p2.total) match.winner = 0;
            else if (p2.total > p1.total) match.winner = 1;
            else match.winner = -1;
        } else if (blacked.length === 1) {
            match.winner = blacked[0]!.index === 0 ? 1 : 0;
        } else {
            match.winner = null;
        }

        match.lastLosers = losers.map((player) => player.index);
        match.phase = "drink";
        sfx("glug");
        if (blacked.length) sfx("blackout");
        else sfx("sting");
        updateScoreboard();
        updateDrunkVisuals();
        showRoundOverlay(losers);
    }

    function showRoundOverlay(losers: DartPlayer[]): void {
        const match = state.match;
        if (!match) return;
        const p1 = match.players[0];
        const p2 = match.players[1];

        dom.roundKicker.textContent = "Round " + match.round + " complete";
        dom.roundNames[0].textContent = p1.name;
        dom.roundNames[1].textContent = p2.name;
        dom.roundVals[0].textContent = String(p1.roundScore);
        dom.roundVals[1].textContent = String(p2.roundScore);

        if (losers.length === 2) {
            dom.roundTitle.textContent = "Dead even.";
            dom.roundSub.textContent = "Both players drink. The board gets blurrier.";
        } else {
            const loser = losers[0]!;
            const winner = loser.index === 0 ? p2 : p1;
            dom.roundTitle.textContent = winner.name + " takes it.";
            dom.roundSub.textContent = loser.name + " drinks.";
        }

        dom.drinkRow.innerHTML = "";
        for (const player of losers) {
            const tag = document.createElement("span");
            tag.className = "drink-tag";
            tag.textContent = player.name + " +1 " + DRUNK[player.drinks]!.label;
            dom.drinkRow.appendChild(tag);
        }

        dom.roundContinue.textContent = match.winner !== null ? "See result" : "Next round";
        dom.roundContinue.appendChild(makeKeyHint());
        dom.roundOverlay.classList.remove("hidden");
        dom.roundContinue.focus();
        updateHud();
        announce(
            dom.roundTitle.textContent + " " + dom.roundSub.textContent
        );
    }

    function makeKeyHint(): HTMLElement {
        const hint = document.createElement("span");
        hint.className = "key-hint";
        hint.textContent = "Enter";
        return hint;
    }

    function updateEffects(): void {
        byId("app").classList.toggle(
            "reduced",
            state.settings.reducedEffects || reducedMotionQuery.matches
        );
        dom.effectsToggle.setAttribute("aria-pressed", String(state.settings.reducedEffects));
    }

    function updateDrunkVisuals(): void {
        const match = state.match;
        const level = visualDrunkLevel();
        const active = match ? match.players[match.active] : null;
        const botTurn = Boolean(active && active.isBot && match && match.phase !== "drink");

        dom.boardStage.classList.remove("drunk-0", "drunk-1", "drunk-2", "drunk-3", "drunk-4");
        dom.boardStage.classList.add("drunk-" + level);
        dom.boardStage.classList.toggle("bot-turn", botTurn);
    }

    function updateSips(index: number, player: DartPlayer): void {
        const meter = dom.sips[index];
        if (!meter) return;
        meter.innerHTML = "";
        for (let i = 0; i < DRINK_LIMIT; i += 1) {
            const pip = document.createElement("span");
            pip.className = "sip-pip";
            if (i < player.drinks) pip.classList.add("filled");
            if (player.drinks >= DRINK_LIMIT && i === DRINK_LIMIT - 1) pip.classList.add("wasted");
            meter.appendChild(pip);
        }
        meter.setAttribute(
            "aria-label",
            player.name + " drinks: " + player.drinks + " of " + DRINK_LIMIT
        );
    }

    function updateScoreboard(): void {
        const match = state.match;
        if (!match) return;
        const turnPhases = ["turnStart", "pass", "aim", "timing", "flight"];

        for (let i = 0; i < 2; i += 1) {
            const player = match.players[i]!;
            dom.names[i]!.textContent = player.name;
            dom.totals[i]!.textContent = String(player.total);
            dom.roundScores[i]!.textContent = String(player.roundScore);
            dom.panels[i]!.classList.toggle(
                "active",
                match.active === i && turnPhases.indexOf(match.phase) !== -1
            );
            dom.panels[i]!.classList.toggle(
                "dim",
                match.active !== i && turnPhases.indexOf(match.phase) !== -1
            );
            dom.turnChips[i]!.hidden = !(match.active === i && turnPhases.indexOf(match.phase) !== -1);
            updateSips(i, player);
        }
    }

    function updateHud(): void {
        const match = state.match;
        if (!match) return;
        const player = match.players[match.active];
        const touch = prefersTouchUi();

        dom.hudRound.textContent = "Round " + match.round;

        let turnText = "";
        let status = "";
        switch (match.phase) {
            case "toast":
                turnText = "First round's on the house";
                status = "Everyone takes one free sip. It doesn't count.";
                break;
            case "turnStart":
                turnText = player.isBot ? player.name + " is stepping up" : player.name + " to throw";
                status = player.isBot ? player.name + " is stepping up..." : player.name + ", get ready.";
                break;
            case "pass":
                turnText = "Waiting for " + player.name;
                status = "Pass the device to " + player.name + ".";
                break;
            case "aim":
                turnText = player.isBot ? player.name + " is aiming" : player.name + " to throw";
                status = player.isBot
                    ? player.name + " is aiming..."
                    : touch
                        ? "Drag to aim, release to lock. " + match.dartsLeft + " dart" + (match.dartsLeft === 1 ? "" : "s") + " left."
                        : "Aim, then click or press Space to lock in. " + match.dartsLeft + " dart" + (match.dartsLeft === 1 ? "" : "s") + " left.";
                break;
            case "timing": {
                const stage = match.timing ? match.timing.stage : "horizontal";
                turnText = "Precision timing";
                status = stage === "horizontal"
                    ? (touch ? "Tap to stop the horizontal bar." : "Click or press Space to stop the horizontal bar.")
                    : stage === "vertical"
                        ? (touch ? "Tap to stop the vertical bar." : "Click or press Space to stop the vertical bar.")
                        : "Dart away...";
                break;
            }
            case "flight":
                turnText = "Dart in the air";
                status = "Dart in the air...";
                break;
            case "turnEnd":
                turnText = "Turn complete";
                status = "Turn complete.";
                break;
            case "roundEnd":
            case "drink":
                turnText = "Round " + match.round + " scored";
                status = "Comparing round totals...";
                break;
            case "end":
                turnText = "Match over";
                status = "Match over.";
                break;
            default:
                turnText = player ? player.name + " to throw" : "";
                status = "";
                break;
        }

        dom.hudTurn.textContent = turnText;
        dom.statusLine.textContent = status;

        dom.turnBanner.hidden = !(match.phase === "aim" && player.isBot);
        dom.turnBanner.textContent = player.name + " is aiming";

        dom.dartsLeft.innerHTML = "";
        for (let i = 0; i < DARTS_PER_TURN; i += 1) {
            const pip = document.createElement("span");
            pip.className = "dart-pip" + (i >= match.dartsLeft ? " spent" : "");
            dom.dartsLeft.appendChild(pip);
        }
        dom.dartsLeft.setAttribute(
            "aria-label",
            match.dartsLeft + " of " + DARTS_PER_TURN + " darts left"
        );
    }

    function recordMatch(): void {
        const match = state.match;
        if (!match || match.recorded) return;
        match.recorded = true;

        if (match.mode === "solo") {
            const record = state.records.solo[match.difficulty];
            if (match.winner === 0) {
                record.wins += 1;
                record.best = record.best ? Math.min(record.best, match.round) : match.round;
            } else if (match.winner === 1) {
                record.losses += 1;
            }
        } else {
            const duo = state.records.duo;
            if (match.winner === 0) {
                duo.p1 += 1;
                duo.bestP1 = duo.bestP1 ? Math.min(duo.bestP1, match.round) : match.round;
            } else if (match.winner === 1) {
                duo.p2 += 1;
                duo.bestP2 = duo.bestP2 ? Math.min(duo.bestP2, match.round) : match.round;
            }
        }

        saveRecords();
        renderRecords();
    }

    function showEnd(): void {
        const match = state.match;
        if (!match) return;
        const winnerIndex = match.winner;
        if (winnerIndex === null) return;
        clearTimers();
        recordMatch();
        match.phase = "end";
        flight = null;
        botPlan = null;
        dom.roundOverlay.classList.add("hidden");

        const p1 = match.players[0];
        const p2 = match.players[1];

        if (winnerIndex === -1) {
            dom.endKicker.textContent = "Double blackout";
            dom.endTitle.textContent = "Draw.";
            dom.endSub.textContent = "Both players blacked out on the same round with the same total.";
            sfx("sting");
        } else {
            const winner = match.players[winnerIndex]!;
            const loser = match.players[1 - winnerIndex]!;
            dom.endKicker.textContent = "Blackout";
            dom.endTitle.textContent = winner.name + " wins.";
            if (match.blacked.length === 2) {
                dom.endSub.textContent = "Both blacked out. " + winner.name + " had the higher total.";
            } else {
                dom.endSub.textContent = loser.name + " blacked out after five drinks.";
            }
            sfx("win");
        }

        dom.endNames[0].textContent = p1.name;
        dom.endNames[1].textContent = p2.name;
        dom.endDrinks[0].textContent = String(p1.drinks);
        dom.endDrinks[1].textContent = String(p2.drinks);
        dom.endDarts[0].textContent = String(p1.dartsThrown);
        dom.endDarts[1].textContent = String(p2.dartsThrown);
        dom.endTotals[0].textContent = String(p1.total);
        dom.endTotals[1].textContent = String(p2.total);

        dom.endOverlay.classList.remove("hidden");
        dom.endRematch.focus();
        updateDrunkVisuals();
        updateHud();
        announce(dom.endTitle.textContent + " " + dom.endSub.textContent);
    }

    function renderRecords(): void {
        const solo = state.records.solo[state.difficulty];
        if (state.mode === "solo") {
            let text = DIFFICULTY[state.difficulty].name + ": " + solo.wins + "W / " + solo.losses + "L";
            if (solo.best) text += " / best win " + solo.best + " round" + (solo.best === 1 ? "" : "s");
            dom.recordsLine.textContent = text;
        } else {
            const duo = state.records.duo;
            let p1 = "Player 1 " + duo.p1 + "W";
            let p2 = "Player 2 " + duo.p2 + "W";
            if (duo.bestP1) p1 += " (best " + duo.bestP1 + ")";
            if (duo.bestP2) p2 += " (best " + duo.bestP2 + ")";
            dom.recordsLine.textContent = "Duo: " + p1 + " · " + p2;
        }
    }

    function goLobby(): void {
        clearTimers();
        flight = null;
        botPlan = null;
        popups.length = 0;
        state.match = null;
        state.paused = false;
        state.pendingResume = false;
        if (dom.timingUi) dom.timingUi.classList.add("hidden");
        hideOverlays();
        showScreen("lobby");
        dom.startBtn.focus({ preventScroll: true });
        renderRecords();
        updateEffects();
        updateMuteButtons();
        sfx("click");
    }

    function resumeTurn(): void {
        const match = state.match;
        if (!match) return;
        const player = match.players[match.active];

        if (match.phase === "turnStart" && player.isBot) {
            beginTurn();
            return;
        }
        if (match.phase === "turnEnd") {
            later(endTurn, 220);
            return;
        }
        if (match.phase === "aim" && player.isBot) {
            if (!botPlan) botPlan = { aim: pickBotTarget(), targetAt: performance.now() };
            scheduleBotThrow();
        }
        if (match.phase === "timing" && match.timing && match.timing.stage === "done" && match.timing.finalAim) {
            const timing = match.timing;
            later(() => {
                if (!state.match || state.match !== match || match.phase !== "timing" || !timing.finalAim) return;
                beginThrow(timing.finalAim, player);
            }, TIMING_STOP_MS);
        }
    }

    function resumeFromOverlay(): void {
        const match = state.match;
        if (!match) return;
        const pausedFor = performance.now() - state.pausedAt;
        if (flight) flight.start += pausedFor;
        if (match.timing) {
            if (match.timing.stage === "horizontal") match.timing.horizontal.start += pausedFor;
            if (match.timing.stage === "vertical") match.timing.vertical.start += pausedFor;
        }
        state.paused = false;
        state.pendingResume = false;
        resumeTurn();
        if (match.phase === "aim" && !match.players[match.active].isBot) {
            focusBoard();
        }
    }

    // ============================================================
    // UI, input & boot
    // ============================================================
    function selectMode(mode: string): void {
        state.mode = mode === "duo" ? "duo" : "solo";
        for (const card of dom.modeCards) {
            const selected = card.dataset.mode === state.mode;
            card.classList.toggle("selected", selected);
            card.setAttribute("aria-checked", String(selected));
        }
        dom.difficultyField.classList.toggle("hidden", state.mode !== "solo");
        renderRecords();
        sfx("click");
    }

    function selectDifficulty(difficulty: string): void {
        if (difficulty !== "easy" && difficulty !== "normal" && difficulty !== "hard") return;
        state.difficulty = difficulty;
        for (const button of dom.difficultyButtons) {
            const selected = button.dataset.difficulty === difficulty;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-checked", String(selected));
        }
        renderRecords();
        sfx("click");
    }

    function toggleMute(): void {
        state.settings.muted = !state.settings.muted;
        sfxEngine.setMuted(state.settings.muted);
        saveSettings();
        updateMuteButtons();
        if (!state.settings.muted) {
            ensureAudio();
            sfx("click");
        }
    }

    function toggleEffects(): void {
        state.settings.reducedEffects = !state.settings.reducedEffects;
        saveSettings();
        updateEffects();
        sfx("click");
    }

    function resetRecords(): void {
        if (!window.confirm("Reset all records? This cannot be undone.")) return;
        state.records = {
            solo: { easy: makeRecord(), normal: makeRecord(), hard: makeRecord() },
            duo: makeDuoRecord(),
        };
        saveRecords();
        renderRecords();
        announce("Records reset.");
        sfx("click");
    }

    function bindEvents(): void {
        for (const card of dom.modeCards) {
            card.addEventListener("click", () => selectMode(card.dataset.mode ?? ""));
        }
        for (const button of dom.difficultyButtons) {
            button.addEventListener("click", () => selectDifficulty(button.dataset.difficulty ?? ""));
        }

        dom.startBtn.addEventListener("click", startMatch);
        dom.effectsToggle.addEventListener("click", toggleEffects);
        dom.resetRecords.addEventListener("click", resetRecords);
        dom.lobbyMute.addEventListener("click", toggleMute);
        dom.matchMute.addEventListener("click", toggleMute);

        dom.startContinue.addEventListener("click", dismissStartToast);

        dom.passContinue.addEventListener("click", () => {
            const match = state.match;
            if (!match || match.phase !== "pass") return;
            dom.passOverlay.classList.add("hidden");
            match.phase = "aim";
            updateHud();
            updateScoreboard();
            updateDrunkVisuals();
            announce(match.players[match.active].name + " to throw.");
            focusBoard();
            sfx("click");
        });

        dom.roundContinue.addEventListener("click", () => {
            const match = state.match;
            if (!match) return;
            sfx("click");
            if (match.winner !== null) {
                showEnd();
                return;
            }
            dom.roundOverlay.classList.add("hidden");
            match.round += 1;
            match.starter = (1 - match.starter) as 0 | 1;
            startRound();
        });

        dom.endRematch.addEventListener("click", startMatch);
        dom.endLobby.addEventListener("click", goLobby);

        dom.quitBtn.addEventListener("click", openQuit);
        dom.quitCancel.addEventListener("click", cancelQuit);
        dom.quitConfirm.addEventListener("click", goLobby);

        bindBoardInput();
        bindKeyboard();
        bindViewport();
    }

    function openQuit(): void {
        if (!state.match) return;
        state.paused = true;
        state.pausedAt = performance.now();
        dom.quitOverlay.classList.remove("hidden");
        dom.quitCancel.focus();
        sfx("click");
    }

    function cancelQuit(): void {
        dom.quitOverlay.classList.add("hidden");
        resumeFromOverlay();
        focusBoard();
        sfx("click");
    }

    function updateTouchAim(event: PointerEvent): Point {
        const point = eventPoint(event);
        drag.point = point;
        input.pointer = point;
        input.hover = point;
        input.keyboard = null;
        input.lastDevice = "touch";
        return point;
    }

    function releasePointer(pointerId: number): void {
        try {
            if (dom.board.hasPointerCapture && dom.board.hasPointerCapture(pointerId)) {
                dom.board.releasePointerCapture(pointerId);
            }
        } catch (err) { /* pointer capture unavailable */ }
    }

    function bindBoardInput(): void {
        dom.board.addEventListener("pointermove", (event) => {
            if (state.screen !== "match") return;

            if (drag.active && event.pointerId === drag.pointerId) {
                if (state.paused) return;
                const match = state.match;
                if (!match || match.phase !== "aim") return;
                event.preventDefault();
                updateTouchAim(event);
                return;
            }

            if (event.pointerType !== "mouse") return;
            input.hover = eventPoint(event);
            input.keyboard = null;
            input.lastDevice = "pointer";
        });

        dom.board.addEventListener("pointerleave", (event) => {
            if (drag.active || event.pointerType !== "mouse") return;
            input.hover = null;
        });

        dom.board.addEventListener("pointerdown", (event) => {
            if (state.screen !== "match" || state.paused) return;
            const match = state.match;
            if (!match) return;
            const player = match.players[match.active];
            if (player.isBot) return;
            if (event.isPrimary === false) return;

            if (match.phase === "timing") {
                event.preventDefault();
                ensureAudio();
                stopTiming();
                return;
            }

            if (match.phase !== "aim") return;
            event.preventDefault();
            ensureAudio();

            if (event.pointerType === "mouse") {
                const point = eventPoint(event);
                input.pointer = point;
                input.hover = point;
                input.keyboard = null;
                input.lastDevice = "pointer";
                lockHumanAim(point);
                return;
            }

            drag.active = true;
            drag.pointerId = event.pointerId;
            updateTouchAim(event);
            try {
                dom.board.setPointerCapture(event.pointerId);
            } catch (err) { /* pointer capture unavailable */ }
        });

        dom.board.addEventListener("pointerup", (event) => {
            if (!drag.active || event.pointerId !== drag.pointerId) return;
            const pointerId = drag.pointerId!;
            const point = drag.point || eventPoint(event);
            drag.active = false;
            drag.pointerId = null;
            drag.point = null;
            releasePointer(pointerId);
            if (state.screen !== "match" || state.paused) return;
            const match = state.match;
            if (!match || match.phase !== "aim") return;
            const player = match.players[match.active];
            if (player.isBot) return;
            event.preventDefault();
            lockHumanAim(point);
        });

        dom.board.addEventListener("pointercancel", (event) => {
            if (!drag.active || event.pointerId !== drag.pointerId) return;
            const pointerId = drag.pointerId!;
            drag.active = false;
            drag.pointerId = null;
            drag.point = null;
            input.pointer = null;
            input.hover = null;
            releasePointer(pointerId);
        });

        dom.board.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    function overlayVisible(element: HTMLElement | null): boolean {
        return element !== null && !element.classList.contains("hidden");
    }

    function bindKeyboard(): void {
        document.addEventListener("keydown", (event) => {
            const key = event.key;
            const nativeActivation = (key === "Enter" || key === " ") &&
                event.target instanceof Element &&
                Boolean(event.target.closest("button, a"));

            if (overlayVisible(dom.endOverlay)) {
                if ((key === "Enter" || key === " ") && !nativeActivation) {
                    event.preventDefault();
                    startMatch();
                }
                return;
            }

            if (overlayVisible(dom.quitOverlay)) {
                if (key === "Escape" || ((key === "Enter" || key === " ") && !nativeActivation)) {
                    event.preventDefault();
                    cancelQuit();
                }
                return;
            }

            if (overlayVisible(dom.startOverlay)) {
                if ((key === "Enter" || key === " ") && !nativeActivation) {
                    event.preventDefault();
                    dismissStartToast();
                }
                return;
            }

            if (overlayVisible(dom.roundOverlay)) {
                if ((key === "Enter" || key === " ") && !nativeActivation) {
                    event.preventDefault();
                    dom.roundContinue.click();
                }
                return;
            }

            if (overlayVisible(dom.passOverlay)) {
                if ((key === "Enter" || key === " ") && !nativeActivation) {
                    event.preventDefault();
                    dom.passContinue.click();
                }
                return;
            }

            if (state.screen === "lobby") {
                if ((key === "Enter" || key === " ") && !nativeActivation) {
                    event.preventDefault();
                    startMatch();
                }
                return;
            }

            const match = state.match;
            if (!match) return;

            if (key === "Escape") {
                event.preventDefault();
                openQuit();
                return;
            }

            if (nativeActivation || state.paused) return;

            const player = match.players[match.active];
            if (player.isBot) return;

            if (match.phase === "timing") {
                if (key === " " || key === "Enter") {
                    event.preventDefault();
                    stopTiming();
                }
                return;
            }

            if (match.phase !== "aim") return;

            const current = currentAim();
            const step = 0.028;
            let x = current ? current.x : 0;
            let y = current ? current.y : 0;
            let handled = true;

            switch (key) {
                case "ArrowLeft":
                    x -= step;
                    break;
                case "ArrowRight":
                    x += step;
                    break;
                case "ArrowUp":
                    y -= step;
                    break;
                case "ArrowDown":
                    y += step;
                    break;
                case " ":
                case "Enter":
                    event.preventDefault();
                    if (!current) {
                        announce("Aim at the board first. Move the pointer over it or use the arrow keys.");
                        return;
                    }
                    input.keyboard = { x: clamp(x, -1.1, 1.1), y: clamp(y, -1.1, 1.1) };
                    lockHumanAim(input.keyboard);
                    return;
                default:
                    handled = false;
                    break;
            }

            if (handled) {
                event.preventDefault();
                input.keyboard = { x: clamp(x, -1.1, 1.1), y: clamp(y, -1.1, 1.1) };
                input.hover = null;
            }
        });
    }

    function bindViewport(): void {
        window.addEventListener("resize", () => {
            if (state.screen === "match") {
                resizeCanvas();
                forceRender = true;
            }
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                const phases = ["turnStart", "aim", "timing", "flight", "turnEnd"];
                if (state.match && !state.paused && phases.indexOf(state.match.phase) !== -1 &&
                    !overlayVisible(dom.quitOverlay) && !overlayVisible(dom.roundOverlay) &&
                    !overlayVisible(dom.endOverlay)) {
                    state.paused = true;
                    state.pausedAt = performance.now();
                }
                return;
            }
            if (state.match && state.paused && !overlayVisible(dom.quitOverlay) &&
                !overlayVisible(dom.roundOverlay) && !overlayVisible(dom.endOverlay)) {
                resumeFromOverlay();
            }
        });

        if (window.ResizeObserver && dom.boardStage) {
            const observer = new ResizeObserver(() => {
                if (state.screen === "match") resizeCanvas();
            });
            observer.observe(dom.boardStage);
        }

        if (reducedMotionQuery.addEventListener) {
            reducedMotionQuery.addEventListener("change", updateEffects);
        }
    }

    function init(): void {
        cacheDom();
        if (!dom.board) return;
        updateMuteButtons();
        updateEffects();
        renderRecords();
        bindEvents();
        rafId = requestAnimationFrame(renderFrame);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    if (import.meta.hot) {
        import.meta.hot.dispose(() => {
            if (state.match) {
                clearTimers();
                cancelAnimationFrame(rafId);
            }
        });
        import.meta.hot.accept(() => {
            location.reload();
        });
    }

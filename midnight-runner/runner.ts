export {};

import { createSfxEngine, type NoiseOptions, type ToneOptions } from "../sfx";

/* Midnight Runner — vanilla Canvas 2D endless maze runner */

type CharacterId = "vela" | "rho" | "sol";
type Dir = "up" | "down" | "left" | "right";

interface RunnerSettings {
    boostMode: "auto" | "manual";
    boostKey: string;
    lastCharacter: CharacterId;
    reducedEffects: boolean;
    muted: boolean;
}

interface EnemyEntity {
    type: "enemy";
    kind: "chaser" | "drifter" | "sentinel";
    tx: number;
    ty: number;
    x: number;
    y: number;
    progress: number;
    dir: Dir | null;
    dead: boolean;
    awake: boolean;
    speed: number;
    timer: number;
    spin: number;
}

interface HazardEntity {
    type: "hazard";
    kind: "spike" | "saw" | "barricade";
    x: number;
    y: number;
    dead: boolean;
    rot: number;
}

interface PickupEntity {
    type: "pickup";
    kind: "coin" | "chest" | "heal";
    x: number;
    y: number;
    dead: boolean;
    phase: number;
}

interface ProjectileEntity {
    type: "proj";
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    dead: boolean;
}

type RunnerEntity =
    EnemyEntity | HazardEntity | PickupEntity | ProjectileEntity;

interface MazeRow {
    walls: boolean[];
}

interface Player {
    tx: number;
    ty: number;
    x: number;
    y: number;
    progress: number;
    dir: Dir | null;
    queued: Dir[];
    speed: number;
    facing: Dir;
}

interface Collapse {
    active: boolean;
    row: number;
    grace: number;
    speed: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    max: number;
    color: string;
    size: number;
}

interface Wave {
    x: number;
    y: number;
    age: number;
    max: number;
    facing: Dir;
}

interface EggFrame {
    x: number;
    y: number;
    facing: Dir;
}

interface GameState {
    character: CharacterId;
    seed: number;
    rng: () => number;
    active: boolean;
    paused: boolean;
    over: boolean;
    time: number;
    bonus: number;
    distance: number;
    hp: number;
    invuln: number;
    gauge: number;
    boost: number;
    surge: number;
    shake: number;
    flash: number;
    player: Player;
    maze: Map<number, MazeRow>;
    generatedHigh: number;
    prunedRow: number;
    laneChunks: Map<number, number>;
    entities: RunnerEntity[];
    particles: Particle[];
    waves: Wave[];
    collapse: Collapse;
    newBest: boolean;
    trailTimer?: number;
}

interface CharacterConfig {
    id: CharacterId;
    name: string;
    color: string;
    duration: number;
    speed: number;
}

interface AppState {
    screen: "lobby" | "game";
    selected: CharacterId;
    settings: RunnerSettings;
    best: Record<CharacterId, number>;
    game: GameState | null;
}

interface HudCache {
    score: number;
    distance: number;
    hp: number;
    gauge: number;
    label: string;
    ready: boolean;
    boosting: boolean;
}

interface Sprites {
    walls: HTMLImageElement[];
    hazards: Partial<Record<HazardEntity["kind"], HTMLImageElement>>;
    projectile: HTMLImageElement | null;
}

interface DomCache {
    screenLobby: HTMLElement;
    screenGame: HTMLElement;
    lobbySettings: HTMLElement;
    lobbyMute: HTMLElement;
    lobbyBest: HTMLElement;
    startBtn: HTMLElement;
    resetProgress: HTMLElement;
    gamePause: HTMLElement;
    gameSettings: HTMLElement;
    gameMute: HTMLElement;
    hpPips: HTMLElement;
    hudScore: HTMLElement;
    hudDistance: HTMLElement;
    boostTrack: HTMLElement;
    boostFill: HTMLElement;
    boostLabel: HTMLElement;
    canvasWrap: HTMLElement;
    game: HTMLCanvasElement;
    boostTint: HTMLElement;
    touchBoost: HTMLElement;
    pauseOverlay: HTMLElement;
    pauseResume: HTMLElement;
    pauseSettings: HTMLElement;
    pauseQuit: HTMLElement;
    gameoverOverlay: HTMLElement;
    goScore: HTMLElement;
    goDistance: HTMLElement;
    goBest: HTMLElement;
    goCharacter: HTMLElement;
    goNote: HTMLElement;
    goRetry: HTMLElement;
    goLobby: HTMLElement;
    settingsModal: HTMLElement;
    keyCapture: HTMLElement;
    keyWarning: HTMLElement;
    reducedToggle: HTMLElement;
    soundToggle: HTMLElement;
    settingsClose: HTMLElement;
    characters: HTMLElement[];
    bestLabels: HTMLElement[];
    boostModes: HTMLElement[];
}

// ============================================================
// Config
// ============================================================
const TILE = 32;
const COLS = 15;
const ROWS = 22;
const VIEW_W = COLS * TILE;
const VIEW_H = ROWS * TILE;
const SETTINGS_KEY = "mr-settings-v1";
const BEST_KEY = "mr-best-v1";

const START_HP = 3;
const MAX_HP = 3;
const PLAYER_SPEED = 5.2;
const IFRAME_TIME = 1.2;
const GRACE_TIME = 12;
const START_ROW = 4;
const START_COL = 5;
const CAMERA_OFFSET = 5;
const CHUNK_ROWS = 12;
const GENERATE_AHEAD = 24;
const GENERATE_BEHIND = 8;
const BLOCK_STARTS = [1, 4, 7, 10];
const LANE_BLOCKS = BLOCK_STARTS.length;
const MAGNET_RADIUS = 5;
const EGG_FRONT = 1.6;
const EGG_REAR = 0.7;
const SHOCK_RADIUS = 3.2;
const WAVE_SAMPLES = 32;

// The egg shape scales linearly with its radius, so the boundary distance
// along each angle can be solved once at unit radius and multiplied later.
function buildEggBoundary(): number[] {
    const table: number[] = [];
    for (let i = 0; i <= WAVE_SAMPLES; i++) {
        const angle = (i / WAVE_SAMPLES) * Math.PI * 2;
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        let lo = 0;
        let hi = EGG_FRONT;
        for (let j = 0; j < 24; j++) {
            const mid = (lo + hi) * 0.5;
            if (eggInside(ux * mid, uy * mid, 1)) lo = mid;
            else hi = mid;
        }
        table.push(lo);
    }
    return table;
}

const EGG_BOUNDARY = buildEggBoundary();

const DIRECTIONS: Record<Dir, { x: number; y: number }> = {
    up: { x: 0, y: 1 },
    down: { x: 0, y: -1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Dir, Dir> = {
    up: "down",
    down: "up",
    left: "right",
    right: "left",
};

const CHARACTERS: Record<CharacterId, CharacterConfig> = {
    vela: {
        id: "vela",
        name: "Vela",
        color: "#2ee6ff",
        duration: 6.5,
        speed: 1.08,
    },
    rho: { id: "rho", name: "Rho", color: "#ff45cf", duration: 5, speed: 1 },
    sol: { id: "sol", name: "Sol", color: "#ffb23e", duration: 5, speed: 1 },
};

const CHARACTER_IDS: CharacterId[] = ["vela", "rho", "sol"];
const HAZARD_KINDS: HazardEntity["kind"][] = ["spike", "saw", "barricade"];
const ENEMY_KINDS: EnemyEntity["kind"][] = [
    "chaser",
    "chaser",
    "drifter",
    "sentinel",
];

const RESERVED_CODES = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "Escape",
    "Enter",
    "NumpadEnter",
    "Tab",
    "Space",
    "Backspace",
    "PrintScreen",
    "ScrollLock",
    "Pause",
    "Insert",
    "Delete",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "CapsLock",
    "NumLock",
    "MetaLeft",
    "MetaRight",
    "ContextMenu",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "ShiftLeft",
    "ShiftRight",
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "F10",
    "F11",
    "F12",
]);

// ============================================================
// Helpers
// ============================================================
function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function isCharacterId(value: unknown): value is CharacterId {
    return value === "vela" || value === "rho" || value === "sol";
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el as T;
}

function makeRng(seed: number): () => number {
    let s = seed >>> 0;
    return function rng() {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash2(x: number, y: number): number {
    let h = (x * 374761393 + y * 668265263) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

function hexToRgba(hex: string, alpha: number): string {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

function keyLabel(code: string): string {
    if (!code) return "?";
    if (code.indexOf("Key") === 0) return code.slice(3);
    if (code.indexOf("Digit") === 0) return code.slice(5);
    if (code.indexOf("Numpad") === 0) return "Num " + code.slice(6);
    return code;
}

function totalScore(g: GameState): number {
    return Math.floor(g.distance * 10) + g.bonus;
}

// ============================================================
// Persistence
// ============================================================
function loadSettings(): RunnerSettings {
    const defaults: RunnerSettings = {
        boostMode: "auto",
        boostKey: "KeyE",
        lastCharacter: "vela",
        reducedEffects: false,
        muted: false,
    };
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return defaults;
        const data = JSON.parse(raw) as Record<string, unknown>;
        return {
            boostMode: data.boostMode === "manual" ? "manual" : "auto",
            boostKey:
                typeof data.boostKey === "string" && data.boostKey
                    ? data.boostKey
                    : "KeyE",
            lastCharacter: isCharacterId(data.lastCharacter)
                ? data.lastCharacter
                : "vela",
            reducedEffects: Boolean(data.reducedEffects),
            muted: Boolean(data.muted),
        };
    } catch (err) {
        return defaults;
    }
}

function saveSettings(): void {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (err) {
        /* storage unavailable */
    }
}

function loadBest(): Record<CharacterId, number> {
    const best: Record<CharacterId, number> = { vela: 0, rho: 0, sol: 0 };
    try {
        const raw = localStorage.getItem(BEST_KEY);
        if (!raw) return best;
        const data = JSON.parse(raw) as Record<string, unknown>;
        for (const key of CHARACTER_IDS) {
            const value = data[key];
            best[key] =
                typeof value === "number" && Number.isFinite(value)
                    ? Math.max(0, Math.floor(value))
                    : 0;
        }
    } catch (err) {
        /* storage unavailable */
    }
    return best;
}

function saveBest(): void {
    try {
        localStorage.setItem(BEST_KEY, JSON.stringify(state.best));
    } catch (err) {
        /* storage unavailable */
    }
}

function resetBestScores(): void {
    state.best = { vela: 0, rho: 0, sol: 0 };
    saveBest();
    updateLobby();
}

// ============================================================
// State & DOM
// ============================================================
const state: AppState = {
    screen: "lobby",
    selected: "vela",
    settings: loadSettings(),
    best: loadBest(),
    game: null,
};

// ============================================================
// Audio (shared WebAudio engine)
// ============================================================
const sfxEngine = createSfxEngine(state.settings.muted);

function ensureAudio(): void {
    sfxEngine.resume();
}

function resumeAudio(): void {
    sfxEngine.resume();
}

function tone(
    freq: number,
    duration: number,
    type?: OscillatorType,
    gain?: number,
    slideTo?: number | null,
    delay?: number,
    extra?: ToneOptions,
): void {
    sfxEngine.tone(freq, duration, { type, gain, slideTo, delay, ...extra });
}

function noiseBurst(
    duration: number,
    gain?: number,
    filterFreq?: number,
    delay?: number,
    extra?: NoiseOptions,
): void {
    sfxEngine.noise(duration, { gain, filterFreq, delay, ...extra });
}

function sfx(name: string): void {
    switch (name) {
        case "start":
            tone(330, 0.11, "square", 0.035, null, 0, { reverb: 0.14 });
            tone(495, 0.2, "triangle", 0.04, null, 0.07, { detune: 6, reverb: 0.18 });
            break;
        case "boost":
            tone(220, 0.4, "sawtooth", 0.065, 660, 0, { sub: true, drive: 0.2, reverb: 0.2 });
            noiseBurst(0.24, 0.04, 700, 0, { reverb: 0.18 });
            break;
        case "boostEnd":
            tone(440, 0.24, "triangle", 0.05, 180, 0, { reverb: 0.16 });
            break;
        case "deny":
            tone(150, 0.18, "square", 0.045, 90, 0, { sub: true, drive: 0.15, reverb: 0.12 });
            break;
        case "coin":
            tone(880, 0.1, "sine", 0.05, null, 0, { detune: 7, reverb: 0.18 });
            tone(1320, 0.14, "sine", 0.04, null, 0.04, { detune: 7, reverb: 0.2 });
            break;
        case "chest":
            tone(520, 0.12, "sine", 0.055, null, 0, { detune: 7, reverb: 0.22 });
            tone(660, 0.12, "sine", 0.05, null, 0.07, { detune: 7, reverb: 0.22 });
            tone(880, 0.2, "sine", 0.055, null, 0.14, { detune: 7, reverb: 0.24 });
            break;
        case "heal":
            tone(520, 0.18, "sine", 0.055, 680, 0, { detune: 6, reverb: 0.22 });
            break;
        case "hurt":
            noiseBurst(0.16, 0.06, 320, 0, { reverb: 0.2 });
            tone(120, 0.26, "sawtooth", 0.075, 60, 0, { sub: true, drive: 0.2, reverb: 0.2 });
            break;
        case "kill":
            tone(320, 0.12, "square", 0.045, 520, 0, { drive: 0.15, reverb: 0.16 });
            noiseBurst(0.08, 0.03, 900, 0, { reverb: 0.16 });
            break;
        case "shock":
            tone(140, 0.45, "sine", 0.06, 520, 0, { sub: true, drive: 0.2, reverb: 0.24 });
            noiseBurst(0.28, 0.035, 500, 0, { reverb: 0.22 });
            break;
        case "shoot":
            tone(520, 0.1, "triangle", 0.035, 300, 0, { reverb: 0.1 });
            break;
        case "collapse":
            tone(70, 1.1, "sawtooth", 0.08, 40, 0, { sub: true, drive: 0.2, reverb: 0.3 });
            noiseBurst(0.75, 0.04, 180, 0, { reverb: 0.28 });
            break;
        case "ready":
            tone(740, 0.12, "sine", 0.045, null, 0, { detune: 7, reverb: 0.18 });
            tone(990, 0.14, "sine", 0.04, null, 0.07, { detune: 7, reverb: 0.2 });
            break;
        case "over":
            tone(180, 1.25, "sawtooth", 0.09, 44, 0, { sub: true, drive: 0.2, reverb: 0.3 });
            noiseBurst(0.8, 0.04, 220, 0, { reverb: 0.28 });
            break;
        case "best":
            tone(523, 0.16, "sine", 0.07, null, 0, { detune: 8, reverb: 0.26 });
            tone(659, 0.16, "sine", 0.07, null, 0.11, { detune: 8, reverb: 0.28 });
            tone(784, 0.3, "sine", 0.08, null, 0.22, { detune: 8, reverb: 0.3 });
            break;
        case "click":
        default:
            tone(340, 0.06, "square", 0.028, null, 0, { reverb: 0.08 });
            break;
    }
}

function uiClick(): void {
    ensureAudio();
    sfx("click");
}

let dom: DomCache;
const sprites: Sprites = { walls: [], hazards: {}, projectile: null };
let ctx: CanvasRenderingContext2D;
let capturingKey = false;
let pausedBySettings = false;
let lastFrame = 0;
let lastFocusedElement: HTMLElement | null = null;
let hudCache: HudCache = {
    score: -1,
    distance: -1,
    hp: -1,
    gauge: -1,
    label: "",
    ready: false,
    boosting: false,
};
let rafId = 0;
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function cacheDom(): void {
    dom = {
        screenLobby: byId("screen-lobby"),
        screenGame: byId("screen-game"),
        lobbySettings: byId("lobby-settings"),
        lobbyMute: byId("lobby-mute"),
        lobbyBest: byId("lobby-best"),
        startBtn: byId("start-btn"),
        resetProgress: byId("reset-progress"),
        gamePause: byId("game-pause"),
        gameSettings: byId("game-settings"),
        gameMute: byId("game-mute"),
        hpPips: byId("hp-pips"),
        hudScore: byId("hud-score"),
        hudDistance: byId("hud-distance"),
        boostTrack: byId("boost-track"),
        boostFill: byId("boost-fill"),
        boostLabel: byId("boost-label"),
        canvasWrap: byId("canvas-wrap"),
        game: byId<HTMLCanvasElement>("game"),
        boostTint: byId("boost-tint"),
        touchBoost: byId("touch-boost"),
        pauseOverlay: byId("pause-overlay"),
        pauseResume: byId("pause-resume"),
        pauseSettings: byId("pause-settings"),
        pauseQuit: byId("pause-quit"),
        gameoverOverlay: byId("gameover-overlay"),
        goScore: byId("go-score"),
        goDistance: byId("go-distance"),
        goBest: byId("go-best"),
        goCharacter: byId("go-character"),
        goNote: byId("go-note"),
        goRetry: byId("go-retry"),
        goLobby: byId("go-lobby"),
        settingsModal: byId("settings-modal"),
        keyCapture: byId("key-capture"),
        keyWarning: byId("key-warning"),
        reducedToggle: byId("reduced-toggle"),
        soundToggle: byId("sound-toggle"),
        settingsClose: byId("settings-close"),
        characters: Array.from(
            document.querySelectorAll<HTMLElement>(".character"),
        ),
        bestLabels: Array.from(
            document.querySelectorAll<HTMLElement>("[data-best]"),
        ),
        boostModes: Array.from(
            document.querySelectorAll<HTMLElement>("[data-boost-mode]"),
        ),
    };
}

// ============================================================
// SVG sprite factory
// ============================================================
function loadSvg(svg: string): HTMLImageElement {
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    return img;
}

function wallSvg(index: number, rng: () => number): string {
    const tints = ["#4b4bb0", "#3a6fd0", "#8a3fd0", "#2f9fc0"];
    const tint = tints[index % tints.length]!;
    let marks = "";
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
        const x = 5 + Math.floor(rng() * 20);
        const y = 5 + Math.floor(rng() * 20);
        const w = 4 + Math.floor(rng() * 8);
        marks +=
            '<rect x="' +
            x +
            '" y="' +
            y +
            '" width="' +
            w +
            '" height="3" rx="1.5" fill="#0e0e28" opacity="0.9"/>';
    }
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
        '<defs><linearGradient id="g' +
        index +
        '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#23235c"/><stop offset="1" stop-color="#101028"/>' +
        "</linearGradient></defs>" +
        '<rect x="0.5" y="0.5" width="31" height="31" rx="5" fill="url(#g' +
        index +
        ')" ' +
        'stroke="' +
        tint +
        '" stroke-width="1.4"/>' +
        '<rect x="4.5" y="4.5" width="23" height="23" rx="3.5" fill="none" ' +
        'stroke="' +
        hexToRgba(tint, 0.35) +
        '" stroke-width="1"/>' +
        marks +
        '<path d="M7 25 L11 20 L10 16 L15 13" fill="none" stroke="' +
        hexToRgba(tint, 0.5) +
        '" stroke-width="1.2" stroke-linecap="round"/>' +
        "</svg>"
    );
}

function spikeSvg(): string {
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
        '<path d="M5 15 L9 3 L12 13 L16 2 L20 13 L23 3 L27 15 Z" fill="#e02b66" ' +
        'stroke="#ff7aa2" stroke-width="1"/>' +
        '<rect x="4" y="14" width="24" height="14" rx="4" fill="#a4134a" stroke="#ff5d8f" stroke-width="1.5"/>' +
        '<rect x="9" y="19" width="5" height="5" rx="1" fill="#ff8aac" opacity="0.8"/>' +
        '<rect x="18" y="19" width="5" height="5" rx="1" fill="#ff8aac" opacity="0.8"/>' +
        "</svg>"
    );
}

function sawSvg(): string {
    let teeth = "";
    for (let i = 0; i < 8; i++) {
        const a = (i * 45 * Math.PI) / 180;
        const x1 = 16 + Math.cos(a) * 10;
        const y1 = 16 + Math.sin(a) * 10;
        const x2 = 16 + Math.cos(a + 0.28) * 15;
        const y2 = 16 + Math.sin(a + 0.28) * 15;
        const x3 = 16 + Math.cos(a + 0.56) * 10;
        const y3 = 16 + Math.sin(a + 0.56) * 10;
        teeth +=
            "M" +
            x1.toFixed(1) +
            " " +
            y1.toFixed(1) +
            " L" +
            x2.toFixed(1) +
            " " +
            y2.toFixed(1) +
            " L" +
            x3.toFixed(1) +
            " " +
            y3.toFixed(1) +
            " Z ";
    }
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
        '<path d="' +
        teeth +
        '" fill="#ff9b32" stroke="#ffd27a" stroke-width="1"/>' +
        '<circle cx="16" cy="16" r="9" fill="#c05a12" stroke="#ffb95c" stroke-width="1.5"/>' +
        '<circle cx="16" cy="16" r="3.5" fill="#3a1a06" stroke="#ffd27a" stroke-width="1.2"/>' +
        '<path d="M11 16 H21" stroke="#ffd27a" stroke-width="1" opacity="0.6"/>' +
        "</svg>"
    );
}

function barricadeSvg(): string {
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
        '<rect x="3" y="10" width="26" height="6" rx="2" fill="#8a4fe0" stroke="#c79bff" ' +
        'stroke-width="1.2" transform="rotate(-8 16 13)"/>' +
        '<rect x="4" y="20" width="22" height="6" rx="2" fill="#6b3fc0" stroke="#b48cff" ' +
        'stroke-width="1.2" transform="rotate(6 16 23)"/>' +
        '<path d="M9 9 L11 23 M19 8 L21 25 M26 9 L24 21" stroke="#2a1050" stroke-width="2"/>' +
        '<path d="M25 9 L29 5" stroke="#c79bff" stroke-width="1.5" stroke-linecap="round"/>' +
        "</svg>"
    );
}

function projectileSvg(): string {
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<circle cx="12" cy="12" r="9" fill="#19c8e8" opacity="0.28"/>' +
        '<circle cx="12" cy="12" r="6" fill="#28e6ff" stroke="#a9f6ff" stroke-width="1.2"/>' +
        '<circle cx="10" cy="10" r="2" fill="#e6ffff"/>' +
        '<path d="M12 3 L13.5 8 L12 7 L10.5 8 Z" fill="#9ff3ff"/>' +
        "</svg>"
    );
}

function initSprites(): void {
    const rng = makeRng(0x51ff77);
    for (let i = 0; i < 6; i++) {
        sprites.walls.push(loadSvg(wallSvg(i, rng)));
    }
    sprites.hazards.spike = loadSvg(spikeSvg());
    sprites.hazards.saw = loadSvg(sawSvg());
    sprites.hazards.barricade = loadSvg(barricadeSvg());
    sprites.projectile = loadSvg(projectileSvg());
    for (const key of Object.keys(CHARACTERS) as CharacterId[]) {
        playerGlowSprite(key, CHARACTERS[key].color);
    }
}

// ============================================================
// Maze generation
// ============================================================
function ensureMaze(g: GameState, targetRow: number): void {
    if (targetRow <= g.generatedHigh) return;
    const target = Math.ceil(targetRow / CHUNK_ROWS) * CHUNK_ROWS;
    for (let y = g.generatedHigh + 1; y <= target; y++) {
        generateRow(g, y);
    }
    g.generatedHigh = Math.max(g.generatedHigh, target);
}

// An endless run must not keep every generated row forever. Entities are
// already culled at player.y - 10, so a wider margin is safe.
const PRUNE_BEHIND = 18;
const PRUNE_INTERVAL = 8;

function pruneMaze(g: GameState): void {
    const cutoff = Math.floor(g.player.y) - PRUNE_BEHIND;
    if (cutoff < g.prunedRow + PRUNE_INTERVAL) return;
    g.prunedRow = cutoff;

    for (const row of g.maze.keys()) {
        if (row < cutoff) g.maze.delete(row);
    }

    const chunkCutoff = Math.floor(cutoff / CHUNK_ROWS);
    for (const chunk of g.laneChunks.keys()) {
        if (chunk < chunkCutoff) g.laneChunks.delete(chunk);
    }
}

function laneBlockForChunk(g: GameState, chunk: number): number {
    if (chunk <= 0) return 1;
    if (g.laneChunks.has(chunk)) return g.laneChunks.get(chunk)!;
    const prev = laneBlockForChunk(g, chunk - 1);
    let block = Math.floor(g.rng() * LANE_BLOCKS);
    if (block === prev) {
        block =
            (block + 1 + Math.floor(g.rng() * (LANE_BLOCKS - 1))) % LANE_BLOCKS;
    }
    g.laneChunks.set(chunk, block);
    return block;
}

function generateRow(g: GameState, y: number): void {
    const walls: boolean[] = new Array<boolean>(COLS).fill(false);
    walls[0] = true;
    walls[COLS - 1] = true;

    const chunk = Math.floor(y / CHUNK_ROWS);
    const laneBlock = laneBlockForChunk(g, chunk);
    const lane = 2 + laneBlock * 3;
    const transition = y > START_ROW && y % CHUNK_ROWS === 0;

    if (!transition) {
        // Open each pillar independently, then guarantee the chunk lane and
        // one extra lane so the player can always weave between two routes.
        for (let b = 0; b < LANE_BLOCKS; b++) {
            const start = 1 + b * 3;
            walls[start] = g.rng() >= 0.45;
        }
        walls[1 + laneBlock * 3] = false;

        let openLanes = 0;
        for (let b = 0; b < LANE_BLOCKS; b++) {
            if (!walls[1 + b * 3]) openLanes += 1;
        }
        let extraLane = -1;
        if (openLanes < 2) {
            let extra = Math.floor(g.rng() * LANE_BLOCKS);
            while (extra === laneBlock || !walls[1 + extra * 3]) {
                extra = (extra + 1) % LANE_BLOCKS;
            }
            walls[1 + extra * 3] = false;
            extraLane = extra;
        }
        walls[COLS - 2] = true;

        // Clutter only on closed, non-lane blocks; never on guaranteed-open lanes.
        if (y > START_ROW && g.rng() < 0.22) {
            const closed: number[] = [];
            for (let b = 0; b < LANE_BLOCKS; b++) {
                if (b !== laneBlock && b !== extraLane && walls[1 + b * 3])
                    closed.push(b);
            }
            if (closed.length > 0) {
                const b = closed[Math.floor(g.rng() * closed.length)]!;
                const s = 1 + b * 3;
                walls[s + (g.rng() < 0.5 ? 1 : 2)] = true;
            }
        }
    }

    g.maze.set(y, { walls: walls });
    maybeSpawnRow(g, y, walls, lane);
}

function maybeSpawnRow(
    g: GameState,
    y: number,
    walls: boolean[],
    lane: number,
): void {
    const dist = y - START_ROW;
    if (dist < 5) return;
    const open: number[] = [];
    for (let x = 1; x < COLS - 1; x++) {
        if (!walls[x] && x !== lane && x !== lane + 1) open.push(x);
    }
    if (open.length === 0) return;
    const pickX = (): number => open[Math.floor(g.rng() * open.length)]!;
    const difficulty = clamp((dist - 5) / 150, 0, 1);
    const enemyChance = 0.05 + difficulty * 0.1;
    const roll = g.rng();
    if (roll < enemyChance) {
        g.entities.push(makeEnemy(g, pickX(), y));
        return;
    }
    if (roll < enemyChance + 0.07) {
        const kind = HAZARD_KINDS[Math.floor(g.rng() * HAZARD_KINDS.length)]!;
        g.entities.push({
            type: "hazard",
            kind: kind,
            x: pickX(),
            y: y,
            dead: false,
            rot: g.rng() * Math.PI * 2,
        });
        return;
    }
    if (roll < enemyChance + 0.21) {
        g.entities.push(makePickup(g, "coin", pickX(), y));
        return;
    }
    if (roll < enemyChance + 0.235) {
        g.entities.push(makePickup(g, "chest", pickX(), y));
        return;
    }
    if (roll < enemyChance + 0.245) {
        g.entities.push(makePickup(g, "heal", pickX(), y));
    }
}

function makePickup(
    g: GameState,
    kind: PickupEntity["kind"],
    x: number,
    y: number,
): PickupEntity {
    return {
        type: "pickup",
        kind: kind,
        x: x,
        y: y,
        dead: false,
        phase: g.rng() * Math.PI * 2,
    };
}

function makeEnemy(g: GameState, x: number, y: number): EnemyEntity {
    const kind = ENEMY_KINDS[Math.floor(g.rng() * ENEMY_KINDS.length)]!;
    const enemy: EnemyEntity = {
        type: "enemy",
        kind: kind,
        tx: x,
        ty: y,
        x: x,
        y: y,
        progress: 0,
        dir: null,
        dead: false,
        awake: false,
        speed: kind === "chaser" ? 1.15 : kind === "drifter" ? 1.7 : 0,
        timer: 1.2 + g.rng() * 1.8,
        spin: g.rng() * Math.PI * 2,
    };
    return enemy;
}

function makeProjectile(g: GameState, x: number, y: number): ProjectileEntity {
    return { type: "proj", x: x, y: y, vx: 0, vy: 0, life: 5, dead: false };
}

// ============================================================
// Maze queries
// ============================================================
function tileOpen(g: GameState, x: number, y: number): boolean {
    if (x < 0 || x >= COLS) return false;
    if (y > g.generatedHigh) ensureMaze(g, y + 1);
    const row = g.maze.get(y);
    if (!row) return false;
    return !row.walls[x];
}

function canMove(g: GameState, x: number, y: number, dir: Dir): boolean {
    const vec = DIRECTIONS[dir];
    if (!vec) return false;
    return tileOpen(g, x + vec.x, y + vec.y);
}

// ============================================================
// Run lifecycle
// ============================================================
function createGame(character: CharacterId): GameState {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const cfg = CHARACTERS[character];
    return {
        character: character,
        seed: seed,
        rng: makeRng(seed),
        active: true,
        paused: false,
        over: false,
        time: 0,
        bonus: 0,
        distance: 0,
        hp: START_HP,
        invuln: 0,
        gauge: 0,
        boost: 0,
        surge: 0,
        shake: 0,
        flash: 0,
        player: {
            tx: START_COL,
            ty: START_ROW,
            x: START_COL,
            y: START_ROW,
            progress: 0,
            dir: null,
            queued: ["up"],
            speed: PLAYER_SPEED * cfg.speed,
            facing: "up",
        },
        maze: new Map(),
        generatedHigh: START_ROW - GENERATE_BEHIND - 1,
        prunedRow: 0,
        laneChunks: new Map(),
        entities: [],
        particles: [],
        waves: [],
        collapse: {
            active: false,
            row: START_ROW - 5.2,
            grace: GRACE_TIME,
            speed: 1.6,
        },
        newBest: false,
    };
}

function startRun(character: CharacterId): void {
    const key = CHARACTERS[character] ? character : "vela";
    state.selected = key;
    state.settings.lastCharacter = key;
    saveSettings();
    ensureAudio();
    sfx("start");

    const g = createGame(key);
    state.game = g;
    ensureMaze(g, START_ROW + GENERATE_AHEAD);

    dom.boostTint.classList.remove("on");
    dom.pauseOverlay.classList.add("hidden");
    dom.gameoverOverlay.classList.add("hidden");
    dom.touchBoost.classList.remove("visible");
    dom.boostTrack.classList.remove("ready", "nudge");
    dom.hpPips.innerHTML = "";
    for (let i = 0; i < MAX_HP; i++) {
        const pip = document.createElement("span");
        pip.className = "pip";
        dom.hpPips.appendChild(pip);
    }

    applyAccent(key);
    hudCache = {
        score: -1,
        distance: -1,
        hp: -1,
        gauge: -1,
        label: "",
        ready: false,
        boosting: false,
    };
    showScreen("game");
    resizeCanvas();
    updateHud(g);
    updateTouchBoost();
    updatePauseButton();
    lastFrame = performance.now();
}

function applyAccent(character: CharacterId): void {
    const cfg = CHARACTERS[character];
    dom.screenGame.style.setProperty("--char", cfg.color);
    dom.screenGame.style.setProperty("--char-soft", hexToRgba(cfg.color, 0.24));
}

function showScreen(name: "lobby" | "game"): void {
    state.screen = name;
    dom.screenLobby.classList.toggle("active", name === "lobby");
    dom.screenGame.classList.toggle("active", name === "game");
    if (name === "lobby") {
        updateLobby();
    } else {
        requestAnimationFrame(resizeCanvas);
    }
}

function quitToLobby(): void {
    uiClick();
    state.game = null;
    dom.pauseOverlay.classList.add("hidden");
    dom.gameoverOverlay.classList.add("hidden");
    dom.boostTint.classList.remove("on");
    dom.touchBoost.classList.remove("visible");
    showScreen("lobby");
    updatePauseButton();
    dom.startBtn.focus({ preventScroll: true });
}

function endRun(g: GameState): void {
    if (!g || g.over) return;
    g.over = true;
    g.active = false;
    g.paused = false;

    const score = totalScore(g);
    const previous = state.best[g.character] || 0;
    g.newBest = score > previous;
    if (g.newBest) {
        state.best[g.character] = score;
        saveBest();
    }
    sfx(g.newBest ? "best" : "over");

    dom.goScore.textContent = String(score);
    dom.goDistance.textContent = Math.floor(g.distance) + " m";
    dom.goBest.textContent = String(state.best[g.character] || 0);
    dom.goCharacter.textContent = CHARACTERS[g.character].name;
    dom.goNote.classList.toggle("hidden", !g.newBest);

    dom.pauseOverlay.classList.add("hidden");
    dom.gameoverOverlay.classList.remove("hidden");
    dom.boostTint.classList.remove("on");
    dom.touchBoost.classList.remove("visible");
    updateLobby();
    updatePauseButton();
    focusInside(dom.gameoverOverlay);
}

// ============================================================
// Update
// ============================================================
function updateGame(g: GameState, dt: number): void {
    g.time += dt;
    if (g.invuln > 0) g.invuln = Math.max(0, g.invuln - dt);
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
    if (g.flash > 0) g.flash = Math.max(0, g.flash - dt);

    updatePlayer(g, dt);
    ensureMaze(g, Math.ceil(g.player.y) + GENERATE_AHEAD);
    pruneMaze(g);
    g.distance = Math.max(g.distance, Math.max(0, g.player.y - START_ROW));

    updateBoost(g, dt);
    updateCollapse(g, dt);
    updateEntities(g, dt);
    updateParticles(g, dt);

    if (g.boost <= 0 && g.gauge >= 100 && state.settings.boostMode === "auto") {
        activateBoost(g);
    }

    if (g.boost > 0) {
        g.trailTimer = (g.trailTimer || 0) - dt;
        if (g.trailTimer <= 0) {
            g.trailTimer = 0.055;
            spawnParticle(
                g,
                g.player.x,
                g.player.y,
                CHARACTERS[g.character].color,
                1.4,
                0.5,
            );
        }
    }
}

function chooseDir(g: GameState, p: Player): Dir | null {
    // Drop queued entries that are illegal from here AND from the next cell
    // along the current heading (they can never fire).
    while (p.queued.length > 0) {
        const dir = p.queued[0]!;
        if (canMove(g, p.tx, p.ty, dir)) break;
        if (p.dir) {
            const v = DIRECTIONS[p.dir];
            if (canMove(g, p.tx + v.x, p.ty + v.y, dir)) break; // legal next tile
        }
        p.queued.shift(); // provably dead, discard
    }

    if (p.queued.length > 0) {
        const dir = p.queued[0]!;
        if (canMove(g, p.tx, p.ty, dir)) {
            p.queued.shift();
            return dir;
        }
        // legal only from the next tile — keep it, keep current direction here
    }

    if (p.dir && canMove(g, p.tx, p.ty, p.dir)) return p.dir;
    return null;
}

function updatePlayer(g: GameState, dt: number): void {
    const p = g.player;
    let budget = p.speed * dt;
    let guard = 0;

    while (budget > 0.00001 && guard++ < 12) {
        // Instant reversal: if mid-tile and the newest intent is backwards.
        if (
            p.dir &&
            p.progress > 0 &&
            p.queued.length &&
            p.queued[p.queued.length - 1] === OPPOSITE[p.dir]
        ) {
            const v = DIRECTIONS[p.dir];
            p.queued.pop();
            p.tx += v.x;
            p.ty += v.y; // we were heading into this tile
            p.progress = 1 - p.progress;
            p.dir = OPPOSITE[p.dir];
            p.facing = p.dir;
            continue;
        }

        if (!p.dir) {
            p.dir = chooseDir(g, p);
            if (!p.dir) break;
        }
        const vec = DIRECTIONS[p.dir];
        const remain = 1 - p.progress;
        if (budget < remain) {
            p.progress += budget;
            budget = 0;
        } else {
            budget -= remain;
            p.progress = 0;
            p.tx += vec.x;
            p.ty += vec.y;
            p.facing = p.dir;
            p.dir = chooseDir(g, p);
        }
    }

    if (p.dir) {
        const vec = DIRECTIONS[p.dir];
        p.x = p.tx + vec.x * p.progress;
        p.y = p.ty + vec.y * p.progress;
        p.facing = p.dir;
    } else {
        p.x = p.tx;
        p.y = p.ty;
    }
}

function activateBoost(g: GameState): void {
    if (g.boost > 0 || g.gauge < 100) return;
    g.boost = CHARACTERS[g.character].duration;
    g.gauge = 0;
    g.surge = 0.25;
    dom.boostTint.classList.add("on");
    dom.boostTrack.classList.remove("ready", "nudge");
    spawnBurst(g, g.player.x, g.player.y, CHARACTERS[g.character].color, 18, 5);
    sfx("boost");
}

function manualBoost(): void {
    const g = state.game;
    if (!g || !g.active || g.paused || g.over) return;
    if (g.boost > 0) return;
    ensureAudio();
    if (g.gauge >= 100) {
        activateBoost(g);
    } else if (state.settings.boostMode === "manual") {
        dom.boostTrack.classList.remove("nudge");
        void dom.boostTrack.offsetWidth;
        dom.boostTrack.classList.add("nudge");
        sfx("deny");
    }
}

function updateBoost(g: GameState, dt: number): void {
    if (g.boost <= 0) return;
    g.boost = Math.max(0, g.boost - dt);
    if (g.boost === 0) {
        dom.boostTint.classList.remove("on");
        dom.boostTrack.classList.remove("ready");
        sfx("boostEnd");
        return;
    }
    if (g.character === "rho") {
        g.surge -= dt;
        if (g.surge <= 0) {
            g.surge = 0.9;
            shockwave(g);
        }
    }
    if (g.character === "sol") {
        magnetize(g, dt);
    }
}

function updateCollapse(g: GameState, dt: number): void {
    const c = g.collapse;
    const p = g.player;

    if (!c.active) {
        c.grace -= dt;
        c.row = p.y - 5.2;
        if (c.grace <= 0) {
            c.grace = 0;
            c.active = true;
            c.speed = 1.6;
            sfx("collapse");
        }
        return;
    }

    c.speed = 1.6 + Math.min(3.9, g.time * 0.03);
    c.row += c.speed * dt;
    if (c.row < p.y - 7.5) c.row = p.y - 7.5;

    if (c.row >= p.y - 0.35) {
        spawnBurst(g, p.x, p.y, "#ff2f8a", 26, 6);
        endRun(g);
    }
}

function damagePlayer(g: GameState): void {
    if (g.invuln > 0 || g.boost > 0 || g.over) return;
    g.hp -= 1;
    g.invuln = IFRAME_TIME;
    g.flash = 0.55;
    g.shake = 0.4;
    spawnBurst(g, g.player.x, g.player.y, "#ff4d7d", 16, 5);
    sfx("hurt");
    if (g.hp <= 0) {
        g.hp = 0;
        endRun(g);
    }
}

// ============================================================
// Entities
// ============================================================
function updateEntities(g: GameState, dt: number): void {
    const p = g.player;
    for (const e of g.entities) {
        if (e.dead) continue;
        if (e.type === "enemy") updateEnemy(g, e, dt);
        else if (e.type === "proj") updateProjectile(g, e, dt);
        else if (e.type === "pickup") updatePickup(g, e, dt);
        else if (e.type === "hazard") updateHazard(g, e);
        if (!e.dead && e.y < p.y - 10) e.dead = true;
    }
    g.entities = g.entities.filter((e) => !e.dead);
}

function stepGrid(
    g: GameState,
    e: EnemyEntity,
    dt: number,
    choose: (g: GameState, e: EnemyEntity) => void,
): void {
    let budget = e.speed * dt;
    let guard = 0;
    while (budget > 0.00001 && guard++ < 8) {
        if (!e.dir) {
            choose(g, e);
            if (!e.dir) break;
        }
        const vec = DIRECTIONS[e.dir];
        const remain = 1 - e.progress;
        if (budget < remain) {
            e.progress += budget;
            budget = 0;
        } else {
            budget -= remain;
            e.progress = 0;
            e.tx += vec.x;
            e.ty += vec.y;
            choose(g, e);
        }
    }
    if (e.dir) {
        const vec = DIRECTIONS[e.dir];
        e.x = e.tx + vec.x * e.progress;
        e.y = e.ty + vec.y * e.progress;
    } else {
        e.x = e.tx;
        e.y = e.ty;
    }
}

function chooseChaserDir(g: GameState, e: EnemyEntity): void {
    const p = g.player;
    const dx = p.tx - e.tx;
    const dy = p.ty - e.ty;
    const opts: Dir[] = [];
    if (Math.abs(dy) >= Math.abs(dx)) {
        opts.push(dy >= 0 ? "up" : "down", dx >= 0 ? "right" : "left");
    } else {
        opts.push(dx >= 0 ? "right" : "left", dy >= 0 ? "up" : "down");
    }
    opts.push("up", "down", "left", "right");
    for (const dir of opts) {
        if (canMove(g, e.tx, e.ty, dir)) {
            e.dir = dir;
            return;
        }
    }
    e.dir = null;
}

function chooseDrifterDir(g: GameState, e: EnemyEntity): void {
    if (
        (e.dir === "left" || e.dir === "right") &&
        canMove(g, e.tx, e.ty, e.dir)
    )
        return;
    const alt = e.dir === "left" ? "right" : "left";
    if (canMove(g, e.tx, e.ty, alt)) {
        e.dir = alt;
        return;
    }
    for (const dir of ["up", "down", "left", "right"] as const) {
        if (canMove(g, e.tx, e.ty, dir)) {
            e.dir = dir;
            return;
        }
    }
    e.dir = null;
}

function updateEnemy(g: GameState, e: EnemyEntity, dt: number): void {
    const p = g.player;
    let d = Math.hypot(e.x - p.x, e.y - p.y);
    if (!e.awake) {
        if (d > 13) return;
        e.awake = true;
    }

    if (e.kind === "chaser") {
        stepGrid(g, e, dt, chooseChaserDir);
    } else if (e.kind === "drifter") {
        stepGrid(g, e, dt, chooseDrifterDir);
    } else {
        e.timer -= dt;
        if (e.timer <= 0) {
            e.timer = 2.2 + g.rng() * 1.4;
            fireProjectile(g, e);
        }
    }

    d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < 0.68) {
        if (g.boost > 0) {
            killEnemy(g, e);
        } else if (g.invuln <= 0) {
            damagePlayer(g);
        }
    }
}

function fireProjectile(g: GameState, e: EnemyEntity): void {
    const p = g.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 2.1;
    const proj = makeProjectile(g, e.x, e.y);
    proj.vx = (dx / len) * speed;
    proj.vy = (dy / len) * speed;
    g.entities.push(proj);
    sfx("shoot");
}

function isSolid(g: GameState, x: number, y: number): boolean {
    return !tileOpen(g, Math.round(x), Math.round(y));
}

function updateProjectile(g: GameState, e: ProjectileEntity, dt: number): void {
    e.life -= dt;
    if (e.life <= 0) {
        e.dead = true;
        return;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (isSolid(g, e.x, e.y)) {
        e.dead = true;
        return;
    }
    const p = g.player;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < 0.55 && g.boost <= 0 && g.invuln <= 0) {
        e.dead = true;
        damagePlayer(g);
    }
}

function updateHazard(g: GameState, e: HazardEntity): void {
    if (g.boost > 0 || g.invuln > 0) return;
    const p = g.player;
    if (Math.hypot(e.x - p.x, e.y - p.y) < 0.55) {
        damagePlayer(g);
    }
}

function updatePickup(g: GameState, e: PickupEntity, dt: number): void {
    e.phase += dt * 2;
    const p = g.player;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < 0.62) collectPickup(g, e);
}

function magnetize(g: GameState, dt: number): void {
    const p = g.player;
    for (const e of g.entities) {
        if (e.dead || e.type !== "pickup") continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d < MAGNET_RADIUS && d > 0.01) {
            const pull = Math.min(d, 7 * dt);
            e.x += (dx / d) * pull;
            e.y += (dy / d) * pull;
            if (d < 0.7) collectPickup(g, e);
        }
    }
}

function collectPickup(g: GameState, e: PickupEntity): void {
    if (e.dead) return;
    e.dead = true;
    const color =
        e.kind === "coin"
            ? "#ffd45e"
            : e.kind === "chest"
              ? "#ff9b32"
              : "#45f0b0";
    if (e.kind === "coin") {
        g.bonus += 20;
        addGauge(g, 8);
        sfx("coin");
    } else if (e.kind === "chest") {
        g.bonus += 60;
        addGauge(g, 34);
        sfx("chest");
    } else {
        g.hp = Math.min(MAX_HP, g.hp + 1);
        g.bonus += 15;
        sfx("heal");
    }
    spawnBurst(g, e.x, e.y, color, 10, 3.5);
}

function addGauge(g: GameState, amount: number): void {
    if (g.boost > 0) {
        const cfg = CHARACTERS[g.character];
        const extra = (amount / 100) * cfg.duration;
        const cap = cfg.duration * 1.5; // optional ceiling
        g.boost = Math.min(cap, g.boost + extra);
        return;
    }
    g.gauge = clamp(g.gauge + amount, 0, 100);
}

function killEnemy(g: GameState, e: EnemyEntity, silent?: boolean): void {
    if (e.dead) return;
    e.dead = true;
    g.bonus += 60;
    spawnBurst(g, e.x, e.y, enemyColor(e.kind), 14, 4.5);
    if (!silent) sfx("kill");
}

// Half-width of the egg at forward offset `ly` (local frame, +ly = forward).
// Returns 0 outside the shape. This is the single source of truth.
function eggHalfWidth(ly: number, radius: number): number {
    if (ly >= 0) {
        const extent = radius * EGG_FRONT;
        if (ly > extent) return 0;
        const t = ly / extent;
        return radius * Math.sqrt(1 - t * t);
    }
    const extent = radius * EGG_REAR;
    if (-ly > extent) return 0;
    const t = -ly / extent;
    return radius * (1 - t * t);
}

// Point test — derived from eggHalfWidth.
function eggInside(lx: number, ly: number, radius: number): boolean {
    return Math.abs(lx) <= eggHalfWidth(ly, radius);
}

// Local egg frame: +lx = right of facing, +ly = forward.
// eggLocal and eggWorld are inverses. If you change one, change the other.
function eggLocal(
    x: number,
    y: number,
    f: EggFrame,
): { lx: number; ly: number } {
    const d = DIRECTIONS[f.facing] || DIRECTIONS.up;
    const dx = x - f.x;
    const dy = y - f.y;
    return { lx: dx * d.y - dy * d.x, ly: dx * d.x + dy * d.y };
}

function eggWorld(
    lx: number,
    ly: number,
    f: EggFrame,
): { x: number; y: number } {
    const d = DIRECTIONS[f.facing] || DIRECTIONS.up;
    return {
        x: f.x + d.x * ly + d.y * lx,
        y: f.y + d.y * ly - d.x * lx,
    };
}

function inEgg(x: number, y: number, f: EggFrame, radius: number): boolean {
    const { lx, ly } = eggLocal(x, y, f);
    return eggInside(lx, ly, radius);
}

function shockwave(g: GameState): void {
    const p = g.player;
    g.waves.push({ x: p.x, y: p.y, age: 0, max: 0.5, facing: p.facing });
    sfx("shock");
    for (const e of g.entities) {
        if (e.dead) continue;
        if (e.type !== "enemy" && e.type !== "proj") continue;
        if (inEgg(e.x, e.y, p, SHOCK_RADIUS)) {
            if (e.type === "enemy") killEnemy(g, e, true);
            else {
                e.dead = true;
                g.bonus += 10;
            }
        }
    }
}

function prefersReduced(): boolean {
    if (state.settings.reducedEffects) return true;
    return reducedMotionQuery.matches;
}

function enemyColor(kind: EnemyEntity["kind"]): string {
    if (kind === "chaser") return "#ff5d6c";
    if (kind === "drifter") return "#3ddc97";
    return "#b46bff";
}

function spawnParticle(
    g: GameState,
    x: number,
    y: number,
    color: string,
    size: number,
    life: number,
): void {
    if (g.particles.length >= 140) return;
    const angle = g.rng() * Math.PI * 2;
    const speed = 0.4 + g.rng() * 1.8;
    g.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: life,
        max: life,
        color: color,
        size: size,
    });
}

function spawnBurst(
    g: GameState,
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
): void {
    const total = prefersReduced() ? Math.min(count, 4) : count;
    for (let i = 0; i < total; i++) {
        const angle = (i / total) * Math.PI * 2 + g.rng() * 0.6;
        const force = speed * (0.5 + g.rng() * 0.7);
        if (g.particles.length >= 140) break;
        g.particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * force,
            vy: Math.sin(angle) * force,
            life: 0.4 + g.rng() * 0.4,
            max: 0.8,
            color: color,
            size: 1.5 + g.rng() * 2,
        });
    }
}

function updateParticles(g: GameState, dt: number): void {
    for (const p of g.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
    if (g.particles.length > 140) g.particles.length = 140;

    for (const wave of g.waves) wave.age += dt;
    g.waves = g.waves.filter((w) => w.age < w.max);
}

// ============================================================
// Canvas sizing & camera
// ============================================================
function resizeCanvas(): void {
    if (!ctx) return;
    const wrap = dom.canvasWrap;
    const rect = wrap.getBoundingClientRect();
    const availW = Math.max(160, rect.width - 8);
    const availH = Math.max(240, rect.height - 8);
    const scale = Math.min(availW / VIEW_W, availH / VIEW_H);
    const cssW = Math.max(120, Math.floor(VIEW_W * scale));
    const cssH = Math.max(176, Math.floor(VIEW_H * scale));
    dom.game.style.width = cssW + "px";
    dom.game.style.height = cssH + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    dom.game.width = Math.round(VIEW_W * dpr);
    dom.game.height = Math.round(VIEW_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
}

function cameraRow(g: GameState): number {
    return g.player.y - CAMERA_OFFSET;
}

function worldToScreenY(row: number, camRow: number): number {
    return (ROWS - 1 - (row - camRow)) * TILE;
}

function centerX(x: number): number {
    return x * TILE + TILE / 2;
}

function centerY(y: number, camRow: number): number {
    return worldToScreenY(y, camRow) + TILE / 2;
}

// ============================================================
// Render
// ============================================================
function renderGame(g: GameState): void {
    const camRow = cameraRow(g);
    const reduced = prefersReduced();
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    if (g.shake > 0 && !reduced) {
        const amp = g.shake * 9;
        ctx.translate(
            (Math.random() * 2 - 1) * amp,
            (Math.random() * 2 - 1) * amp,
        );
    }

    drawFloor(camRow, g);
    drawWalls(camRow, g);
    drawMagnetField(g, camRow);
    drawPickups(g, camRow);
    drawHazards(g, camRow);
    drawEnemies(g, camRow);
    drawProjectiles(g, camRow);
    drawWaves(g, camRow);
    drawPlayer(g, camRow);
    drawCollapse(g, camRow);
    drawParticles(g, camRow);

    if (g.boost > 0) {
        const used = CHARACTERS[g.character];
        const wash = ctx.createRadialGradient(
            centerX(g.player.x),
            centerY(g.player.y, camRow),
            16,
            centerX(g.player.x),
            centerY(g.player.y, camRow),
            VIEW_W * 0.85,
        );
        wash.addColorStop(0, hexToRgba(used.color, 0.18));
        wash.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    ctx.restore();

    if (g.flash > 0) {
        ctx.fillStyle =
            "rgba(255, 60, 100, " + (g.flash * 0.45).toFixed(3) + ")";
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (g.invuln > 0 && !reduced && Math.floor(g.time * 20) % 2 === 0) {
        ctx.fillStyle = hexToRgba(CHARACTERS[g.character].color, 0.08);
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
}

function visibleRows(camRow: number): { first: number; last: number } {
    return {
        first: Math.floor(camRow) - 1,
        last: Math.floor(camRow) + ROWS + 1,
    };
}

let floorGradient: CanvasGradient | null = null;

function floorBackground(): CanvasGradient {
    if (!floorGradient) {
        const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
        gradient.addColorStop(0, "#080818");
        gradient.addColorStop(0.5, "#0a0a22");
        gradient.addColorStop(1, "#070716");
        floorGradient = gradient;
    }
    return floorGradient;
}

function drawFloor(camRow: number, g: GameState): void {
    ctx.fillStyle = floorBackground();
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const rows = visibleRows(camRow);
    const topOf = (row: number): number => worldToScreenY(row, camRow);
    const inView = (top: number): boolean => top <= VIEW_H && top + TILE >= 0;

    // Batch every same-coloured tile into one path so the style only changes
    // a handful of times per frame instead of once per tile.
    ctx.fillStyle = "#0d0d27";
    ctx.beginPath();
    for (let row = rows.first; row <= rows.last; row++) {
        const top = topOf(row);
        if (!inView(top)) continue;
        for (let x = 0; x < COLS; x++) {
            if (hash2(x, row) % 2 === 0) ctx.rect(x * TILE, top, TILE, TILE);
        }
    }
    ctx.fill();

    ctx.fillStyle = "#0b0b22";
    ctx.beginPath();
    for (let row = rows.first; row <= rows.last; row++) {
        const top = topOf(row);
        if (!inView(top)) continue;
        for (let x = 0; x < COLS; x++) {
            if (hash2(x, row) % 2 !== 0) ctx.rect(x * TILE, top, TILE, TILE);
        }
    }
    ctx.fill();

    ctx.strokeStyle = "rgba(96, 96, 190, 0.10)";
    ctx.beginPath();
    for (let row = rows.first; row <= rows.last; row++) {
        const top = topOf(row);
        if (!inView(top)) continue;
        for (let x = 0; x < COLS; x++) {
            ctx.rect(x * TILE + 0.5, top + 0.5, TILE - 1, TILE - 1);
        }
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(120, 140, 255, 0.18)";
    ctx.beginPath();
    for (let row = rows.first; row <= rows.last; row++) {
        const top = topOf(row);
        if (!inView(top)) continue;
        for (let x = 0; x < COLS; x++) {
            const seed = hash2(x, row);
            if (seed % 11 === 0) {
                ctx.rect(
                    x * TILE + (seed % 24) + 4,
                    top + ((seed >> 3) % 24) + 4,
                    2,
                    2,
                );
            }
        }
    }
    ctx.fill();
}

function drawWalls(camRow: number, g: GameState): void {
    const rows = visibleRows(camRow);
    for (let row = rows.first; row <= rows.last; row++) {
        const data = g.maze.get(row);
        if (!data) continue;
        const top = worldToScreenY(row, camRow);
        if (top > VIEW_H || top + TILE < 0) continue;
        for (let x = 0; x < COLS; x++) {
            if (!data.walls[x]) continue;
            const variant = (hash2(x, row) ^ g.seed) % sprites.walls.length;
            const img = sprites.walls[variant];
            if (img && img.complete) {
                ctx.drawImage(img, x * TILE, top, TILE, TILE);
            } else {
                ctx.fillStyle = "#22225a";
                ctx.fillRect(x * TILE, top, TILE, TILE);
            }
        }
    }
}

function drawPickups(g: GameState, camRow: number): void {
    for (const e of g.entities) {
        if (e.dead || e.type !== "pickup") continue;
        const bob = Math.sin(e.phase) * 2;
        const cx = centerX(e.x);
        const cy = centerY(e.y, camRow) + bob;
        if (cy < -20 || cy > VIEW_H + 20) continue;
        ctx.save();
        ctx.translate(cx, cy);
        if (e.kind === "coin") {
            ctx.fillStyle = "#ffd45e";
            ctx.shadowColor = "#ffd45e";
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "#a76a00";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
            ctx.stroke();
        } else if (e.kind === "chest") {
            ctx.fillStyle = "#ff9b32";
            ctx.shadowColor = "#ff9b32";
            ctx.shadowBlur = 14;
            ctx.fillRect(-9, -7, 18, 14);
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#7a3f06";
            ctx.fillRect(-9, -2, 18, 2);
            ctx.fillStyle = "#ffe0a3";
            ctx.fillRect(-2, -3, 4, 5);
        } else {
            ctx.fillStyle = "#45f0b0";
            ctx.shadowColor = "#45f0b0";
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#063a28";
            ctx.fillRect(-1.5, -5, 3, 10);
            ctx.fillRect(-5, -1.5, 10, 3);
        }
        ctx.restore();
    }
}

function drawHazards(g: GameState, camRow: number): void {
    for (const e of g.entities) {
        if (e.dead || e.type !== "hazard") continue;
        const top = worldToScreenY(e.y, camRow);
        if (top > VIEW_H || top + TILE < 0) continue;
        const img = sprites.hazards[e.kind];
        if (!img || !img.complete) continue;
        if (e.kind === "saw") {
            const cx = centerX(e.x);
            const cy = centerY(e.y, camRow);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(g.time * 4 + e.rot);
            ctx.drawImage(img, -TILE / 2, -TILE / 2, TILE, TILE);
            ctx.restore();
        } else {
            ctx.drawImage(img, e.x * TILE, top, TILE, TILE);
        }
    }
}

function drawEnemies(g: GameState, camRow: number): void {
    for (const e of g.entities) {
        if (e.dead || e.type !== "enemy") continue;
        const cx = centerX(e.x);
        const cy = centerY(e.y, camRow);
        if (cy < -24 || cy > VIEW_H + 24) continue;
        const color = enemyColor(e.kind);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = "#0a0a20";
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        if (e.kind === "chaser") {
            for (let i = 0; i < 3; i++) {
                const a = e.spin + i * ((Math.PI * 2) / 3);
                ctx.beginPath();
                ctx.arc(0, 0, 7.5, a, a + 0.7);
                ctx.stroke();
            }
        } else if (e.kind === "drifter") {
            ctx.beginPath();
            ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-7, 0);
            ctx.lineTo(7, 0);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(6, 0);
            ctx.lineTo(0, 7);
            ctx.lineTo(-6, 0);
            ctx.closePath();
            ctx.stroke();
        }
        ctx.restore();
    }
}

function drawProjectiles(g: GameState, camRow: number): void {
    const img = sprites.projectile;
    for (const e of g.entities) {
        if (e.dead || e.type !== "proj") continue;
        const cx = centerX(e.x);
        const cy = centerY(e.y, camRow);
        if (cy < -20 || cy > VIEW_H + 20) continue;
        if (img && img.complete) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(g.time * 6);
            ctx.drawImage(img, -12, -12, 24, 24);
            ctx.restore();
        } else {
            ctx.fillStyle = "#28e6ff";
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

const waveFrame: EggFrame = { x: 0, y: 0, facing: "up" };

function drawWaves(g: GameState, camRow: number): void {
    for (const wave of g.waves) {
        const t = wave.age / wave.max;

        // Same radius the hit test used, animated outward.
        const radius = SHOCK_RADIUS * t;

        // Cheap circular screen-space cull (covers the whole egg shape).
        const cx = centerX(wave.x);
        const cy = centerY(wave.y, camRow);
        const reach = radius * EGG_FRONT * TILE + TILE;
        if (
            cx < -reach ||
            cx > VIEW_W + reach ||
            cy < -reach ||
            cy > VIEW_H + reach
        )
            continue;

        waveFrame.x = wave.x;
        waveFrame.y = wave.y;
        waveFrame.facing = wave.facing;

        ctx.strokeStyle = hexToRgba(
            CHARACTERS[g.character].color,
            (1 - t) * 0.6,
        );
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        for (let i = 0; i <= WAVE_SAMPLES; i++) {
            const a = (i / WAVE_SAMPLES) * Math.PI * 2;
            const r = EGG_BOUNDARY[i]! * radius;
            // local point -> world point -> screen point
            const w = eggWorld(Math.cos(a) * r, Math.sin(a) * r, waveFrame);
            const sx = centerX(w.x);
            const sy = centerY(w.y, camRow);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }

        ctx.closePath();
        ctx.stroke();
    }
}

const PLAYER_GLOW_RADIUS = 27;
const glowSprites = new Map<string, HTMLCanvasElement>();

function playerGlowSprite(character: string, color: string): HTMLCanvasElement {
    const cached = glowSprites.get(character);
    if (cached) return cached;
    const size = PLAYER_GLOW_RADIUS * 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext("2d")!;
    const glow = g.createRadialGradient(
        PLAYER_GLOW_RADIUS,
        PLAYER_GLOW_RADIUS,
        2,
        PLAYER_GLOW_RADIUS,
        PLAYER_GLOW_RADIUS,
        PLAYER_GLOW_RADIUS,
    );
    glow.addColorStop(0, hexToRgba(color, 0.5));
    glow.addColorStop(1, hexToRgba(color, 0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(
        PLAYER_GLOW_RADIUS,
        PLAYER_GLOW_RADIUS,
        PLAYER_GLOW_RADIUS,
        0,
        Math.PI * 2,
    );
    g.fill();
    glowSprites.set(character, canvas);
    return canvas;
}

function drawPlayer(g: GameState, camRow: number): void {
    const p = g.player;
    const cfg = CHARACTERS[g.character];
    const cx = centerX(p.x);
    const cy = centerY(p.y, camRow);

    ctx.save();
    if (g.invuln > 0 && Math.floor(g.time * 18) % 2 === 0) {
        ctx.globalAlpha = 0.32;
    }
    ctx.drawImage(
        playerGlowSprite(g.character, cfg.color),
        cx - PLAYER_GLOW_RADIUS,
        cy - PLAYER_GLOW_RADIUS,
    );

    ctx.fillStyle = cfg.color;
    ctx.shadowColor = cfg.color;
    ctx.shadowBlur = g.boost > 0 ? 24 : 12;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#08081c";
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 2;
    if (g.character === "vela") {
        ctx.beginPath();
        ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
        ctx.stroke();
    } else if (g.character === "rho") {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-4.5, -4.5, 9, 9);
        ctx.restore();
    } else {
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = 0; i < 6; i++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(3, 0);
            ctx.lineTo(7.5, 0);
            ctx.stroke();
        }
        ctx.restore();
    }

    const face = DIRECTIONS[p.facing] || DIRECTIONS.up;
    ctx.fillStyle = "#08081c";
    ctx.beginPath();
    ctx.arc(cx + face.x * 9, cy - face.y * 9, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawMagnetField(g: GameState, camRow: number): void {
    if (g.character !== "sol" || g.boost <= 0) return;

    const reduced = prefersReduced();
    const p = g.player;
    const cx = centerX(p.x);
    const cy = centerY(p.y, camRow);
    const radius = MAGNET_RADIUS * TILE;
    const color = CHARACTERS.sol.color;

    ctx.save();

    // Soft fill so the reach is legible on a busy floor. Skipped in reduced mode.
    if (!reduced) {
        const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        fill.addColorStop(0, hexToRgba(color, 0.14));
        fill.addColorStop(0.7, hexToRgba(color, 0.06));
        fill.addColorStop(1, hexToRgba(color, 0));
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Inward pulse only — no static boundary ring. Starts at the full
    // magnet radius and shrinks to zero, then repeats.
    const pulseSpeed = 0.6;
    const pulseAlpha = reduced ? 0.35 : 0.7;
    const t = (g.time * pulseSpeed) % 1;
    ctx.strokeStyle = hexToRgba(color, pulseAlpha * (1 - t));
    ctx.lineWidth = reduced ? 1.5 : 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (1 - t), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

function drawCollapse(g: GameState, camRow: number): void {
    const c = g.collapse;
    const reduced = prefersReduced();
    const edge = worldToScreenY(c.row, camRow) + TILE * 0.5;

    if (!c.active) {
        if (c.grace <= 5) {
            const pulse = reduced ? 0.4 : 0.35 + 0.22 * Math.sin(g.time * 8);
            ctx.fillStyle = "rgba(255, 47, 138, " + pulse.toFixed(3) + ")";
            ctx.fillRect(0, VIEW_H - 3, VIEW_W, 3);
            ctx.font = "bold 10px 'Courier New', monospace";
            ctx.textAlign = "center";
            ctx.fillStyle = "#ff9bc4";
            ctx.fillText(
                "COLLAPSE IN " + Math.ceil(c.grace) + "s",
                VIEW_W / 2,
                VIEW_H - 10,
            );
        }
        return;
    }

    if (edge > VIEW_H + 30) return;
    const top = clamp(edge, -60, VIEW_H + 40);
    const grad = ctx.createLinearGradient(0, top - 40, 0, VIEW_H);
    grad.addColorStop(0, "rgba(255, 47, 138, 0)");
    grad.addColorStop(0.2, "rgba(255, 47, 138, 0.55)");
    grad.addColorStop(0.45, "rgba(150, 24, 190, 0.88)");
    grad.addColorStop(1, "rgba(30, 0, 60, 0.98)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, VIEW_W, VIEW_H - top);

    ctx.beginPath();
    for (let x = 0; x <= VIEW_W; x += 8) {
        const yy =
            top +
            (reduced
                ? 0
                : Math.sin(x * 0.045 + g.time * 5) * 5 +
                  Math.sin(x * 0.11 - g.time * 3) * 2);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = "#ff5aa6";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ff2f8a";
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let i = 0; i < 14; i++) {
        const seed = hash2(i, 7);
        const x = seed % VIEW_W;
        const span = Math.max(1, VIEW_H - top);
        const y = top + 10 + ((seed >> 5) % span);
        const h = 8 + ((seed >> 9) % 20);
        ctx.fillStyle =
            "rgba(255, 120, 200, " + (0.15 + ((seed >> 3) % 20) / 80) + ")";
        ctx.fillRect(x, y, 2, h);
    }
}

function drawParticles(g: GameState, camRow: number): void {
    let needsReset = false;
    for (const p of g.particles) {
        const cx = centerX(p.x);
        const cy = centerY(p.y, camRow);
        if (
            cx < -p.size ||
            cx > VIEW_W + p.size ||
            cy < -p.size ||
            cy > VIEW_H + p.size
        )
            continue;
        const alpha = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(cx, cy, p.size, 0, Math.PI * 2);
        ctx.fill();
        needsReset = true;
    }
    if (needsReset) ctx.globalAlpha = 1;
}

// ============================================================
// HUD & lobby
// ============================================================
function updateHud(g: GameState): void {
    const score = totalScore(g);
    const distance = Math.floor(g.distance);
    if (score !== hudCache.score) {
        dom.hudScore.textContent = String(score);
        hudCache.score = score;
    }
    if (distance !== hudCache.distance) {
        dom.hudDistance.textContent = distance + " m";
        hudCache.distance = distance;
    }
    if (g.hp !== hudCache.hp) {
        const pips = dom.hpPips.children;
        for (let i = 0; i < pips.length; i++) {
            const pip = pips[i];
            if (!pip) continue;
            pip.classList.toggle("lost", i >= g.hp);
        }
        hudCache.hp = g.hp;
    }
    let fillPct;
    if (g.boost > 0) {
        const cfg = CHARACTERS[g.character];
        fillPct = Math.min(100, Math.round((g.boost / cfg.duration) * 100));
    } else {
        fillPct = Math.round(g.gauge);
    }
    if (fillPct !== hudCache.gauge) {
        dom.boostFill.style.width = fillPct + "%";
        hudCache.gauge = fillPct;
    }
    let label;
    if (g.boost > 0) {
        label = "Boost " + g.boost.toFixed(1) + "s";
    } else if (g.gauge >= 100 && state.settings.boostMode === "manual") {
        label = "Ready";
    } else {
        label = state.settings.boostMode === "manual" ? "Manual" : "Auto";
    }
    if (label !== hudCache.label) {
        dom.boostLabel.textContent = label;
        hudCache.label = label;
    }
    const ready = g.gauge >= 100 && g.boost <= 0;
    if (ready !== hudCache.ready) {
        dom.boostTrack.classList.toggle("ready", ready);
        if (ready) sfx("ready");
        hudCache.ready = ready;
    }
    const boosting = g.boost > 0;
    if (boosting !== hudCache.boosting) {
        dom.boostLabel.classList.toggle("boosting", boosting);
        dom.boostTrack.classList.toggle("draining", boosting);
        hudCache.boosting = boosting;
    }
}

function updateLobby(): void {
    for (const card of dom.characters) {
        const key = card.getAttribute("data-character");
        const selected = key === state.selected;
        card.setAttribute("aria-checked", selected ? "true" : "false");
    }
    for (const node of dom.bestLabels) {
        const key = node.getAttribute("data-best");
        node.textContent = String(
            key && isCharacterId(key) ? state.best[key] || 0 : 0,
        );
    }
    const all = Object.values(state.best);
    dom.lobbyBest.textContent = String(
        all.length ? Math.max.apply(null, all) : 0,
    );
}

function selectCharacter(key: string | null): void {
    if (!isCharacterId(key)) return;
    state.selected = key;
    state.settings.lastCharacter = key;
    saveSettings();
    updateLobby();
    uiClick();
}

// ============================================================
// Settings & pause UI
// ============================================================
const coarsePointerQuery = window.matchMedia("(any-pointer: coarse)");

function isTouchDevice(): boolean {
    return (
        coarsePointerQuery.matches ||
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0
    );
}

function updatePauseButton(): void {
    const g = state.game;
    const show = Boolean(
        state.screen === "game" && g && g.active && !g.over && !g.paused,
    );
    dom.gamePause.classList.toggle("hidden", !show);
}

function focusableIn(root: HTMLElement): HTMLElement[] {
    const selector =
        "button:not([disabled]), [href], input:not([disabled]), " +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.getClientRects().length > 0,
    );
}

function focusInside(root: HTMLElement): boolean {
    const first = focusableIn(root)[0];
    if (first) {
        first.focus({ preventScroll: true });
        return true;
    }
    return false;
}

function trapFocus(e: KeyboardEvent, root: HTMLElement): void {
    if (e.code !== "Tab") return;
    const items = focusableIn(root);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (!root.contains(active)) {
        e.preventDefault();
        first.focus({ preventScroll: true });
        return;
    }
    if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
    } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
    }
}

function updateTouchBoost(): void {
    const g = state.game;
    const show =
        isTouchDevice() &&
        state.settings.boostMode === "manual" &&
        state.screen === "game" &&
        g &&
        g.active &&
        !g.over &&
        !g.paused;
    dom.touchBoost.classList.toggle("visible", Boolean(show));
}

function updateSoundUi(): void {
    const enabled = !state.settings.muted;
    dom.soundToggle.setAttribute("aria-pressed", String(enabled));
    dom.soundToggle.textContent = enabled ? "On" : "Off";
    for (const button of [dom.lobbyMute, dom.gameMute]) {
        button.setAttribute("aria-pressed", String(enabled));
        button.setAttribute("aria-label", enabled ? "Sound on" : "Sound off");
        button.setAttribute("title", enabled ? "Sound on" : "Sound off");
    }
}

function applySettingsUi(): void {
    const settings = state.settings;
    for (const btn of dom.boostModes) {
        const mode = btn.getAttribute("data-boost-mode");
        btn.setAttribute(
            "aria-checked",
            mode === settings.boostMode ? "true" : "false",
        );
    }
    if (!capturingKey) {
        dom.keyCapture.textContent = keyLabel(settings.boostKey);
    }
    dom.reducedToggle.setAttribute(
        "aria-pressed",
        settings.reducedEffects ? "true" : "false",
    );
    dom.reducedToggle.textContent = settings.reducedEffects ? "On" : "Off";
    document.body.classList.toggle("reduced", settings.reducedEffects);
    updateSoundUi();
    updateTouchBoost();
}

function toggleMute(): void {
    state.settings.muted = !state.settings.muted;
    sfxEngine.setMuted(state.settings.muted);
    saveSettings();
    applySettingsUi();
    if (!state.settings.muted) {
        ensureAudio();
        sfx("click");
    }
}

function openSettings(): void {
    const g = state.game;
    lastFocusedElement =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
    if (state.screen === "game" && g && g.active && !g.over && !g.paused) {
        g.paused = true;
        pausedBySettings = true;
        dom.pauseOverlay.classList.add("hidden");
    }
    dom.settingsModal.classList.remove("hidden");
    dom.keyWarning.classList.add("hidden");
    cancelCapture();
    applySettingsUi();
    updateTouchBoost();
    updatePauseButton();
    dom.settingsClose.focus({ preventScroll: true });
    uiClick();
}

function closeSettings(): void {
    dom.settingsModal.classList.add("hidden");
    cancelCapture();
    const restoreFocus = lastFocusedElement;
    lastFocusedElement = null;
    if (pausedBySettings && state.game && !state.game.over) {
        pausedBySettings = false;
        pauseGame(true);
    } else {
        pausedBySettings = false;
        if (restoreFocus && document.contains(restoreFocus)) {
            restoreFocus.focus({ preventScroll: true });
        }
    }
    updateTouchBoost();
    updatePauseButton();
    uiClick();
}

function pauseGame(focusPrimaryAction?: boolean): void {
    const g = state.game;
    if (!g || !g.active || g.over) return;
    g.paused = true;
    dom.pauseOverlay.classList.remove("hidden");
    if (focusPrimaryAction) focusInside(dom.pauseOverlay);
    updateTouchBoost();
    updatePauseButton();
}

function resumeGame(): void {
    const g = state.game;
    if (!g || !g.active || g.over) return;
    g.paused = false;
    dom.pauseOverlay.classList.add("hidden");
    lastFrame = performance.now();
    updateTouchBoost();
    updatePauseButton();
}

function togglePause(): void {
    const g = state.game;
    if (!g || !g.active || g.over) return;
    uiClick();
    if (g.paused) resumeGame();
    else pauseGame(true);
}

function cancelCapture(): void {
    capturingKey = false;
    dom.keyCapture.classList.remove("capturing");
    if (state.settings) {
        dom.keyCapture.textContent = keyLabel(state.settings.boostKey);
    }
}

function beginCapture(): void {
    capturingKey = true;
    dom.keyCapture.textContent = "Press a key";
    dom.keyCapture.classList.add("capturing");
    dom.keyWarning.classList.add("hidden");
}

function validateBoostKey(e: KeyboardEvent): string | null {
    if (e.ctrlKey || e.altKey || e.metaKey) {
        return "Ctrl, Alt, and Meta combinations are not allowed.";
    }
    if (RESERVED_CODES.has(e.code)) {
        return "That key is reserved for movement, pause, or the browser.";
    }
    if (!/^Key[A-Z]$/.test(e.code) && !/^Digit[0-9]$/.test(e.code)) {
        return "Choose a letter or a number key.";
    }
    return null;
}

// ============================================================
// Input
// ============================================================
const MOVE_KEYS: Record<string, Dir> = {
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
};
const SCROLL_KEYS = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Space",
]);

function queueDirection(g: GameState | null, dir: Dir): void {
    if (!g || !g.active || g.over) return;
    const q = g.player.queued;
    if (q.length >= 2) q.shift(); // keep last two intents
    q.push(dir);
}

function handleCapture(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") {
        cancelCapture();
        return;
    }
    const problem = validateBoostKey(e);
    if (problem) {
        dom.keyWarning.textContent = problem;
        dom.keyWarning.classList.remove("hidden");
        return;
    }
    state.settings.boostKey = e.code;
    saveSettings();
    capturingKey = false;
    dom.keyCapture.classList.remove("capturing");
    dom.keyCapture.textContent = keyLabel(e.code);
    dom.keyWarning.classList.add("hidden");
    applySettingsUi();
    uiClick();
}

function onKeyDown(e: KeyboardEvent): void {
    if (capturingKey) {
        handleCapture(e);
        return;
    }

    const settingsOpen = !dom.settingsModal.classList.contains("hidden");
    if (settingsOpen) {
        if (e.code === "Escape") {
            e.preventDefault();
            closeSettings();
        } else if (e.code === "Tab") {
            trapFocus(e, dom.settingsModal);
        }
        return;
    }

    if (e.code === "Escape") {
        if (state.screen === "game") {
            e.preventDefault();
            togglePause();
        }
        return;
    }

    if (e.code === "Tab" && state.screen === "game") {
        if (!dom.gameoverOverlay.classList.contains("hidden")) {
            trapFocus(e, dom.gameoverOverlay);
        } else if (!dom.pauseOverlay.classList.contains("hidden")) {
            trapFocus(e, dom.pauseOverlay);
        }
    }

    if (e.code === "Enter" || e.code === "NumpadEnter") {
        if (state.screen === "lobby") {
            e.preventDefault();
            startRun(state.selected);
            return;
        }
        const g = state.game;
        if (g && g.over) {
            e.preventDefault();
            startRun(g.character);
            return;
        }
        if (g && g.paused) {
            e.preventDefault();
            uiClick();
            resumeGame();
            return;
        }
    }

    if (state.screen !== "game") return;
    const game = state.game;
    if (!game || !game.active || game.over || game.paused) {
        if (SCROLL_KEYS.has(e.code)) e.preventDefault();
        return;
    }

    if (SCROLL_KEYS.has(e.code)) e.preventDefault();

    const move = MOVE_KEYS[e.code];
    if (move) {
        if (!e.repeat) queueDirection(game, move);
        return;
    }

    if (
        state.settings.boostMode === "manual" &&
        e.code === state.settings.boostKey
    ) {
        e.preventDefault();
        if (!e.repeat) manualBoost();
    }
}

let touchStart: { x: number; y: number } | null = null;

function onTouchStart(e: TouchEvent): void {
    if (state.screen !== "game") return;
    const t = e.changedTouches[0];
    if (!t) return;
    touchStart = { x: t.clientX, y: t.clientY };
}

function onTouchMove(e: TouchEvent): void {
    if (!touchStart || state.screen !== "game") return;
    const g = state.game;
    if (!g || !g.active || g.over || g.paused) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return;
    if (Math.abs(dx) > Math.abs(dy)) {
        queueDirection(g, dx > 0 ? "right" : "left");
    } else {
        queueDirection(g, dy > 0 ? "down" : "up");
    }
    touchStart = { x: t.clientX, y: t.clientY };
}

function autoPause(): void {
    const g = state.game;
    if (state.screen !== "game" || !g || !g.active || g.over || g.paused)
        return;
    if (!dom.settingsModal.classList.contains("hidden")) return;
    pauseGame();
}

function bindEvents(): void {
    document.addEventListener("keydown", onKeyDown);

    dom.lobbySettings.addEventListener("click", openSettings);
    dom.gameSettings.addEventListener("click", openSettings);
    dom.lobbyMute.addEventListener("click", toggleMute);
    dom.gameMute.addEventListener("click", toggleMute);
    dom.gamePause.addEventListener("click", () => {
        uiClick();
        pauseGame(true);
    });
    dom.startBtn.addEventListener("click", () => startRun(state.selected));
    dom.resetProgress.addEventListener("click", () => {
        if (!window.confirm("Reset all Midnight Runner best scores?")) return;
        uiClick();
        resetBestScores();
        window.alert("Progress reset.");
    });

    for (const card of dom.characters) {
        card.addEventListener("click", () => {
            selectCharacter(card.getAttribute("data-character"));
        });
    }

    dom.boostModes.forEach((btn) => {
        btn.addEventListener("click", () => {
            state.settings.boostMode =
                btn.getAttribute("data-boost-mode") === "manual"
                    ? "manual"
                    : "auto";
            saveSettings();
            applySettingsUi();
            uiClick();
        });
    });

    dom.keyCapture.addEventListener("click", () => {
        uiClick();
        if (capturingKey) cancelCapture();
        else beginCapture();
    });

    dom.reducedToggle.addEventListener("click", () => {
        state.settings.reducedEffects = !state.settings.reducedEffects;
        saveSettings();
        applySettingsUi();
        uiClick();
    });

    dom.soundToggle.addEventListener("click", toggleMute);

    dom.settingsClose.addEventListener("click", closeSettings);
    dom.settingsModal.addEventListener("click", (e) => {
        if (e.target === dom.settingsModal) closeSettings();
    });

    dom.pauseResume.addEventListener("click", () => {
        uiClick();
        resumeGame();
    });
    dom.pauseSettings.addEventListener("click", openSettings);
    dom.pauseQuit.addEventListener("click", quitToLobby);
    dom.goRetry.addEventListener("click", () => {
        const g = state.game;
        startRun(g ? g.character : state.selected);
    });
    dom.goLobby.addEventListener("click", quitToLobby);
    dom.touchBoost.addEventListener("click", manualBoost);

    dom.game.addEventListener("touchstart", onTouchStart, { passive: true });
    dom.game.addEventListener("touchmove", onTouchMove, { passive: false });
    dom.game.addEventListener("touchend", () => {
        touchStart = null;
    });
    dom.game.addEventListener("touchcancel", () => {
        touchStart = null;
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) autoPause();
        else resumeAudio();
    });
    window.addEventListener("blur", autoPause);
    window.addEventListener("resize", () => {
        if (state.screen === "game") {
            resizeCanvas();
            if (state.game) renderGame(state.game);
        }
    });
}

// ============================================================
// Main loop & boot
// ============================================================
function loop(now: number): void {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
    lastFrame = now;
    const g = state.game;
    if (state.screen === "game" && g && g.active && !g.paused && !g.over) {
        updateGame(g, dt);
        renderGame(g);
        updateHud(g);
    }
    rafId = requestAnimationFrame(loop);
}

function init(): void {
    cacheDom();
    const context = dom.game.getContext("2d");
    if (!context) return;
    ctx = context;
    state.selected = state.settings.lastCharacter;
    initSprites();
    applySettingsUi();
    updateLobby();
    bindEvents();
    updatePauseButton();
    resizeCanvas();
    lastFrame = performance.now();
    rafId = requestAnimationFrame(loop);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        cancelAnimationFrame(rafId);
    });
    import.meta.hot.accept(() => {
        location.reload();
    });
}

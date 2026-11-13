export {};

import { createSfxEngine, type NoiseOptions, type ToneOptions } from "../sfx";

/* Lux — a survivor-style glow arena. Light is health, vision, and weapon range. */

type WeaponId = "orbit" | "bolt" | "pulse" | "chain" | "scatter" | "sparks";
type BasicEnemyKind =
    | "chaser"
    | "swarmer"
    | "tank"
    | "ranged"
    | "spartan"
    | "bomber";
type BossKind = "warden" | "cinder" | "herald" | "colossus" | "reaper";
type EnemyKind = BasicEnemyKind | "boss";
type StatId =
    "ember" | "wick" | "boots" | "focus" | "lens" | "cinder" | "photon";

interface LuxSettings {
    muted: boolean;
    reducedEffects: boolean;
    dashKey: string;
}

interface PlayerState {
    x: number;
    y: number;
    radius: number;
    facingX: number;
    facingY: number;
    invuln: number;
    dashTime: number;
    dashCooldown: number;
    dashDirX: number;
    dashDirY: number;
}

interface PlayerStats {
    speedMult: number;
    damageMult: number;
    radiusBonus: number;
    dashCdMult: number;
    sparkDamageMult: number;
}

interface Enemy {
    id: number;
    kind: EnemyKind;
    bossKind?: BossKind;
    life?: number;
    dashTime?: number;
    dashDirX?: number;
    dashDirY?: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    radius: number;
    speed: number;
    damage: number;
    lightReward: number;
    xpReward: number;
    color: string;
    fireTimer: number;
    orbitCd: number;
    wobble: number;
}

interface Projectile {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    damage: number;
    radius: number;
    pierce: number;
    hitIds: number[];
    color: string;
    turnRate: number;
    dead: boolean;
}

interface EnemyShot {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    damage: number;
    radius: number;
    dead: boolean;
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

interface RingEffect {
    kind: "ring";
    x: number;
    y: number;
    age: number;
    max: number;
    radius: number;
    color: string;
    lineWidth: number;
}

interface ChainEffect {
    kind: "chain";
    points: { x: number; y: number }[];
    age: number;
    max: number;
    color: string;
}

type Effect = RingEffect | ChainEffect;

interface GameState {
    active: boolean;
    paused: boolean;
    over: boolean;
    levelUpOpen: boolean;
    time: number;
    kills: number;
    level: number;
    xp: number;
    xpNeeded: number;
    pendingPicks: number;
    light: number;
    maxLight: number;
    drain: number;
    player: PlayerState;
    stats: PlayerStats;
    upgrades: Record<StatId, number>;
    weapons: Record<WeaponId, number>;
    weaponCd: Record<WeaponId, number>;
    enemies: Enemy[];
    projectiles: Projectile[];
    enemyShots: EnemyShot[];
    particles: Particle[];
    effects: Effect[];
    nextEnemyId: number;
    spawnTimer: number;
    nextBossAt: number;
    bossTier: number;
    shake: number;
    flash: number;
    newBest: boolean;
    camX: number;
    camY: number;
    orbitAngle: number;
    keys: Set<string>;
    pointerActive: boolean;
    pointerX: number;
    pointerY: number;
    lastKillSfx: number;
    lastShootSfx: number;
}

interface WeaponConfig {
    id: WeaponId;
    name: string;
    evolvedName: string;
    glyph: string;
    color: string;
    desc: string;
    evoDesc: string;
}

interface EnemyConfig {
    hp: number;
    speed: number;
    radius: number;
    damage: number;
    light: number;
    xp: number;
    color: string;
}

interface StatUpgradeConfig {
    name: string;
    desc: string;
    max: number;
    requires?: WeaponId;
}

interface UpgradeChoice {
    kind: "weapon" | "stat" | "fallback";
    title: string;
    desc: string;
    meta: string;
    weapon?: WeaponId;
    stat?: StatId;
    evolve?: boolean;
}

interface AppState {
    screen: "lobby" | "game";
    settings: LuxSettings;
    best: number;
    game: GameState | null;
}

interface HudCache {
    time: number;
    kills: number;
    level: number;
    light: number;
    lightPct: number;
    lightState: string;
    weaponSig: string;
}

interface DashCache {
    ready: boolean;
    offset: number;
    active: boolean;
}

interface DomCache {
    screenLobby: HTMLElement;
    screenGame: HTMLElement;
    lobbyMute: HTMLElement;
    lobbySettings: HTMLElement;
    lobbyBest: HTMLElement;
    startBtn: HTMLElement;
    resetProgress: HTMLElement;
    gamePause: HTMLElement;
    gameMute: HTMLElement;
    gameSettings: HTMLElement;
    gameBack: HTMLElement;
    hudTime: HTMLElement;
    hudKills: HTMLElement;
    hudLevel: HTMLElement;
    lightTrack: HTMLElement;
    lightFill: HTMLElement;
    lightValue: HTMLElement;
    weaponRow: HTMLElement;
    canvasWrap: HTMLElement;
    game: HTMLCanvasElement;
    touchDash: HTMLElement;
    dashStatus: HTMLElement;
    dashRingFill: SVGCircleElement;
    dashLive: HTMLElement;
    levelupOverlay: HTMLElement;
    levelupTitle: HTMLElement;
    levelupCards: HTMLElement;
    pauseOverlay: HTMLElement;
    pauseResume: HTMLElement;
    pauseSettings: HTMLElement;
    pauseQuit: HTMLElement;
    runoverOverlay: HTMLElement;
    goTime: HTMLElement;
    goKills: HTMLElement;
    goLevel: HTMLElement;
    goBest: HTMLElement;
    goNote: HTMLElement;
    goRetry: HTMLElement;
    goLobby: HTMLElement;
    settingsModal: HTMLElement;
    soundToggle: HTMLElement;
    reducedToggle: HTMLElement;
    dashKeyBtn: HTMLElement;
    dashKeyError: HTMLElement;
    dashKeyHint: HTMLElement;
    settingsClose: HTMLElement;
    live: HTMLElement;
}

// ============================================================
// Config
// ============================================================
const VIEW_W = 960;
const VIEW_H = 640;
const ARENA_W = 1200;
const ARENA_H = 900;
const SETTINGS_KEY = "lux-settings-v1";
const BEST_KEY = "lux-best-v1";
const DASH_DEFAULT = "Space";

const BASE_LIGHT = 100;
const BASE_DRAIN = 2;
const BASE_SPEED = 205;
const PLAYER_RADIUS = 11;
const IFRAME_TIME = 0.85;
const DASH_TIME = 0.16;
const DASH_COOLDOWN = 1.7;
const DASH_RING_LENGTH = 289; // Keep in sync with .dash-ring-fill stroke-dasharray.
const DASH_SPEED = 820;
const DASH_IFRAME = 0.36;
const MAX_PARTICLES = 200;
const BOMBER_FUSE = 2.2;
const BOMBER_BLAST = 96;
const SPARTAN_DASH_INTERVAL = 3;
const SPARTAN_DASH_TIME = 0.2;
const SPARTAN_DASH_SPEED = 520;
const TAU = Math.PI * 2;

const WEAPONS: Record<WeaponId, WeaponConfig> = {
    orbit: {
        id: "orbit",
        name: "Halo",
        evolvedName: "Twin Halo",
        glyph: "◎",
        color: "#ffd166",
        desc: "Blades orbit your body, cutting anything near the light.",
        evoDesc: "A wider ring of five blades with heavier hits.",
    },
    bolt: {
        id: "bolt",
        name: "Lance",
        evolvedName: "Sun Lance",
        glyph: "➤",
        color: "#ffe8a3",
        desc: "Auto-fires a focused bolt at the nearest target.",
        evoDesc: "Twin piercing bolts punch through two enemies.",
    },
    pulse: {
        id: "pulse",
        name: "Nova",
        evolvedName: "Supernova",
        glyph: "✹",
        color: "#ff9e5e",
        desc: "A periodic shockwave burns everything close to you.",
        evoDesc: "The pulse reaches the full glow radius.",
    },
    chain: {
        id: "chain",
        name: "Link",
        evolvedName: "Storm Link",
        glyph: "⚡",
        color: "#a8e6ff",
        desc: "Lightning arcs from target to target inside your glow.",
        evoDesc: "Chains through two more enemies with brighter arcs.",
    },
    scatter: {
        id: "scatter",
        name: "Scatter",
        evolvedName: "Sunburst",
        glyph: "✸",
        color: "#ffb3c7",
        desc: "Sprays a short fan of burning shards at the nearest foe.",
        evoDesc: "A dense seven-shard fan with extra punch.",
    },
    sparks: {
        id: "sparks",
        name: "Sparks",
        evolvedName: "Swarm",
        glyph: "✨",
        color: "#aaffd0",
        desc: "Sparks that seek the nearest enemy inside your glow.",
        evoDesc: "A larger swarm that pierces two targets.",
    },
};

const WEAPON_IDS: WeaponId[] = [
    "orbit",
    "bolt",
    "pulse",
    "chain",
    "scatter",
    "sparks",
];

const STAT_UPGRADES: Record<StatId, StatUpgradeConfig> = {
    ember: {
        name: "Ember Core",
        desc: "Max light +20. Current light rises by 20.",
        max: 5,
    },
    wick: {
        name: "Steady Flame",
        desc: "Light drains 0.18/sec slower.",
        max: 5,
    },
    boots: {
        name: "Swift Ash",
        desc: "Move speed +8%.",
        max: 5,
    },
    focus: {
        name: "Keen Light",
        desc: "All weapon damage +15%.",
        max: 5,
    },
    lens: {
        name: "Wide Halo",
        desc: "Glow radius +10 px. Vision and weapon range grow together.",
        max: 3,
    },
    cinder: {
        name: "Quick Step",
        desc: "Dash cooldown -12%.",
        max: 5,
    },
    photon: {
        name: "Rich Photons",
        desc: "Sparks deal +30% more damage.",
        max: 4,
        requires: "sparks",
    },
};

const STAT_IDS: StatId[] = [
    "ember",
    "wick",
    "boots",
    "focus",
    "lens",
    "cinder",
    "photon",
];

const ENEMY_CONFIG: Record<BasicEnemyKind, EnemyConfig> = {
    chaser: {
        hp: 18,
        speed: 64,
        radius: 14,
        damage: 12,
        light: 4,
        xp: 1,
        color: "#ff5d6c",
    },
    swarmer: {
        hp: 8,
        speed: 106,
        radius: 10,
        damage: 7,
        light: 3,
        xp: 1,
        color: "#ff9f45",
    },
    tank: {
        hp: 52,
        speed: 34,
        radius: 22,
        damage: 22,
        light: 11,
        xp: 3,
        color: "#b07bff",
    },
    ranged: {
        hp: 22,
        speed: 46,
        radius: 15,
        damage: 9,
        light: 6,
        xp: 2,
        color: "#4fd1c5",
    },
    spartan: {
        hp: 40,
        speed: 72,
        radius: 16,
        damage: 50,
        light: 9,
        xp: 3,
        color: "#e8e0c8",
    },
    bomber: {
        hp: 26,
        speed: 48,
        radius: 16,
        damage: 42,
        light: 8,
        xp: 3,
        color: "#ff9a3c",
    },
};

interface BossConfig {
    name: string;
    hp: number;
    hpScale: number;
    speed: number;
    radius: number;
    damage: number;
    light: number;
    xp: number;
    color: string;
}

const BOSS_CONFIG: Record<BossKind, BossConfig> = {
    warden: {
        name: "Warden",
        hp: 230,
        hpScale: 0.85,
        speed: 30,
        radius: 42,
        damage: 28,
        light: 25,
        xp: 8,
        color: "#ff7a90",
    },
    cinder: {
        name: "Cinder",
        hp: 165,
        hpScale: 0.7,
        speed: 44,
        radius: 36,
        damage: 22,
        light: 28,
        xp: 9,
        color: "#ffb03a",
    },
    herald: {
        name: "Herald",
        hp: 130,
        hpScale: 0.6,
        speed: 86,
        radius: 30,
        damage: 26,
        light: 22,
        xp: 8,
        color: "#7fe7ff",
    },
    colossus: {
        name: "Colossus",
        hp: 460,
        hpScale: 1,
        speed: 22,
        radius: 54,
        damage: 42,
        light: 48,
        xp: 15,
        color: "#b07bff",
    },
    reaper: {
        name: "Reaper",
        hp: 84,
        hpScale: 0.35,
        speed: 74,
        radius: 34,
        damage: 9999,
        light: 45,
        xp: 14,
        color: "#d8b4ff",
    },
};

const MOVE_KEYS = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
]);
const SCROLL_KEYS = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Space",
]);
const RESERVED_CODES = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Escape",
    "Enter",
    "NumpadEnter",
    "Tab",
]);
const MODIFIER_ONLY_CODES = new Set([
    "ShiftLeft",
    "ShiftRight",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
]);
const KEY_LABELS: Record<string, string> = {
    Space: "Space",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    MetaLeft: "Left Meta",
    MetaRight: "Right Meta",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    NumpadEnter: "Numpad Enter",
    Escape: "Esc",
    Tab: "Tab",
    Backspace: "Backspace",
    CapsLock: "Caps Lock",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
};

function formatKey(code: string): string {
    return (
        KEY_LABELS[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "")
    );
}

function hasBindConflict(code: string): boolean {
    return RESERVED_CODES.has(code) || MOVE_KEYS.has(code);
}

// ============================================================
// Helpers
// ============================================================
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el as T;
}

function hexToRgba(hex: string, alpha: number): string {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

function formatClock(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(seconds).padStart(2, "0")
    );
}

function distance(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(ax - bx, ay - by);
}

function shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const a = items[i]!;
        const b = items[j]!;
        items[i] = b;
        items[j] = a;
    }
    return items;
}

function xpForLevel(level: number): number {
    return 5 + (level - 1) * 3;
}

function lightRadiusOf(g: GameState): number {
    return 60 + g.light * 2.4 + g.stats.radiusBonus;
}

// ============================================================
// Persistence
// ============================================================
function loadSettings(): LuxSettings {
    const defaults: LuxSettings = {
        muted: false,
        reducedEffects: false,
        dashKey: DASH_DEFAULT,
    };
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return defaults;
        const data = JSON.parse(raw) as Record<string, unknown>;
        const dashKey =
            typeof data.dashKey === "string" && data.dashKey.trim() !== ""
                ? data.dashKey
                : DASH_DEFAULT;
        return {
            muted: Boolean(data.muted),
            reducedEffects: Boolean(data.reducedEffects),
            dashKey,
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

function loadBest(): number {
    let best = 0;
    try {
        const raw = localStorage.getItem(BEST_KEY);
        if (!raw) return best;
        const data = JSON.parse(raw) as unknown;
        if (typeof data === "number" && Number.isFinite(data)) {
            best = Math.max(0, Math.floor(data));
        } else if (data && typeof data === "object") {
            const record = data as Record<string, unknown>;
            const value = record.bestSeconds ?? record.best;
            if (typeof value === "number" && Number.isFinite(value)) {
                best = Math.max(0, Math.floor(value));
            }
        }
    } catch (err) {
        /* storage unavailable */
    }
    return best;
}

function saveBest(): void {
    try {
        localStorage.setItem(
            BEST_KEY,
            JSON.stringify({ bestSeconds: state.best }),
        );
    } catch (err) {
        /* storage unavailable */
    }
}

// ============================================================
// State, DOM & audio
// ============================================================
const state: AppState = {
    screen: "lobby",
    settings: loadSettings(),
    best: loadBest(),
    game: null,
};

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
        case "shoot":
            tone(720, 0.05, "square", 0.016, 520, 0, { reverb: 0.05 });
            break;
        case "kill":
            tone(660, 0.07, "sine", 0.028, 900, 0, { reverb: 0.1 });
            break;
        case "hit":
            noiseBurst(0.18, 0.05, 260, 0, { reverb: 0.2 });
            tone(120, 0.26, "sawtooth", 0.065, 55, 0, {
                sub: true,
                drive: 0.2,
                reverb: 0.2,
            });
            break;
        case "levelup":
            tone(523, 0.12, "sine", 0.05, null, 0, { detune: 7, reverb: 0.22 });
            tone(659, 0.12, "sine", 0.05, null, 0.08, {
                detune: 7,
                reverb: 0.24,
            });
            tone(784, 0.18, "sine", 0.055, null, 0.16, {
                detune: 7,
                reverb: 0.26,
            });
            tone(1046, 0.28, "sine", 0.06, null, 0.24, {
                detune: 7,
                reverb: 0.3,
            });
            break;
        case "dash":
            noiseBurst(0.18, 0.035, 1200, 0, { reverb: 0.12 });
            tone(330, 0.16, "triangle", 0.035, 170, 0, { reverb: 0.12 });
            break;
        case "boss":
            tone(70, 0.95, "sawtooth", 0.08, 40, 0, {
                sub: true,
                drive: 0.2,
                reverb: 0.3,
            });
            noiseBurst(0.65, 0.035, 150, 0, { reverb: 0.28 });
            break;
        case "reaper":
            tone(1180, 0.3, "sawtooth", 0.045, 480, 0, {
                drive: 0.35,
                reverb: 0.32,
            });
            tone(84, 1.1, "sawtooth", 0.07, 38, 0, {
                sub: true,
                drive: 0.25,
                reverb: 0.34,
            });
            noiseBurst(0.75, 0.04, 900, 0, { reverb: 0.32 });
            break;
        case "bomb":
            noiseBurst(0.32, 0.06, 180, 0, { reverb: 0.2 });
            tone(95, 0.38, "sawtooth", 0.07, 42, 0, {
                sub: true,
                drive: 0.3,
                reverb: 0.22,
            });
            break;
        case "over":
            tone(210, 1.35, "sawtooth", 0.08, 40, 0, {
                sub: true,
                drive: 0.2,
                reverb: 0.3,
            });
            noiseBurst(0.9, 0.04, 190, 0, { reverb: 0.28 });
            break;
        case "best":
            tone(523, 0.16, "sine", 0.055, null, 0.8, {
                detune: 8,
                reverb: 0.26,
            });
            tone(659, 0.16, "sine", 0.055, null, 0.92, {
                detune: 8,
                reverb: 0.28,
            });
            tone(784, 0.3, "sine", 0.06, null, 1.04, {
                detune: 8,
                reverb: 0.3,
            });
            break;
        case "click":
        default:
            tone(340, 0.06, "square", 0.026, null, 0, { reverb: 0.08 });
            break;
    }
}

function uiClick(): void {
    ensureAudio();
    sfx("click");
}

let dom: DomCache;
let ctx: CanvasRenderingContext2D;
let rafId = 0;
let lastFrame = 0;
let pausedBySettings = false;
let lastFocusedElement: HTMLElement | null = null;
let listeningForKey = false;
let previousDashKey: string | null = null;
let currentChoices: UpgradeChoice[] = [];
let hudCache: HudCache = {
    time: -1,
    kills: -1,
    level: -1,
    light: -1,
    lightPct: -1,
    lightState: "",
    weaponSig: "",
};
let dashCache: DashCache = { ready: false, offset: -1, active: false };
let dashWasCharging = false;
let dashReadyAnnounced = false;
const reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
);

function cacheDom(): void {
    dom = {
        screenLobby: byId("screen-lobby"),
        screenGame: byId("screen-game"),
        lobbyMute: byId("lobby-mute"),
        lobbySettings: byId("lobby-settings"),
        lobbyBest: byId("lobby-best"),
        startBtn: byId("start-btn"),
        resetProgress: byId("reset-progress"),
        gamePause: byId("game-pause"),
        gameMute: byId("game-mute"),
        gameSettings: byId("game-settings"),
        gameBack: byId("game-back"),
        hudTime: byId("hud-time"),
        hudKills: byId("hud-kills"),
        hudLevel: byId("hud-level"),
        lightTrack: byId("light-track"),
        lightFill: byId("light-fill"),
        lightValue: byId("light-value"),
        weaponRow: byId("weapon-row"),
        canvasWrap: byId("canvas-wrap"),
        game: byId<HTMLCanvasElement>("game"),
        touchDash: byId("touch-dash"),
        dashStatus: byId("dash-status"),
        dashRingFill: document.querySelector<SVGCircleElement>(
            "#dash-ring-fill",
        )!,
        dashLive: byId("dash-live"),
        levelupOverlay: byId("levelup-overlay"),
        levelupTitle: byId("levelup-title"),
        levelupCards: byId("levelup-cards"),
        pauseOverlay: byId("pause-overlay"),
        pauseResume: byId("pause-resume"),
        pauseSettings: byId("pause-settings"),
        pauseQuit: byId("pause-quit"),
        runoverOverlay: byId("runover-overlay"),
        goTime: byId("go-time"),
        goKills: byId("go-kills"),
        goLevel: byId("go-level"),
        goBest: byId("go-best"),
        goNote: byId("go-note"),
        goRetry: byId("go-retry"),
        goLobby: byId("go-lobby"),
        settingsModal: byId("settings-modal"),
        soundToggle: byId("sound-toggle"),
        reducedToggle: byId("reduced-toggle"),
        dashKeyBtn: byId("dash-key-btn"),
        dashKeyError: byId("dash-key-error"),
        dashKeyHint: byId("dash-key-hint"),
        settingsClose: byId("settings-close"),
        live: byId("live"),
    };
}

function prefersReduced(): boolean {
    if (state.settings.reducedEffects) return true;
    return reducedMotionQuery.matches;
}

function announce(message: string): void {
    if (!dom) return;
    dom.live.textContent = message;
}

// ============================================================
// Run lifecycle
// ============================================================
function createGame(): GameState {
    return {
        active: true,
        paused: false,
        over: false,
        levelUpOpen: false,
        time: 0,
        kills: 0,
        level: 1,
        xp: 0,
        xpNeeded: xpForLevel(1),
        pendingPicks: 0,
        light: BASE_LIGHT,
        maxLight: BASE_LIGHT,
        drain: BASE_DRAIN,
        player: {
            x: ARENA_W / 2,
            y: ARENA_H / 2,
            radius: PLAYER_RADIUS,
            facingX: 0,
            facingY: -1,
            invuln: 0,
            dashTime: 0,
            dashCooldown: 0,
            dashDirX: 0,
            dashDirY: 0,
        },
        stats: {
            speedMult: 1,
            damageMult: 1,
            radiusBonus: 0,
            dashCdMult: 1,
            sparkDamageMult: 1,
        },
        upgrades: {
            ember: 0,
            wick: 0,
            boots: 0,
            focus: 0,
            lens: 0,
            cinder: 0,
            photon: 0,
        },
        weapons: {
            orbit: 0,
            bolt: 1,
            pulse: 0,
            chain: 0,
            scatter: 0,
            sparks: 0,
        },
        weaponCd: {
            orbit: 0,
            bolt: 0,
            pulse: 0,
            chain: 0,
            scatter: 0,
            sparks: 0,
        },
        enemies: [],
        projectiles: [],
        enemyShots: [],
        particles: [],
        effects: [],
        nextEnemyId: 1,
        spawnTimer: 1.1,
        nextBossAt: 60,
        bossTier: 0,
        shake: 0,
        flash: 0,
        newBest: false,
        camX: 0,
        camY: 0,
        orbitAngle: 0,
        keys: new Set<string>(),
        pointerActive: false,
        pointerX: ARENA_W / 2,
        pointerY: ARENA_H / 2,
        lastKillSfx: 0,
        lastShootSfx: 0,
    };
}

function startRun(): void {
    ensureAudio();
    const g = createGame();
    updateCamera(g);
    state.game = g;

    dom.levelupOverlay.classList.add("hidden");
    dom.pauseOverlay.classList.add("hidden");
    dom.runoverOverlay.classList.add("hidden");
    dom.settingsModal.classList.add("hidden");
    cancelDashKeyListening();
    pausedBySettings = false;
    currentChoices = [];
    hudCache = {
        time: -1,
        kills: -1,
        level: -1,
        light: -1,
        lightPct: -1,
        lightState: "",
        weaponSig: "",
    };
    dashCache = { ready: false, offset: -1, active: false };
    dashWasCharging = false;
    dashReadyAnnounced = false;
    dom.dashLive.textContent = "";

    showScreen("game");
    resizeCanvas();
    updateHud(g);
    updatePauseButton();
    dom.game.focus({ preventScroll: true });
    lastFrame = performance.now();
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
    pausedBySettings = false;
    currentChoices = [];
    dom.levelupOverlay.classList.add("hidden");
    dom.pauseOverlay.classList.add("hidden");
    dom.runoverOverlay.classList.add("hidden");
    dom.settingsModal.classList.add("hidden");
    cancelDashKeyListening();
    showScreen("lobby");
    updatePauseButton();
    dom.startBtn.focus({ preventScroll: true });
}

function endRun(g: GameState): void {
    if (!g || g.over) return;
    g.over = true;
    g.active = false;
    g.paused = false;
    g.levelUpOpen = false;
    g.pointerActive = false;
    g.keys.clear();

    const survived = Math.floor(g.time);
    const previous = state.best;
    g.newBest = survived > previous;
    if (g.newBest) {
        state.best = survived;
        saveBest();
    }

    dom.goTime.textContent = formatClock(survived);
    dom.goKills.textContent = String(g.kills);
    dom.goLevel.textContent = String(g.level);
    dom.goBest.textContent = "Best " + formatClock(state.best);
    dom.goNote.classList.toggle("hidden", !g.newBest);

    dom.levelupOverlay.classList.add("hidden");
    dom.pauseOverlay.classList.add("hidden");
    dom.runoverOverlay.classList.remove("hidden");
    updateLobby();
    updatePauseButton();
    focusInside(dom.runoverOverlay);

    sfx("over");
    if (g.newBest) sfx("best");
    announce("Run ended. Survived " + formatClock(survived) + ".");
}

// ============================================================
// Update
// ============================================================
function updateGame(g: GameState, dt: number): void {
    g.time += dt;
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
    if (g.flash > 0) g.flash = Math.max(0, g.flash - dt);

    updatePlayer(g, dt);
    updateCamera(g);

    g.light -= g.drain * dt;
    if (g.light <= 0) {
        g.light = 0;
        endRun(g);
        return;
    }

    updateSpawning(g, dt);

    while (g.time >= g.nextBossAt) {
        if (!g.enemies.some((e) => e.kind === "boss" && e.hp > 0)) {
            spawnBoss(g, g.bossTier);
            g.bossTier += 1;
        }
        g.nextBossAt += 60;
    }

    updateEnemies(g, dt);
    if (g.over) return;
    updateWeapons(g, dt);
    updateProjectiles(g, dt);
    updateEnemyShots(g, dt);
    if (g.over) return;
    updateParticles(g, dt);
    updateEffects(g, dt);
}

function readMoveDir(g: GameState): { x: number; y: number } {
    let dx = 0;
    let dy = 0;
    if (g.keys.has("KeyA") || g.keys.has("ArrowLeft")) dx -= 1;
    if (g.keys.has("KeyD") || g.keys.has("ArrowRight")) dx += 1;
    if (g.keys.has("KeyW") || g.keys.has("ArrowUp")) dy -= 1;
    if (g.keys.has("KeyS") || g.keys.has("ArrowDown")) dy += 1;

    if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1;
        return { x: dx / len, y: dy / len };
    }

    if (g.pointerActive) {
        const px = g.pointerX - g.player.x;
        const py = g.pointerY - g.player.y;
        const len = Math.hypot(px, py);
        if (len > 6) return { x: px / len, y: py / len };
    }

    return { x: 0, y: 0 };
}

function updatePlayer(g: GameState, dt: number): void {
    const p = g.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);

    const dir = readMoveDir(g);

    if (p.dashTime > 0) {
        p.dashTime = Math.max(0, p.dashTime - dt);
        p.x += p.dashDirX * DASH_SPEED * dt;
        p.y += p.dashDirY * DASH_SPEED * dt;
        p.invuln = Math.max(p.invuln, 0.12);
        if (!prefersReduced() && Math.random() < 0.75) {
            spawnParticle(g, p.x, p.y, "#ffe8a3", 2 + Math.random() * 2, 0.32);
        }
    } else {
        const speed = BASE_SPEED * g.stats.speedMult;
        p.x += dir.x * speed * dt;
        p.y += dir.y * speed * dt;
        if (dir.x !== 0 || dir.y !== 0) {
            p.facingX = dir.x;
            p.facingY = dir.y;
        }
    }

    p.x = clamp(p.x, p.radius + 4, ARENA_W - p.radius - 4);
    p.y = clamp(p.y, p.radius + 4, ARENA_H - p.radius - 4);
}

function tryDash(g: GameState): void {
    if (!g.active || g.paused || g.over || g.levelUpOpen) return;
    const p = g.player;
    if (p.dashCooldown > 0 || p.dashTime > 0) return;

    const dir = readMoveDir(g);
    let dx = dir.x;
    let dy = dir.y;
    if (dx === 0 && dy === 0) {
        dx = p.facingX;
        dy = p.facingY;
    }
    const len = Math.hypot(dx, dy) || 1;
    p.dashDirX = dx / len;
    p.dashDirY = dy / len;
    p.dashTime = DASH_TIME;
    p.dashCooldown = DASH_COOLDOWN * g.stats.dashCdMult;
    p.invuln = Math.max(p.invuln, DASH_IFRAME);
    spawnBurst(g, p.x, p.y, "#ffd166", 8, 3);
    sfx("dash");
}

function updateCamera(g: GameState): void {
    g.camX = clamp(g.player.x - VIEW_W / 2, 0, ARENA_W - VIEW_W);
    g.camY = clamp(g.player.y - VIEW_H / 2, 0, ARENA_H - VIEW_H);
}

function updateSpawning(g: GameState, dt: number): void {
    g.spawnTimer -= dt;
    if (g.spawnTimer > 0) return;

    const interval = clamp(1.25 - g.time * 0.0045, 0.26, 1.25);
    g.spawnTimer = interval * (0.8 + Math.random() * 0.4);
    const count = g.time > 150 && Math.random() < 0.32 ? 2 : 1;
    for (let i = 0; i < count; i += 1) spawnEnemy(g);
}

function pickEnemyKind(time: number): BasicEnemyKind {
    const roll = Math.random();
    if (time < 20) return roll < 0.55 ? "swarmer" : "chaser";
    if (time < 45) {
        if (roll < 0.4) return "chaser";
        if (roll < 0.75) return "swarmer";
        if (roll < 0.9) return "ranged";
        return "tank";
    }
    if (time < 75) {
        if (roll < 0.3) return "chaser";
        if (roll < 0.55) return "swarmer";
        if (roll < 0.72) return "ranged";
        if (roll < 0.87) return "tank";
        return "spartan";
    }
    if (time < 110) {
        if (roll < 0.24) return "chaser";
        if (roll < 0.46) return "swarmer";
        if (roll < 0.62) return "ranged";
        if (roll < 0.78) return "tank";
        if (roll < 0.9) return "spartan";
        return "bomber";
    }
    if (roll < 0.2) return "chaser";
    if (roll < 0.4) return "swarmer";
    if (roll < 0.55) return "ranged";
    if (roll < 0.73) return "tank";
    if (roll < 0.88) return "spartan";
    return "bomber";
}

function spawnPosition(g: GameState, extra: number): { x: number; y: number } {
    const lightR = lightRadiusOf(g);
    const radius = lightR + extra;
    let x = g.player.x;
    let y = g.player.y;
    for (let attempt = 0; attempt < 14; attempt += 1) {
        const angle = Math.random() * TAU;
        x = clamp(g.player.x + Math.cos(angle) * radius, 24, ARENA_W - 24);
        y = clamp(g.player.y + Math.sin(angle) * radius, 24, ARENA_H - 24);
        if (distance(x, y, g.player.x, g.player.y) >= lightR + 30) {
            return { x, y };
        }
    }
    return { x, y };
}

function spawnEnemy(g: GameState): void {
    const kind = pickEnemyKind(g.time);
    const cfg = ENEMY_CONFIG[kind];
    const pos = spawnPosition(g, 70 + Math.random() * 80);
    const hpScale = 1 + Math.min(0.55, g.time * 0.003);
    const hp = Math.round(cfg.hp * hpScale);
    g.enemies.push({
        id: g.nextEnemyId++,
        kind,
        x: pos.x,
        y: pos.y,
        hp,
        maxHp: hp,
        radius: cfg.radius,
        speed: cfg.speed,
        damage: cfg.damage,
        lightReward: cfg.light,
        xpReward: cfg.xp,
        color: cfg.color,
        fireTimer:
            kind === "bomber" ? BOMBER_FUSE : 1.4 + Math.random() * 1.4,
        orbitCd: 0,
        wobble: Math.random() * TAU,
    });
}

function pickBossKind(g: GameState, tier: number): BossKind {
    if (tier === 0) return "warden";
    if ((tier + 1) % 4 === 0) return "reaper";
    const roll = Math.random();
    if (g.time >= 180 && roll < (g.level >= 9 ? 0.34 : 0.24)) {
        return "colossus";
    }
    if (roll < 0.18) return "herald";
    if (roll < 0.46) return "cinder";
    return "warden";
}

function spawnBoss(g: GameState, tier: number): void {
    const kind = pickBossKind(g, tier);
    const cfg = BOSS_CONFIG[kind];
    const pos = spawnPosition(g, 95);
    const hp = Math.round(cfg.hp * (1 + tier * cfg.hpScale));
    g.enemies.push({
        id: g.nextEnemyId++,
        kind: "boss",
        bossKind: kind,
        life: kind === "herald" ? 20 + tier * 2 : undefined,
        x: pos.x,
        y: pos.y,
        hp,
        maxHp: hp,
        radius: cfg.radius,
        speed: cfg.speed + tier * 2,
        damage: cfg.damage,
        lightReward: cfg.light,
        xpReward: cfg.xp,
        color: cfg.color,
        fireTimer: kind === "colossus" ? 4 : kind === "herald" ? 2.4 : 1.4,
        orbitCd: 0,
        wobble: Math.random() * TAU,
    });
    g.effects.push({
        kind: "ring",
        x: pos.x,
        y: pos.y,
        age: 0,
        max: 0.9,
        radius: 150,
        color: cfg.color,
        lineWidth: 3,
    });
    g.shake = prefersReduced() ? 0 : 0.45;
    sfx(kind === "reaper" ? "reaper" : "boss");
    announce("A " + cfg.name + " has entered the arena.");
}

function updateEnemies(g: GameState, dt: number): void {
    const lightR = lightRadiusOf(g);
    const p = g.player;

    for (const e of g.enemies) {
        if (e.hp <= 0) continue;
        e.orbitCd = Math.max(0, e.orbitCd - dt);

        if (e.life !== undefined) {
            e.life -= dt;
            if (e.life <= 0 && e.bossKind === "herald") {
                spawnBurst(g, e.x, e.y, e.color, 20, 5);
                g.effects.push({
                    kind: "ring",
                    x: e.x,
                    y: e.y,
                    age: 0,
                    max: 0.5,
                    radius: 80,
                    color: e.color,
                    lineWidth: 2,
                });
                announce("The Herald slips away.");
                e.hp = 0;
                continue;
            }
        }

        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        if (e.kind === "boss") {
            updateBossEnemy(g, e, dt, dist, nx, ny, lightR);
        } else if (e.kind === "ranged") {
            if (dist > 260) {
                e.x += nx * e.speed * dt;
                e.y += ny * e.speed * dt;
            } else if (dist < 175) {
                e.x -= nx * e.speed * dt;
                e.y -= ny * e.speed * dt;
            } else {
                const side = Math.sin(g.time * 1.2 + e.wobble) >= 0 ? 1 : -1;
                e.x += -ny * e.speed * 0.6 * dt * side;
                e.y += nx * e.speed * 0.6 * dt * side;
            }

            e.fireTimer -= dt;
            if (e.fireTimer <= 0 && dist <= lightR + 80) {
                e.fireTimer = 2.1 + Math.random() * 0.9;
                fireEnemyShot(g, e);
            }
        } else if (e.kind === "bomber") {
            e.x += nx * e.speed * dt;
            e.y += ny * e.speed * dt;
            if (dist <= 190) {
                e.fireTimer -= dt;
                if (e.fireTimer <= 0) {
                    explodeBomber(g, e);
                    e.hp = 0;
                    continue;
                }
            }
        } else if (e.kind === "spartan") {
            if ((e.dashTime ?? 0) > 0) {
                e.dashTime = Math.max(0, (e.dashTime ?? 0) - dt);
                e.x += (e.dashDirX ?? nx) * SPARTAN_DASH_SPEED * dt;
                e.y += (e.dashDirY ?? ny) * SPARTAN_DASH_SPEED * dt;
                if (!prefersReduced() && Math.random() < 0.4) {
                    spawnParticle(g, e.x, e.y, e.color, 2, 0.28);
                }
            } else {
                e.x += nx * e.speed * dt;
                e.y += ny * e.speed * dt;
                e.fireTimer -= dt;
                if (e.fireTimer <= 0) {
                    if (dist <= lightR + 40) {
                        e.fireTimer =
                            SPARTAN_DASH_INTERVAL * (0.85 + Math.random() * 0.3);
                        e.dashTime = SPARTAN_DASH_TIME;
                        e.dashDirX = nx;
                        e.dashDirY = ny;
                        g.effects.push({
                            kind: "ring",
                            x: e.x,
                            y: e.y,
                            age: 0,
                            max: 0.3,
                            radius: 44,
                            color: e.color,
                            lineWidth: 2,
                        });
                    } else {
                        e.fireTimer = 0.5;
                    }
                }
            }
        } else {
            let moveX = nx;
            let moveY = ny;
            if (e.kind === "swarmer") {
                const wave = Math.sin(g.time * 5.5 + e.wobble) * 0.38;
                moveX += -ny * wave;
                moveY += nx * wave;
                const len = Math.hypot(moveX, moveY) || 1;
                moveX /= len;
                moveY /= len;
            }
            e.x += moveX * e.speed * dt;
            e.y += moveY * e.speed * dt;
        }

        e.x = clamp(e.x, e.radius, ARENA_W - e.radius);
        e.y = clamp(e.y, e.radius, ARENA_H - e.radius);

        const contact = distance(e.x, e.y, p.x, p.y);
        if (contact < e.radius + p.radius + 2) {
            damagePlayer(g, e);
            if (g.over) return;
        }
    }

    g.enemies = g.enemies.filter((e) => e.hp > 0);
}

function updateBossEnemy(
    g: GameState,
    e: Enemy,
    dt: number,
    dist: number,
    nx: number,
    ny: number,
    lightR: number,
): void {
    const kind = e.bossKind ?? "warden";

    if (kind === "cinder") {
        if (dist > 270) {
            e.x += nx * e.speed * dt;
            e.y += ny * e.speed * dt;
        } else if (dist < 185) {
            e.x -= nx * e.speed * dt;
            e.y -= ny * e.speed * dt;
        } else {
            const side = Math.sin(g.time * 1.1 + e.wobble) >= 0 ? 1 : -1;
            e.x += -ny * e.speed * 0.55 * dt * side;
            e.y += nx * e.speed * 0.55 * dt * side;
        }
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && dist <= lightR + 140) {
            e.fireTimer = 2.3 + Math.random() * 0.7;
            fireBossSpread(g, e);
        }
        return;
    }

    if (kind === "herald") {
        if ((e.dashTime ?? 0) > 0) {
            e.dashTime = Math.max(0, (e.dashTime ?? 0) - dt);
            e.x += (e.dashDirX ?? nx) * 620 * dt;
            e.y += (e.dashDirY ?? ny) * 620 * dt;
            if (!prefersReduced() && Math.random() < 0.5) {
                spawnParticle(g, e.x, e.y, e.color, 2, 0.3);
            }
            return;
        }
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
            e.fireTimer = 2.6 + Math.random() * 0.8;
            e.dashTime = 0.22;
            e.dashDirX = nx;
            e.dashDirY = ny;
            g.effects.push({
                kind: "ring",
                x: e.x,
                y: e.y,
                age: 0,
                max: 0.3,
                radius: 38,
                color: e.color,
                lineWidth: 2,
            });
            return;
        }
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
        return;
    }

    if (kind === "colossus") {
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
            e.fireTimer = 4.4;
            spawnBossAdds(g, e);
        }
        return;
    }

    e.x += nx * e.speed * dt;
    e.y += ny * e.speed * dt;
}

function fireBossSpread(g: GameState, e: Enemy): void {
    const dx = g.player.x - e.x;
    const dy = g.player.y - e.y;
    const base = Math.atan2(dy, dx);
    const speed = 172;
    for (const offset of [-0.28, 0, 0.28]) {
        g.enemyShots.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(base + offset) * speed,
            vy: Math.sin(base + offset) * speed,
            life: 5,
            damage: e.damage,
            radius: 7,
            dead: false,
        });
    }
}

function spawnBossAdds(g: GameState, e: Enemy): void {
    const cfg = ENEMY_CONFIG.swarmer;
    const hpScale = 1 + Math.min(0.55, g.time * 0.003);
    for (let i = 0; i < 2; i += 1) {
        const angle = Math.random() * TAU;
        const hp = Math.round(cfg.hp * hpScale);
        g.enemies.push({
            id: g.nextEnemyId++,
            kind: "swarmer",
            x: clamp(e.x + Math.cos(angle) * e.radius, 24, ARENA_W - 24),
            y: clamp(e.y + Math.sin(angle) * e.radius, 24, ARENA_H - 24),
            hp,
            maxHp: hp,
            radius: cfg.radius,
            speed: cfg.speed,
            damage: cfg.damage,
            lightReward: cfg.light,
            xpReward: cfg.xp,
            color: cfg.color,
            fireTimer: 1.4 + Math.random() * 1.4,
            orbitCd: 0,
            wobble: Math.random() * TAU,
        });
    }
    g.effects.push({
        kind: "ring",
        x: e.x,
        y: e.y,
        age: 0,
        max: 0.45,
        radius: 90,
        color: e.color,
        lineWidth: 2,
    });
}

function explodeBomber(g: GameState, e: Enemy): void {
    g.effects.push({
        kind: "ring",
        x: e.x,
        y: e.y,
        age: 0,
        max: 0.42,
        radius: BOMBER_BLAST,
        color: "#ffb35e",
        lineWidth: 3,
    });
    spawnBurst(g, e.x, e.y, e.color, 16, 5);
    if (!prefersReduced()) g.shake = Math.max(g.shake, 0.34);
    sfx("bomb");
    if (distance(e.x, e.y, g.player.x, g.player.y) <= BOMBER_BLAST + g.player.radius) {
        damagePlayer(g, e);
    }
}

function fireEnemyShot(g: GameState, e: Enemy): void {
    const p = g.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 185;
    g.enemyShots.push({
        x: e.x,
        y: e.y,
        vx: (dx / len) * speed,
        vy: (dy / len) * speed,
        life: 4.5,
        damage: e.damage,
        radius: 6,
        dead: false,
    });
}

function damagePlayer(g: GameState, e: Enemy): void {
    if (g.player.invuln > 0 || g.over) return;
    g.light -= e.damage;
    g.player.invuln = IFRAME_TIME;
    g.flash = 0.55;
    if (!prefersReduced()) g.shake = 0.36;
    spawnBurst(g, g.player.x, g.player.y, "#ff6b6b", 12, 4.5);
    sfx("hit");

    const dx = g.player.x - e.x;
    const dy = g.player.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    g.player.x = clamp(g.player.x + (dx / len) * 26, 16, ARENA_W - 16);
    g.player.y = clamp(g.player.y + (dy / len) * 26, 16, ARENA_H - 16);

    if (g.light <= 0) {
        g.light = 0;
        endRun(g);
    }
}

function updateEnemyShots(g: GameState, dt: number): void {
    const p = g.player;
    for (const shot of g.enemyShots) {
        if (shot.dead) continue;
        shot.life -= dt;
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        if (
            shot.life <= 0 ||
            shot.x < -20 ||
            shot.x > ARENA_W + 20 ||
            shot.y < -20 ||
            shot.y > ARENA_H + 20
        ) {
            shot.dead = true;
            continue;
        }
        if (distance(shot.x, shot.y, p.x, p.y) < shot.radius + p.radius) {
            shot.dead = true;
            if (p.invuln <= 0) {
                g.light -= shot.damage;
                p.invuln = IFRAME_TIME;
                g.flash = 0.45;
                if (!prefersReduced()) g.shake = 0.3;
                spawnBurst(g, p.x, p.y, "#ff6b6b", 9, 3.8);
                sfx("hit");
                if (g.light <= 0) {
                    g.light = 0;
                    endRun(g);
                }
            }
        }
    }
    g.enemyShots = g.enemyShots.filter((s) => !s.dead);
}

// ============================================================
// Weapons
// ============================================================
function playShoot(g: GameState): void {
    if (g.time - g.lastShootSfx < 0.06) return;
    g.lastShootSfx = g.time;
    sfx("shoot");
}

function nearestEnemy(g: GameState, maxDistance: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = maxDistance;
    for (const e of g.enemies) {
        if (e.hp <= 0) continue;
        const d = distance(e.x, e.y, g.player.x, g.player.y);
        if (d <= bestDist) {
            best = e;
            bestDist = d;
        }
    }
    return best;
}

function orbitPositions(
    g: GameState,
    lightR: number,
): { x: number; y: number }[] {
    const level = g.weapons.orbit;
    const out: { x: number; y: number }[] = [];
    if (level <= 0) return out;
    const count = level >= 3 ? 5 : level === 2 ? 3 : 2;
    const orbitRadius = Math.min(lightR * 0.82, 58 + level * 8);
    for (let i = 0; i < count; i += 1) {
        const angle = g.orbitAngle + (i * TAU) / count;
        out.push({
            x: g.player.x + Math.cos(angle) * orbitRadius,
            y: g.player.y + Math.sin(angle) * orbitRadius,
        });
    }
    return out;
}

function updateOrbit(g: GameState, lightR: number): void {
    const level = g.weapons.orbit;
    if (level <= 0) return;
    const positions = orbitPositions(g, lightR);
    const damage = (9 + 4 * (level - 1)) * g.stats.damageMult;
    const bladeRadius = 9 + level * 1.5;
    for (const blade of positions) {
        for (const e of g.enemies) {
            if (e.hp <= 0 || e.orbitCd > 0) continue;
            if (distance(g.player.x, g.player.y, e.x, e.y) > lightR) continue;
            if (
                distance(blade.x, blade.y, e.x, e.y) <=
                bladeRadius + e.radius
            ) {
                e.orbitCd = 0.45;
                damageEnemy(g, e, damage);
            }
        }
    }
}

function updateWeapons(g: GameState, dt: number): void {
    g.orbitAngle = (g.orbitAngle + dt * (2.2 + g.weapons.orbit * 0.45)) % TAU;
    const lightR = lightRadiusOf(g);

    for (const id of WEAPON_IDS) {
        if (g.weaponCd[id] > 0) {
            g.weaponCd[id] = Math.max(0, g.weaponCd[id] - dt);
        }
    }

    updateOrbit(g, lightR);

    if (g.weapons.bolt > 0 && g.weaponCd.bolt <= 0) fireBolt(g, lightR);
    if (g.weapons.pulse > 0 && g.weaponCd.pulse <= 0) firePulse(g, lightR);
    if (g.weapons.chain > 0 && g.weaponCd.chain <= 0) fireChain(g, lightR);
    if (g.weapons.scatter > 0 && g.weaponCd.scatter <= 0)
        fireScatter(g, lightR);
    if (g.weapons.sparks > 0 && g.weaponCd.sparks <= 0)
        fireSparks(g, lightR);
}

function spawnPlayerProjectile(
    g: GameState,
    angle: number,
    speed: number,
    damage: number,
    radius: number,
    pierce: number,
    color: string,
    turnRate = 0,
    life = 3,
): void {
    g.projectiles.push({
        x: g.player.x,
        y: g.player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        damage,
        radius,
        pierce,
        hitIds: [],
        color,
        turnRate,
        dead: false,
    });
}

function fireBolt(g: GameState, lightR: number): void {
    const target = nearestEnemy(g, lightR);
    if (!target) return;
    const level = g.weapons.bolt;
    const damage = (10 + 4 * (level - 1)) * g.stats.damageMult;
    const baseAngle = Math.atan2(target.y - g.player.y, target.x - g.player.x);
    const evolved = level >= 3;
    const angles = evolved
        ? [baseAngle - 0.055, baseAngle + 0.055]
        : [baseAngle];
    for (const angle of angles) {
        spawnPlayerProjectile(
            g,
            angle,
            evolved ? 640 : 560,
            damage,
            5,
            evolved ? 2 : 1,
            WEAPONS.bolt.color,
        );
    }
    g.weaponCd.bolt = Math.max(0.35, 0.95 - (level - 1) * 0.12);
    playShoot(g);
}

function fireScatter(g: GameState, lightR: number): void {
    const target = nearestEnemy(g, lightR);
    if (!target) return;
    const level = g.weapons.scatter;
    const pellets = level >= 3 ? 7 : 3 + level;
    const damage = (5 + 1.6 * (level - 1)) * g.stats.damageMult;
    const baseAngle = Math.atan2(target.y - g.player.y, target.x - g.player.x);
    const spread = 0.58;
    for (let i = 0; i < pellets; i += 1) {
        const offset = (i / (pellets - 1) - 0.5) * spread;
        spawnPlayerProjectile(
            g,
            baseAngle + offset,
            500,
            damage,
            4,
            1,
            WEAPONS.scatter.color,
        );
    }
    g.weaponCd.scatter = Math.max(0.8, 1.45 - (level - 1) * 0.15);
    playShoot(g);
}

function fireSparks(g: GameState, lightR: number): void {
    const target = nearestEnemy(g, lightR);
    if (!target) return;
    const level = g.weapons.sparks;
    const evolved = level >= 3;
    const count = evolved ? 9 : 3 + level;
    const damage =
        (6 + 2.5 * (level - 1)) *
        g.stats.damageMult *
        g.stats.sparkDamageMult;
    const baseAngle = Math.atan2(target.y - g.player.y, target.x - g.player.x);
    const spread = 0.5;
    const speed = evolved ? 300 : 262;
    const turnRate = evolved ? 9.5 : 6.5;
    const pierce = evolved ? 2 : 1;
    const life = evolved ? 1.6 : 1.45;
    for (let i = 0; i < count; i += 1) {
        const offset =
            (i / (count - 1) - 0.5) * spread + (Math.random() - 0.5) * 0.12;
        spawnPlayerProjectile(
            g,
            baseAngle + offset,
            speed,
            damage,
            evolved ? 5 : 4,
            pierce,
            WEAPONS.sparks.color,
            turnRate,
            life,
        );
    }
    g.weaponCd.sparks = Math.max(0.7, 1.4 - (level - 1) * 0.18);
    playShoot(g);
}

function firePulse(g: GameState, lightR: number): void {
    const level = g.weapons.pulse;
    const radius =
        level >= 3 ? lightR : Math.min(lightR, lightR * 0.55 + level * 14 + 20);
    const damage = (14 + 7 * (level - 1)) * g.stats.damageMult;
    for (const e of g.enemies) {
        if (e.hp <= 0) continue;
        if (distance(g.player.x, g.player.y, e.x, e.y) <= radius + e.radius) {
            damageEnemy(g, e, damage);
        }
    }
    g.effects.push({
        kind: "ring",
        x: g.player.x,
        y: g.player.y,
        age: 0,
        max: 0.42,
        radius,
        color: WEAPONS.pulse.color,
        lineWidth: 3,
    });
    g.weaponCd.pulse = Math.max(0.8, 2.05 - (level - 1) * 0.28);
    playShoot(g);
}

function fireChain(g: GameState, lightR: number): void {
    const first = nearestEnemy(g, lightR);
    if (!first) return;
    const level = g.weapons.chain;
    const maxTargets = 2 + level;
    const jumpRange = 115 + level * 28;
    const damage = (12 + 5 * (level - 1)) * g.stats.damageMult;
    const points: { x: number; y: number }[] = [
        { x: g.player.x, y: g.player.y },
    ];
    const hit = new Set<number>();
    let current: Enemy | null = first;
    let sourceX = g.player.x;
    let sourceY = g.player.y;

    while (current && points.length <= maxTargets) {
        hit.add(current.id);
        points.push({ x: current.x, y: current.y });
        damageEnemy(g, current, damage);
        sourceX = current.x;
        sourceY = current.y;

        let next: Enemy | null = null;
        let bestDist = jumpRange;
        for (const e of g.enemies) {
            if (e.hp <= 0 || hit.has(e.id)) continue;
            if (distance(e.x, e.y, g.player.x, g.player.y) > lightR) continue;
            const d = distance(e.x, e.y, sourceX, sourceY);
            if (d <= bestDist) {
                next = e;
                bestDist = d;
            }
        }
        current = next;
    }

    g.effects.push({
        kind: "chain",
        points,
        age: 0,
        max: 0.3,
        color: WEAPONS.chain.color,
    });
    g.weaponCd.chain = Math.max(1, 2.45 - (level - 1) * 0.3);
    playShoot(g);
}

function updateProjectiles(g: GameState, dt: number): void {
    const lightR = lightRadiusOf(g);
    for (const p of g.projectiles) {
        if (p.dead) continue;
        if (p.turnRate > 0) {
            let target: Enemy | null = null;
            let bestDist = Infinity;
            for (const e of g.enemies) {
                if (e.hp <= 0) continue;
                if (distance(e.x, e.y, g.player.x, g.player.y) > lightR) {
                    continue;
                }
                const d = distance(e.x, e.y, p.x, p.y);
                if (d < bestDist) {
                    target = e;
                    bestDist = d;
                }
            }
            if (target) {
                const speed = Math.hypot(p.vx, p.vy) || 1;
                const current = Math.atan2(p.vy, p.vx);
                const desired = Math.atan2(target.y - p.y, target.x - p.x);
                let diff = desired - current;
                while (diff > Math.PI) diff -= TAU;
                while (diff < -Math.PI) diff += TAU;
                const maxTurn = p.turnRate * dt;
                const angle = current + clamp(diff, -maxTurn, maxTurn);
                p.vx = Math.cos(angle) * speed;
                p.vy = Math.sin(angle) * speed;
            }
        }
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (
            p.life <= 0 ||
            p.x < 0 ||
            p.x > ARENA_W ||
            p.y < 0 ||
            p.y > ARENA_H ||
            distance(p.x, p.y, g.player.x, g.player.y) > lightR
        ) {
            p.dead = true;
            continue;
        }
        for (const e of g.enemies) {
            if (e.hp <= 0 || p.hitIds.indexOf(e.id) !== -1) continue;
            if (distance(p.x, p.y, e.x, e.y) <= p.radius + e.radius) {
                p.hitIds.push(e.id);
                damageEnemy(g, e, p.damage);
                p.pierce -= 1;
                if (p.pierce <= 0) {
                    p.dead = true;
                    break;
                }
            }
        }
    }
    g.projectiles = g.projectiles.filter((p) => !p.dead);
}

function damageEnemy(g: GameState, e: Enemy, amount: number): void {
    if (e.hp <= 0) return;
    e.hp -= amount;
    if (e.hp > 0) return;
    e.hp = 0;
    g.kills += 1;
    g.light = Math.min(g.maxLight, g.light + e.lightReward);
    addXp(g, e.xpReward);
    const count = e.kind === "boss" ? 34 : e.kind === "tank" ? 18 : 10;
    spawnBurst(g, e.x, e.y, e.color, count, e.kind === "boss" ? 7 : 4.2);
    if (e.kind === "boss") {
        g.flash = 0.5;
        if (!prefersReduced()) g.shake = 0.6;
        announce("Boss defeated. Light restored.");
    }
    if (g.time - g.lastKillSfx > 0.07) {
        g.lastKillSfx = g.time;
        sfx("kill");
    }
}

// ============================================================
// XP, levels & upgrades
// ============================================================
function addXp(g: GameState, amount: number): void {
    g.xp += amount;
    while (g.xp >= g.xpNeeded) {
        g.xp -= g.xpNeeded;
        g.level += 1;
        g.xpNeeded = xpForLevel(g.level);
        g.pendingPicks += 1;
    }
    if (g.pendingPicks > 0 && !g.levelUpOpen && !g.over) {
        openLevelUp(g);
    }
}

function statChoice(g: GameState, id: StatId): UpgradeChoice {
    const cfg = STAT_UPGRADES[id];
    const next = g.upgrades[id] + 1;
    return {
        kind: "stat",
        stat: id,
        title: cfg.name,
        desc: cfg.desc,
        meta: "Upgrade " + next + " / " + cfg.max,
    };
}

function rollChoices(g: GameState): UpgradeChoice[] {
    const candidates: UpgradeChoice[] = [];

    for (const id of WEAPON_IDS) {
        const level = g.weapons[id];
        const cfg = WEAPONS[id];
        if (level === 0) {
            candidates.push({
                kind: "weapon",
                weapon: id,
                title: "New weapon · " + cfg.name,
                desc: cfg.desc,
                meta: "Weapon",
            });
        } else if (level < 3) {
            const evolves = level + 1 === 3;
            candidates.push({
                kind: "weapon",
                weapon: id,
                evolve: evolves,
                title: evolves
                    ? "Evolve · " + cfg.evolvedName
                    : "Upgrade · " + cfg.name,
                desc: evolves
                    ? cfg.evoDesc
                    : "Level " + (level + 1) + ". " + cfg.desc,
                meta: evolves ? "Evolution" : "Level " + (level + 1) + " / 3",
            });
        }
    }

    for (const id of STAT_IDS) {
        const cfg = STAT_UPGRADES[id];
        if (cfg.requires && g.weapons[cfg.requires] <= 0) continue;
        if (g.upgrades[id] < cfg.max) {
            candidates.push(statChoice(g, id));
        }
    }

    shuffle(candidates);
    const picked = candidates.slice(0, 3);
    while (picked.length < 3) {
        picked.push({
            kind: "fallback",
            title: "Overcharge",
            desc: "A repeatable spark. All weapon damage +5%.",
            meta: "Fallback",
        });
    }
    return picked;
}

function openLevelUp(g: GameState): void {
    g.levelUpOpen = true;
    g.paused = true;
    g.keys.clear();
    g.pointerActive = false;
    dom.pauseOverlay.classList.add("hidden");
    dom.levelupTitle.textContent = "Level " + g.level;
    currentChoices = rollChoices(g);
    renderChoices(g);
    dom.levelupOverlay.classList.remove("hidden");
    updatePauseButton();
    sfx("levelup");
    announce("Level " + g.level + ". Choose an upgrade.");
    focusInside(dom.levelupOverlay);
}

function closeLevelUp(): void {
    const g = state.game;
    if (!g || !g.levelUpOpen) return;
    // Deferring the pick: pendingPicks stays untouched. Resuming re-opens the
    // level-up overlay before the player can act, so the choice is not lost.
    g.levelUpOpen = false;
    g.paused = true;
    dom.levelupOverlay.classList.add("hidden");
    currentChoices = [];
    dom.levelupCards.innerHTML = "";
    updatePauseButton();
}

function renderChoices(g: GameState): void {
    dom.levelupCards.innerHTML = "";
    currentChoices.forEach((choice, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "upgrade-card" + (choice.evolve ? " evolved" : "");
        button.setAttribute("data-index", String(index));

        const key = document.createElement("span");
        key.className = "upgrade-key";
        key.textContent = String(index + 1);

        const kind = document.createElement("span");
        kind.className = "upgrade-kind";
        kind.textContent = choice.meta;

        const title = document.createElement("span");
        title.className = "upgrade-title";
        title.textContent = choice.title;

        const desc = document.createElement("span");
        desc.className = "upgrade-desc";
        desc.textContent = choice.desc;

        button.append(key, kind, title, desc);
        button.addEventListener("click", () => chooseUpgrade(index));
        dom.levelupCards.appendChild(button);
    });
    if (g.levelUpOpen) {
        const first =
            dom.levelupCards.querySelector<HTMLElement>(".upgrade-card");
        if (first) first.focus({ preventScroll: true });
    }
}

function applyStat(g: GameState, id: StatId): void {
    g.upgrades[id] += 1;
    if (id === "ember") {
        g.maxLight += 20;
        g.light = Math.min(g.maxLight, g.light + 20);
    } else if (id === "wick") {
        g.drain = Math.max(0.4, g.drain - 0.18);
    } else if (id === "boots") {
        g.stats.speedMult += 0.08;
    } else if (id === "focus") {
        g.stats.damageMult += 0.15;
    } else if (id === "lens") {
        g.stats.radiusBonus += 10;
    } else if (id === "cinder") {
        g.stats.dashCdMult = Math.max(0.45, g.stats.dashCdMult - 0.12);
    } else if (id === "photon") {
        g.stats.sparkDamageMult += 0.3;
    }
}

function applyChoice(g: GameState, choice: UpgradeChoice): void {
    if (choice.kind === "weapon" && choice.weapon) {
        g.weapons[choice.weapon] += 1;
    } else if (choice.kind === "stat" && choice.stat) {
        applyStat(g, choice.stat);
    } else {
        g.stats.damageMult += 0.05;
    }
    hudCache.weaponSig = "";
}

function chooseUpgrade(index: number): void {
    const g = state.game;
    if (!g || !g.levelUpOpen) return;
    const choice = currentChoices[index];
    if (!choice) return;

    applyChoice(g, choice);
    g.pendingPicks = Math.max(0, g.pendingPicks - 1);
    uiClick();

    if (g.pendingPicks > 0) {
        currentChoices = rollChoices(g);
        renderChoices(g);
        dom.levelupTitle.textContent = "Level " + g.level;
        sfx("levelup");
        return;
    }

    g.levelUpOpen = false;
    dom.levelupOverlay.classList.add("hidden");
    g.paused = false;
    lastFrame = performance.now();
    updatePauseButton();
    dom.game.focus({ preventScroll: true });
}

// ============================================================
// Particles & effects
// ============================================================
function spawnParticle(
    g: GameState,
    x: number,
    y: number,
    color: string,
    size: number,
    life: number,
): void {
    if (g.particles.length >= MAX_PARTICLES) return;
    const angle = Math.random() * TAU;
    const speed = 20 + Math.random() * 110;
    g.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        max: life,
        color,
        size,
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
    for (let i = 0; i < total; i += 1) {
        if (g.particles.length >= MAX_PARTICLES) break;
        const angle = (i / total) * TAU + Math.random() * 0.6;
        const force = speed * (22 + Math.random() * 42);
        g.particles.push({
            x,
            y,
            vx: Math.cos(angle) * force,
            vy: Math.sin(angle) * force,
            life: 0.4 + Math.random() * 0.45,
            max: 0.85,
            color,
            size: 1.5 + Math.random() * 2.4,
        });
    }
}

function updateParticles(g: GameState, dt: number): void {
    for (const p of g.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.95;
        p.vy *= 0.95;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
    if (g.particles.length > MAX_PARTICLES) {
        g.particles.length = MAX_PARTICLES;
    }
}

function updateEffects(g: GameState, dt: number): void {
    for (const effect of g.effects) effect.age += dt;
    g.effects = g.effects.filter((effect) => effect.age < effect.max);
}

// ============================================================
// Canvas sizing
// ============================================================
function resizeCanvas(): void {
    if (!ctx) return;
    const rect = dom.canvasWrap.getBoundingClientRect();
    const availW = Math.max(120, rect.width - 8);
    const availH = Math.max(100, rect.height - 8);
    const scale = Math.min(availW / VIEW_W, availH / VIEW_H);
    const cssW = Math.max(120, Math.floor(VIEW_W * scale));
    const cssH = Math.max(100, Math.floor(VIEW_H * scale));
    dom.game.style.width = cssW + "px";
    dom.game.style.height = cssH + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    dom.game.width = Math.round(VIEW_W * dpr);
    dom.game.height = Math.round(VIEW_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
}

function screenToWorld(
    g: GameState,
    clientX: number,
    clientY: number,
): { x: number; y: number } {
    const rect = dom.game.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return { x: g.player.x, y: g.player.y };
    }
    const localX = ((clientX - rect.left) / rect.width) * VIEW_W;
    const localY = ((clientY - rect.top) / rect.height) * VIEW_H;
    return { x: localX + g.camX, y: localY + g.camY };
}

// ============================================================
// Render
// ============================================================
function renderGame(g: GameState): void {
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

    drawFloor(g);
    drawArena(g);
    drawEnemies(g);
    drawEnemyShots(g);
    drawPlayer(g);
    drawProjectiles(g);
    drawOrbit(g);
    drawEffects(g);
    drawParticles(g);
    drawLight(g);
    drawRangeRing(g);

    ctx.restore();

    if (g.flash > 0 && !reduced) {
        ctx.fillStyle =
            "rgba(255, 80, 90, " + (g.flash * 0.34).toFixed(3) + ")";
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
}

function drawFloor(g: GameState): void {
    ctx.fillStyle = "#050510";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const cell = 60;
    const startX = Math.floor(g.camX / cell) * cell;
    const startY = Math.floor(g.camY / cell) * cell;

    ctx.strokeStyle = "rgba(255, 209, 102, 0.055)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x <= g.camX + VIEW_W + cell; x += cell) {
        const sx = x - g.camX;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, VIEW_H);
    }
    for (let y = startY; y <= g.camY + VIEW_H + cell; y += cell) {
        const sy = y - g.camY;
        ctx.moveTo(0, sy);
        ctx.lineTo(VIEW_W, sy);
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 209, 102, 0.1)";
    for (let x = startX; x <= g.camX + VIEW_W + cell; x += cell) {
        for (let y = startY; y <= g.camY + VIEW_H + cell; y += cell) {
            const sx = x - g.camX;
            const sy = y - g.camY;
            if ((Math.abs(x) / cell + Math.abs(y) / cell) % 3 === 0) {
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
            }
        }
    }
}

function drawArena(g: GameState): void {
    const x = -g.camX;
    const y = -g.camY;
    ctx.strokeStyle = "rgba(255, 209, 102, 0.1)";
    ctx.lineWidth = 12;
    ctx.strokeRect(x - 5, y - 5, ARENA_W + 10, ARENA_H + 10);
    ctx.strokeStyle = "rgba(255, 209, 102, 0.34)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, ARENA_W, ARENA_H);
}

function drawEnemies(g: GameState): void {
    const lightR = lightRadiusOf(g);
    for (const e of g.enemies) {
        if (e.hp <= 0) continue;
        const d = distance(e.x, e.y, g.player.x, g.player.y);
        const visibility = e.kind === "boss" ? lightR + e.radius * 0.8 : lightR;
        if (d > visibility) continue;

        const sx = e.x - g.camX;
        const sy = e.y - g.camY;
        if (sx < -70 || sx > VIEW_W + 70 || sy < -70 || sy > VIEW_H + 70) {
            continue;
        }

        const angle = Math.atan2(g.player.y - e.y, g.player.x - e.x);

        ctx.save();
        ctx.translate(sx, sy);
        drawEnemyBody(g, e, angle);
        ctx.restore();

        if (
            e.kind === "boss" ||
            e.kind === "tank" ||
            e.kind === "spartan"
        ) {
            const width =
                e.kind === "boss" ? 76 : e.kind === "tank" ? 38 : 42;
            const barY = -e.radius - (e.kind === "boss" ? 16 : 10);
            ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
            ctx.fillRect(sx - width / 2, sy + barY, width, 4);
            ctx.fillStyle = e.color;
            ctx.fillRect(
                sx - width / 2,
                sy + barY,
                width * (e.hp / e.maxHp),
                4,
            );
        }
    }
}

function drawEnemyBody(g: GameState, e: Enemy, angle: number): void {
    const color = e.color;
    const isBoss = e.kind === "boss";
    ctx.shadowColor = color;
    ctx.shadowBlur = isBoss ? 28 : 13;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    if (e.kind === "chaser") {
        ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -e.radius);
        ctx.lineTo(e.radius * 0.82, e.radius * 0.7);
        ctx.lineTo(0, e.radius * 0.35);
        ctx.lineTo(-e.radius * 0.82, e.radius * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#170a12";
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.36, 0, TAU);
        ctx.fill();
    } else if (e.kind === "swarmer") {
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(e.radius, 0);
        ctx.lineTo(0, e.radius * 0.72);
        ctx.lineTo(-e.radius, 0);
        ctx.lineTo(0, -e.radius * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#1c0f08";
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.3, 0, TAU);
        ctx.fill();
    } else if (e.kind === "tank") {
        tracePolygon(6, e.radius);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#100a18";
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.56, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.56, 0, TAU);
        ctx.stroke();
    } else if (e.kind === "ranged") {
        ctx.rotate(angle);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-e.radius * 0.6, 0);
        ctx.lineTo(e.radius * 0.6, 0);
        ctx.moveTo(0, -e.radius * 0.6);
        ctx.lineTo(0, e.radius * 0.6);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(e.radius * 0.42, 0, 3, 0, TAU);
        ctx.fill();
    } else if (e.kind === "spartan") {
        drawSpartanEnemy(g, e, angle);
    } else if (e.kind === "bomber") {
        drawBomberEnemy(g, e);
    } else {
        drawBossEnemy(g, e, angle, e.bossKind ?? "warden");
    }
}

function tracePolygon(sides: number, radius: number): void {
    ctx.beginPath();
    for (let i = 0; i < sides; i += 1) {
        const a = (i / sides) * TAU;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

function drawSpartanEnemy(g: GameState, e: Enemy, angle: number): void {
    const r = e.radius;
    const pulse = 1 + 0.05 * Math.sin(g.time * 8 + e.wobble);
    ctx.save();
    ctx.rotate(angle + Math.PI / 2);
    ctx.scale(pulse, pulse);

    ctx.strokeStyle = "#f4eedb";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.3);
    ctx.lineTo(0, r * 0.92);
    ctx.stroke();

    ctx.fillStyle = "#fff8e6";
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.62);
    ctx.lineTo(r * 0.16, -r * 1.12);
    ctx.lineTo(-r * 0.16, -r * 1.12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.9);
    ctx.lineTo(r * 0.8, -r * 0.16);
    ctx.lineTo(r * 0.56, r * 0.6);
    ctx.lineTo(0, r * 0.94);
    ctx.lineTo(-r * 0.56, r * 0.6);
    ctx.lineTo(-r * 0.8, -r * 0.16);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#18140c";
    ctx.fillRect(-r * 0.46, -r * 0.28, r * 0.92, r * 0.22);
    ctx.strokeStyle = "rgba(20, 18, 12, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, r * 0.2);
    ctx.lineTo(r * 0.5, r * 0.2);
    ctx.moveTo(0, -r * 0.02);
    ctx.lineTo(0, r * 0.78);
    ctx.stroke();
    ctx.restore();
}

function drawBomberEnemy(g: GameState, e: Enemy): void {
    const r = e.radius;
    const fuse = clamp(e.fireTimer / BOMBER_FUSE, 0, 1);
    const rate = 5 + (1 - fuse) * 18;
    const pulse = 0.5 + 0.5 * Math.sin(g.time * rate + e.wobble);

    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, 0, TAU);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#2a1206";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.46, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = hexToRgba("#ff5d3a", 0.35 + 0.55 * pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 3 + 9 * pulse, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = hexToRgba("#ffd9a0", 0.7);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
        ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        ctx.stroke();
    }

    ctx.fillStyle = pulse > 0.5 ? "#fff2c4" : "#ff7a3a";
    ctx.beginPath();
    ctx.arc(0, -r * 0.95, 2 + 2 * pulse, 0, TAU);
    ctx.fill();
}

function drawBossEnemy(
    g: GameState,
    e: Enemy,
    angle: number,
    kind: BossKind,
): void {
    const r = e.radius;

    if (kind === "cinder") {
        ctx.rotate(g.time * 0.8 + e.wobble);
        ctx.beginPath();
        const spikes = 12;
        for (let i = 0; i < spikes * 2; i += 1) {
            const a = (i / (spikes * 2)) * TAU;
            const radius = i % 2 === 0 ? r : r * 0.72;
            const px = Math.cos(a) * radius;
            const py = Math.sin(a) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#2a1206";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.48, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.52, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = "#ffd27a";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.18, 0, TAU);
        ctx.fill();
    } else if (kind === "herald") {
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(r * 1.05, 0);
        ctx.lineTo(-r * 0.55, r * 0.7);
        ctx.lineTo(-r * 0.22, 0);
        ctx.lineTo(-r * 0.55, -r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#08202a";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.3, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(e.color, 0.7);
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.92, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#d8fbff";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.12, 0, TAU);
        ctx.fill();
    } else if (kind === "colossus") {
        ctx.rotate(g.time * 0.25 + e.wobble);
        tracePolygon(6, r);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#100a18";
        tracePolygon(6, r * 0.64);
        ctx.fill();
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        tracePolygon(6, r * 0.64);
        ctx.stroke();
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.22, 0, TAU);
        ctx.fill();
    } else if (kind === "reaper") {
        const pulse = 0.5 + 0.5 * Math.sin(g.time * 5 + e.wobble);
        ctx.strokeStyle = hexToRgba(e.color, 0.3 + 0.5 * pulse);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.22 + 8 * pulse, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = hexToRgba("#ff5d8a", 0.25 + 0.35 * (1 - pulse));
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.02, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.68, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#100a18";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.45, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#ffe0ff";
        ctx.beginPath();
        ctx.arc(-r * 0.16, -r * 0.08, r * 0.09, 0, TAU);
        ctx.arc(r * 0.16, -r * 0.08, r * 0.09, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = hexToRgba("#ffe0ff", 0.8);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, r * 0.08, r * 0.2, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
    } else {
        ctx.rotate(g.time * 0.5 + e.wobble);
        ctx.beginPath();
        const spikes = 14;
        for (let i = 0; i < spikes * 2; i += 1) {
            const a = (i / (spikes * 2)) * TAU;
            const radius = i % 2 === 0 ? e.radius : e.radius * 0.72;
            const px = Math.cos(a) * radius;
            const py = Math.sin(a) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#1a0710";
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.58, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.58, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = "#ffe0e6";
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.2, 0, TAU);
        ctx.fill();
    }
}

function drawEnemyShots(g: GameState): void {
    const lightR = lightRadiusOf(g);
    for (const shot of g.enemyShots) {
        if (shot.dead) continue;
        if (distance(shot.x, shot.y, g.player.x, g.player.y) > lightR + 50) {
            continue;
        }
        const sx = shot.x - g.camX;
        const sy = shot.y - g.camY;
        ctx.save();
        ctx.shadowColor = "#ff6b6b";
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#ff8a8a";
        ctx.beginPath();
        ctx.arc(sx, sy, shot.radius, 0, TAU);
        ctx.fill();
        ctx.restore();
    }
}

function drawPlayer(g: GameState): void {
    const p = g.player;
    const sx = p.x - g.camX;
    const sy = p.y - g.camY;
    const reduced = prefersReduced();
    const pulse = reduced ? 1 : 0.92 + 0.08 * Math.sin(g.time * 7);
    const flicker = p.invuln > 0 && Math.floor(g.time * 20) % 2 === 0;

    ctx.save();
    if (flicker) ctx.globalAlpha = 0.45;

    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, 52 * pulse);
    glow.addColorStop(0, "rgba(255, 244, 210, 0.75)");
    glow.addColorStop(0.35, "rgba(255, 209, 102, 0.42)");
    glow.addColorStop(1, "rgba(255, 170, 60, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, 52 * pulse, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.fillStyle = "#fff7df";
    ctx.shadowColor = "#ffd166";
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(sx, sy, p.radius, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255, 209, 102, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, p.radius + 7, 0, TAU);
    ctx.stroke();

    const fx = p.facingX * (p.radius + 11);
    const fy = p.facingY * (p.radius + 11);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(sx + fx, sy + fy, 3, 0, TAU);
    ctx.fill();

    ctx.restore();
}

function drawProjectiles(g: GameState): void {
    const lightR = lightRadiusOf(g);
    for (const p of g.projectiles) {
        if (p.dead) continue;
        if (distance(p.x, p.y, g.player.x, g.player.y) > lightR + 18) continue;
        const sx = p.x - g.camX;
        const sy = p.y - g.camY;
        const len = Math.hypot(p.vx, p.vy) || 1;
        const tx = (p.vx / len) * 13;
        const ty = (p.vy / len) * 13;
        ctx.save();
        ctx.strokeStyle = hexToRgba(p.color, 0.55);
        ctx.lineWidth = p.radius * 0.8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx - tx, sy - ty);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, p.radius, 0, TAU);
        ctx.fill();
        ctx.restore();
    }
}

function drawOrbit(g: GameState): void {
    if (g.weapons.orbit <= 0) return;
    const lightR = lightRadiusOf(g);
    const positions = orbitPositions(g, lightR);
    const level = g.weapons.orbit;
    const color = WEAPONS.orbit.color;
    const bladeRadius = 9 + level * 1.5;

    ctx.save();
    ctx.strokeStyle = hexToRgba(color, 0.13);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const orbitRadius = Math.min(lightR * 0.82, 58 + level * 8);
    ctx.arc(g.player.x - g.camX, g.player.y - g.camY, orbitRadius, 0, TAU);
    ctx.stroke();

    for (const blade of positions) {
        const sx = blade.x - g.camX;
        const sy = blade.y - g.camY;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, bladeRadius * 0.55, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 244, 210, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, bladeRadius, 0, TAU);
        ctx.stroke();
    }
    ctx.restore();
}

function drawEffects(g: GameState): void {
    for (const effect of g.effects) {
        if (effect.kind === "ring") {
            const t = effect.age / effect.max;
            const radius = effect.radius * (0.25 + 0.75 * t);
            const alpha = (1 - t) * 0.85;
            ctx.save();
            ctx.strokeStyle = hexToRgba(effect.color, alpha);
            ctx.lineWidth = effect.lineWidth * (1 - t * 0.7) + 0.5;
            ctx.beginPath();
            ctx.arc(effect.x - g.camX, effect.y - g.camY, radius, 0, TAU);
            ctx.stroke();
            ctx.restore();
        } else {
            const t = effect.age / effect.max;
            const alpha = Math.max(0, 1 - t);
            if (effect.points.length < 2) continue;
            ctx.save();
            ctx.strokeStyle = hexToRgba(effect.color, alpha);
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.shadowColor = effect.color;
            ctx.shadowBlur = 14;
            ctx.beginPath();
            let first = true;
            for (const point of effect.points) {
                const sx = point.x - g.camX;
                const sy = point.y - g.camY;
                if (first) {
                    ctx.moveTo(sx, sy);
                    first = false;
                } else {
                    ctx.lineTo(sx, sy);
                }
            }
            ctx.stroke();
            ctx.restore();
        }
    }
}

function drawParticles(g: GameState): void {
    for (const p of g.particles) {
        const sx = p.x - g.camX;
        const sy = p.y - g.camY;
        if (
            sx < -p.size ||
            sx > VIEW_W + p.size ||
            sy < -p.size ||
            sy > VIEW_H + p.size
        ) {
            continue;
        }
        const alpha = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, TAU);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawLight(g: GameState): void {
    const px = g.player.x - g.camX;
    const py = g.player.y - g.camY;
    const radius = lightRadiusOf(g);
    const reduced = prefersReduced();
    const breathe = reduced ? 1 : 0.98 + 0.02 * Math.sin(g.time * 3);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const light = ctx.createRadialGradient(
        px,
        py,
        2,
        px,
        py,
        radius * 1.08 * breathe,
    );
    light.addColorStop(0, "rgba(255, 244, 205, 0.38)");
    light.addColorStop(0.28, "rgba(255, 209, 102, 0.22)");
    light.addColorStop(0.62, "rgba(255, 166, 64, 0.12)");
    light.addColorStop(1, "rgba(255, 120, 20, 0)");
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(px, py, radius * 1.08 * breathe, 0, TAU);
    ctx.fill();
    ctx.restore();

    const darkRadius = Math.max(VIEW_W, VIEW_H) * 0.94;
    const edge = clamp(radius / darkRadius, 0.06, 0.96);
    const dark = ctx.createRadialGradient(px, py, 0, px, py, darkRadius);
    dark.addColorStop(0, "rgba(5, 5, 16, 0)");
    dark.addColorStop(edge * 0.58, "rgba(5, 5, 16, 0.03)");
    dark.addColorStop(edge, "rgba(5, 5, 16, 0.56)");
    dark.addColorStop(Math.min(1, edge + 0.2), "rgba(5, 5, 16, 0.88)");
    dark.addColorStop(1, "rgba(5, 5, 16, 0.95)");
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawRangeRing(g: GameState): void {
    const reduced = prefersReduced();
    const radius = lightRadiusOf(g);
    const alpha = reduced ? 0.32 : 0.24 + 0.12 * Math.sin(g.time * 4.2);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 209, 102, " + alpha.toFixed(3) + ")";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 11]);
    ctx.beginPath();
    ctx.arc(g.player.x - g.camX, g.player.y - g.camY, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
}

// ============================================================
// HUD & lobby
// ============================================================
function weaponSignature(g: GameState): string {
    return WEAPON_IDS.map((id) => id + ":" + g.weapons[id]).join("|");
}

function rebuildWeaponRow(g: GameState): void {
    dom.weaponRow.innerHTML = "";
    for (const id of WEAPON_IDS) {
        const level = g.weapons[id];
        if (level <= 0) continue;
        const cfg = WEAPONS[id];
        const chip = document.createElement("span");
        chip.className = "weapon-chip" + (level >= 3 ? " evolved" : "");
        chip.style.setProperty("--weapon-color", cfg.color);

        const glyph = document.createElement("span");
        glyph.className = "weapon-glyph";
        glyph.textContent = cfg.glyph;

        const name = document.createElement("span");
        name.className = "weapon-name";
        name.textContent = level >= 3 ? cfg.evolvedName : cfg.name;

        const lvl = document.createElement("b");
        lvl.textContent = String(level);

        chip.append(glyph, name, lvl);
        dom.weaponRow.appendChild(chip);
    }
}

function updateDashIndicator(g: GameState): void {
    const total = DASH_COOLDOWN * g.stats.dashCdMult;
    const remaining = Math.max(0, g.player.dashCooldown);
    const ready = remaining <= 0;
    const active = g.player.dashTime > 0;
    const progress = ready
        ? 1
        : clamp(1 - remaining / Math.max(0.001, total), 0, 1);
    const offset = ready ? 0 : DASH_RING_LENGTH * (1 - progress);
    const roundedOffset = Math.round(offset);

    if (
        roundedOffset !== dashCache.offset ||
        ready !== dashCache.ready ||
        active !== dashCache.active
    ) {
        dom.dashStatus.dataset.ready = String(ready);
        dom.dashStatus.dataset.active = String(active);
        dom.dashRingFill.style.setProperty(
            "stroke-dashoffset",
            String(roundedOffset),
        );
        dashCache = { ready, offset: roundedOffset, active };
    }

    if (!ready) {
        dashWasCharging = true;
    } else if (dashWasCharging) {
        if (!dashReadyAnnounced) {
            dom.dashLive.textContent = "Dash ready.";
            dashReadyAnnounced = true;
        }
        dashWasCharging = false;
    }
}

function updateHud(g: GameState): void {
    const time = Math.floor(g.time);
    if (time !== hudCache.time) {
        dom.hudTime.textContent = formatClock(time);
        hudCache.time = time;
    }
    if (g.kills !== hudCache.kills) {
        dom.hudKills.textContent = String(g.kills);
        hudCache.kills = g.kills;
    }
    if (g.level !== hudCache.level) {
        dom.hudLevel.textContent = String(g.level);
        hudCache.level = g.level;
    }

    const light = Math.ceil(g.light);
    const pct = g.maxLight > 0 ? Math.round((g.light / g.maxLight) * 100) : 0;
    if (light !== hudCache.light) {
        dom.lightValue.textContent = String(light);
        dom.lightTrack.setAttribute("aria-valuenow", String(light));
        dom.lightTrack.setAttribute(
            "aria-valuemax",
            String(Math.round(g.maxLight)),
        );
        hudCache.light = light;
    }
    if (pct !== hudCache.lightPct) {
        dom.lightFill.style.width = pct + "%";
        hudCache.lightPct = pct;
    }
    const lightState = pct <= 15 ? "critical" : pct <= 30 ? "low" : "";
    if (lightState !== hudCache.lightState) {
        dom.lightTrack.classList.toggle("low", lightState === "low");
        dom.lightTrack.classList.toggle("critical", lightState === "critical");
        hudCache.lightState = lightState;
    }

    const sig = weaponSignature(g);
    if (sig !== hudCache.weaponSig) {
        rebuildWeaponRow(g);
        hudCache.weaponSig = sig;
    }

    updateDashIndicator(g);
}

function updateLobby(): void {
    dom.lobbyBest.textContent = formatClock(state.best);
}

// ============================================================
// Settings, pause & overlays
// ============================================================
// Overlay invariant: at most one of #levelup-overlay, #pause-overlay, and
// #runover-overlay is visible at a time. #settings-modal may sit above them.
// Escape must always reach a usable overlay (or cancel a key rebind).

function updatePauseButton(): void {
    const g = state.game;
    const show = Boolean(
        state.screen === "game" &&
        g &&
        g.active &&
        !g.over &&
        !g.paused &&
        !g.levelUpOpen,
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

function updateDashKeyUi(): void {
    dom.dashKeyBtn.textContent = formatKey(state.settings.dashKey);
    dom.dashKeyBtn.removeAttribute("aria-pressed");
    dom.dashKeyBtn.removeAttribute("data-listening");
}

function updateDashKeyHint(): void {
    dom.dashKeyHint.textContent =
        "Current: " +
        formatKey(state.settings.dashKey) +
        ". Press any key to rebind. Right-click always dashes.";
}

function showDashKeyError(message: string): void {
    dom.dashKeyError.textContent = message;
    dom.dashKeyError.classList.remove("hidden");
}

function beginDashKeyListening(): void {
    listeningForKey = true;
    previousDashKey = state.settings.dashKey;
    dom.dashKeyBtn.setAttribute("data-listening", "true");
    dom.dashKeyBtn.textContent = "Press a key…";
    dom.dashKeyError.classList.add("hidden");
    dom.dashKeyBtn.focus({ preventScroll: true });
}

function cancelDashKeyListening(): void {
    if (previousDashKey !== null) {
        state.settings.dashKey = previousDashKey;
    }
    listeningForKey = false;
    previousDashKey = null;
    dom.dashKeyBtn.removeAttribute("data-listening");
    updateDashKeyUi();
    dom.dashKeyError.classList.add("hidden");
}

function attemptBindDashKey(code: string): void {
    if (hasBindConflict(code)) {
        showDashKeyError("That key is reserved.");
        return;
    }
    if (!code || MODIFIER_ONLY_CODES.has(code)) {
        showDashKeyError("Choose a non-modifier key.");
        return;
    }

    state.settings.dashKey = code;
    saveSettings();
    listeningForKey = false;
    previousDashKey = null;
    dom.dashKeyBtn.removeAttribute("data-listening");
    updateDashKeyUi();
    updateDashKeyHint();
    dom.dashKeyError.classList.add("hidden");
    uiClick();
}

function applySettingsUi(): void {
    dom.reducedToggle.setAttribute(
        "aria-pressed",
        state.settings.reducedEffects ? "true" : "false",
    );
    dom.reducedToggle.textContent = state.settings.reducedEffects
        ? "On"
        : "Off";
    document.body.classList.toggle("reduced", state.settings.reducedEffects);
    updateDashKeyUi();
    updateDashKeyHint();
    updateSoundUi();
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
    if (g && g.levelUpOpen) return;
    lastFocusedElement =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
    if (state.screen === "game" && g && g.active && !g.over && !g.paused) {
        g.paused = true;
        pausedBySettings = true;
        g.keys.clear();
        g.pointerActive = false;
        dom.pauseOverlay.classList.add("hidden");
    }
    dom.settingsModal.classList.remove("hidden");
    applySettingsUi();
    updatePauseButton();
    dom.settingsClose.focus({ preventScroll: true });
    uiClick();
}

function closeSettings(): void {
    cancelDashKeyListening();
    dom.settingsModal.classList.add("hidden");
    const restoreFocus = lastFocusedElement;
    lastFocusedElement = null;
    const g = state.game;
    if (
        pausedBySettings &&
        g &&
        !g.over &&
        !g.levelUpOpen &&
        state.screen === "game"
    ) {
        pausedBySettings = false;
        pauseGame(true);
    } else {
        pausedBySettings = false;
        if (restoreFocus && document.contains(restoreFocus)) {
            restoreFocus.focus({ preventScroll: true });
        }
    }
    updatePauseButton();
    uiClick();
}

function pauseGame(focusPrimaryAction?: boolean): void {
    const g = state.game;
    if (!g || !g.active || g.over || g.levelUpOpen) return;
    g.paused = true;
    g.keys.clear();
    g.pointerActive = false;
    dom.pauseOverlay.classList.remove("hidden");
    if (focusPrimaryAction) focusInside(dom.pauseOverlay);
    updatePauseButton();
}

function resumeGame(): void {
    const g = state.game;
    if (!g || !g.active || g.over || g.levelUpOpen) return;
    if (!dom.settingsModal.classList.contains("hidden")) return;
    // A pick deferred with Escape must be honored before play resumes.
    if (g.pendingPicks > 0 && !g.levelUpOpen) {
        openLevelUp(g);
        return;
    }
    g.paused = false;
    dom.pauseOverlay.classList.add("hidden");
    lastFrame = performance.now();
    updatePauseButton();
    dom.game.focus({ preventScroll: true });
}

function togglePause(): void {
    const g = state.game;
    if (!g || !g.active || g.over || g.levelUpOpen) return;
    uiClick();
    if (g.paused) resumeGame();
    else pauseGame(true);
}

function autoPause(): void {
    const g = state.game;
    if (state.screen !== "game" || !g || !g.active || g.over) return;
    if (g.paused || g.levelUpOpen) return;
    if (!dom.settingsModal.classList.contains("hidden")) return;
    pauseGame();
}

// ============================================================
// Input
// ============================================================
function digitIndex(code: string): number {
    if (code === "Digit1" || code === "Numpad1") return 0;
    if (code === "Digit2" || code === "Numpad2") return 1;
    if (code === "Digit3" || code === "Numpad3") return 2;
    return -1;
}

function onKeyDown(e: KeyboardEvent): void {
    if (listeningForKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === "Escape") {
            cancelDashKeyListening();
        } else {
            attemptBindDashKey(e.code);
        }
        return;
    }

    const game = state.game;
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

    if (game && game.levelUpOpen) {
        if (e.code === "Escape") {
            e.preventDefault();
            closeLevelUp();
            pauseGame(true);
            return;
        }
        const index = digitIndex(e.code);
        if (index !== -1) {
            e.preventDefault();
            chooseUpgrade(index);
            return;
        }
        if (e.code === "Tab") trapFocus(e, dom.levelupOverlay);
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
        if (!dom.runoverOverlay.classList.contains("hidden")) {
            trapFocus(e, dom.runoverOverlay);
        } else if (!dom.pauseOverlay.classList.contains("hidden")) {
            trapFocus(e, dom.pauseOverlay);
        }
    }

    if (e.code === "Enter" || e.code === "NumpadEnter") {
        if (state.screen === "lobby") {
            e.preventDefault();
            uiClick();
            startRun();
            return;
        }
        if (game && game.over) {
            e.preventDefault();
            startRun();
            return;
        }
        if (game && game.paused && !game.levelUpOpen) {
            e.preventDefault();
            uiClick();
            resumeGame();
            return;
        }
    }

    if (state.screen !== "game" || !game) return;
    if (!game.active || game.over || game.paused) {
        if (SCROLL_KEYS.has(e.code)) e.preventDefault();
        return;
    }

    if (SCROLL_KEYS.has(e.code)) e.preventDefault();

    if (MOVE_KEYS.has(e.code)) {
        game.keys.add(e.code);
        return;
    }

    if (e.code === state.settings.dashKey) {
        e.preventDefault();
        if (!e.repeat) tryDash(game);
    }
}

function onKeyUp(e: KeyboardEvent): void {
    const game = state.game;
    if (game) game.keys.delete(e.code);
}

function setPointerTarget(
    g: GameState,
    clientX: number,
    clientY: number,
): void {
    const world = screenToWorld(g, clientX, clientY);
    g.pointerX = world.x;
    g.pointerY = world.y;
}

function onMouseDown(e: MouseEvent): void {
    const g = state.game;
    if (!g || !g.active || g.over || g.paused || g.levelUpOpen) return;
    if (e.button === 0) {
        e.preventDefault();
        dom.game.focus({ preventScroll: true });
        g.pointerActive = true;
        setPointerTarget(g, e.clientX, e.clientY);
    } else if (e.button === 2) {
        e.preventDefault();
        tryDash(g);
    }
}

function onMouseMove(e: MouseEvent): void {
    const g = state.game;
    if (!g || !g.pointerActive) return;
    setPointerTarget(g, e.clientX, e.clientY);
}

function onMouseUp(e: MouseEvent): void {
    const g = state.game;
    if (g && e.button === 0) g.pointerActive = false;
}

function onTouchStart(e: TouchEvent): void {
    const g = state.game;
    if (!g || !g.active || g.over || g.paused || g.levelUpOpen) return;
    const t = e.changedTouches[0];
    if (!t) return;
    g.pointerActive = true;
    setPointerTarget(g, t.clientX, t.clientY);
    e.preventDefault();
}

function onTouchMove(e: TouchEvent): void {
    const g = state.game;
    if (!g || !g.pointerActive) return;
    const t = e.changedTouches[0];
    if (!t) return;
    setPointerTarget(g, t.clientX, t.clientY);
    e.preventDefault();
}

function onTouchEnd(e: TouchEvent): void {
    const g = state.game;
    if (!g) return;
    if (e.touches.length === 0) g.pointerActive = false;
}

function bindEvents(): void {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    dom.lobbySettings.addEventListener("click", openSettings);
    dom.gameSettings.addEventListener("click", openSettings);
    dom.gameBack.addEventListener("click", quitToLobby);
    dom.lobbyMute.addEventListener("click", toggleMute);
    dom.gameMute.addEventListener("click", toggleMute);
    dom.gamePause.addEventListener("click", () => {
        uiClick();
        pauseGame(true);
    });

    dom.startBtn.addEventListener("click", () => {
        uiClick();
        startRun();
    });
    dom.resetProgress.addEventListener("click", () => {
        if (!window.confirm("Reset your Lux best survival time?")) return;
        state.best = 0;
        saveBest();
        updateLobby();
        uiClick();
        window.alert("Progress reset.");
    });

    dom.touchDash.addEventListener("click", () => {
        const g = state.game;
        if (g) tryDash(g);
    });

    dom.pauseResume.addEventListener("click", () => {
        uiClick();
        resumeGame();
    });
    dom.pauseSettings.addEventListener("click", openSettings);
    dom.pauseQuit.addEventListener("click", quitToLobby);
    dom.goRetry.addEventListener("click", () => {
        uiClick();
        startRun();
    });
    dom.goLobby.addEventListener("click", quitToLobby);

    dom.soundToggle.addEventListener("click", toggleMute);
    dom.reducedToggle.addEventListener("click", () => {
        state.settings.reducedEffects = !state.settings.reducedEffects;
        saveSettings();
        applySettingsUi();
        uiClick();
    });
    dom.dashKeyBtn.addEventListener("click", () => {
        if (listeningForKey) {
            cancelDashKeyListening();
        } else {
            beginDashKeyListening();
        }
    });
    dom.settingsClose.addEventListener("click", closeSettings);
    dom.settingsModal.addEventListener("click", (e) => {
        if (e.target === dom.settingsModal) closeSettings();
    });

    dom.game.addEventListener("mousedown", onMouseDown);
    dom.game.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    dom.game.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.game.addEventListener("touchstart", onTouchStart, { passive: false });
    dom.game.addEventListener("touchmove", onTouchMove, { passive: false });
    dom.game.addEventListener("touchend", onTouchEnd);
    dom.game.addEventListener("touchcancel", onTouchEnd);

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) autoPause();
        else resumeAudio();
    });
    window.addEventListener("blur", () => {
        autoPause();
        const g = state.game;
        if (g) {
            g.keys.clear();
            g.pointerActive = false;
        }
    });
    window.addEventListener("resize", () => {
        if (state.screen === "game") {
            resizeCanvas();
            if (state.game) {
                renderGame(state.game);
                updateHud(state.game);
            }
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
        if (state.game) {
            renderGame(g);
            updateHud(g);
        }
    }
    rafId = requestAnimationFrame(loop);
}

function init(): void {
    cacheDom();
    const context = dom.game.getContext("2d");
    if (!context) return;
    ctx = context;
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

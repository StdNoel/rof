/* Midnight Runner — vanilla Canvas 2D endless maze runner */
(() => {
    "use strict";

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

    const DIRECTIONS = {
        up: { x: 0, y: 1 },
        down: { x: 0, y: -1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    };

    const CHARACTERS = {
        vela: { id: "vela", name: "Vela", color: "#2ee6ff", duration: 6.5, speed: 1.08 },
        rho: { id: "rho", name: "Rho", color: "#ff45cf", duration: 5, speed: 1 },
        sol: { id: "sol", name: "Sol", color: "#ffb23e", duration: 5, speed: 1 },
    };

    const HAZARD_KINDS = ["spike", "saw", "barricade"];
    const ENEMY_KINDS = ["chaser", "chaser", "drifter", "sentinel"];

    const RESERVED_CODES = new Set([
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "KeyW", "KeyA", "KeyS", "KeyD",
        "Escape", "Enter", "NumpadEnter", "Tab", "Space", "Backspace",
        "PrintScreen", "ScrollLock", "Pause", "Insert", "Delete",
        "Home", "End", "PageUp", "PageDown", "CapsLock", "NumLock",
        "MetaLeft", "MetaRight", "ContextMenu",
        "ControlLeft", "ControlRight", "AltLeft", "AltRight",
        "ShiftLeft", "ShiftRight",
        "F1", "F2", "F3", "F4", "F5", "F6",
        "F7", "F8", "F9", "F10", "F11", "F12",
    ]);

    // ============================================================
    // Helpers
    // ============================================================
    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function makeRng(seed) {
        let s = seed >>> 0;
        return function rng() {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hash2(x, y) {
        let h = (x * 374761393 + y * 668265263) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
        return (h ^ (h >>> 16)) >>> 0;
    }

    function hexToRgba(hex, alpha) {
        const value = hex.replace("#", "");
        const r = parseInt(value.slice(0, 2), 16);
        const g = parseInt(value.slice(2, 4), 16);
        const b = parseInt(value.slice(4, 6), 16);
        return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
    }

    function keyLabel(code) {
        if (!code) return "?";
        if (code.indexOf("Key") === 0) return code.slice(3);
        if (code.indexOf("Digit") === 0) return code.slice(5);
        if (code.indexOf("Numpad") === 0) return "Num " + code.slice(6);
        return code;
    }

    function totalScore(g) {
        return Math.floor(g.distance * 10) + g.bonus;
    }

    // ============================================================
    // Persistence
    // ============================================================
    function loadSettings() {
        const defaults = {
            boostMode: "auto",
            boostKey: "KeyE",
            lastCharacter: "vela",
            reducedEffects: false,
        };
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return defaults;
            const data = JSON.parse(raw);
            return {
                boostMode: data.boostMode === "manual" ? "manual" : "auto",
                boostKey: typeof data.boostKey === "string" && data.boostKey ? data.boostKey : "KeyE",
                lastCharacter: CHARACTERS[data.lastCharacter] ? data.lastCharacter : "vela",
                reducedEffects: Boolean(data.reducedEffects),
            };
        } catch (err) {
            return defaults;
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
        } catch (err) { /* storage unavailable */ }
    }

    function loadBest() {
        const best = { vela: 0, rho: 0, sol: 0 };
        try {
            const raw = localStorage.getItem(BEST_KEY);
            if (!raw) return best;
            const data = JSON.parse(raw);
            for (const key of Object.keys(best)) {
                best[key] = Number.isFinite(data[key]) ? Math.max(0, Math.floor(data[key])) : 0;
            }
        } catch (err) { /* storage unavailable */ }
        return best;
    }

    function saveBest() {
        try {
            localStorage.setItem(BEST_KEY, JSON.stringify(state.best));
        } catch (err) { /* storage unavailable */ }
    }

    function resetBestScores() {
        state.best = { vela: 0, rho: 0, sol: 0 };
        saveBest();
        updateLobby();
    }

    // ============================================================
    // State & DOM
    // ============================================================
    const state = {
        screen: "lobby",
        selected: "vela",
        settings: loadSettings(),
        best: loadBest(),
        game: null,
    };

    const dom = {};
    const sprites = { walls: [], hazards: {}, projectile: null };
    let ctx = null;
    let capturingKey = false;
    let pausedBySettings = false;
    let lastFrame = 0;
    let lastFocusedElement = null;
    let hudCache = { score: -1, distance: -1, hp: -1, gauge: -1, label: "" };

    function cacheDom() {
        const ids = [
            "screen-lobby", "screen-game", "lobby-settings", "lobby-best", "start-btn",
            "reset-progress",
            "game-settings", "hp-pips", "hud-score", "hud-distance", "boost-track",
            "boost-fill", "boost-label", "canvas-wrap", "game", "boost-tint", "touch-boost",
            "pause-overlay", "pause-resume", "pause-settings", "pause-quit",
            "gameover-overlay", "go-score", "go-distance", "go-best", "go-character",
            "go-note", "go-retry", "go-lobby", "settings-modal", "key-capture",
            "key-warning", "reduced-toggle", "settings-close",
        ];
        for (const id of ids) {
            const camel = id.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
            dom[camel] = document.getElementById(id);
        }
        dom.characters = Array.from(document.querySelectorAll(".character"));
        dom.bestLabels = Array.from(document.querySelectorAll("[data-best]"));
        dom.boostModes = Array.from(document.querySelectorAll("[data-boost-mode]"));
    }

    // ============================================================
    // SVG sprite factory
    // ============================================================
    function loadSvg(svg) {
        const img = new Image();
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        return img;
    }

    function wallSvg(index, rng) {
        const tints = ["#4b4bb0", "#3a6fd0", "#8a3fd0", "#2f9fc0"];
        const tint = tints[index % tints.length];
        let marks = "";
        const count = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
            const x = 5 + Math.floor(rng() * 20);
            const y = 5 + Math.floor(rng() * 20);
            const w = 4 + Math.floor(rng() * 8);
            marks += '<rect x="' + x + '" y="' + y + '" width="' + w +
                '" height="3" rx="1.5" fill="#0e0e28" opacity="0.9"/>';
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
            '<defs><linearGradient id="g' + index + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#23235c"/><stop offset="1" stop-color="#101028"/>' +
            '</linearGradient></defs>' +
            '<rect x="0.5" y="0.5" width="31" height="31" rx="5" fill="url(#g' + index + ')" ' +
            'stroke="' + tint + '" stroke-width="1.4"/>' +
            '<rect x="4.5" y="4.5" width="23" height="23" rx="3.5" fill="none" ' +
            'stroke="' + hexToRgba(tint, 0.35) + '" stroke-width="1"/>' +
            marks +
            '<path d="M7 25 L11 20 L10 16 L15 13" fill="none" stroke="' + hexToRgba(tint, 0.5) +
            '" stroke-width="1.2" stroke-linecap="round"/>' +
            '</svg>';
    }

    function spikeSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
            '<path d="M5 15 L9 3 L12 13 L16 2 L20 13 L23 3 L27 15 Z" fill="#e02b66" ' +
            'stroke="#ff7aa2" stroke-width="1"/>' +
            '<rect x="4" y="14" width="24" height="14" rx="4" fill="#a4134a" stroke="#ff5d8f" stroke-width="1.5"/>' +
            '<rect x="9" y="19" width="5" height="5" rx="1" fill="#ff8aac" opacity="0.8"/>' +
            '<rect x="18" y="19" width="5" height="5" rx="1" fill="#ff8aac" opacity="0.8"/>' +
            '</svg>';
    }

    function sawSvg() {
        let teeth = "";
        for (let i = 0; i < 8; i++) {
            const a = (i * 45) * Math.PI / 180;
            const x1 = 16 + Math.cos(a) * 10;
            const y1 = 16 + Math.sin(a) * 10;
            const x2 = 16 + Math.cos(a + 0.28) * 15;
            const y2 = 16 + Math.sin(a + 0.28) * 15;
            const x3 = 16 + Math.cos(a + 0.56) * 10;
            const y3 = 16 + Math.sin(a + 0.56) * 10;
            teeth += "M" + x1.toFixed(1) + " " + y1.toFixed(1) + " L" + x2.toFixed(1) + " " +
                y2.toFixed(1) + " L" + x3.toFixed(1) + " " + y3.toFixed(1) + " Z ";
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
            '<path d="' + teeth + '" fill="#ff9b32" stroke="#ffd27a" stroke-width="1"/>' +
            '<circle cx="16" cy="16" r="9" fill="#c05a12" stroke="#ffb95c" stroke-width="1.5"/>' +
            '<circle cx="16" cy="16" r="3.5" fill="#3a1a06" stroke="#ffd27a" stroke-width="1.2"/>' +
            '<path d="M11 16 H21" stroke="#ffd27a" stroke-width="1" opacity="0.6"/>' +
            '</svg>';
    }

    function barricadeSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
            '<rect x="3" y="10" width="26" height="6" rx="2" fill="#8a4fe0" stroke="#c79bff" ' +
            'stroke-width="1.2" transform="rotate(-8 16 13)"/>' +
            '<rect x="4" y="20" width="22" height="6" rx="2" fill="#6b3fc0" stroke="#b48cff" ' +
            'stroke-width="1.2" transform="rotate(6 16 23)"/>' +
            '<path d="M9 9 L11 23 M19 8 L21 25 M26 9 L24 21" stroke="#2a1050" stroke-width="2"/>' +
            '<path d="M25 9 L29 5" stroke="#c79bff" stroke-width="1.5" stroke-linecap="round"/>' +
            '</svg>';
    }

    function projectileSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
            '<circle cx="12" cy="12" r="9" fill="#19c8e8" opacity="0.28"/>' +
            '<circle cx="12" cy="12" r="6" fill="#28e6ff" stroke="#a9f6ff" stroke-width="1.2"/>' +
            '<circle cx="10" cy="10" r="2" fill="#e6ffff"/>' +
            '<path d="M12 3 L13.5 8 L12 7 L10.5 8 Z" fill="#9ff3ff"/>' +
            '</svg>';
    }

    function initSprites() {
        const rng = makeRng(0x51ff77);
        for (let i = 0; i < 6; i++) {
            sprites.walls.push(loadSvg(wallSvg(i, rng)));
        }
        sprites.hazards.spike = loadSvg(spikeSvg());
        sprites.hazards.saw = loadSvg(sawSvg());
        sprites.hazards.barricade = loadSvg(barricadeSvg());
        sprites.projectile = loadSvg(projectileSvg());
    }

    // ============================================================
    // Maze generation
    // ============================================================
    function ensureMaze(g, targetRow) {
        if (targetRow <= g.generatedHigh) return;
        const target = Math.ceil(targetRow / CHUNK_ROWS) * CHUNK_ROWS;
        for (let y = g.generatedHigh + 1; y <= target; y++) {
            generateRow(g, y);
        }
        g.generatedHigh = Math.max(g.generatedHigh, target);
    }

    function laneBlockForChunk(g, chunk) {
        if (chunk <= 0) return 1;
        if (g.laneChunks.has(chunk)) return g.laneChunks.get(chunk);
        const prev = laneBlockForChunk(g, chunk - 1);
        let block = Math.floor(g.rng() * LANE_BLOCKS);
        if (block === prev) {
            block = (block + 1 + Math.floor(g.rng() * (LANE_BLOCKS - 1))) % LANE_BLOCKS;
        }
        g.laneChunks.set(chunk, block);
        return block;
    }

    function generateRow(g, y) {
        const walls = new Array(COLS).fill(false);
        walls[0] = true;
        walls[COLS - 1] = true;

        const chunk = Math.floor(y / CHUNK_ROWS);
        const laneBlock = laneBlockForChunk(g, chunk);
        const lane = 2 + laneBlock * 3;
        const transition = y > START_ROW && y % CHUNK_ROWS === 0;

        if (!transition) {
            for (let b = 0; b < LANE_BLOCKS; b++) {
                const start = 1 + b * 3;
                walls[start] = true;
                if (b !== laneBlock && g.rng() < 0.14) walls[start] = false;
            }
            walls[COLS - 2] = true;

            if (y > START_ROW && g.rng() < 0.34) {
                for (let b = 0; b < LANE_BLOCKS; b++) {
                    if (b === laneBlock) continue;
                    if (g.rng() < 0.5) {
                        const s = 1 + b * 3;
                        walls[s] = true;
                        walls[s + 1] = true;
                        walls[s + 2] = true;
                    }
                }
            }
        }

        g.lanes.set(y, lane);
        g.maze.set(y, { walls: walls, lane: lane });
        maybeSpawnRow(g, y, walls, lane);
    }

    function maybeSpawnRow(g, y, walls, lane) {
        const dist = y - START_ROW;
        if (dist < 5) return;
        const open = [];
        for (let x = 1; x < COLS - 1; x++) {
            if (!walls[x] && x !== lane && x !== lane + 1) open.push(x);
        }
        if (open.length === 0) return;
        const pickX = () => open[Math.floor(g.rng() * open.length)];
        const difficulty = clamp((dist - 5) / 150, 0, 1);
        const enemyChance = 0.05 + difficulty * 0.1;
        const roll = g.rng();
        if (roll < enemyChance) {
            g.entities.push(makeEnemy(g, pickX(), y));
            return;
        }
        if (roll < enemyChance + 0.07) {
            const kind = HAZARD_KINDS[Math.floor(g.rng() * HAZARD_KINDS.length)];
            g.entities.push({ type: "hazard", kind: kind, x: pickX(), y: y, dead: false, rot: g.rng() * Math.PI * 2 });
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

    function makePickup(g, kind, x, y) {
        return { type: "pickup", kind: kind, x: x, y: y, dead: false, phase: g.rng() * Math.PI * 2 };
    }

    function makeEnemy(g, x, y) {
        const kind = ENEMY_KINDS[Math.floor(g.rng() * ENEMY_KINDS.length)];
        const enemy = {
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

    function makeProjectile(g, x, y) {
        return { type: "proj", x: x, y: y, vx: 0, vy: 0, life: 5, dead: false };
    }

    // ============================================================
    // Maze queries
    // ============================================================
    function tileOpen(g, x, y) {
        if (x < 0 || x >= COLS) return false;
        if (y > g.generatedHigh) ensureMaze(g, y + 1);
        const row = g.maze.get(y);
        if (!row) return false;
        return !row.walls[x];
    }

    function canMove(g, x, y, dir) {
        const vec = DIRECTIONS[dir];
        if (!vec) return false;
        return tileOpen(g, x + vec.x, y + vec.y);
    }

    // ============================================================
    // Run lifecycle
    // ============================================================
    function createGame(character) {
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
                queued: "up",
                speed: PLAYER_SPEED * cfg.speed,
                facing: "up",
            },
            maze: new Map(),
            lanes: new Map(),
            generatedHigh: START_ROW - GENERATE_BEHIND - 1,
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

    function startRun(character) {
        const key = CHARACTERS[character] ? character : "vela";
        state.selected = key;
        state.settings.lastCharacter = key;
        saveSettings();

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
        hudCache = { score: -1, distance: -1, hp: -1, gauge: -1, label: "" };
        showScreen("game");
        resizeCanvas();
        updateHud(g);
        updateTouchBoost();
        lastFrame = performance.now();
    }

    function applyAccent(character) {
        const cfg = CHARACTERS[character];
        dom.screenGame.style.setProperty("--char", cfg.color);
        dom.screenGame.style.setProperty("--char-soft", hexToRgba(cfg.color, 0.24));
    }

    function showScreen(name) {
        state.screen = name;
        dom.screenLobby.classList.toggle("active", name === "lobby");
        dom.screenGame.classList.toggle("active", name === "game");
        if (name === "lobby") {
            updateLobby();
        } else {
            requestAnimationFrame(resizeCanvas);
        }
    }

    function quitToLobby() {
        state.game = null;
        dom.pauseOverlay.classList.add("hidden");
        dom.gameoverOverlay.classList.add("hidden");
        dom.boostTint.classList.remove("on");
        dom.touchBoost.classList.remove("visible");
        showScreen("lobby");
        dom.startBtn.focus({ preventScroll: true });
    }

    function endRun(g) {
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
        focusInside(dom.gameoverOverlay);
    }

    // ============================================================
    // Update
    // ============================================================
    function updateGame(g, dt) {
        g.time += dt;
        if (g.invuln > 0) g.invuln = Math.max(0, g.invuln - dt);
        if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
        if (g.flash > 0) g.flash = Math.max(0, g.flash - dt);

        updatePlayer(g, dt);
        ensureMaze(g, Math.ceil(g.player.y) + GENERATE_AHEAD);
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
                spawnParticle(g, g.player.x, g.player.y, CHARACTERS[g.character].color, 1.4, 0.5);
            }
        }
    }

    function chooseDir(g, p) {
        if (p.queued && canMove(g, p.tx, p.ty, p.queued)) {
            const dir = p.queued;
            p.queued = null;
            return dir;
        }
        if (p.dir && canMove(g, p.tx, p.ty, p.dir)) return p.dir;
        return null;
    }

    function updatePlayer(g, dt) {
        const p = g.player;
        let budget = p.speed * dt;
        let guard = 0;

        while (budget > 0.00001 && guard++ < 12) {
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

    function activateBoost(g) {
        if (g.boost > 0 || g.gauge < 100) return;
        g.boost = CHARACTERS[g.character].duration;
        g.gauge = 0;
        g.surge = 0.25;
        dom.boostTint.classList.add("on");
        dom.boostTrack.classList.remove("ready", "nudge");
        spawnBurst(g, g.player.x, g.player.y, CHARACTERS[g.character].color, 18, 5);
    }

    function manualBoost() {
        const g = state.game;
        if (!g || !g.active || g.paused || g.over) return;
        if (g.boost > 0) return;
        if (g.gauge >= 100) {
            activateBoost(g);
        } else if (state.settings.boostMode === "manual") {
            dom.boostTrack.classList.remove("nudge");
            void dom.boostTrack.offsetWidth;
            dom.boostTrack.classList.add("nudge");
        }
    }

    function updateBoost(g, dt) {
        if (g.boost <= 0) return;
        g.boost = Math.max(0, g.boost - dt);
        if (g.boost === 0) {
            dom.boostTint.classList.remove("on");
            dom.boostTrack.classList.remove("ready");
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

    function updateCollapse(g, dt) {
        const c = g.collapse;
        const p = g.player;

        if (!c.active) {
            c.grace -= dt;
            c.row = p.y - 5.2;
            if (c.grace <= 0) {
                c.grace = 0;
                c.active = true;
                c.speed = 1.6;
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

    function damagePlayer(g) {
        if (g.invuln > 0 || g.boost > 0 || g.over) return;
        g.hp -= 1;
        g.invuln = IFRAME_TIME;
        g.flash = 0.55;
        g.shake = 0.4;
        spawnBurst(g, g.player.x, g.player.y, "#ff4d7d", 16, 5);
        if (g.hp <= 0) {
            g.hp = 0;
            endRun(g);
        }
    }

    // ============================================================
    // Entities
    // ============================================================
    function updateEntities(g, dt) {
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

    function stepGrid(g, e, dt, choose) {
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

    function chooseChaserDir(g, e) {
        const p = g.player;
        const dx = p.tx - e.tx;
        const dy = p.ty - e.ty;
        const opts = [];
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

    function chooseDrifterDir(g, e) {
        if ((e.dir === "left" || e.dir === "right") && canMove(g, e.tx, e.ty, e.dir)) return;
        const alt = e.dir === "left" ? "right" : "left";
        if (canMove(g, e.tx, e.ty, alt)) {
            e.dir = alt;
            return;
        }
        for (const dir of ["up", "down", "left", "right"]) {
            if (canMove(g, e.tx, e.ty, dir)) {
                e.dir = dir;
                return;
            }
        }
        e.dir = null;
    }

    function updateEnemy(g, e, dt) {
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

    function fireProjectile(g, e) {
        const p = g.player;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        const speed = 2.1;
        const proj = makeProjectile(g, e.x, e.y);
        proj.vx = (dx / len) * speed;
        proj.vy = (dy / len) * speed;
        g.entities.push(proj);
    }

    function isSolid(g, x, y) {
        return !tileOpen(g, Math.round(x), Math.round(y));
    }

    function updateProjectile(g, e, dt) {
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

    function updateHazard(g, e) {
        if (g.boost > 0 || g.invuln > 0) return;
        const p = g.player;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 0.55) {
            damagePlayer(g);
        }
    }

    function updatePickup(g, e, dt) {
        e.phase += dt * 2;
        const p = g.player;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < 0.62) collectPickup(g, e);
    }

    function magnetize(g, dt) {
        const p = g.player;
        for (const e of g.entities) {
            if (e.dead || e.type !== "pickup") continue;
            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const d = Math.hypot(dx, dy);
            if (d < 5 && d > 0.01) {
                const pull = Math.min(d, 7 * dt);
                e.x += (dx / d) * pull;
                e.y += (dy / d) * pull;
                if (d < 0.7) collectPickup(g, e);
            }
        }
    }

    function collectPickup(g, e) {
        if (e.dead) return;
        e.dead = true;
        const color = e.kind === "coin" ? "#ffd45e" : e.kind === "chest" ? "#ff9b32" : "#45f0b0";
        if (e.kind === "coin") {
            g.bonus += 20;
            addGauge(g, 8);
        } else if (e.kind === "chest") {
            g.bonus += 60;
            addGauge(g, 34);
        } else {
            g.hp = Math.min(MAX_HP, g.hp + 1);
            g.bonus += 15;
        }
        spawnBurst(g, e.x, e.y, color, 10, 3.5);
    }

    function addGauge(g, amount) {
        if (g.boost > 0 && amount < 20) return;
        g.gauge = clamp(g.gauge + amount, 0, 100);
    }

    function killEnemy(g, e) {
        if (e.dead) return;
        e.dead = true;
        g.bonus += 60;
        spawnBurst(g, e.x, e.y, enemyColor(e.kind), 14, 4.5);
    }

    function shockwave(g) {
        const p = g.player;
        const radius = 3.2;
        g.waves.push({ x: p.x, y: p.y, age: 0, max: 0.5 });
        for (const e of g.entities) {
            if (e.dead) continue;
            if (e.type !== "enemy" && e.type !== "proj") continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) <= radius) {
                if (e.type === "enemy") {
                    killEnemy(g, e);
                } else {
                    e.dead = true;
                    g.bonus += 10;
                }
            }
        }
    }

    function prefersReduced() {
        if (state.settings.reducedEffects) return true;
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function enemyColor(kind) {
        if (kind === "chaser") return "#ff5d6c";
        if (kind === "drifter") return "#3ddc97";
        return "#b46bff";
    }

    function spawnParticle(g, x, y, color, size, life) {
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

    function spawnBurst(g, x, y, color, count, speed) {
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

    function updateParticles(g, dt) {
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
    function resizeCanvas() {
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

    function cameraRow(g) {
        return g.player.y - CAMERA_OFFSET;
    }

    function worldToScreenY(row, camRow) {
        return (ROWS - 1 - (row - camRow)) * TILE;
    }

    function centerX(x) {
        return x * TILE + TILE / 2;
    }

    function centerY(y, camRow) {
        return worldToScreenY(y, camRow) + TILE / 2;
    }

    // ============================================================
    // Render
    // ============================================================
    function renderGame(g) {
        const camRow = cameraRow(g);
        const reduced = prefersReduced();
        ctx.clearRect(0, 0, VIEW_W, VIEW_H);

        ctx.save();
        if (g.shake > 0 && !reduced) {
            const amp = g.shake * 9;
            ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
        }

        drawFloor(camRow, g);
        drawWalls(camRow, g);
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
                centerX(g.player.x), centerY(g.player.y, camRow), 16,
                centerX(g.player.x), centerY(g.player.y, camRow), VIEW_W * 0.85
            );
            wash.addColorStop(0, hexToRgba(used.color, 0.18));
            wash.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = wash;
            ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        }

        ctx.restore();

        if (g.flash > 0) {
            ctx.fillStyle = "rgba(255, 60, 100, " + (g.flash * 0.45).toFixed(3) + ")";
            ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        }

        if (g.invuln > 0 && !reduced && Math.floor(g.time * 20) % 2 === 0) {
            ctx.fillStyle = hexToRgba(CHARACTERS[g.character].color, 0.08);
            ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        }
    }

    function visibleRows(camRow) {
        return {
            first: Math.floor(camRow) - 1,
            last: Math.floor(camRow) + ROWS + 1,
        };
    }

    function drawFloor(camRow, g) {
        const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
        gradient.addColorStop(0, "#080818");
        gradient.addColorStop(0.5, "#0a0a22");
        gradient.addColorStop(1, "#070716");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);

        const rows = visibleRows(camRow);
        for (let row = rows.first; row <= rows.last; row++) {
            const top = worldToScreenY(row, camRow);
            if (top > VIEW_H || top + TILE < 0) continue;
            for (let x = 0; x < COLS; x++) {
                const seed = hash2(x, row);
                ctx.fillStyle = seed % 2 === 0 ? "#0d0d27" : "#0b0b22";
                ctx.fillRect(x * TILE, top, TILE, TILE);
                ctx.strokeStyle = "rgba(96, 96, 190, 0.10)";
                ctx.strokeRect(x * TILE + 0.5, top + 0.5, TILE - 1, TILE - 1);
                if (seed % 11 === 0) {
                    ctx.fillStyle = "rgba(120, 140, 255, 0.18)";
                    ctx.fillRect(x * TILE + (seed % 24) + 4, top + ((seed >> 3) % 24) + 4, 2, 2);
                }
            }
        }
    }

    function drawWalls(camRow, g) {
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

    function drawPickups(g, camRow) {
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

    function drawHazards(g, camRow) {
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

    function drawEnemies(g, camRow) {
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
                    const a = e.spin + i * (Math.PI * 2 / 3);
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

    function drawProjectiles(g, camRow) {
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

    function drawWaves(g, camRow) {
        for (const wave of g.waves) {
            const t = wave.age / wave.max;
            const radius = (0.6 + t * 3) * TILE;
            const cx = centerX(wave.x);
            const cy = centerY(wave.y, camRow);
            if (cx + radius < 0 || cx - radius > VIEW_W ||
                cy + radius < 0 || cy - radius > VIEW_H) continue;
            ctx.strokeStyle = hexToRgba(CHARACTERS[g.character].color, (1 - t) * 0.6);
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function drawPlayer(g, camRow) {
        const p = g.player;
        const cfg = CHARACTERS[g.character];
        const cx = centerX(p.x);
        const cy = centerY(p.y, camRow);

        ctx.save();
        if (g.invuln > 0 && Math.floor(g.time * 18) % 2 === 0) {
            ctx.globalAlpha = 0.32;
        }
        const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 27);
        glow.addColorStop(0, hexToRgba(cfg.color, 0.5));
        glow.addColorStop(1, hexToRgba(cfg.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, 27, 0, Math.PI * 2);
        ctx.fill();

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

    function drawCollapse(g, camRow) {
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
                ctx.fillText("COLLAPSE IN " + Math.ceil(c.grace) + "s", VIEW_W / 2, VIEW_H - 10);
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
            const yy = top + (reduced ? 0 :
                Math.sin(x * 0.045 + g.time * 5) * 5 +
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
            ctx.fillStyle = "rgba(255, 120, 200, " + (0.15 + ((seed >> 3) % 20) / 80) + ")";
            ctx.fillRect(x, y, 2, h);
        }
    }

    function drawParticles(g, camRow) {
        for (const p of g.particles) {
            const cx = centerX(p.x);
            const cy = centerY(p.y, camRow);
            if (cx < -p.size || cx > VIEW_W + p.size ||
                cy < -p.size || cy > VIEW_H + p.size) continue;
            const alpha = clamp(p.life / p.max, 0, 1);
            ctx.fillStyle = hexToRgba(p.color, alpha * 0.9);
            ctx.beginPath();
            ctx.arc(cx, cy, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ============================================================
    // HUD & lobby
    // ============================================================
    function updateHud(g) {
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
                pips[i].classList.toggle("lost", i >= g.hp);
            }
            hudCache.hp = g.hp;
        }
        const gauge = Math.round(g.gauge);
        if (gauge !== hudCache.gauge) {
            dom.boostFill.style.width = gauge + "%";
            hudCache.gauge = gauge;
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
        dom.boostTrack.classList.toggle("ready", g.gauge >= 100 && g.boost <= 0);
    }

    function updateLobby() {
        for (const card of dom.characters) {
            const key = card.getAttribute("data-character");
            const selected = key === state.selected;
            card.setAttribute("aria-checked", selected ? "true" : "false");
        }
        for (const node of dom.bestLabels) {
            const key = node.getAttribute("data-best");
            node.textContent = String(state.best[key] || 0);
        }
        const all = Object.values(state.best);
        dom.lobbyBest.textContent = String(all.length ? Math.max.apply(null, all) : 0);
    }

    function selectCharacter(key) {
        if (!CHARACTERS[key]) return;
        state.selected = key;
        state.settings.lastCharacter = key;
        saveSettings();
        updateLobby();
    }

    // ============================================================
    // Settings & pause UI
    // ============================================================
    function isTouchDevice() {
        return ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
    }

    function focusableIn(root) {
        const selector = "button:not([disabled]), [href], input:not([disabled]), " +
            "select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";
        return Array.from(root.querySelectorAll(selector))
            .filter((el) => el.getClientRects().length > 0);
    }

    function focusInside(root) {
        const items = focusableIn(root);
        if (items.length > 0) {
            items[0].focus({ preventScroll: true });
            return true;
        }
        return false;
    }

    function trapFocus(e, root) {
        if (e.code !== "Tab") return;
        const items = focusableIn(root);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
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

    function updateTouchBoost() {
        const g = state.game;
        const show = isTouchDevice() &&
            state.settings.boostMode === "manual" &&
            state.screen === "game" &&
            g && g.active && !g.over && !g.paused;
        dom.touchBoost.classList.toggle("visible", Boolean(show));
    }

    function applySettingsUi() {
        const settings = state.settings;
        for (const btn of dom.boostModes) {
            const mode = btn.getAttribute("data-boost-mode");
            btn.setAttribute("aria-checked", mode === settings.boostMode ? "true" : "false");
        }
        if (!capturingKey) {
            dom.keyCapture.textContent = keyLabel(settings.boostKey);
        }
        dom.reducedToggle.setAttribute("aria-pressed", settings.reducedEffects ? "true" : "false");
        dom.reducedToggle.textContent = settings.reducedEffects ? "On" : "Off";
        document.body.classList.toggle("reduced", settings.reducedEffects);
        updateTouchBoost();
    }

    function openSettings() {
        const g = state.game;
        lastFocusedElement = document.activeElement;
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
        dom.settingsClose.focus({ preventScroll: true });
    }

    function closeSettings() {
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
    }

    function pauseGame(focusPrimaryAction) {
        const g = state.game;
        if (!g || !g.active || g.over) return;
        g.paused = true;
        dom.pauseOverlay.classList.remove("hidden");
        if (focusPrimaryAction) focusInside(dom.pauseOverlay);
        updateTouchBoost();
    }

    function resumeGame() {
        const g = state.game;
        if (!g || !g.active || g.over) return;
        g.paused = false;
        dom.pauseOverlay.classList.add("hidden");
        lastFrame = performance.now();
        updateTouchBoost();
    }

    function togglePause() {
        const g = state.game;
        if (!g || !g.active || g.over) return;
        if (g.paused) resumeGame();
        else pauseGame(true);
    }

    function cancelCapture() {
        capturingKey = false;
        dom.keyCapture.classList.remove("capturing");
        if (state.settings) {
            dom.keyCapture.textContent = keyLabel(state.settings.boostKey);
        }
    }

    function beginCapture() {
        capturingKey = true;
        dom.keyCapture.textContent = "Press a key";
        dom.keyCapture.classList.add("capturing");
        dom.keyWarning.classList.add("hidden");
    }

    function validateBoostKey(e) {
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
    const MOVE_KEYS = {
        ArrowUp: "up", KeyW: "up",
        ArrowDown: "down", KeyS: "down",
        ArrowLeft: "left", KeyA: "left",
        ArrowRight: "right", KeyD: "right",
    };
    const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

    function queueDirection(g, dir) {
        if (!g || !g.active || g.over) return;
        g.player.queued = dir;
    }

    function handleCapture(e) {
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
    }

    function onKeyDown(e) {
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
            queueDirection(game, move);
            return;
        }

        if (state.settings.boostMode === "manual" && e.code === state.settings.boostKey) {
            e.preventDefault();
            if (!e.repeat) manualBoost();
        }
    }

    let touchStart = null;

    function onTouchStart(e) {
        if (state.screen !== "game") return;
        const t = e.changedTouches[0];
        touchStart = { x: t.clientX, y: t.clientY };
    }

    function onTouchMove(e) {
        if (!touchStart || state.screen !== "game") return;
        const g = state.game;
        if (!g || !g.active || g.over || g.paused) return;
        e.preventDefault();
        const t = e.changedTouches[0];
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

    function autoPause() {
        const g = state.game;
        if (state.screen !== "game" || !g || !g.active || g.over || g.paused) return;
        if (!dom.settingsModal.classList.contains("hidden")) return;
        pauseGame();
    }

    function bindEvents() {
        document.addEventListener("keydown", onKeyDown);

        dom.lobbySettings.addEventListener("click", openSettings);
        dom.gameSettings.addEventListener("click", openSettings);
        dom.startBtn.addEventListener("click", () => startRun(state.selected));
        dom.resetProgress.addEventListener("click", () => {
            if (!window.confirm("Reset all Midnight Runner best scores?")) return;
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
                state.settings.boostMode = btn.getAttribute("data-boost-mode") === "manual" ? "manual" : "auto";
                saveSettings();
                applySettingsUi();
            });
        });

        dom.keyCapture.addEventListener("click", () => {
            if (capturingKey) cancelCapture();
            else beginCapture();
        });

        dom.reducedToggle.addEventListener("click", () => {
            state.settings.reducedEffects = !state.settings.reducedEffects;
            saveSettings();
            applySettingsUi();
        });

        dom.settingsClose.addEventListener("click", closeSettings);
        dom.settingsModal.addEventListener("click", (e) => {
            if (e.target === dom.settingsModal) closeSettings();
        });

        dom.pauseResume.addEventListener("click", resumeGame);
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
        dom.game.addEventListener("touchend", () => { touchStart = null; });
        dom.game.addEventListener("touchcancel", () => { touchStart = null; });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) autoPause();
        });
        window.addEventListener("blur", autoPause);
        window.addEventListener("resize", () => {
            if (state.screen === "game") resizeCanvas();
        });
    }

    // ============================================================
    // Main loop & boot
    // ============================================================
    function loop(now) {
        const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
        lastFrame = now;
        const g = state.game;
        if (state.screen === "game" && g) {
            if (g.active && !g.paused && !g.over) updateGame(g, dt);
            renderGame(g);
            updateHud(g);
        }
        requestAnimationFrame(loop);
    }

    function init() {
        cacheDom();
        ctx = dom.game.getContext("2d");
        if (!ctx) return;
        state.selected = state.settings.lastCharacter;
        initSprites();
        applySettingsUi();
        updateLobby();
        bindEvents();
        resizeCanvas();
        lastFrame = performance.now();
        requestAnimationFrame(loop);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

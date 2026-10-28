/* Last Call - standalone darts drinking game */
(() => {
    "use strict";

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

    const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

    const RINGS = {
        bull: 0.037,
        outerBull: 0.093,
        tripleIn: 0.58,
        tripleOut: 0.63,
        doubleIn: 0.95,
        doubleOut: 1,
    };

    const DRUNK = [
        { label: "Sober", sigma: 0.018, sway: 0 },
        { label: "Tipsy", sigma: 0.028, sway: 0.3 },
        { label: "Buzzed", sigma: 0.045, sway: 0.6 },
        { label: "Wasted", sigma: 0.07, sway: 1 },
        { label: "Seeing Double", sigma: 0.1, sway: 1.6 },
        { label: "Blackout", sigma: 0.1, sway: 1.6 },
    ];

    const DIFFICULTY = {
        easy: { name: "Rookie", baseSigma: 0.085 },
        normal: { name: "Regular", baseSigma: 0.05 },
        hard: { name: "Legend", baseSigma: 0.025 },
    };

    const COLORS = { p1: "#ffb347", p2: "#2ee6d0" };
    const PLAYER_NAMES = ["Player 1", "Player 2"];
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    // ============================================================
    // Helpers
    // ============================================================
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function gauss() {
        let u = 0;
        let v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function rad(degrees) {
        return (degrees * Math.PI) / 180;
    }

    function adjustSigma(sigma, drinks) {
        return sigma * (DRUNK[drinks].sigma / DRUNK[0].sigma);
    }

    function makeRecord() {
        return { wins: 0, losses: 0, best: null };
    }

    function makeDuoRecord() {
        return { p1: 0, p2: 0, bestP1: null, bestP2: null };
    }

    // ============================================================
    // Persistence
    // ============================================================
    function loadSettings() {
        const defaults = { muted: false, reducedEffects: false };
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return defaults;
            const data = JSON.parse(raw);
            return {
                muted: Boolean(data.muted),
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

    function loadRecords() {
        const defaults = {
            solo: { easy: makeRecord(), normal: makeRecord(), hard: makeRecord() },
            duo: makeDuoRecord(),
        };
        try {
            const raw = localStorage.getItem(RECORDS_KEY);
            if (!raw) return defaults;
            const data = JSON.parse(raw);
            for (const key of ["easy", "normal", "hard"]) {
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

    function saveRecords() {
        try {
            localStorage.setItem(RECORDS_KEY, JSON.stringify(state.records));
        } catch (err) { /* storage unavailable */ }
    }

    // ============================================================
    // State & DOM
    // ============================================================
    const state = {
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

    const dom = {};
    const view = { size: 0, dpr: 1, cx: 0, cy: 0, R: 0 };
    const input = { pointer: null, hover: null, keyboard: null, lastDevice: "pointer" };
    const popups = [];
    const audio = { ctx: null, muted: state.settings.muted };

    let boardBuffer = null;
    let flight = null;
    let botPlan = null;
    let lastFrame = 0;
    let rafId = 0;

    function byId(id) {
        return document.getElementById(id);
    }

    function cacheDom() {
        const ids = [
            "screen-lobby", "screen-match", "lobby-mute", "match-mute", "difficulty-field",
            "effects-toggle", "start-btn", "records-line", "reset-records",
            "quit-btn", "hud-round", "hud-turn", "board", "board-stage", "board-frame",
            "turn-banner", "darts-left", "status-line", "live",
            "pass-overlay", "pass-kicker", "pass-title", "pass-sub", "pass-continue",
            "round-overlay", "round-kicker", "round-title", "round-sub", "drink-row",
            "round-continue", "end-overlay", "end-kicker", "end-title", "end-sub",
            "end-rematch", "end-lobby", "quit-overlay", "quit-cancel", "quit-confirm",
        ];
        for (const id of ids) {
            const camel = id.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
            dom[camel] = byId(id);
        }

        dom.modeCards = Array.from(document.querySelectorAll("[data-mode]"));
        dom.difficultyButtons = Array.from(document.querySelectorAll("[data-difficulty]"));
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
        dom.ctx = dom.board.getContext("2d");
    }

    function announce(text) {
        if (dom.live) dom.live.textContent = text;
    }

    function focusBoard() {
        if (dom.board && typeof dom.board.focus === "function") {
            dom.board.focus({ preventScroll: true });
        }
    }

    function clearTimers() {
        for (const id of state.timers) clearTimeout(id);
        state.timers = [];
    }

    function later(fn, ms) {
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
    // Audio (WebAudio, no files)
    // ============================================================
    function ensureAudio() {
        if (audio.muted) return null;
        if (!audio.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            audio.ctx = new Ctx();
        }
        if (audio.ctx.state === "suspended") {
            audio.ctx.resume().catch(() => { });
        }
        return audio.ctx;
    }

    function tone(freq, duration, type, gain, slideTo, delay) {
        const ctx = audio.ctx;
        if (!ctx || audio.muted) return;
        const start = ctx.currentTime + (delay || 0);
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = type || "sine";
        osc.frequency.setValueAtTime(Math.max(20, freq), start);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
        }
        amp.gain.setValueAtTime(0.0001, start);
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.08), start + 0.012);
        amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(amp);
        amp.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.03);
    }

    function noiseBurst(duration, gain, filterFreq, delay) {
        const ctx = audio.ctx;
        if (!ctx || audio.muted) return;
        const start = ctx.currentTime + (delay || 0);
        const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i += 1) {
            data[i] = Math.random() * 2 - 1;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = filterFreq || 900;
        filter.Q.value = 0.8;
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(gain || 0.05, start);
        amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(filter);
        filter.connect(amp);
        amp.connect(ctx.destination);
        source.start(start);
    }

    function sfx(name) {
        if (!audio.ctx || audio.muted) return;
        switch (name) {
            case "click":
                tone(340, 0.05, "square", 0.025);
                break;
            case "whoosh":
                noiseBurst(0.14, 0.05, 1200);
                break;
            case "thunk":
                tone(150, 0.13, "triangle", 0.1, 58);
                noiseBurst(0.05, 0.035, 500);
                break;
            case "tick":
                tone(620, 0.06, "sine", 0.05);
                break;
            case "bull":
                tone(660, 0.1, "sine", 0.07);
                tone(990, 0.18, "sine", 0.06, null, 0.09);
                break;
            case "glug":
                tone(300, 0.09, "triangle", 0.06, 190);
                tone(260, 0.09, "triangle", 0.05, 160, 0.1);
                tone(220, 0.12, "triangle", 0.045, 130, 0.2);
                break;
            case "sting":
                tone(220, 0.32, "sawtooth", 0.045, 90);
                break;
            case "blackout":
                tone(78, 1.2, "sine", 0.11, 38);
                tone(117, 0.9, "triangle", 0.04, 55, 0.05);
                tone(82, 1.15, "sine", 0.05, 44, 0.18);
                noiseBurst(0.8, 0.025, 240);
                break;
            case "win":
                tone(523, 0.13, "sine", 0.06);
                tone(659, 0.13, "sine", 0.06, null, 0.12);
                tone(784, 0.22, "sine", 0.07, null, 0.24);
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

    function annularSector(ctx, cx, cy, inner, outer, start, end) {
        ctx.beginPath();
        ctx.arc(cx, cy, outer, start, end);
        ctx.arc(cx, cy, inner, end, start, true);
        ctx.closePath();
    }

    function drawBoard(ctx, size, cx, cy, R) {
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
            ctx.fillText(String(SECTORS[i]), cx + nx, cy + ny);
        }
        ctx.shadowBlur = 0;
    }

    function scoreAt(nx, ny) {
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
        const sector = SECTORS[index];
        let mult = 1;
        let ring = "single";
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

    function resizeCanvas() {
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

        boardBuffer = document.createElement("canvas");
        boardBuffer.width = Math.round(size * dpr);
        boardBuffer.height = Math.round(size * dpr);
        const bctx = boardBuffer.getContext("2d");
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawBoard(bctx, size, view.cx, view.cy, view.R);
    }

    function targetPoint(sector, ring) {
        const index = Math.max(0, SECTORS.indexOf(sector));
        const angle = rad(-90 + index * 18);
        let radius = 0.78;
        if (ring === "triple") radius = (RINGS.tripleIn + RINGS.tripleOut) / 2;
        if (ring === "double") radius = (RINGS.doubleIn + RINGS.doubleOut) / 2;
        if (ring === "outerBull") radius = (RINGS.bull + RINGS.outerBull) / 2;
        if (ring === "bull") radius = 0;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    }

    function pickBotTarget() {
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

    function eventPoint(event) {
        const layout = dom.board.clientWidth || view.size;
        const scale = view.size / layout;
        const px = event.offsetX * scale;
        const py = event.offsetY * scale;
        return { x: (px - view.cx) / view.R, y: (py - view.cy) / view.R };
    }

    function landingPoint(aim, drinks, baseSigma) {
        const sigma = adjustSigma(baseSigma || DRUNK[0].sigma, drinks);
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
    function addPopup(nx, ny, text, color) {
        popups.push({
            x: nx,
            y: ny,
            text,
            color: color || "#f6e9d4",
            age: 0,
            life: 950,
        });
    }

    function drawDart(ctx, nx, ny, color, slide, isP2) {
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

    function drawPopups(ctx, dt) {
        for (let i = popups.length - 1; i >= 0; i -= 1) {
            const popup = popups[i];
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

    function aimPoint() {
        if (input.keyboard) return input.keyboard;
        if (input.hover) return input.hover;
        if (input.pointer) return input.pointer;
        return { x: 0, y: 0 };
    }

    function drawReticle(ctx, aim, drinks, time, color) {
        const sway = DRUNK[drinks].sway;
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

        if (drinks > 0) {
            const ghost = drinks * view.size * 0.004;
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

    function drawFlight(ctx, now) {
        const progress = clamp((now - flight.start) / FLIGHT_MS, 0, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const x = flight.from.x + (flight.to.x - flight.from.x) * ease;
        const y = flight.from.y + (flight.to.y - flight.from.y) * ease;
        const lift = Math.sin(progress * Math.PI) * view.R * 0.05;
        drawDart(ctx, x, y, flight.color, -lift, flight.isP2);
    }

    function renderFrame(now) {
        const frameNow = state.paused ? state.pausedAt : now;
        const dt = state.paused ? 0 : (lastFrame ? Math.min(64, now - lastFrame) : 16);
        lastFrame = now;

        if (state.screen !== "match") {
            rafId = requestAnimationFrame(renderFrame);
            return;
        }

        if (dom.ctx && dom.board) {
            if (!boardBuffer || view.size === 0) resizeCanvas();
            if (view.size) {
                dom.ctx.clearRect(0, 0, view.size, view.size);
                if (boardBuffer) dom.ctx.drawImage(boardBuffer, 0, 0, view.size, view.size);

                const match = state.match;
                if (match) {
                    for (const player of match.players) {
                        for (const dart of player.darts) {
                            drawDart(dom.ctx, dart.x, dart.y, player.color, 0, player.index === 1);
                        }
                    }

                    if (flight) {
                        if (frameNow - flight.start >= FLIGHT_MS) {
                            if (!state.paused) {
                                const finished = flight;
                                flight = null;
                                resolveThrow(finished);
                            } else {
                                drawFlight(dom.ctx, frameNow);
                            }
                        } else {
                            drawFlight(dom.ctx, frameNow);
                        }
                    }

                    if (match.phase === "aim") {
                        const active = match.players[match.active];
                        if (active.isBot && botPlan) {
                            drawReticle(dom.ctx, botPlan.aim, active.drinks, frameNow, COLORS.p2);
                            drawReticle(dom.ctx, botPlan.aim, active.drinks, frameNow + 170, COLORS.p2);
                        } else if (!active.isBot) {
                            drawReticle(dom.ctx, aimPoint(), active.drinks, frameNow, active.color);
                        }
                    }

                    drawPopups(dom.ctx, dt);
                }
            }
        }

        rafId = requestAnimationFrame(renderFrame);
    }

    // ============================================================
    // Match engine
    // ============================================================
    function showScreen(name) {
        state.screen = name;
        dom.screenLobby.classList.toggle("active", name === "lobby");
        dom.screenMatch.classList.toggle("active", name === "match");
        if (name === "match") {
            requestAnimationFrame(() => {
                resizeCanvas();
            });
        }
    }

    function hideOverlays() {
        for (const overlay of [dom.passOverlay, dom.roundOverlay, dom.endOverlay, dom.quitOverlay]) {
            overlay.classList.add("hidden");
        }
    }

    function updateMuteButtons() {
        const muted = state.settings.muted;
        for (const button of [dom.lobbyMute, dom.matchMute]) {
            button.setAttribute("aria-pressed", String(muted));
            const label = button.querySelector(".chip-label");
            if (label) label.textContent = muted ? "Sound off" : "Sound on";
        }
    }

    function startMatch() {
        ensureAudio();
        clearTimers();
        hideOverlays();
        state.paused = false;
        state.pendingResume = false;
        sfx("click");
        const difficulty = state.difficulty;
        state.match = {
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
        };

        flight = null;
        botPlan = null;
        popups.length = 0;
        input.pointer = null;
        input.hover = null;
        input.keyboard = null;

        for (let i = 0; i < 2; i += 1) {
            dom.names[i].textContent = state.match.players[i].name;
        }
        updateMuteButtons();
        updateScoreboard();
        updateDrunkVisuals();
        showScreen("match");
        requestAnimationFrame(() => {
            resizeCanvas();
            startRound();
        });
    }

    function startRound() {
        const match = state.match;
        if (!match) return;
        clearTimers();
        match.turnsTaken = 0;
        match.active = match.starter;
        match.dartsLeft = DARTS_PER_TURN;
        match.phase = "turnStart";
        match.blacked = [];
        flight = null;
        botPlan = null;
        popups.length = 0;
        input.keyboard = null;

        for (const player of match.players) {
            player.roundScore = 0;
            player.darts = [];
        }

        updateScoreboard();
        updateDrunkVisuals();
        beginTurn();
    }

    function beginTurn() {
        const match = state.match;
        if (!match) return;
        const player = match.players[match.active];
        match.phase = "turnStart";
        match.dartsLeft = DARTS_PER_TURN;
        botPlan = null;
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

    function showPassOverlay(player) {
        const match = state.match;
        match.phase = "pass";
        dom.passKicker.textContent = "Round " + match.round;
        dom.passTitle.textContent = player.name + ", take the board.";
        dom.passSub.textContent = player.drinks > 0
            ? "You have " + player.drinks + " drink" + (player.drinks === 1 ? "" : "s") +
              " in you. The board is blurry. Throw three darts."
            : "The board is clear. Throw three darts.";
        dom.passOverlay.classList.remove("hidden");
        updateHud();
        dom.passContinue.focus();
    }

    function beginThrow(aim, player) {
        const match = state.match;
        if (!match || flight) return;
        const baseSigma = player.isBot ? DIFFICULTY[match.difficulty].baseSigma : DRUNK[0].sigma;
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

    function throwHuman(aim) {
        const match = state.match;
        if (!match || match.phase !== "aim" || flight) return;
        const player = match.players[match.active];
        if (player.isBot) return;
        ensureAudio();
        beginThrow(aim, player);
    }

    function scheduleBotThrow() {
        const match = state.match;
        if (!match || !botPlan) return;
        later(() => {
            if (!state.match || state.match !== match || match.phase !== "aim") return;
            const player = match.players[match.active];
            if (!player.isBot || !botPlan) return;
            beginThrow(botPlan.aim, player);
        }, 760);
    }

    function resolveThrow(finished) {
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

    function endTurn() {
        const match = state.match;
        if (!match) return;
        match.turnsTaken += 1;

        if (match.turnsTaken === 1) {
            match.active = 1 - match.starter;
            beginTurn();
            return;
        }

        match.phase = "roundEnd";
        computeRound();
    }

    function computeRound() {
        const match = state.match;
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
            match.winner = blacked[0].index === 0 ? 1 : 0;
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

    function showRoundOverlay(losers) {
        const match = state.match;
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
            const winner = losers[0].index === 0 ? p2 : p1;
            dom.roundTitle.textContent = winner.name + " takes it.";
            dom.roundSub.textContent = losers[0].name + " drinks.";
        }

        dom.drinkRow.innerHTML = "";
        for (const player of losers) {
            const tag = document.createElement("span");
            tag.className = "drink-tag";
            tag.textContent = player.name + " +1 " + DRUNK[player.drinks].label;
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

    function makeKeyHint() {
        const hint = document.createElement("span");
        hint.className = "key-hint";
        hint.textContent = "Enter";
        return hint;
    }

    function updateEffects() {
        document.getElementById("app").classList.toggle(
            "reduced",
            state.settings.reducedEffects || reducedMotionQuery.matches
        );
        dom.effectsToggle.setAttribute("aria-pressed", String(state.settings.reducedEffects));
    }

    function updateDrunkVisuals() {
        const match = state.match;
        let level = 0;
        let botTurn = false;

        if (match) {
            if (match.phase === "drink" && match.lastLosers) {
                for (const index of match.lastLosers) {
                    const player = match.players[index];
                    if (!player.isBot) level = Math.max(level, Math.min(4, player.drinks));
                }
            } else {
                const active = match.players[match.active];
                if (active) {
                    botTurn = active.isBot;
                    if (!active.isBot) level = Math.min(4, active.drinks);
                }
            }
        }

        dom.boardStage.classList.remove("drunk-0", "drunk-1", "drunk-2", "drunk-3", "drunk-4");
        dom.boardStage.classList.add("drunk-" + level);
        dom.boardStage.classList.toggle("bot-turn", botTurn);
    }

    function updateSips(index, player) {
        const meter = dom.sips[index];
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

    function updateScoreboard() {
        const match = state.match;
        if (!match) return;
        const turnPhases = ["turnStart", "pass", "aim", "flight"];

        for (let i = 0; i < 2; i += 1) {
            const player = match.players[i];
            dom.names[i].textContent = player.name;
            dom.totals[i].textContent = String(player.total);
            dom.roundScores[i].textContent = String(player.roundScore);
            dom.panels[i].classList.toggle(
                "active",
                match.active === i && turnPhases.indexOf(match.phase) !== -1
            );
            dom.panels[i].classList.toggle(
                "dim",
                match.active !== i && turnPhases.indexOf(match.phase) !== -1
            );
            dom.turnChips[i].hidden = !(match.active === i && turnPhases.indexOf(match.phase) !== -1);
            updateSips(i, player);
        }
    }

    function updateHud() {
        const match = state.match;
        if (!match) return;
        const player = match.players[match.active];

        dom.hudRound.textContent = "Round " + match.round;

        let turnText = "";
        let status = "";
        switch (match.phase) {
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
                    : "Tap the board to throw. " + match.dartsLeft + " dart" + (match.dartsLeft === 1 ? "" : "s") + " left.";
                break;
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

    function recordMatch() {
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

    function showEnd() {
        const match = state.match;
        if (!match) return;
        clearTimers();
        recordMatch();
        match.phase = "end";
        flight = null;
        botPlan = null;
        dom.roundOverlay.classList.add("hidden");

        const p1 = match.players[0];
        const p2 = match.players[1];

        if (match.winner === -1) {
            dom.endKicker.textContent = "Double blackout";
            dom.endTitle.textContent = "Draw.";
            dom.endSub.textContent = "Both players blacked out on the same round with the same total.";
            sfx("sting");
        } else {
            const winner = match.players[match.winner];
            const loser = match.players[1 - match.winner];
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

    function renderRecords() {
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

    function goLobby() {
        clearTimers();
        flight = null;
        botPlan = null;
        popups.length = 0;
        state.match = null;
        state.paused = false;
        state.pendingResume = false;
        hideOverlays();
        showScreen("lobby");
        dom.startBtn.focus({ preventScroll: true });
        renderRecords();
        updateEffects();
        updateMuteButtons();
        sfx("click");
    }

    function resumeTurn() {
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
    }

    function resumeFromOverlay() {
        if (!state.match) return;
        if (flight) flight.start += performance.now() - state.pausedAt;
        state.paused = false;
        state.pendingResume = false;
        resumeTurn();
        if (state.match.phase === "aim" && !state.match.players[state.match.active].isBot) {
            focusBoard();
        }
    }

    // ============================================================
    // UI, input & boot
    // ============================================================
    function selectMode(mode) {
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

    function selectDifficulty(difficulty) {
        if (!DIFFICULTY[difficulty]) return;
        state.difficulty = difficulty;
        for (const button of dom.difficultyButtons) {
            const selected = button.dataset.difficulty === difficulty;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-checked", String(selected));
        }
        renderRecords();
        sfx("click");
    }

    function toggleMute() {
        state.settings.muted = !state.settings.muted;
        audio.muted = state.settings.muted;
        saveSettings();
        updateMuteButtons();
        if (!state.settings.muted) {
            ensureAudio();
            sfx("click");
        }
    }

    function toggleEffects() {
        state.settings.reducedEffects = !state.settings.reducedEffects;
        saveSettings();
        updateEffects();
        sfx("click");
    }

    function resetRecords() {
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

    function bindEvents() {
        for (const card of dom.modeCards) {
            card.addEventListener("click", () => selectMode(card.dataset.mode));
        }
        for (const button of dom.difficultyButtons) {
            button.addEventListener("click", () => selectDifficulty(button.dataset.difficulty));
        }

        dom.startBtn.addEventListener("click", startMatch);
        dom.effectsToggle.addEventListener("click", toggleEffects);
        dom.resetRecords.addEventListener("click", resetRecords);
        dom.lobbyMute.addEventListener("click", toggleMute);
        dom.matchMute.addEventListener("click", toggleMute);

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
            match.starter = 1 - match.starter;
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

    function openQuit() {
        if (!state.match) return;
        state.paused = true;
        state.pausedAt = performance.now();
        dom.quitOverlay.classList.remove("hidden");
        dom.quitCancel.focus();
        sfx("click");
    }

    function cancelQuit() {
        dom.quitOverlay.classList.add("hidden");
        resumeFromOverlay();
        focusBoard();
        sfx("click");
    }

    function bindBoardInput() {
        dom.board.addEventListener("pointermove", (event) => {
            if (event.pointerType !== "mouse" || state.screen !== "match") return;
            input.hover = eventPoint(event);
            input.lastDevice = "pointer";
        });

        dom.board.addEventListener("pointerleave", () => {
            input.hover = null;
        });

        dom.board.addEventListener("pointerdown", (event) => {
            if (state.screen !== "match" || state.paused) return;
            const match = state.match;
            if (!match || match.phase !== "aim") return;
            const player = match.players[match.active];
            if (player.isBot) return;
            event.preventDefault();
            ensureAudio();
            const point = eventPoint(event);
            input.pointer = point;
            input.hover = point;
            input.keyboard = null;
            throwHuman(point);
        });

        dom.board.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    function overlayVisible(element) {
        return element && !element.classList.contains("hidden");
    }

    function bindKeyboard() {
        document.addEventListener("keydown", (event) => {
            const key = event.key;
            const nativeActivation = (key === "Enter" || key === " ") &&
                event.target && event.target.closest &&
                event.target.closest("button, a");

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
            if (match.phase !== "aim") return;

            const player = match.players[match.active];
            if (player.isBot) return;

            const current = input.keyboard || input.hover || { x: 0, y: 0 };
            const step = 0.028;
            let x = current.x;
            let y = current.y;
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
                    input.keyboard = { x: clamp(x, -1.1, 1.1), y: clamp(y, -1.1, 1.1) };
                    throwHuman(input.keyboard);
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

    function bindViewport() {
        window.addEventListener("resize", () => {
            if (state.screen === "match") resizeCanvas();
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                const phases = ["turnStart", "aim", "flight", "turnEnd"];
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

    function init() {
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
})();

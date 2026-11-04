/* Tetris Protocol - standalone neon drop puzzle */
(() => {
    "use strict";

    // ============================================================
    // Config
    // ============================================================
    const COLS = 10;
    const ROWS = 20;
    const HIDDEN = 2;
    const TOTAL_ROWS = ROWS + HIDDEN;
    const CELL = 48;
    const BOARD_W = COLS * CELL;
    const BOARD_H = ROWS * CELL;
    const SETTINGS_KEY = "tp-settings-v1";
    const BEST_KEY = "tp-best-v1";
    const DEFAULT_BINDS = {
        left: "KeyA",
        right: "KeyD",
        soft: "KeyS",
        cw: "KeyW",
        ccw: "KeyQ",
        hold: "KeyC",
        drop: "Space",
    };
    const BIND_ACTIONS = [
        { key: "left", label: "Move left" },
        { key: "right", label: "Move right" },
        { key: "soft", label: "Soft drop" },
        { key: "cw", label: "Rotate CW" },
        { key: "ccw", label: "Rotate CCW" },
        { key: "hold", label: "Hold" },
        { key: "drop", label: "Hard drop" },
    ];
    const RESERVED_CODES = new Set([
        "Escape", "Enter", "Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "Comma", "Period", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
        "AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "CapsLock",
    ]);
    const DAS = 150;
    const ARR = 40;
    const SOFT_INTERVAL = 45;
    const LOCK_DELAY = 500;
    const MAX_LOCK_RESETS = 15;
    const IDLE_RENDER_INTERVAL = 1000 / 30;
    const HEAT_LINES = [10, 25, 40, 55];
    const HEAT_NAMES = ["Stable", "Warm", "Hot", "Critical", "Overload"];
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const PRESSURE = {
        chill: { label: "Chill", firewall: 14000, gravity: 900, scale: 0.82, corruptionFrom: 99 },
        standard: { label: "Standard", firewall: 10000, gravity: 800, scale: 0.78, corruptionFrom: 3 },
        critical: { label: "Critical", firewall: 7000, gravity: 700, scale: 0.72, corruptionFrom: 2 },
    };

    const COLORS = {
        I: "#2ee6ff",
        J: "#5b8cff",
        L: "#ffb347",
        O: "#ffe14d",
        S: "#45f0b0",
        T: "#bf00ff",
        Z: "#ff45cf",
        garbage: "#6b3a7e",
    };

    const SHAPES = {
        I: [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
        J: [
            [1, 0, 0],
            [1, 1, 1],
            [0, 0, 0],
        ],
        L: [
            [0, 0, 1],
            [1, 1, 1],
            [0, 0, 0],
        ],
        O: [
            [1, 1],
            [1, 1],
        ],
        S: [
            [0, 1, 1],
            [1, 1, 0],
            [0, 0, 0],
        ],
        T: [
            [0, 1, 0],
            [1, 1, 1],
            [0, 0, 0],
        ],
        Z: [
            [1, 1, 0],
            [0, 1, 1],
            [0, 0, 0],
        ],
    };

    const PIECE_TYPES = Object.keys(SHAPES);

    // ============================================================
    // Helpers
    // ============================================================
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function randInt(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    function pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function rotateCW(matrix) {
        const size = matrix.length;
        const next = [];
        for (let y = 0; y < size; y += 1) {
            next.push([]);
            for (let x = 0; x < size; x += 1) {
                next[y].push(matrix[size - 1 - x][y]);
            }
        }
        return next;
    }

    function emptyGrid() {
        const grid = [];
        for (let y = 0; y < TOTAL_ROWS; y += 1) {
            grid.push(new Array(COLS).fill(null));
        }
        return grid;
    }

    function prefersReduced() {
        return state.settings.reducedEffects || reducedMotionQuery.matches;
    }

    function formatNumber(value) {
        return Math.floor(value).toLocaleString("en-US");
    }

    // ============================================================
    // Persistence
    // ============================================================
    function loadSettings() {
        const binds = Object.assign({}, DEFAULT_BINDS);
        const defaults = { muted: false, reducedEffects: false, binds };
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return defaults;
            const data = JSON.parse(raw);
            const savedBinds = data && typeof data.binds === "object" && data.binds ? data.binds : null;
            if (savedBinds) {
                for (const action of Object.keys(DEFAULT_BINDS)) {
                    const code = savedBinds[action];
                    if (typeof code === "string" && code && !RESERVED_CODES.has(code)) {
                        binds[action] = code;
                    }
                }
            }
            return {
                muted: Boolean(data && data.muted),
                reducedEffects: Boolean(data && data.reducedEffects),
                binds,
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
        const best = {
            solo: { bestScore: 0, bestLines: 0, maxHeat: 0 },
            duo: { p1Wins: 0, p2Wins: 0 },
        };
        try {
            const raw = localStorage.getItem(BEST_KEY);
            if (!raw) return best;
            const data = JSON.parse(raw);
            if (data && data.solo) {
                best.solo.bestScore = Number.isFinite(data.solo.bestScore) ? Math.max(0, Math.floor(data.solo.bestScore)) : 0;
                best.solo.bestLines = Number.isFinite(data.solo.bestLines) ? Math.max(0, Math.floor(data.solo.bestLines)) : 0;
                best.solo.maxHeat = Number.isFinite(data.solo.maxHeat) ? clamp(Math.floor(data.solo.maxHeat), 0, 4) : 0;
            }
            if (data && data.duo) {
                best.duo.p1Wins = Number.isFinite(data.duo.p1Wins) ? Math.max(0, Math.floor(data.duo.p1Wins)) : 0;
                best.duo.p2Wins = Number.isFinite(data.duo.p2Wins) ? Math.max(0, Math.floor(data.duo.p2Wins)) : 0;
            }
        } catch (err) { /* storage unavailable */ }
        return best;
    }

    function saveBest() {
        try {
            localStorage.setItem(BEST_KEY, JSON.stringify(state.best));
        } catch (err) { /* storage unavailable */ }
    }

    // ============================================================
    // Audio (WebAudio, no files)
    // ============================================================
    const audio = { ctx: null, muted: false };

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

    function resumeAudio() {
        if (audio.ctx && audio.ctx.state === "suspended") {
            audio.ctx.resume().catch(() => { });
        }
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
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.06), start + 0.012);
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
        amp.gain.setValueAtTime(gain || 0.04, start);
        amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(filter);
        filter.connect(amp);
        amp.connect(ctx.destination);
        source.start(start);
    }

    function sfx(name) {
        if (!audio.ctx || audio.muted) return;
        switch (name) {
            case "move":
                tone(240, 0.03, "square", 0.018);
                break;
            case "rotate":
                tone(420, 0.05, "triangle", 0.035, 520);
                break;
            case "lock":
                tone(150, 0.09, "triangle", 0.07, 80);
                noiseBurst(0.04, 0.025, 600);
                break;
            case "drop":
                tone(110, 0.14, "sawtooth", 0.055, 50);
                noiseBurst(0.08, 0.03, 400);
                break;
            case "clear":
                tone(520, 0.1, "sine", 0.055);
                tone(780, 0.16, "sine", 0.05, null, 0.08);
                break;
            case "tetris":
                tone(440, 0.12, "sine", 0.06);
                tone(660, 0.12, "sine", 0.06, null, 0.1);
                tone(880, 0.24, "sine", 0.07, null, 0.2);
                break;
            case "garbage":
                noiseBurst(0.2, 0.05, 260);
                tone(90, 0.3, "sawtooth", 0.05, 55);
                break;
            case "heat":
                tone(180, 0.35, "sawtooth", 0.045, 420);
                break;
            case "over":
                tone(180, 1.1, "sawtooth", 0.08, 44);
                noiseBurst(0.7, 0.03, 220);
                break;
            case "win":
                tone(523, 0.12, "sine", 0.06);
                tone(659, 0.12, "sine", 0.06, null, 0.11);
                tone(784, 0.24, "sine", 0.07, null, 0.22);
                break;
            case "click":
            default:
                tone(340, 0.05, "square", 0.022);
                break;
        }
    }

    // ============================================================
    // State & DOM
    // ============================================================
    const state = {
        screen: "lobby",
        mode: "solo",
        pressure: "standard",
        settings: loadSettings(),
        best: loadBest(),
        game: null,
        paused: false,
        lastFrame: 0,
        raf: 0,
        renderAcc: 0,
        capturingAction: null,
    };
    audio.muted = state.settings.muted;

    const dom = {};
    const boardCtx = [null, null];
    const fwCtx = [null, null];
    const holdCtx = [null, null];
    const nextCtx = [null, null];

    function el(id) {
        return document.getElementById(id);
    }

    function cacheDom() {
        dom.screenLobby = el("screen-lobby");
        dom.screenMatch = el("screen-match");
        dom.lobbyMute = el("lobby-mute");
        dom.matchMute = el("match-mute");
        dom.matchPause = el("match-pause");
        dom.effectsToggle = el("effects-toggle");
        dom.bindGrid = el("bind-grid");
        dom.bindWarning = el("bind-warning");
        dom.startBtn = el("start-btn");
        dom.recordsLine = el("records-line");
        dom.resetRecords = el("reset-records");
        dom.quitBtn = el("quit-btn");
        dom.hudMode = el("hud-mode");
        dom.hudSub = el("hud-sub");
        dom.boardsArea = el("boards-area");
        dom.live = el("live");
        dom.pauseOverlay = el("pause-overlay");
        dom.pauseResume = el("pause-resume");
        dom.pauseEffects = el("pause-effects");
        dom.pauseQuit = el("pause-quit");
        dom.gameoverOverlay = el("gameover-overlay");
        dom.gameoverKicker = el("gameover-kicker");
        dom.gameoverTitle = el("gameover-title");
        dom.goScore = el("go-score");
        dom.goScoreLabel = el("go-score-label");
        dom.goLines = el("go-lines");
        dom.goHeat = el("go-heat");
        dom.goBest = el("go-best");
        dom.goNote = el("go-note");
        dom.goRetry = el("go-retry");
        dom.goLobby = el("go-lobby");
        dom.quitOverlay = el("quit-overlay");
        dom.quitCancel = el("quit-cancel");
        dom.quitConfirm = el("quit-confirm");

        dom.modeCards = Array.from(document.querySelectorAll("[data-mode]"));
        dom.pressureButtons = Array.from(document.querySelectorAll("[data-pressure]"));
        dom.stages = [el("stage-0"), el("stage-1")];
        dom.boards = [el("board-0"), el("board-1")];
        dom.playfields = [el("playfield-0"), el("playfield-1")];
        dom.firewalls = [el("firewall-0"), el("firewall-1")];
        dom.firewallPanels = [el("firewall-panel-0"), null];
        dom.firewallPcts = [el("firewall-pct-0"), null];
        dom.holds = [el("hold-0"), el("hold-1")];
        dom.nexts = [el("next-0"), el("next-1")];
        dom.lines = [el("lines-0"), el("lines-1")];
        dom.heatLabels = [el("heat-0"), el("heat-1")];
        dom.heatPips = [el("heat-pips-0"), el("heat-pips-1")];
        dom.scores = [el("score-0"), el("score-1")];
        dom.playerNames = [el("player-name-0"), el("player-name-1")];
        dom.flashes = [el("flash-0"), el("flash-1")];
        dom.pads = [el("pad-0"), el("pad-1")];

        for (let i = 0; i < 2; i += 1) {
            boardCtx[i] = dom.boards[i].getContext("2d");
            sizeCanvas(dom.boards[i], boardCtx[i], BOARD_W, BOARD_H);
            const fw = dom.firewalls[i];
            if (fw) {
                fwCtx[i] = fw.getContext("2d");
                sizeCanvas(fw, fwCtx[i], FW_W, BOARD_H);
            }
            holdCtx[i] = dom.holds[i].getContext("2d");
            sizeCanvas(dom.holds[i], holdCtx[i], PREVIEW_W, PREVIEW_HOLD_H);
            nextCtx[i] = dom.nexts[i].getContext("2d");
            sizeCanvas(dom.nexts[i], nextCtx[i], PREVIEW_W, PREVIEW_NEXT_H);
        }
    }

    // ============================================================
    // Screens, HUD & announcements
    // ============================================================
    function showScreen(name) {
        state.screen = name;
        dom.screenLobby.classList.toggle("active", name === "lobby");
        dom.screenMatch.classList.toggle("active", name === "match");
        updatePauseButton();
    }

    function updatePauseButton() {
        if (!dom.matchPause) return;
        const show = state.screen === "match" && state.game && !state.game.over && !state.paused;
        dom.matchPause.classList.toggle("hidden", !show);
    }

    function hideOverlays() {
        dom.pauseOverlay.classList.add("hidden");
        dom.gameoverOverlay.classList.add("hidden");
        dom.quitOverlay.classList.add("hidden");
    }

    function announce(message) {
        if (!dom.live) return;
        dom.live.textContent = "";
        window.setTimeout(() => {
            dom.live.textContent = message;
        }, 30);
    }

    function updateMuteButtons() {
        const muted = state.settings.muted;
        for (const button of [dom.lobbyMute, dom.matchMute]) {
            if (!button) continue;
            button.setAttribute("aria-pressed", String(muted));
            const label = button.querySelector(".chip-label");
            if (label) label.textContent = muted ? "Sound off" : "Sound on";
        }
    }

    function updateEffectsUI() {
        const reduced = state.settings.reducedEffects;
        if (dom.effectsToggle) dom.effectsToggle.setAttribute("aria-pressed", String(reduced));
        if (dom.pauseEffects) {
            dom.pauseEffects.setAttribute("aria-pressed", String(reduced));
            dom.pauseEffects.textContent = reduced ? "Effects reduced" : "Reduce effects";
        }
        document.body.classList.toggle("reduced", prefersReduced());
    }

    function keyLabel(code) {
        if (!code) return "\u2014";
        if (code.startsWith("Key")) return code.slice(3);
        if (code.startsWith("Digit")) return code.slice(5);
        if (code.startsWith("Numpad")) return "Num " + code.slice(6);
        if (code === "Space") return "Space";
        if (code === "ShiftLeft") return "L Shift";
        if (code === "ShiftRight") return "R Shift";
        if (code === "ControlLeft") return "L Ctrl";
        if (code === "ControlRight") return "R Ctrl";
        if (code === "AltLeft") return "L Alt";
        if (code === "AltRight") return "R Alt";
        if (code === "ArrowLeft") return "\u2190";
        if (code === "ArrowRight") return "\u2192";
        if (code === "ArrowUp") return "\u2191";
        if (code === "ArrowDown") return "\u2193";
        return code;
    }

    function setBindWarning(message) {
        if (!dom.bindWarning) return;
        dom.bindWarning.textContent = message || "";
    }

    function renderBinds() {
        if (!dom.bindGrid) return;
        dom.bindGrid.textContent = "";
        const binds = state.settings.binds || DEFAULT_BINDS;
        for (const action of BIND_ACTIONS) {
            const row = document.createElement("div");
            row.className = "bind-row";
            const label = document.createElement("span");
            label.className = "bind-label";
            label.textContent = action.label;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "bind-key";
            button.dataset.action = action.key;
            const capturing = state.capturingAction === action.key;
            button.classList.toggle("capturing", capturing);
            button.textContent = capturing ? "Press a key\u2026" : keyLabel(binds[action.key]);
            button.setAttribute(
                "aria-label",
                action.label + " key: " + (capturing ? "waiting for input" : keyLabel(binds[action.key]))
            );
            button.addEventListener("click", () => beginCapture(action.key));
            row.appendChild(label);
            row.appendChild(button);
            dom.bindGrid.appendChild(row);
        }
    }

    function beginCapture(action) {
        ensureAudio();
        state.capturingAction = action;
        setBindWarning("");
        renderBinds();
        const button = dom.bindGrid && dom.bindGrid.querySelector('[data-action="' + action + '"]');
        if (button) button.focus();
        announce("Press a key for " + action + ". Escape cancels.");
    }

    function cancelCapture() {
        state.capturingAction = null;
        setBindWarning("");
        renderBinds();
    }

    function renderRecords() {
        if (!dom.recordsLine) return;
        const solo = state.best.solo;
        const duo = state.best.duo;
        const soloText = solo.bestScore > 0
            ? "Solo best <b>" + formatNumber(solo.bestScore) + "</b> &middot; " +
            solo.bestLines + " lines &middot; heat " + solo.maxHeat
            : "Solo: no run recorded";
        const duoText = (duo.p1Wins + duo.p2Wins) > 0
            ? "VS: P1 <b>" + duo.p1Wins + "</b> &ndash; <b>" + duo.p2Wins + "</b> P2"
            : "VS: no matches recorded";
        dom.recordsLine.innerHTML = soloText + "<br />" + duoText;
    }

    // ============================================================
    // Board & piece lifecycle
    // ============================================================
    function makeBag() {
        const bag = PIECE_TYPES.slice();
        for (let i = bag.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = bag[i];
            bag[i] = bag[j];
            bag[j] = tmp;
        }
        return bag;
    }

    function nextType(board) {
        if (!board.bag.length) board.bag = makeBag();
        return board.bag.pop();
    }

    function makePiece(type) {
        const matrix = SHAPES[type].map((row) => row.slice());
        return {
            type,
            matrix,
            x: Math.floor((COLS - matrix[0].length) / 2),
            y: HIDDEN - 1,
            rot: 0,
        };
    }

    function createBoard(index) {
        const board = {
            index,
            grid: emptyGrid(),
            bag: [],
            queue: [],
            current: null,
            hold: null,
            canHold: true,
            score: 0,
            lines: 0,
            combo: 0,
            heat: 0,
            permanentHeat: 0,
            sinceClear: 0,
            dropAcc: 0,
            lockTimer: 0,
            lockResets: 0,
            softDrop: false,
            moveDir: 0,
            lastDir: 0,
            dasTimer: 0,
            arrTimer: 0,
            incoming: 0,
            incomingTimer: 0,
            maxHeat: 0,
            firewall: 0,
            firewallTimer: 0,
            corruptionTimer: 0,
            trail: [],
            particles: [],
            flashRows: [],
            flashTimer: 0,
            over: false,
            elapsed: 0,
            gridDirty: true,
            gridCanvas: null,
            gridCtx: null,
            gridDpr: 0,
        };
        for (let i = 0; i < 4; i += 1) board.queue.push(nextType(board));
        return board;
    }

    function collides(board, matrix, px, py) {
        for (let y = 0; y < matrix.length; y += 1) {
            for (let x = 0; x < matrix[y].length; x += 1) {
                if (!matrix[y][x]) continue;
                const gx = px + x;
                const gy = py + y;
                if (gx < 0 || gx >= COLS || gy >= TOTAL_ROWS) return true;
                if (gy >= 0 && board.grid[gy][gx]) return true;
            }
        }
        return false;
    }

    function spawnNext(board) {
        const type = board.queue.shift();
        board.queue.push(nextType(board));
        board.current = makePiece(type);
        board.lockTimer = 0;
        board.lockResets = 0;
        board.dropAcc = 0;
        board.trail.length = 0;
        if (collides(board, board.current.matrix, board.current.x, board.current.y)) {
            board.over = true;
            board.current = null;
            endGame({ loser: board.index, reason: "topout" });
        }
    }

    function spawnType(board, type) {
        board.current = makePiece(type);
        board.lockTimer = 0;
        board.lockResets = 0;
        board.dropAcc = 0;
        board.trail.length = 0;
        if (collides(board, board.current.matrix, board.current.x, board.current.y)) {
            board.over = true;
            board.current = null;
            endGame({ loser: board.index, reason: "topout" });
        }
    }

    function resetLock(board) {
        if (board.lockResets < MAX_LOCK_RESETS) {
            board.lockTimer = 0;
            board.lockResets += 1;
        }
    }

    function movePiece(board, dx) {
        if (!board.current || board.over) return false;
        const piece = board.current;
        if (collides(board, piece.matrix, piece.x + dx, piece.y)) return false;
        piece.x += dx;
        resetLock(board);
        return true;
    }

    function rotatePiece(board, direction) {
        if (!board.current || board.over) return;
        const piece = board.current;
        let matrix = piece.matrix;
        const turns = direction > 0 ? 1 : 3;
        for (let i = 0; i < turns; i += 1) matrix = rotateCW(matrix);
        const kicks = [
            [0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1],
        ];
        for (const [ox, oy] of kicks) {
            if (!collides(board, matrix, piece.x + ox, piece.y + oy)) {
                piece.matrix = matrix;
                piece.x += ox;
                piece.y += oy;
                piece.rot = (piece.rot + (direction > 0 ? 1 : 3)) % 4;
                resetLock(board);
                sfx("rotate");
                return;
            }
        }
    }

    function holdPiece(board) {
        if (!board.current || !board.canHold || board.over) return;
        const type = board.current.type;
        if (board.hold === null) {
            board.hold = type;
            sfx("rotate");
            spawnNext(board);
        } else {
            const swap = board.hold;
            board.hold = type;
            sfx("rotate");
            spawnType(board, swap);
        }
        board.canHold = false;
    }

    function ghostY(board) {
        if (!board.current) return 0;
        let y = board.current.y;
        while (!collides(board, board.current.matrix, board.current.x, y + 1)) y += 1;
        return y;
    }

    function stepDown(board) {
        if (!board.current || board.over) return false;
        if (collides(board, board.current.matrix, board.current.x, board.current.y + 1)) return false;
        board.current.y += 1;
        return true;
    }

    // ============================================================
    // Tuning & canvas sizing
    // ============================================================
    const FW_W = 40;
    const FIREWALL_MAX = 20;
    const TIME_HEAT = 45000;
    const INCOMING_DELAY = 1100;
    const PREVIEW_W = 96;
    const PREVIEW_HOLD_H = 96;
    const PREVIEW_NEXT_H = 216;

    function sizeCanvas(canvas, ctx, logicalW, logicalH) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.width = Math.round(logicalW * dpr);
        canvas.height = Math.round(logicalH * dpr);
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function resizeCanvases() {
        for (let i = 0; i < 2; i += 1) {
            if (dom.boards[i]) sizeCanvas(dom.boards[i], boardCtx[i], BOARD_W, BOARD_H);
            if (dom.firewalls[i]) sizeCanvas(dom.firewalls[i], fwCtx[i], FW_W, BOARD_H);
            if (dom.holds[i]) sizeCanvas(dom.holds[i], holdCtx[i], PREVIEW_W, PREVIEW_HOLD_H);
            if (dom.nexts[i]) sizeCanvas(dom.nexts[i], nextCtx[i], PREVIEW_W, PREVIEW_NEXT_H);
        }
    }

    // ============================================================
    // Effects
    // ============================================================
    function addParticle(board, px, py, color) {
        if (prefersReduced()) return;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.08 + Math.random() * 0.22;
        board.particles.push({
            x: px,
            y: py,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.05,
            life: 380 + Math.random() * 320,
            maxLife: 700,
            size: 2 + Math.random() * 4,
            color: color || COLORS.garbage,
        });
        if (board.particles.length > 160) board.particles.shift();
    }

    function updateParticles(board, dt) {
        const list = board.particles;
        for (let i = list.length - 1; i >= 0; i -= 1) {
            const p = list[i];
            p.life -= dt;
            if (p.life <= 0) {
                list.splice(i, 1);
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 0.0004 * dt;
        }
    }

    function addTrail(board) {
        if (prefersReduced() || !board.current) return;
        const piece = board.current;
        board.trail.push({
            matrix: piece.matrix.map((row) => row.slice()),
            x: piece.x,
            y: piece.y,
            type: piece.type,
            life: 150,
        });
        if (board.trail.length > 6) board.trail.shift();
    }

    function updateTrail(board, dt) {
        for (let i = board.trail.length - 1; i >= 0; i -= 1) {
            board.trail[i].life -= dt;
            if (board.trail[i].life <= 0) board.trail.splice(i, 1);
        }
    }

    // ============================================================
    // Heat
    // ============================================================
    function computeHeat(board) {
        let permanent = 0;
        for (let i = 0; i < HEAT_LINES.length; i += 1) {
            if (board.lines >= HEAT_LINES[i]) permanent = i + 1;
        }
        board.permanentHeat = permanent;

        let top = TOTAL_ROWS;
        for (let y = 0; y < TOTAL_ROWS; y += 1) {
            if (board.grid[y].some((cell) => cell)) {
                top = y;
                break;
            }
        }
        const height = TOTAL_ROWS - top;
        let stack = 0;
        if (height >= 19) stack = 4;
        else if (height >= 17) stack = 3;
        else if (height >= 15) stack = 2;
        else if (height >= 12) stack = 1;

        const timeTier = Math.floor(board.sinceClear / TIME_HEAT);
        return Math.max(permanent, stack, timeTier);
    }

    function applyHeatUI(board) {
        const stage = dom.stages[board.index];
        if (stage) stage.setAttribute("data-heat", String(Math.min(board.heat, 4)));
        if (dom.heatLabels[board.index]) {
            dom.heatLabels[board.index].textContent = String(Math.min(board.heat, 5));
        }
    }

    // ============================================================
    // Line clearing & scoring
    // ============================================================
    function clearLines(board) {
        const full = [];
        for (let y = 0; y < TOTAL_ROWS; y += 1) {
            if (board.grid[y].every((cell) => cell)) full.push(y);
        }
        if (!full.length) return 0;

        for (const y of full) {
            for (let x = 0; x < COLS; x += 1) {
                addParticle(
                    board,
                    x * CELL + CELL / 2,
                    (y - HIDDEN) * CELL + CELL / 2,
                    COLORS[board.grid[y][x]] || COLORS.garbage
                );
            }
        }

        const remaining = [];
        for (let y = 0; y < TOTAL_ROWS; y += 1) {
            if (!full.includes(y)) remaining.push(board.grid[y]);
        }
        while (remaining.length < TOTAL_ROWS) {
            remaining.unshift(new Array(COLS).fill(null));
        }
        board.grid = remaining;
        board.gridDirty = true;
        board.flashRows = full.slice();
        board.flashTimer = 160;
        return full.length;
    }

    function showFlash(board) {
        const flash = dom.flashes[board.index];
        if (!flash) return;
        flash.classList.add("on");
        window.setTimeout(() => flash.classList.remove("on"), 90);
    }

    function applyClear(board, cleared) {
        const heat = Math.min(board.heat, 4);
        const base = [0, 100, 300, 500, 800][Math.min(cleared, 4)];
        board.score += base * (heat + 1);
        board.lines += cleared;
        board.combo += 1;
        if (board.combo > 1) {
            board.score += 50 * (board.combo - 1) * (heat + 1);
        }
        board.sinceClear = 0;

        if (state.game.mode === "solo") {
            const push = [0, 1, 2, 3, 5][Math.min(cleared, 4)] + (board.combo > 1 ? 1 : 0);
            board.firewall = Math.max(0, board.firewall - push);
        } else {
            let outgoing = [0, 0, 1, 2, 4][Math.min(cleared, 4)] + (board.combo > 1 ? 1 : 0);
            if (outgoing > 0) {
                const cancel = Math.min(board.incoming, outgoing);
                board.incoming -= cancel;
                outgoing -= cancel;
                if (outgoing > 0) {
                    const opponent = state.game.boards[1 - board.index];
                    opponent.incoming += outgoing;
                    opponent.incomingTimer = 0;
                    announce("Player " + (board.index + 1) + " sent " + outgoing + " corrupted rows.");
                }
            }
        }

        if (cleared >= 4) sfx("tetris");
        else sfx("clear");

        const label = ["", "Single", "Double", "Triple", "Tetris"][Math.min(cleared, 4)];
        announce(label + " compiled. " + board.lines + " lines. Heat " + board.heat + ".");
        showFlash(board);
    }

    // ============================================================
    // Garbage & corruption
    // ============================================================
    function insertGarbage(board, count) {
        const rows = Math.max(0, Math.min(count, TOTAL_ROWS));
        for (let i = 0; i < rows; i += 1) {
            if (board.grid[i].some((cell) => cell)) {
                board.over = true;
                board.current = null;
                endGame({ loser: board.index, reason: "breach" });
                return;
            }
        }
        for (let i = 0; i < rows; i += 1) {
            const holes = randInt(2, 4);
            const holeStart = randInt(0, COLS - holes);
            const row = new Array(COLS).fill("garbage");
            for (let h = 0; h < holes; h += 1) row[holeStart + h] = null;
            board.grid.shift();
            board.grid.push(row);
        }
        if (rows > 0) board.gridDirty = true;
        if (rows > 0 && board.current) {
            if (collides(board, board.current.matrix, board.current.x, board.current.y)) {
                board.over = true;
                board.current = null;
                endGame({ loser: board.index, reason: "breach" });
            }
        }
    }

    function maybeCorrupt(board, dt) {
        const pressure = PRESSURE[state.game.pressure];
        if (state.game.mode !== "solo") return;
        if (board.heat < pressure.corruptionFrom) {
            board.corruptionTimer = 0;
            return;
        }
        board.corruptionTimer += dt;
        const interval = Math.max(3200, 8500 - board.heat * 900);
        if (board.corruptionTimer >= interval) {
            board.corruptionTimer = 0;
            insertGarbage(board, 1);
            if (!board.over) {
                sfx("garbage");
                announce("Corrupted row injected. Heat " + board.heat + ".");
            }
        }
    }

    function updateFirewall(board, dt) {
        if (state.game.mode !== "solo") return;
        const pressure = PRESSURE[state.game.pressure];
        const interval = pressure.firewall / (1 + board.heat * 0.08);
        board.firewallTimer += dt;
        while (board.firewallTimer >= interval) {
            board.firewallTimer -= interval;
            if (board.firewall < FIREWALL_MAX) {
                board.firewall += 1;
                if (board.firewall === 15) {
                    announce("Firewall warning. Fifteen of twenty cells consumed.");
                    sfx("heat");
                }
                if (board.firewall >= FIREWALL_MAX) {
                    endGame({ loser: board.index, reason: "firewall" });
                    return;
                }
            }
        }
    }

    // ============================================================
    // Piece locking & movement
    // ============================================================
    function lockPiece(board) {
        if (!board.current || board.over) return;
        const piece = board.current;
        for (let y = 0; y < piece.matrix.length; y += 1) {
            for (let x = 0; x < piece.matrix[y].length; x += 1) {
                if (!piece.matrix[y][x]) continue;
                const gx = piece.x + x;
                const gy = piece.y + y;
                if (gy >= 0 && gy < TOTAL_ROWS && gx >= 0 && gx < COLS) {
                    board.grid[gy][gx] = piece.type;
                }
            }
        }
        board.current = null;
        board.trail.length = 0;
        board.canHold = true;
        board.gridDirty = true;

        const cleared = clearLines(board);
        if (cleared > 0) {
            applyClear(board, cleared);
        } else {
            board.combo = 0;
            sfx("lock");
        }
        spawnNext(board);
    }

    function hardDrop(board) {
        if (!board.current || board.over) return;
        let distance = 0;
        while (stepDown(board)) distance += 1;
        board.score += distance * 2;
        sfx("drop");
        lockPiece(board);
    }

    function startMove(board, dir) {
        if (!board.current || board.over || state.paused) return;
        board.moveDir = dir;
        board.dasTimer = 0;
        board.arrTimer = 0;
        if (movePiece(board, dir)) sfx("move");
    }

    function stopMove(board, dir) {
        if (board.moveDir === dir) board.moveDir = 0;
    }

    function updateDAS(board, dt) {
        if (!board.moveDir) return;
        board.dasTimer += dt;
        if (board.dasTimer < DAS) return;
        const arr = board.heat >= 2 ? Math.max(ARR, 80) : ARR;
        board.arrTimer += dt;
        while (board.arrTimer >= arr) {
            board.arrTimer -= arr;
            if (!movePiece(board, board.moveDir)) break;
            state.renderAcc = IDLE_RENDER_INTERVAL;
            sfx("move");
        }
    }

    // ============================================================
    // Simulation
    // ============================================================
    function updateBoard(board, dt) {
        if (board.over || state.game.over) return;
        board.elapsed += dt;
        board.sinceClear += dt;

        if (board.flashTimer > 0) board.flashTimer = Math.max(0, board.flashTimer - dt);
        updateParticles(board, dt);
        updateTrail(board, dt);

        if (board.incoming > 0) {
            board.incomingTimer += dt;
            if (board.incomingTimer >= INCOMING_DELAY) {
                const rows = board.incoming;
                board.incoming = 0;
                board.incomingTimer = 0;
                sfx("garbage");
                announce("Player " + (board.index + 1) + " received " + rows + " corrupted rows.");
                insertGarbage(board, rows);
                if (board.over) return;
            }
        }

        const heat = computeHeat(board);
        if (heat > (board.maxHeat || 0)) board.maxHeat = heat;
        if (heat >= 5) {
            endGame({ loser: board.index, reason: "heat" });
            return;
        }
        if (heat !== board.heat) {
            const previous = board.heat;
            board.heat = heat;
            applyHeatUI(board);
            if (heat > previous) {
                sfx("heat");
                announce("System heat " + heat + ". " + (HEAT_NAMES[heat] || "Overload") + ".");
            }
        }
        if (state.game.mode === "solo") {
            updateFirewall(board, dt);
            if (board.over) return;
            maybeCorrupt(board, dt);
            if (board.over) return;
        }

        if (!board.current) return;

        const pressure = PRESSURE[state.game.pressure];
        const interval = board.softDrop
            ? SOFT_INTERVAL
            : pressure.gravity * Math.pow(pressure.scale, Math.min(board.heat, 4));
        board.dropAcc += dt;
        while (board.dropAcc >= interval) {
            board.dropAcc -= interval;
            if (stepDown(board)) {
                board.lockTimer = 0;
                if (board.softDrop) {
                    board.score += 1;
                    addTrail(board);
                }
            } else {
                break;
            }
        }

        if (collides(board, board.current.matrix, board.current.x, board.current.y + 1)) {
            board.lockTimer += dt;
            if (board.lockTimer >= LOCK_DELAY) {
                lockPiece(board);
                return;
            }
        } else {
            board.lockTimer = 0;
        }

        updateDAS(board, dt);
    }

    function update(dt) {
        if (!state.game || state.game.over) return;
        for (const board of state.game.boards) {
            updateBoard(board, dt);
            if (state.game.over) break;
        }
        updateHud();
    }

    function isIdleFrame() {
        if (!state.game) return false;
        for (const board of state.game.boards) {
            if (board.particles.length || board.trail.length || board.heat >= 2 || board.flashTimer > 0) {
                return false;
            }
        }
        return true;
    }

    function loop(now) {
        const dt = Math.min(64, Math.max(0, now - state.lastFrame));
        state.lastFrame = now;
        if (state.game && !state.paused && !state.game.over) {
            update(dt);
        }
        if (isIdleFrame()) {
            state.renderAcc += dt;
            if (state.renderAcc >= IDLE_RENDER_INTERVAL) {
                state.renderAcc = 0;
                render();
            }
        } else {
            state.renderAcc = 0;
            render();
        }
        state.raf = window.requestAnimationFrame(loop);
    }

    // ============================================================
    // Rendering primitives
    // ============================================================
    function drawBlock(ctx, px, py, size, color, options) {
        const opts = options || {};
        const alpha = opts.alpha === undefined ? 1 : opts.alpha;
        const pad = Math.max(1.5, size * 0.06);
        const inner = size - pad * 2;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, size * 0.045);

        if (opts.ghost) {
            ctx.setLineDash([size * 0.18, size * 0.12]);
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = color;
            ctx.fillRect(px + pad, py + pad, inner, inner);
            ctx.globalAlpha = alpha;
            ctx.lineWidth = Math.max(2, size * 0.07);
            if (opts.glow) {
                ctx.shadowColor = color;
                ctx.shadowBlur = Math.min(18, size * 0.4);
            }
            ctx.strokeRect(px + pad, py + pad, inner, inner);
            ctx.restore();
            return;
        }

        ctx.fillStyle = color;
        ctx.globalAlpha = alpha * 0.16;
        ctx.fillRect(px + pad, py + pad, inner, inner);

        ctx.globalAlpha = alpha;
        if (opts.glow) {
            ctx.shadowColor = color;
            ctx.shadowBlur = Math.min(16, size * 0.32);
        }
        ctx.strokeRect(px + pad, py + pad, inner, inner);

        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * 0.45;
        ctx.lineWidth = 1;
        const midX = px + size / 2;
        const midY = py + size / 2;
        ctx.beginPath();
        ctx.moveTo(midX, py + pad);
        ctx.lineTo(midX, py + size - pad);
        ctx.moveTo(px + pad, midY);
        ctx.lineTo(px + size - pad, midY);
        ctx.stroke();

        if (opts.garbage) {
            ctx.globalAlpha = alpha * 0.6;
            ctx.beginPath();
            ctx.moveTo(px + pad + 3, py + size - pad - 3);
            ctx.lineTo(px + size - pad - 3, py + pad + 3);
            ctx.moveTo(px + pad + 3, py + pad + 3);
            ctx.lineTo(px + size - pad - 3, py + size - pad - 3);
            ctx.stroke();
        }

        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
        ctx.fillRect(px + pad + 2, py + pad + 2, Math.max(2, inner * 0.16), Math.max(2, inner * 0.16));

        ctx.restore();
    }

    function drawMatrix(ctx, piece, originY, cell, alpha, options) {
        const opts = options || {};
        const color = opts.color || COLORS[piece.type];
        for (let y = 0; y < piece.matrix.length; y += 1) {
            for (let x = 0; x < piece.matrix[y].length; x += 1) {
                if (!piece.matrix[y][x]) continue;
                const px = (piece.x + x) * cell;
                const py = (piece.y + y - originY) * cell;
                if (py < -cell) continue;
                drawBlock(ctx, px, py, cell, color, {
                    alpha,
                    glow: opts.glow,
                    ghost: opts.ghost,
                });
            }
        }
    }

    function ensureGridCache(board) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        if (!board.gridCanvas || board.gridDpr !== dpr) {
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(BOARD_W * dpr);
            canvas.height = Math.round(BOARD_H * dpr);
            board.gridCanvas = canvas;
            board.gridCtx = canvas.getContext("2d");
            board.gridDpr = dpr;
            board.gridDirty = true;
        }
        if (!board.gridDirty) return;

        const ctx = board.gridCtx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, BOARD_W, BOARD_H);
        ctx.fillStyle = "#0b0c0f";
        ctx.fillRect(0, 0, BOARD_W, BOARD_H);

        ctx.strokeStyle = "rgba(191, 0, 255, 0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= COLS; x += 1) {
            ctx.moveTo(x * CELL + 0.5, 0);
            ctx.lineTo(x * CELL + 0.5, BOARD_H);
        }
        for (let y = 0; y <= ROWS; y += 1) {
            ctx.moveTo(0, y * CELL + 0.5);
            ctx.lineTo(BOARD_W, y * CELL + 0.5);
        }
        ctx.stroke();

        for (let y = HIDDEN; y < TOTAL_ROWS; y += 1) {
            for (let x = 0; x < COLS; x += 1) {
                const cell = board.grid[y][x];
                if (!cell) continue;
                drawBlock(ctx, x * CELL, (y - HIDDEN) * CELL, CELL, COLORS[cell] || COLORS.garbage, {
                    garbage: cell === "garbage",
                });
            }
        }
        board.gridDirty = false;
    }

    function renderBoard(board) {
        const ctx = boardCtx[board.index];
        if (!ctx) return;
        const reduced = prefersReduced();
        const heat = Math.min(board.heat, 4);

        ensureGridCache(board);
        ctx.clearRect(0, 0, BOARD_W, BOARD_H);
        ctx.drawImage(board.gridCanvas, 0, 0, BOARD_W, BOARD_H);

        const flicker = heat >= 2 && !reduced
            ? 0.7 + 0.3 * Math.abs(Math.sin(board.elapsed / 130))
            : 1;
        if (flicker < 1) {
            ctx.save();
            ctx.globalAlpha = 1 - flicker;
            ctx.fillStyle = "#0b0c0f";
            ctx.fillRect(0, 0, BOARD_W, BOARD_H);
            ctx.restore();
        }

        if (heat >= 3 && !reduced) {
            ctx.save();
            ctx.fillStyle = "rgba(11, 12, 15, 0.65)";
            for (let y = HIDDEN; y < TOTAL_ROWS; y += 1) {
                if (Math.sin(board.elapsed / 90 + y) > 0.97) {
                    ctx.fillRect(0, (y - HIDDEN) * CELL, BOARD_W, CELL);
                }
            }
            ctx.restore();
        }

        for (const after of board.trail) {
            const age = 1 - after.life / 150;
            drawMatrix(ctx, after, HIDDEN, CELL, Math.max(0, 0.22 * (1 - age)), {
                color: COLORS[after.type],
            });
        }

        if (board.current) {
            const ghost = {
                type: board.current.type,
                matrix: board.current.matrix,
                x: board.current.x,
                y: ghostY(board),
            };
            const ghostAlpha = heat >= 3 ? 0.4 : 0.55;
            drawMatrix(ctx, ghost, HIDDEN, CELL, ghostAlpha, { ghost: true, glow: true });

            if (heat >= 1 && !reduced) {
                const offset = heat >= 3 ? 3 : 2;
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                drawMatrix(ctx, board.current, HIDDEN, CELL, 0.16, { color: "#2ee6ff" });
                ctx.translate(offset, 0);
                drawMatrix(ctx, board.current, HIDDEN, CELL, 0.16, { color: "#ff45cf" });
                ctx.restore();
            }
            drawMatrix(ctx, board.current, HIDDEN, CELL, 1, { glow: true });
        }

        for (const p of board.particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        if (heat >= 3 && !reduced) {
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            for (let i = 0; i < 3; i += 1) {
                if (Math.random() > 0.55) continue;
                const gy = Math.random() * BOARD_H;
                const gh = 2 + Math.random() * 6;
                ctx.fillStyle = i === 0 ? "rgba(46, 230, 255, 0.08)" : "rgba(255, 69, 207, 0.07)";
                ctx.fillRect(0, gy, BOARD_W, gh);
            }
            ctx.restore();
        }
    }

    function renderFirewall(board) {
        const ctx = fwCtx[0];
        if (!ctx || board.index !== 0) return;
        ctx.clearRect(0, 0, FW_W, BOARD_H);
        const cellH = BOARD_H / FIREWALL_MAX;
        const filledCells = Math.min(FIREWALL_MAX, Math.round(board.firewall));
        for (let i = 0; i < FIREWALL_MAX; i += 1) {
            const y = BOARD_H - (i + 1) * cellH;
            const filled = i < filledCells;
            const hot = filled && i >= 14;
            ctx.fillStyle = hot ? "rgba(255, 77, 125, 0.4)" : filled ? "rgba(255, 77, 125, 0.26)" : "rgba(255, 77, 125, 0.04)";
            ctx.fillRect(3, y + 1.5, FW_W - 6, cellH - 3);
            ctx.strokeStyle = hot ? "rgba(255, 77, 125, 0.95)" : filled ? "rgba(255, 77, 125, 0.7)" : "rgba(255, 77, 125, 0.18)";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(3, y + 1.5, FW_W - 6, cellH - 3);
        }
    }

    function drawPreviewPiece(ctx, type, centerX, centerY, cell) {
        if (!type) return;
        const matrix = SHAPES[type];
        let minX = matrix[0].length;
        let maxX = -1;
        let minY = matrix.length;
        let maxY = -1;
        for (let y = 0; y < matrix.length; y += 1) {
            for (let x = 0; x < matrix[y].length; x += 1) {
                if (!matrix[y][x]) continue;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }
        if (maxX < 0) return;
        const width = (maxX - minX + 1) * cell;
        const height = (maxY - minY + 1) * cell;
        const startX = centerX - width / 2;
        const startY = centerY - height / 2;
        for (let y = minY; y <= maxY; y += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                if (!matrix[y][x]) continue;
                drawBlock(
                    ctx,
                    startX + (x - minX) * cell,
                    startY + (y - minY) * cell,
                    cell,
                    COLORS[type],
                    { glow: false }
                );
            }
        }
    }

    function renderHold(board) {
        const ctx = holdCtx[board.index];
        if (!ctx) return;
        ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_HOLD_H);
        if (board.canHold || board.hold) {
            drawPreviewPiece(ctx, board.hold, PREVIEW_W / 2, PREVIEW_HOLD_H / 2, 18);
        }
    }

    function renderNext(board) {
        const ctx = nextCtx[board.index];
        if (!ctx) return;
        ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_NEXT_H);
        const slots = Math.min(3, board.queue.length);
        const slotH = PREVIEW_NEXT_H / 3;
        for (let i = 0; i < slots; i += 1) {
            drawPreviewPiece(ctx, board.queue[i], PREVIEW_W / 2, slotH * i + slotH / 2, 16);
        }
    }

    function render() {
        if (!state.game) return;
        for (const board of state.game.boards) {
            if (board.index === 1 && dom.stages[1].classList.contains("hidden")) continue;
            renderBoard(board);
            renderFirewall(board);
            renderHold(board);
            renderNext(board);
        }
    }

    // ============================================================
    // HUD & records
    // ============================================================
    function ensurePips() {
        for (let i = 0; i < 2; i += 1) {
            const holder = dom.heatPips[i];
            if (!holder || holder.children.length) continue;
            for (let p = 0; p < 4; p += 1) {
                holder.appendChild(document.createElement("span"));
            }
        }
    }

    function updateHud() {
        if (!state.game) return;
        for (const board of state.game.boards) {
            const i = board.index;
            if (dom.scores[i]) dom.scores[i].textContent = formatNumber(board.score);
            if (dom.lines[i]) dom.lines[i].textContent = String(board.lines);
            if (dom.heatLabels[i]) dom.heatLabels[i].textContent = String(Math.min(board.heat, 5));
            if (dom.heatPips[i]) {
                const pips = dom.heatPips[i].children;
                for (let p = 0; p < pips.length; p += 1) {
                    pips[p].classList.toggle("on", p < board.heat);
                    pips[p].classList.toggle("hot", p < board.heat && board.heat >= 3);
                }
            }
            if (dom.stages[i]) {
                dom.stages[i].setAttribute("data-heat", String(Math.min(board.heat, 4)));
            }
            if (i === 0) {
                if (dom.firewallPcts[0]) {
                    dom.firewallPcts[0].textContent = Math.round((board.firewall / FIREWALL_MAX) * 100) + "%";
                }
                if (dom.firewallPanels[0]) {
                    dom.firewallPanels[0].classList.toggle("warning", board.firewall >= 15);
                }
            }
        }
    }

    function updateRecords() {
        const game = state.game;
        let newBest = false;
        if (game.mode === "solo") {
            const board = game.boards[0];
            if (board.score > state.best.solo.bestScore) {
                state.best.solo.bestScore = board.score;
                newBest = true;
            }
            if (board.lines > state.best.solo.bestLines) state.best.solo.bestLines = board.lines;
            if ((board.maxHeat || 0) > state.best.solo.maxHeat) state.best.solo.maxHeat = board.maxHeat;
        } else if (game.winner === 0) {
            state.best.duo.p1Wins += 1;
        } else if (game.winner === 1) {
            state.best.duo.p2Wins += 1;
        }
        saveBest();
        renderRecords();
        return newBest;
    }

    function showResults(newBest) {
        const game = state.game;
        const duo = game.mode === "duo";
        const board = duo ? game.boards[game.winner] : game.boards[0];
        let kicker;
        let title;

        if (!duo) {
            if (game.reason === "firewall") {
                kicker = "Core dump";
                title = "Firewall breach.";
            } else if (game.reason === "heat") {
                kicker = "Core dump";
                title = "System overload.";
            } else {
                kicker = "Stack overflow";
                title = "Data grid collapsed.";
            }
            dom.goScoreLabel.textContent = "Score";
        } else {
            kicker = "Match complete";
            title = "Player " + (game.winner + 1) + " wins.";
            dom.goScoreLabel.textContent = "P" + (game.winner + 1) + " score";
        }

        dom.gameoverKicker.textContent = kicker;
        dom.gameoverTitle.textContent = title;
        dom.goScore.textContent = formatNumber(board ? board.score : 0);
        dom.goLines.textContent = String(board ? board.lines : 0);
        dom.goHeat.textContent = String(board ? (board.maxHeat || 0) : 0);

        if (duo) {
            dom.goBest.textContent = "Series: P1 " + state.best.duo.p1Wins + " - " + state.best.duo.p2Wins + " P2";
        } else if (state.best.solo.bestScore > 0) {
            dom.goBest.textContent = "Best: " + formatNumber(state.best.solo.bestScore) +
                " / " + state.best.solo.bestLines + " lines / heat " + state.best.solo.maxHeat;
        } else {
            dom.goBest.textContent = "No record yet.";
        }

        dom.goNote.classList.toggle("hidden", !newBest);
        dom.gameoverOverlay.classList.remove("hidden");
        updatePauseButton();
        dom.goRetry.focus();
    }

    function endGame(result) {
        const game = state.game;
        if (!game || game.over) return;
        game.over = true;
        game.reason = result.reason;
        game.winner = game.mode === "duo" ? 1 - result.loser : null;
        if (game.boards[result.loser]) game.boards[result.loser].over = true;

        const newBest = updateRecords();
        showResults(newBest);
        if (game.mode === "duo") sfx("win");
        else sfx("over");

        const message = game.mode === "duo"
            ? "Match complete. Player " + (game.winner + 1) + " wins."
            : "Core dump. Run ended.";
        announce(message);
    }

    // ============================================================
    // Game lifecycle
    // ============================================================
    function startGame() {
        if (state.capturingAction) cancelCapture();
        ensureAudio();
        const game = {
            mode: state.mode,
            pressure: state.pressure,
            boards: [],
            over: false,
            winner: null,
            reason: null,
        };
        state.game = game;
        state.paused = false;
        const count = state.mode === "duo" ? 2 : 1;
        for (let i = 0; i < count; i += 1) {
            const board = createBoard(i);
            board.maxHeat = 0;
            spawnNext(board);
            game.boards.push(board);
        }

        hideOverlays();
        ensurePips();
        dom.boardsArea.classList.toggle("duo", count === 2);
        dom.stages[0].classList.remove("hidden");
        dom.stages[1].classList.toggle("hidden", count < 2);
        dom.stages[0].setAttribute("data-heat", "0");
        dom.stages[1].setAttribute("data-heat", "0");
        dom.firewallPanels[0].classList.toggle("hidden", count === 2);

        dom.hudMode.textContent = count === 2 ? "Local VS" : "Solo vs Firewall";
        dom.hudSub.textContent = PRESSURE[state.pressure].label + " pressure";
        dom.playerNames[0].textContent = count === 2 ? "PLAYER 1" : "OPERATOR";
        dom.playerNames[1].textContent = "PLAYER 2";

        updateHud();
        showScreen("match");
        announce(count === 2
            ? "Local versus started. " + PRESSURE[state.pressure].label + " pressure."
            : "Protocol started. " + PRESSURE[state.pressure].label + " pressure.");

        state.lastFrame = performance.now();
        state.renderAcc = 0;
        window.cancelAnimationFrame(state.raf);
        state.raf = window.requestAnimationFrame(loop);
    }

    function goLobby() {
        window.cancelAnimationFrame(state.raf);
        state.raf = 0;
        state.game = null;
        state.paused = false;
        if (state.capturingAction) cancelCapture();
        hideOverlays();
        renderRecords();
        showScreen("lobby");
        announce("Returned to lobby.");
        if (dom.startBtn) dom.startBtn.focus();
    }

    function releaseInputs() {
        if (!state.game) return;
        for (const board of state.game.boards) {
            board.softDrop = false;
            board.moveDir = 0;
            board.dasTimer = 0;
            board.arrTimer = 0;
        }
    }

    function openPause() {
        if (!state.game || state.game.over || state.paused) return;
        state.paused = true;
        releaseInputs();
        if (dom.pauseEffects) {
            dom.pauseEffects.setAttribute("aria-pressed", String(state.settings.reducedEffects));
            dom.pauseEffects.textContent = state.settings.reducedEffects ? "Effects reduced" : "Reduce effects";
        }
        dom.pauseOverlay.classList.remove("hidden");
        updatePauseButton();
        dom.pauseResume.focus();
        announce("Protocol paused.");
    }

    function closePause() {
        if (!state.paused) return;
        state.paused = false;
        state.lastFrame = performance.now();
        dom.pauseOverlay.classList.add("hidden");
        updatePauseButton();
        announce("Resumed.");
    }

    function onEscape() {
        if (!dom.quitOverlay.classList.contains("hidden")) {
            dom.quitOverlay.classList.add("hidden");
            if (state.paused) dom.pauseOverlay.classList.remove("hidden");
            return;
        }
        if (state.paused) {
            closePause();
            return;
        }
        if (state.game && !state.game.over) openPause();
    }

    function requestQuit() {
        if (!state.game) return;
        if (state.game.over) {
            goLobby();
            return;
        }
        state.paused = true;
        releaseInputs();
        updatePauseButton();
        dom.quitOverlay.classList.remove("hidden");
        dom.quitCancel.focus();
        announce("Quit confirmation.");
    }

    // ============================================================
    // Input
    // ============================================================
    function mapKey(code, duo) {
        const binds = state.settings.binds || DEFAULT_BINDS;
        for (const action of Object.keys(DEFAULT_BINDS)) {
            if (code === binds[action]) return { player: 0, action };
        }
        // Layout-stable accessibility fallbacks.
        if (code === "KeyZ") return { player: 0, action: "ccw" };
        if (code === "ShiftLeft" || code === "ShiftRight") return { player: 0, action: "hold" };
        if (!duo) {
            if (code === "ArrowLeft") return { player: 0, action: "left" };
            if (code === "ArrowRight") return { player: 0, action: "right" };
            if (code === "ArrowDown") return { player: 0, action: "soft" };
            if (code === "ArrowUp") return { player: 0, action: "cw" };
            return null;
        }
        if (code === "ArrowLeft") return { player: 1, action: "left" };
        if (code === "ArrowRight") return { player: 1, action: "right" };
        if (code === "ArrowDown") return { player: 1, action: "soft" };
        if (code === "ArrowUp") return { player: 1, action: "cw" };
        if (code === "Comma") return { player: 1, action: "ccw" };
        if (code === "Period") return { player: 1, action: "hold" };
        if (code === "Enter") return { player: 1, action: "drop" };
        return null;
    }

    function performAction(player, action, down) {
        if (!state.game || state.game.over || state.paused) return;
        const board = state.game.boards[player];
        if (!board || board.over) return;
        state.renderAcc = IDLE_RENDER_INTERVAL;
        if (action === "left") {
            if (down) startMove(board, -1);
            else stopMove(board, -1);
            return;
        }
        if (action === "right") {
            if (down) startMove(board, 1);
            else stopMove(board, 1);
            return;
        }
        if (action === "soft") {
            board.softDrop = down;
            if (!down) board.dropAcc = 0;
            return;
        }
        if (!down) return;
        if (action === "cw") rotatePiece(board, 1);
        else if (action === "ccw") rotatePiece(board, -1);
        else if (action === "hold") holdPiece(board);
        else if (action === "drop") hardDrop(board);
    }

    function onKeyDown(event) {
        if (state.capturingAction) {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            if (event.code === "Escape") {
                cancelCapture();
                announce("Key bind cancelled.");
                return;
            }
            if (!event.code || RESERVED_CODES.has(event.code)) {
                setBindWarning("That key is reserved. Choose another key.");
                return;
            }
            const action = state.capturingAction;
            const conflict = BIND_ACTIONS.find(
                (item) => item.key !== action && state.settings.binds[item.key] === event.code
            );
            if (conflict) {
                setBindWarning(
                    keyLabel(event.code) + " is already bound to " + conflict.label +
                    ". Pick another key, or rebind that action first."
                );
                return;
            }
            state.settings.binds[action] = event.code;
            state.capturingAction = null;
            saveSettings();
            setBindWarning("");
            renderBinds();
            const button = dom.bindGrid && dom.bindGrid.querySelector('[data-action="' + action + '"]');
            if (button) button.focus();
            announce(action + " bound to " + keyLabel(event.code) + ".");
            return;
        }

        resumeAudio();
        if (state.screen === "lobby") {
            if (event.key === "Enter") {
                const tag = event.target && event.target.tagName;
                if (tag === "BUTTON" || tag === "A") return;
                event.preventDefault();
                startGame();
            }
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            onEscape();
            return;
        }
        if (state.paused || !state.game || state.game.over) return;

        const duo = state.game.mode === "duo";
        const mapping = mapKey(event.code, duo);
        if (!mapping) return;
        event.preventDefault();
        if (event.repeat) return;
        performAction(mapping.player, mapping.action, true);
    }

    function onKeyUp(event) {
        if (state.capturingAction) return;
        if (state.screen !== "match" || !state.game) return;
        const duo = state.game.mode === "duo";
        const mapping = mapKey(event.code, duo);
        if (!mapping) return;
        performAction(mapping.player, mapping.action, false);
    }

    // ============================================================
    // Wiring
    // ============================================================
    function toggleMute() {
        state.settings.muted = !state.settings.muted;
        audio.muted = state.settings.muted;
        saveSettings();
        updateMuteButtons();
        if (!audio.muted) {
            ensureAudio();
            sfx("click");
        }
    }

    function toggleEffects() {
        state.settings.reducedEffects = !state.settings.reducedEffects;
        saveSettings();
        updateEffectsUI();
        ensureAudio();
        sfx("click");
    }

    function selectMode(mode) {
        state.mode = mode;
        ensureAudio();
        for (const card of dom.modeCards) {
            const selected = card.dataset.mode === mode;
            card.classList.toggle("selected", selected);
            card.setAttribute("aria-checked", String(selected));
        }
        sfx("click");
    }

    function selectPressure(pressure) {
        state.pressure = pressure;
        ensureAudio();
        for (const button of dom.pressureButtons) {
            const selected = button.dataset.pressure === pressure;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-checked", String(selected));
        }
        sfx("click");
    }

    function resetRecords() {
        if (!window.confirm("Reset all Tetris Protocol records?")) return;
        state.best = {
            solo: { bestScore: 0, bestLines: 0, maxHeat: 0 },
            duo: { p1Wins: 0, p2Wins: 0 },
        };
        saveBest();
        renderRecords();
        announce("Records reset.");
    }

    function wireTouchPads() {
        for (const pad of dom.pads) {
            if (!pad) continue;
            const buttons = pad.querySelectorAll("button[data-action]");
            for (const button of buttons) {
                const player = Number(button.dataset.player);
                const action = button.dataset.action;
                const down = (event) => {
                    event.preventDefault();
                    resumeAudio();
                    performAction(player, action, true);
                };
                const up = (event) => {
                    event.preventDefault();
                    performAction(player, action, false);
                };
                button.addEventListener("pointerdown", down);
                button.addEventListener("pointerup", up);
                button.addEventListener("pointercancel", up);
                button.addEventListener("pointerleave", (event) => {
                    if (event.buttons) performAction(player, action, false);
                });
            }
        }
    }

    function wireEvents() {
        for (const card of dom.modeCards) {
            card.addEventListener("click", () => selectMode(card.dataset.mode));
        }
        for (const button of dom.pressureButtons) {
            button.addEventListener("click", () => selectPressure(button.dataset.pressure));
        }

        dom.lobbyMute.addEventListener("click", toggleMute);
        dom.matchMute.addEventListener("click", toggleMute);
        dom.matchPause.addEventListener("click", openPause);
        dom.effectsToggle.addEventListener("click", toggleEffects);
        dom.startBtn.addEventListener("click", startGame);
        dom.resetRecords.addEventListener("click", resetRecords);

        dom.quitBtn.addEventListener("click", requestQuit);
        dom.quitCancel.addEventListener("click", () => {
            dom.quitOverlay.classList.add("hidden");
            closePause();
        });
        dom.quitConfirm.addEventListener("click", goLobby);

        dom.pauseResume.addEventListener("click", closePause);
        dom.pauseEffects.addEventListener("click", toggleEffects);
        dom.pauseQuit.addEventListener("click", () => {
            dom.pauseOverlay.classList.add("hidden");
            requestQuit();
        });

        dom.goRetry.addEventListener("click", startGame);
        dom.goLobby.addEventListener("click", goLobby);
        dom.pauseOverlay.addEventListener("click", (event) => {
            if (event.target === dom.pauseOverlay) closePause();
        });

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);

        window.addEventListener("resize", resizeCanvases);
        window.addEventListener("blur", () => {
            if (state.game && !state.game.over) openPause();
        });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden && state.game && !state.game.over) openPause();
        });
        reducedMotionQuery.addEventListener("change", updateEffectsUI);

        wireTouchPads();
    }

    function init() {
        cacheDom();
        updateMuteButtons();
        updateEffectsUI();
        ensurePips();
        renderBinds();
        renderRecords();
        wireEvents();
        showScreen("lobby");
    }

    init();
})();

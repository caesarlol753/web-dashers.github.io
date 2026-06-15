/*
 Chromium v0.1 — Browser Macro Add-on
 Designed for authorized Web Dashers / browser-game copies.
 Add this file to the game source and load it before </body>:
 <script src="chromium.js"></script>

 This tool visibly labels playback as UNVERIFIED.
*/

(() => {
  "use strict";

  if (window.ChromiumMacro) {
    console.warn("Chromium is already loaded.");
    return;
  }

  const VERSION = "0.1.0";
  const STORAGE_KEY = "chromium_macro_v1";
  const CONTROL_CODES = new Set(["Space", "ArrowUp", "KeyW"]);
  const state = {
    recording: false,
    playing: false,
    loop: false,
    frame: 0,
    startTime: 0,
    macro: [],
    speed: 1,
    startDelay: 500,
    target: null,
    playbackToken: 0,
  };

  const sleepFrame = () =>
    new Promise(resolve => requestAnimationFrame(resolve));

  function gameTarget() {
    if (state.target && document.contains(state.target)) return state.target;
    return (
      document.querySelector("canvas") ||
      document.querySelector("[tabindex]") ||
      document.body
    );
  }

  function nowMs() {
    return performance.now() - state.startTime;
  }

  function record(data) {
    if (!state.recording || state.playing) return;
    state.macro.push({
      time: Number(nowMs().toFixed(3)),
      frame: state.frame,
      ...data,
    });
    updateUI();
  }

  function keyDetails(code) {
    const map = {
      Space: { key: " ", keyCode: 32 },
      ArrowUp: { key: "ArrowUp", keyCode: 38 },
      KeyW: { key: "w", keyCode: 87 },
    };
    return map[code] || { key: code, keyCode: 0 };
  }

  function dispatchKeyboard(type, code) {
    const d = keyDetails(code);
    const init = {
      key: d.key,
      code,
      keyCode: d.keyCode,
      which: d.keyCode,
      bubbles: true,
      cancelable: true,
      repeat: false,
    };

    const target = gameTarget();
    target.dispatchEvent(new KeyboardEvent(type, init));
    window.dispatchEvent(new KeyboardEvent(type, init));
    document.dispatchEvent(new KeyboardEvent(type, init));
  }

  function dispatchPointer(type, xRatio = 0.5, yRatio = 0.5) {
    const target = gameTarget();
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + Math.max(0, Math.min(1, xRatio)) * rect.width;
    const clientY = rect.top + Math.max(0, Math.min(1, yRatio)) * rect.height;
    const down = type === "pointerdown";

    try {
      target.dispatchEvent(new PointerEvent(type, {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: down ? 1 : 0,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
      }));
    } catch (_) {}

    target.dispatchEvent(new MouseEvent(down ? "mousedown" : "mouseup", {
      button: 0,
      buttons: down ? 1 : 0,
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    }));
  }

  function fireEvent(item) {
    if (item.kind === "keyboard") {
      dispatchKeyboard(item.action, item.code);
    } else if (item.kind === "pointer") {
      dispatchPointer(item.action, item.x, item.y);
    }
  }

  function startRecording() {
    stopPlayback();
    state.macro = [];
    state.frame = 0;
    state.startTime = performance.now();
    state.recording = true;
    setStatus("RECORDING", "recording");
    updateUI();
  }

  function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    saveLocal();
    setStatus("SAVED", "ready");
    updateUI();
  }

  function stopPlayback() {
    state.playbackToken++;
    state.playing = false;
    setWatermark(false);
    setStatus("READY", "ready");
    updateUI();
  }

  async function playOnce(token) {
    if (!state.macro.length) {
      setStatus("NO MACRO", "error");
      return;
    }

    state.playing = true;
    state.recording = false;
    setWatermark(true);
    setStatus("PLAYING", "playing");
    updateUI();

    const delay = Math.max(0, Number(state.startDelay) || 0);
    const delayEnd = performance.now() + delay;
    while (performance.now() < delayEnd) {
      if (token !== state.playbackToken) return;
      await sleepFrame();
    }

    const started = performance.now();

    for (const item of state.macro) {
      const due = started + item.time / Math.max(0.05, state.speed);
      while (performance.now() < due) {
        if (token !== state.playbackToken) return;
        await sleepFrame();
      }
      if (token !== state.playbackToken) return;
      fireEvent(item);
    }
  }

  async function playMacro() {
    stopPlayback();
    const token = ++state.playbackToken;

    do {
      await playOnce(token);
      if (token !== state.playbackToken) return;
      if (state.loop) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    } while (state.loop && token === state.playbackToken);

    if (token === state.playbackToken) {
      state.playing = false;
      setWatermark(false);
      setStatus("FINISHED", "ready");
      updateUI();
    }
  }

  function saveLocal() {
    const payload = {
      format: "chromium-macro",
      version: VERSION,
      createdAt: new Date().toISOString(),
      macro: state.macro,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function loadLocal() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw);
      state.macro = Array.isArray(parsed) ? parsed : (parsed.macro || []);
      updateUI();
      return true;
    } catch {
      setStatus("LOAD ERROR", "error");
      return false;
    }
  }

  function exportMacro() {
    const payload = {
      format: "chromium-macro",
      version: VERSION,
      createdAt: new Date().toISOString(),
      settings: {
        speed: state.speed,
        startDelay: state.startDelay,
      },
      macro: state.macro,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "macro.chromium.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("EXPORTED", "ready");
  }

  function importMacro(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const macro = Array.isArray(parsed) ? parsed : parsed.macro;
        if (!Array.isArray(macro)) throw new Error("No macro array");

        state.macro = macro.filter(item =>
          item &&
          typeof item.time === "number" &&
          (item.kind === "keyboard" || item.kind === "pointer")
        );

        if (parsed.settings) {
          if (Number.isFinite(Number(parsed.settings.speed))) {
            state.speed = Number(parsed.settings.speed);
          }
          if (Number.isFinite(Number(parsed.settings.startDelay))) {
            state.startDelay = Number(parsed.settings.startDelay);
          }
        }

        saveLocal();
        syncControls();
        setStatus("IMPORTED", "ready");
        updateUI();
      } catch (error) {
        console.error(error);
        setStatus("BAD FILE", "error");
      }
    };
    reader.readAsText(file);
  }

  function clearMacro() {
    stopPlayback();
    state.recording = false;
    state.macro = [];
    localStorage.removeItem(STORAGE_KEY);
    setStatus("CLEARED", "ready");
    updateUI();
  }

  function setTargetMode() {
    setStatus("CLICK GAME", "target");
    const choose = event => {
      event.preventDefault();
      event.stopPropagation();
      state.target = event.target;
      document.removeEventListener("pointerdown", choose, true);
      setStatus("TARGET SET", "ready");
    };
    document.addEventListener("pointerdown", choose, true);
  }

  // Input capture
  const held = new Set();

  document.addEventListener("keydown", event => {
    if (!CONTROL_CODES.has(event.code)) return;
    if (held.has(event.code)) return;
    held.add(event.code);
    record({
      kind: "keyboard",
      action: "keydown",
      code: event.code,
    });
  }, true);

  document.addEventListener("keyup", event => {
    if (!CONTROL_CODES.has(event.code)) return;
    held.delete(event.code);
    record({
      kind: "keyboard",
      action: "keyup",
      code: event.code,
    });
  }, true);

  document.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    if (panel.contains(event.target)) return;

    const target = gameTarget();
    const rect = target.getBoundingClientRect();
    record({
      kind: "pointer",
      action: "pointerdown",
      x: rect.width ? (event.clientX - rect.left) / rect.width : 0.5,
      y: rect.height ? (event.clientY - rect.top) / rect.height : 0.5,
    });
  }, true);

  document.addEventListener("pointerup", event => {
    if (event.button !== 0) return;
    if (panel.contains(event.target)) return;

    const target = gameTarget();
    const rect = target.getBoundingClientRect();
    record({
      kind: "pointer",
      action: "pointerup",
      x: rect.width ? (event.clientX - rect.left) / rect.width : 0.5,
      y: rect.height ? (event.clientY - rect.top) / rect.height : 0.5,
    });
  }, true);

  function frameLoop() {
    state.frame++;
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);

  // UI
  const style = document.createElement("style");
  style.textContent = `
    #chromium-panel {
      position: fixed;
      top: 18px;
      right: 18px;
      width: 260px;
      z-index: 2147483646;
      background: rgba(12, 15, 20, .96);
      border: 1px solid #69788b;
      border-radius: 12px;
      color: #f2f6fb;
      font: 13px/1.25 Arial, sans-serif;
      box-shadow: 0 14px 40px rgba(0,0,0,.55);
      user-select: none;
      overflow: hidden;
    }
    #chromium-panel * { box-sizing: border-box; }
    #chromium-head {
      padding: 11px 12px;
      background: linear-gradient(135deg, #2b333f, #151a21);
      border-bottom: 1px solid #424c59;
      cursor: move;
      font-weight: 800;
      letter-spacing: 1.2px;
    }
    #chromium-head small {
      float: right;
      color: #9fb0c4;
      font-weight: 600;
      letter-spacing: 0;
    }
    #chromium-body { padding: 10px; }
    .chromium-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
      margin-bottom: 7px;
    }
    .chromium-row.one { grid-template-columns: 1fr; }
    .chromium-btn, .chromium-input {
      min-height: 34px;
      border-radius: 7px;
      border: 1px solid #596777;
      background: #202731;
      color: #f6f8fb;
      font-weight: 700;
    }
    .chromium-btn { cursor: pointer; }
    .chromium-btn:hover { background: #2d3744; }
    .chromium-btn.red { background: #54242b; border-color: #98505b; }
    .chromium-btn.blue { background: #203f5b; border-color: #4d85b5; }
    .chromium-btn.green { background: #1f4c3b; border-color: #4a8b72; }
    .chromium-label {
      color: #aeb9c7;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .chromium-input {
      width: 100%;
      padding: 6px 8px;
      text-align: center;
    }
    #chromium-status {
      display: flex;
      justify-content: space-between;
      padding: 8px 9px;
      margin-bottom: 8px;
      background: #151a21;
      border: 1px solid #39434f;
      border-radius: 7px;
      font-weight: 800;
    }
    #chromium-status[data-mode="recording"] { color: #ff7e8c; }
    #chromium-status[data-mode="playing"] { color: #7ec5ff; }
    #chromium-status[data-mode="error"] { color: #ffbd69; }
    #chromium-status[data-mode="target"] { color: #caa7ff; }
    #chromium-loop-label {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      background: #202731;
      border: 1px solid #596777;
      border-radius: 7px;
      min-height: 34px;
      font-weight: 700;
    }
    #chromium-file { display: none; }
    #chromium-watermark {
      display: none;
      position: fixed;
      left: 50%;
      top: 12px;
      transform: translateX(-50%);
      z-index: 2147483647;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(80, 15, 25, .92);
      border: 1px solid #ff7488;
      color: white;
      font: 800 12px Arial, sans-serif;
      letter-spacing: 1px;
      pointer-events: none;
    }
  `;
  document.documentElement.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "chromium-panel";
  panel.innerHTML = `
    <div id="chromium-head">CHROMIUM <small>v${VERSION}</small></div>
    <div id="chromium-body">
      <div id="chromium-status" data-mode="ready">
        <span id="chromium-status-text">READY</span>
        <span id="chromium-count">0 inputs</span>
      </div>

      <div class="chromium-row">
        <button class="chromium-btn red" id="chromium-record">RECORD</button>
        <button class="chromium-btn" id="chromium-stop">STOP</button>
      </div>

      <div class="chromium-row">
        <button class="chromium-btn blue" id="chromium-play">PLAY</button>
        <label id="chromium-loop-label">
          <input type="checkbox" id="chromium-loop"> LOOP
        </label>
      </div>

      <div class="chromium-row">
        <div>
          <div class="chromium-label">Playback speed</div>
          <select class="chromium-input" id="chromium-speed">
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="0.75">0.75×</option>
            <option value="1" selected>1.00×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.50×</option>
            <option value="2">2.00×</option>
          </select>
        </div>
        <div>
          <div class="chromium-label">Start delay (ms)</div>
          <input class="chromium-input" id="chromium-delay"
                 type="number" min="0" step="50" value="500">
        </div>
      </div>

      <div class="chromium-row">
        <button class="chromium-btn" id="chromium-import">IMPORT</button>
        <button class="chromium-btn" id="chromium-export">EXPORT</button>
      </div>

      <div class="chromium-row">
        <button class="chromium-btn" id="chromium-target">SET TARGET</button>
        <button class="chromium-btn green" id="chromium-save">SAVE</button>
      </div>

      <div class="chromium-row one">
        <button class="chromium-btn" id="chromium-clear">CLEAR MACRO</button>
      </div>

      <input id="chromium-file" type="file"
             accept=".json,.chromium,application/json">
    </div>
  `;
  document.body.appendChild(panel);

  const watermark = document.createElement("div");
  watermark.id = "chromium-watermark";
  watermark.textContent = "CHROMIUM PLAYBACK — UNVERIFIED";
  document.body.appendChild(watermark);

  const $ = id => document.getElementById(id);
  const statusText = $("chromium-status-text");
  const statusBox = $("chromium-status");
  const countText = $("chromium-count");
  const fileInput = $("chromium-file");

  function setStatus(text, mode = "ready") {
    statusText.textContent = text;
    statusBox.dataset.mode = mode;
  }

  function setWatermark(show) {
    watermark.style.display = show ? "block" : "none";
  }

  function updateUI() {
    countText.textContent =
      `${state.macro.length} input${state.macro.length === 1 ? "" : "s"}`;
  }

  function syncControls() {
    $("chromium-speed").value = String(state.speed);
    $("chromium-delay").value = String(state.startDelay);
    $("chromium-loop").checked = state.loop;
  }

  $("chromium-record").addEventListener("click", startRecording);
  $("chromium-stop").addEventListener("click", () => {
    if (state.recording) stopRecording();
    else stopPlayback();
  });
  $("chromium-play").addEventListener("click", playMacro);
  $("chromium-loop").addEventListener("change", e => {
    state.loop = e.target.checked;
  });
  $("chromium-speed").addEventListener("change", e => {
    state.speed = Number(e.target.value) || 1;
  });
  $("chromium-delay").addEventListener("change", e => {
    state.startDelay = Math.max(0, Number(e.target.value) || 0);
  });
  $("chromium-import").addEventListener("click", () => fileInput.click());
  $("chromium-export").addEventListener("click", exportMacro);
  $("chromium-target").addEventListener("click", setTargetMode);
  $("chromium-save").addEventListener("click", () => {
    saveLocal();
    setStatus("SAVED", "ready");
  });
  $("chromium-clear").addEventListener("click", clearMacro);
  fileInput.addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    if (file) importMacro(file);
    e.target.value = "";
  });

  // Drag panel
  const head = $("chromium-head");
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  head.addEventListener("pointerdown", event => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    head.setPointerCapture?.(event.pointerId);
  });

  head.addEventListener("pointermove", event => {
    if (!dragging) return;
    panel.style.left = `${Math.max(0, event.clientX - offsetX)}px`;
    panel.style.top = `${Math.max(0, event.clientY - offsetY)}px`;
    panel.style.right = "auto";
  });

  head.addEventListener("pointerup", () => {
    dragging = false;
  });

  // Public API
  window.ChromiumMacro = {
    version: VERSION,
    state,
    startRecording,
    stopRecording,
    playMacro,
    stopPlayback,
    saveLocal,
    loadLocal,
    exportMacro,
    clearMacro,
    setTarget(element) {
      state.target = element;
      setStatus("TARGET SET", "ready");
    },
  };

  loadLocal();
  syncControls();
  updateUI();
  setStatus("READY", "ready");
})();

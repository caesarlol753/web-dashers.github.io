/*
Chromium Lite v0.1.1 — Performance Build
Add before </body>: <script defer src="chromium-lite.js"></script>
Do not load the old chromium.js at the same time.
*/
(() => {
  "use strict";
  if (window.ChromiumLite) return;

  const KEY = "chromium_lite_v011";
  const controls = new Set(["Space", "ArrowUp", "KeyW"]);
  const held = new Set();

  const s = {
    recording: false, playing: false, loop: false,
    macro: [], started: 0, index: 0, playStart: 0,
    raf: 0, timer: 0, speed: 1, delay: 500,
    mode: "keyboard", target: "window", lastUi: 0
  };

  const $ = id => document.getElementById(id);
  const target = () => s.target === "document" ? document :
    s.target === "canvas" ? (document.querySelector("canvas") || window) : window;

  function status(text, mode="") {
    const e = $("cl-status");
    if (e) { e.textContent = text; e.dataset.mode = mode; }
  }

  function count(force=false) {
    const n = performance.now();
    if (!force && n - s.lastUi < 100) return;
    s.lastUi = n;
    const e = $("cl-count");
    if (e) e.textContent = `${s.macro.length} inputs`;
  }

  function add(item) {
    if (!s.recording || s.playing) return;
    s.macro.push({time:+(performance.now()-s.started).toFixed(2), ...item});
    count();
  }

  function keyData(code) {
    return code === "Space" ? [" ",32] :
           code === "ArrowUp" ? ["ArrowUp",38] :
           code === "KeyW" ? ["w",87] : [code,0];
  }

  function fire(item) {
    if (item.kind === "key") {
      const [key,keyCode] = keyData(item.code);
      target().dispatchEvent(new KeyboardEvent(item.action, {
        key, code:item.code, keyCode, which:keyCode,
        bubbles:true, cancelable:true
      }));
    } else {
      const canvas = document.querySelector("canvas");
      const t = canvas || document.body;
      const r = t.getBoundingClientRect();
      const down = item.action === "down";
      t.dispatchEvent(new MouseEvent(down ? "mousedown" : "mouseup", {
        button:0, buttons:down?1:0,
        clientX:r.left+r.width/2, clientY:r.top+r.height/2,
        bubbles:true, cancelable:true
      }));
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify({
      version:"0.1.1",
      settings:{speed:s.speed,delay:s.delay,mode:s.mode,target:s.target},
      macro:s.macro
    }));
    status("SAVED","ready");
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      s.macro = Array.isArray(p) ? p : (p.macro || []);
      if (p.settings) {
        s.speed = Number(p.settings.speed)||1;
        s.delay = Number(p.settings.delay)||500;
        s.mode = p.settings.mode||"keyboard";
        s.target = p.settings.target||"window";
      }
    } catch(e) { console.error(e); }
  }

  function stopPlayback() {
    s.playing = false;
    cancelAnimationFrame(s.raf);
    clearTimeout(s.timer);
    s.raf = 0; s.timer = 0;
    const w = $("cl-watermark"); if (w) w.hidden = true;
    if (!s.recording) status("READY","ready");
  }

  function startRecording() {
    stopPlayback();
    s.macro = []; held.clear(); s.started = performance.now();
    s.recording = true;
    status("RECORDING","record");
    count(true);
  }

  function stopRecording() {
    if (!s.recording) return;
    s.recording = false;
    save();
    count(true);
  }

  function tick(now) {
    if (!s.playing) return;
    const elapsed = (now - s.playStart) * s.speed;
    while (s.index < s.macro.length && s.macro[s.index].time <= elapsed) {
      fire(s.macro[s.index++]);
    }
    if (s.index >= s.macro.length) {
      if (s.loop) {
        s.index = 0;
        s.playStart = now + 250;
        s.raf = requestAnimationFrame(tick);
      } else {
        s.playing = false;
        $("cl-watermark").hidden = true;
        status("FINISHED","ready");
      }
      return;
    }
    s.raf = requestAnimationFrame(tick);
  }

  function play() {
    if (!s.macro.length || s.recording) {
      status("NO MACRO","error"); return;
    }
    stopPlayback();
    s.playing = true; s.index = 0;
    $("cl-watermark").hidden = false;
    status("STARTING","play");
    s.timer = setTimeout(() => {
      if (!s.playing) return;
      s.playStart = performance.now();
      status("PLAYING","play");
      s.raf = requestAnimationFrame(tick);
    }, Math.max(0,s.delay));
  }

  function clearMacro() {
    stopPlayback(); s.recording=false; s.macro=[];
    localStorage.removeItem(KEY);
    status("CLEARED","ready"); count(true);
  }

  function exportMacro() {
    const blob = new Blob([JSON.stringify({format:"chromium-lite",version:"0.1.1",macro:s.macro},null,2)], {type:"text/plain"});
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=u; a.download="macro.chromium.txt"; document.body.appendChild(a);
    a.click(); a.remove(); URL.revokeObjectURL(u);
  }

  function importMacro(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(String(r.result));
        const m = Array.isArray(p) ? p : p.macro;
        if (!Array.isArray(m)) throw Error("Invalid macro");
        s.macro = m.filter(x => x && typeof x.time==="number" && (x.kind==="key"||x.kind==="mouse"));
        save(); count(true); status("IMPORTED","ready");
      } catch(e) { console.error(e); status("BAD FILE","error"); }
    };
    r.readAsText(file);
  }

  window.addEventListener("keydown", e => {
    if (s.mode!=="keyboard" || !controls.has(e.code) || held.has(e.code)) return;
    held.add(e.code); add({kind:"key",action:"keydown",code:e.code});
  }, true);

  window.addEventListener("keyup", e => {
    if (s.mode!=="keyboard" || !controls.has(e.code)) return;
    held.delete(e.code); add({kind:"key",action:"keyup",code:e.code});
  }, true);

  window.addEventListener("mousedown", e => {
    if (s.mode!=="mouse" || e.button!==0 || e.target.closest?.("#cl-panel")) return;
    add({kind:"mouse",action:"down"});
  }, true);

  window.addEventListener("mouseup", e => {
    if (s.mode!=="mouse" || e.button!==0 || e.target.closest?.("#cl-panel")) return;
    add({kind:"mouse",action:"up"});
  }, true);

  const style = document.createElement("style");
  style.textContent = `
  #cl-panel{position:fixed;top:12px;right:12px;z-index:2147483646;width:205px;padding:9px;background:rgba(17,20,25,.94);color:#f4f6f8;border:1px solid #5b6572;border-radius:9px;font:12px Arial;box-shadow:0 8px 22px #0008;user-select:none}
  #cl-title{font-weight:800;letter-spacing:1px;margin-bottom:7px}#cl-title span{float:right;color:#9da8b5;font-size:10px}
  #cl-info{display:flex;justify-content:space-between;padding:7px;margin-bottom:7px;background:#101318;border-radius:6px}
  #cl-status[data-mode=record]{color:#ff7b8b}#cl-status[data-mode=play]{color:#75c7ff}#cl-status[data-mode=error]{color:#ffc36c}
  .cl-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px}.cl-btn,.cl-input{min-height:30px;border:1px solid #56616f;border-radius:6px;background:#252c35;color:#f4f6f8;font:700 11px Arial}.cl-btn{cursor:pointer}.cl-red{background:#54252c}.cl-blue{background:#213f59}.cl-wide{width:100%;margin-bottom:6px}
  .cl-label{font-size:10px;color:#abb5c1;margin:3px 0}#cl-file{display:none}
  #cl-watermark{position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:2147483647;padding:6px 10px;background:#64151fe8;border:1px solid #ff7488;border-radius:999px;color:white;font:800 10px Arial;pointer-events:none}`;
  document.documentElement.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "cl-panel";
  panel.innerHTML = `
    <div id="cl-title">CHROMIUM LITE <span>v0.1.1</span></div>
    <div id="cl-info"><b id="cl-status">READY</b><span id="cl-count">0 inputs</span></div>
    <div class="cl-row"><button class="cl-btn cl-red" id="cl-record">RECORD</button><button class="cl-btn" id="cl-stop">STOP</button></div>
    <div class="cl-row"><button class="cl-btn cl-blue" id="cl-play">PLAY</button><label class="cl-btn" style="display:flex;align-items:center;justify-content:center;gap:4px"><input id="cl-loop" type="checkbox">LOOP</label></div>
    <div class="cl-label">Record input</div>
    <select class="cl-input cl-wide" id="cl-mode"><option value="keyboard">Keyboard only</option><option value="mouse">Mouse only</option></select>
    <div class="cl-label">Playback target</div>
    <select class="cl-input cl-wide" id="cl-target"><option value="window">Window</option><option value="document">Document</option><option value="canvas">Canvas</option></select>
    <div class="cl-row">
      <div><div class="cl-label">Speed</div><select class="cl-input" id="cl-speed" style="width:100%"><option>.5</option><option>.75</option><option selected>1</option><option>1.25</option><option>1.5</option></select></div>
      <div><div class="cl-label">Delay ms</div><input class="cl-input" id="cl-delay" type="number" value="500" min="0" step="100" style="width:100%"></div>
    </div>
    <div class="cl-row"><button class="cl-btn" id="cl-import">IMPORT</button><button class="cl-btn" id="cl-export">EXPORT</button></div>
    <div class="cl-row"><button class="cl-btn" id="cl-save">SAVE</button><button class="cl-btn" id="cl-clear">CLEAR</button></div>
    <input id="cl-file" type="file" accept=".txt,.json,.chromium">`;
  document.body.appendChild(panel);

  const wm = document.createElement("div");
  wm.id="cl-watermark"; wm.hidden=true; wm.textContent="CHROMIUM PLAYBACK — UNVERIFIED";
  document.body.appendChild(wm);

  $("cl-record").onclick=startRecording;
  $("cl-stop").onclick=()=>s.recording?stopRecording():stopPlayback();
  $("cl-play").onclick=play;
  $("cl-loop").onchange=e=>s.loop=e.target.checked;
  $("cl-speed").onchange=e=>s.speed=Number(e.target.value)||1;
  $("cl-delay").onchange=e=>s.delay=Math.max(0,Number(e.target.value)||0);
  $("cl-mode").onchange=e=>s.mode=e.target.value;
  $("cl-target").onchange=e=>s.target=e.target.value;
  $("cl-save").onclick=save;
  $("cl-clear").onclick=clearMacro;
  $("cl-export").onclick=exportMacro;
  $("cl-import").onclick=()=>$("cl-file").click();
  $("cl-file").onchange=e=>{const f=e.target.files?.[0];if(f)importMacro(f);e.target.value=""};

  load();
  $("cl-speed").value=String(s.speed); $("cl-delay").value=String(s.delay);
  $("cl-mode").value=s.mode; $("cl-target").value=s.target;
  count(true); status("READY","ready");

  window.ChromiumLite={state:s,startRecording,stopRecording,play,stopPlayback,save,clearMacro};
})();

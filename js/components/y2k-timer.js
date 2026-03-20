/**
 * y2k-timer.js — Floating Y2K Countdown Timer Web Component
 *
 * Usage:
 *   <script src="y2k-timer.js"></script>
 *   <y2k-timer></y2k-timer>
 *
 * Attributes:
 *   default-seconds="40"   — starting duration (default: 40)
 *   position="bottom-right" — corner: bottom-right | bottom-left | top-right | top-left (default: bottom-right)
 *
 * Example:
 *   <y2k-timer default-seconds="300" position="bottom-left"></y2k-timer>
 */

const Y2K_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Floating button ─────────────────────────────────────────── */
  #fab {
    position: fixed;
    z-index: 9998;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: #0a0a1a;
    border: 2px solid #00f5ff;
    box-shadow: 0 0 12px #00f5ff, 0 0 30px #00f5ff66;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 2px;
    transition: box-shadow 0.2s, transform 0.15s;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  #fab:hover { box-shadow: 0 0 18px #00f5ff, 0 0 50px #00f5ff88; transform: scale(1.07); }
  #fab:active { transform: scale(0.95); }

  #fab-time {
    font-family: 'Orbitron', monospace;
    font-size: 10px;
    font-weight: 900;
    color: #00f5ff;
    letter-spacing: 1px;
    line-height: 1;
  }
  #fab-icon {
    font-size: 18px;
    line-height: 1;
  }
  #fab.running #fab-icon { display: none; }
  #fab.running #fab-time { font-size: 11px; }
  #fab.done {
    border-color: #ff00cc;
    box-shadow: 0 0 12px #ff00cc, 0 0 30px #ff00cc66;
    animation: fabPulse 0.6s ease-in-out infinite alternate;
  }
  @keyframes fabPulse {
    from { box-shadow: 0 0 12px #ff00cc, 0 0 30px #ff00cc66; }
    to   { box-shadow: 0 0 24px #ff00cc, 0 0 60px #ff00ccaa; }
  }

  /* ── Panel ───────────────────────────────────────────────────── */
  #panel {
    position: fixed;
    z-index: 9999;
    width: min(360px, 92vw);
    transform-origin: var(--origin-x, right) var(--origin-y, bottom);
    transform: scale(0.85);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease;
  }
  #panel.open {
    transform: scale(1);
    opacity: 1;
    pointer-events: all;
  }

  /* position variants set via JS on host element */
  .pos-bottom-right { bottom: 80px; right: 16px; }
  .pos-bottom-left  { bottom: 80px; left: 16px; }
  .pos-top-right    { top: 80px;    right: 16px; }
  .pos-top-left     { top: 80px;    left: 16px; }

  .fab-bottom-right { bottom: 16px; right: 16px; }
  .fab-bottom-left  { bottom: 16px; left: 16px; }
  .fab-top-right    { top: 16px;    right: 16px; }
  .fab-top-left     { top: 16px;    left: 16px; }

  /* ── Title bar ───────────────────────────────────────────────── */
  #titlebar {
    background: linear-gradient(90deg, #000080, #1a1aff, #000080);
    border: 2px solid #00f5ff;
    border-bottom: none;
    padding: 5px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 0 8px #00f5ff, 0 0 20px #00f5ff88;
  }
  #titlebar-text {
    font-family: 'Orbitron', monospace;
    font-size: 10px;
    font-weight: 700;
    color: white;
    letter-spacing: 2px;
  }
  #close-btn {
    background: #ff5f57;
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    width: 14px; height: 14px;
    cursor: pointer;
    font-size: 8px;
    font-weight: 900;
    color: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    transition: filter 0.15s;
  }
  #close-btn:hover { filter: brightness(1.2); }

  /* ── Main panel body ─────────────────────────────────────────── */
  #body {
    background: linear-gradient(160deg, #050514 0%, #0a0a2a 50%, #060620 100%);
    border: 2px solid #00f5ff;
    border-top: 1px solid rgba(0,245,255,0.4);
    padding: 20px 18px 18px;
    box-shadow: 0 0 8px #00f5ff, 0 0 20px #00f5ff88, inset 0 0 60px rgba(0,245,255,0.03);
    position: relative;
    overflow: hidden;
  }
  #body::before, #body::after {
    content: '';
    position: absolute;
    width: 24px; height: 24px;
    border-color: #ff00cc;
    border-style: solid;
  }
  #body::before { top: 5px; right: 5px; border-width: 2px 2px 0 0; }
  #body::after  { bottom: 5px; left: 5px; border-width: 0 0 2px 2px; }

  /* ── Marquee ─────────────────────────────────────────────────── */
  .marquee-wrap {
    overflow: hidden;
    border: 1px solid rgba(0,245,255,0.2);
    padding: 3px 0;
    margin-bottom: 14px;
  }
  .marquee {
    display: inline-block;
    white-space: nowrap;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: #aaff00;
    animation: marquee 12s linear infinite;
    letter-spacing: 2px;
  }
  @keyframes marquee {
    from { transform: translateX(360px); }
    to   { transform: translateX(-100%); }
  }

  /* ── Status bar ──────────────────────────────────────────────── */
  .status-bar { display: flex; align-items: center; gap: 7px; margin-bottom: 14px; }
  .status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #555; box-shadow: none;
  }
  .status-dot.running { background: #aaff00; box-shadow: 0 0 8px #aaff00; animation: blink 1.2s infinite; }
  .status-dot.paused  { background: #ff6600; box-shadow: 0 0 8px #ff6600; }
  .status-dot.done    { background: #ff00cc; box-shadow: 0 0 8px #ff00cc; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .status-text {
    font-family: 'Orbitron', monospace;
    font-size: 8px; letter-spacing: 3px; text-transform: uppercase; color: #555;
  }
  .status-text.running { color: #aaff00; }
  .status-text.paused  { color: #ff6600; }
  .status-text.done    { color: #ff00cc; }

  /* ── Clock ───────────────────────────────────────────────────── */
  .clock-wrapper {
    text-align: center; margin: 6px 0 18px;
    cursor: pointer; user-select: none;
  }
  .clock-ring {
    display: inline-flex; align-items: center; justify-content: center;
    position: relative; padding: 14px;
  }
  .clock-ring svg {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  }
  .progress-track { fill: none; stroke: rgba(0,245,255,0.1); stroke-width: 3; }
  .progress-fill  {
    fill: none; stroke: #00f5ff; stroke-width: 3; stroke-linecap: round;
    filter: drop-shadow(0 0 5px #00f5ff);
    transition: stroke-dashoffset 1s linear;
    transform-origin: center; transform: rotate(-90deg);
  }
  .time-display {
    font-family: 'Orbitron', monospace;
    font-size: clamp(42px, 11vw, 58px);
    font-weight: 900; color: #00f5ff;
    text-shadow: 0 0 8px #00f5ff, 0 0 20px #00f5ff88;
    letter-spacing: 3px; line-height: 1;
    position: relative; z-index: 2;
    transition: color 0.3s, text-shadow 0.3s;
  }
  .time-display.done {
    color: #ff00cc;
    text-shadow: 0 0 8px #ff00cc, 0 0 20px #ff00cc88;
    animation: flashDone 0.5s ease-in-out infinite alternate;
  }
  @keyframes flashDone { from{opacity:1} to{opacity:0.45} }
  .click-hint {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: rgba(0,245,255,0.35);
    letter-spacing: 2px; margin-top: 5px; text-transform: uppercase;
  }

  /* ── Duration buttons ────────────────────────────────────────── */
  .duration-row { display: flex; gap: 5px; margin-bottom: 14px; }
  .dur-btn {
    flex: 1; padding: 6px 2px;
    background: transparent;
    border: 1px solid rgba(0,245,255,0.22);
    color: rgba(0,245,255,0.45);
    font-family: 'Orbitron', monospace; font-size: 8px; font-weight: 700;
    letter-spacing: 1px; cursor: pointer; position: relative; overflow: hidden;
    transition: all 0.2s;
  }
  .dur-btn::before {
    content: ''; position: absolute; inset: 0;
    background: #00f5ff; opacity: 0; transition: opacity 0.2s;
  }
  .dur-btn:hover::before, .dur-btn.active::before { opacity: 0.1; }
  .dur-btn.active { border-color: #00f5ff; color: #00f5ff; box-shadow: 0 0 8px rgba(0,245,255,0.25); }
  .dur-btn span { position: relative; z-index: 1; }

  /* ── Control buttons ─────────────────────────────────────────── */
  .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .btn {
    padding: 11px 8px; border: 2px solid; background: transparent;
    font-family: 'Orbitron', monospace; font-size: 9px; font-weight: 700;
    letter-spacing: 2px; cursor: pointer; text-transform: uppercase;
    position: relative; overflow: hidden; transition: all 0.15s;
    clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px));
  }
  .btn::before { content: ''; position: absolute; inset: 0; opacity: 0; transition: opacity 0.15s; }
  .btn:active { transform: scale(0.96); }
  .btn-start { border-color: #00f5ff; color: #00f5ff; }
  .btn-start::before { background: #00f5ff; }
  .btn-start:hover::before { opacity: 0.13; }
  .btn-start:hover { box-shadow: 0 0 10px #00f5ff88; }
  .btn-reset { border-color: #ff00cc; color: #ff00cc; }
  .btn-reset::before { background: #ff00cc; }
  .btn-reset:hover::before { opacity: 0.13; }
  .btn-reset:hover { box-shadow: 0 0 10px #ff00cc88; }

  /* ── Bottom bar ──────────────────────────────────────────────── */
  .bottom-bar {
    margin-top: 12px; border-top: 1px solid rgba(0,245,255,0.1);
    padding-top: 8px; display: flex; justify-content: space-between; align-items: center;
  }
  .bottom-label { font-family: 'Share Tech Mono', monospace; font-size: 7px; color: rgba(0,245,255,0.2); letter-spacing: 2px; }
  .pixel-logo   { font-family: 'Orbitron', monospace; font-size: 8px; color: #ff00cc; text-shadow: 0 0 6px #ff00cc; }
`;

class Y2KTimer extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._totalSeconds = 40;
    this._remaining = 40;
    this._running = false;
    this._interval = null;
    this._audioCtx = null;
    this._open = false;
  }

  static get observedAttributes() {
    return ['default-seconds', 'position', 'no-fab'];
  }

  connectedCallback() {
    const secs = parseInt(this.getAttribute('default-seconds') || '40', 10);
    this._totalSeconds = secs;
    this._remaining = secs;
    this._position = this.getAttribute('position') || 'bottom-right';
    this._render();
    this._bindEvents();
    this._updateUI();
    if (this.hasAttribute('no-fab')) {
      const fab = this._shadow.getElementById('fab');
      if (fab) fab.style.display = 'none';
    }
  }

  attributeChangedCallback() {
    if (this._shadow.innerHTML) {
      this._totalSeconds = parseInt(this.getAttribute('default-seconds') || '40', 10);
      this._remaining = this._totalSeconds;
      this._position = this.getAttribute('position') || 'bottom-right';
      this._updateUI();
    }
  }

  _render() {
    this._shadow.innerHTML = `
      <style>${Y2K_STYLES}</style>

      <!-- FAB trigger button -->
      <div id="fab" class="fab-${this._position}" title="Y2K Timer">
        <span id="fab-icon">⏱</span>
        <span id="fab-time"></span>
      </div>

      <!-- Expandable panel -->
      <div id="panel" class="pos-${this._position}">
        <div id="titlebar">
          <span id="titlebar-text">⚡ COUNTDOWN_SYS.EXE</span>
          <div id="close-btn" title="Close">✕</div>
        </div>
        <div id="body">
          <div class="marquee-wrap">
            <span class="marquee">★ TIMER v2.0 LOADED ★ Y2K COMPLIANT ★ SYSTEM READY ★ CLICK TO START ★ DON'T BLINK ★</span>
          </div>

          <div class="status-bar">
            <div class="status-dot" id="statusDot"></div>
            <span class="status-text" id="statusText">STANDBY</span>
          </div>

          <div class="clock-wrapper" id="clockWrapper" title="Click to start/pause">
            <div class="clock-ring">
              <svg viewBox="0 0 200 200">
                <circle class="progress-track" cx="100" cy="100" r="90"/>
                <circle class="progress-fill" cx="100" cy="100" r="90" id="progressFill"/>
              </svg>
              <div>
                <div class="time-display" id="timeDisplay">00:40</div>
                <div class="click-hint" id="clickHint">[ CLICK TO START ]</div>
              </div>
            </div>
          </div>

          <div class="duration-row" id="durationRow">
            <button class="dur-btn active" data-secs="40"><span>40 SEC</span></button>
            <button class="dur-btn" data-secs="120"><span>2 MIN</span></button>
            <button class="dur-btn" data-secs="300"><span>5 MIN</span></button>
          </div>

          <div class="controls">
            <button class="btn btn-start" id="startBtn">▶ START</button>
            <button class="btn btn-reset" id="resetBtn">↺ RESET</button>
          </div>

          <div class="bottom-bar">
            <span class="bottom-label">BUILD 2000.1.0</span>
            <span class="pixel-logo">★ Y2K ★</span>
            <span class="bottom-label">ALL SYSTEMS GO</span>
          </div>
        </div>
      </div>
    `;

    // Init progress ring
    const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const r = 90;
    this._circumference = 2 * Math.PI * r;
    const fill = this._shadow.getElementById('progressFill');
    fill.style.strokeDasharray = this._circumference;
    fill.style.strokeDashoffset = 0;
  }

  _bindEvents() {
    const s = this._shadow;

    // FAB toggles panel open/close
    s.getElementById('fab').addEventListener('click', () => this._togglePanel());

    // Close button
    s.getElementById('close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._togglePanel(false);
    });

    // Clock face = start/pause
    s.getElementById('clockWrapper').addEventListener('click', () => this._toggleTimer());

    // Start/Pause button
    s.getElementById('startBtn').addEventListener('click', () => this._toggleTimer());

    // Reset button
    s.getElementById('resetBtn').addEventListener('click', () => this._resetTimer());

    // Duration preset buttons
    s.getElementById('durationRow').addEventListener('click', (e) => {
      const btn = e.target.closest('.dur-btn');
      if (!btn) return;
      const secs = parseInt(btn.dataset.secs, 10);
      this._setDuration(secs, btn);
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (this._open && !this._shadow.contains(e.target) && !this.contains(e.target)) {
        this._togglePanel(false);
      }
    });
  }

  _togglePanel(force) {
    this._open = force !== undefined ? force : !this._open;
    const panel = this._shadow.getElementById('panel');
    panel.classList.toggle('open', this._open);
  }

  // ── Timer logic ───────────────────────────────────────────────────────────

  _toggleTimer() {
    if (this._remaining === 0) return;
    this._unlockAudio();
    this._running = !this._running;
    if (this._running) this._startCountdown();
    else this._stopCountdown();
    this._playTick();
    this._updateUI();
  }

  _startCountdown() {
    if (this._interval) clearInterval(this._interval);
    this._interval = setInterval(() => {
      this._remaining--;
      this._playClockTick();
      this._updateUI();
      if (this._remaining <= 0) {
        this._remaining = 0;
        this._stopCountdown();
        this._onDone();
      }
    }, 1000);
  }

  _stopCountdown() {
    this._running = false;
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  _resetTimer() {
    this._stopCountdown();
    this._remaining = this._totalSeconds;
    this._updateUI();
    this._playTick();
  }

  _setDuration(secs, clickedBtn) {
    this._stopCountdown();
    this._totalSeconds = secs;
    this._remaining = secs;
    this._shadow.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
    this._updateUI();
    this._playTick();
  }

  _onDone() {
    this._updateUI();
    this._playDoneSound();
    // Open panel so user sees it
    this._togglePanel(true);
    // Dispatch a custom event for host page to react to
    this.dispatchEvent(new CustomEvent('y2k-timer-done', { bubbles: true }));
  }

  // ── UI update ─────────────────────────────────────────────────────────────

  _fmt(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  _updateRing(fraction) {
    const fill = this._shadow.getElementById('progressFill');
    if (fill) fill.style.strokeDashoffset = this._circumference * (1 - fraction);
  }

  _updateUI() {
    const s = this._shadow;
    const td   = s.getElementById('timeDisplay');
    const dot  = s.getElementById('statusDot');
    const st   = s.getElementById('statusText');
    const btn  = s.getElementById('startBtn');
    const hint = s.getElementById('clickHint');
    const fab  = s.getElementById('fab');
    const fabTime = s.getElementById('fab-time');

    if (!td) return;

    const timeStr = this._fmt(this._remaining);
    td.textContent = timeStr;
    fabTime.textContent = timeStr;
    this._updateRing(this._remaining / this._totalSeconds);

    // FAB state
    fab.className = `fab-${this._position}` + (this._running ? ' running' : '') + (this._remaining === 0 ? ' done' : '');

    if (this._remaining === 0) {
      td.className = 'time-display done';
      dot.className = 'status-dot done';
      st.className  = 'status-text done';
      st.textContent = "TIME'S UP!";
      btn.textContent = '▶ START';
      hint.textContent = '[ RESET TO PLAY AGAIN ]';
    } else if (this._running) {
      td.className = 'time-display';
      dot.className = 'status-dot running';
      st.className  = 'status-text running';
      st.textContent = 'COUNTING DOWN';
      btn.textContent = '⏸ PAUSE';
      hint.textContent = '[ CLICK TO PAUSE ]';
    } else {
      td.className = 'time-display';
      if (this._remaining < this._totalSeconds) {
        dot.className = 'status-dot paused';
        st.className  = 'status-text paused';
        st.textContent = 'PAUSED';
        btn.textContent = '▶ RESUME';
        hint.textContent = '[ CLICK TO RESUME ]';
      } else {
        dot.className = 'status-dot';
        st.className  = 'status-text';
        st.textContent = 'STANDBY';
        btn.textContent = '▶ START';
        hint.textContent = '[ CLICK TO START ]';
      }
    }
  }

  // ── Audio ─────────────────────────────────────────────────────────────────

  _unlockAudio() {
    if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
  }

  _playTick() {
    // UI-click sound (button presses) — short blip
    try {
      this._unlockAudio();
      const ctx = this._audioCtx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.06, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.06);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.06);
    } catch(e) {}
  }

  _playClockTick() {
    // Layered mechanical clock tick — fired every second during countdown
    try {
      this._unlockAudio();
      const ctx = this._audioCtx;
      const now = ctx.currentTime;

      // Layer 1: noise burst — sharp "click" transient (mechanical impact texture)
      const bufferSize = Math.floor(ctx.sampleRate * 0.04); // 40ms of noise
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // High-pass so it's a crisp tick, not a thud
      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 1800;

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.28, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      noise.connect(hpf);
      hpf.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.04);

      // Layer 2: low-freq "thock" body — gives the tick some weight
      const body = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      body.type = 'sine';
      body.frequency.setValueAtTime(180, now);
      body.frequency.exponentialRampToValueAtTime(60, now + 0.05);
      bodyGain.gain.setValueAtTime(0.18, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      body.connect(bodyGain);
      bodyGain.connect(ctx.destination);
      body.start(now);
      body.stop(now + 0.07);

    } catch(e) {}
  }

  _playDoneSound() {
    try {
      this._unlockAudio();
      const ctx = this._audioCtx;
      const notes = [
        { freq: 523.25, time: 0,    dur: 0.18 },
        { freq: 659.25, time: 0.16, dur: 0.18 },
        { freq: 783.99, time: 0.32, dur: 0.18 },
        { freq: 1046.5, time: 0.48, dur: 0.35 },
        { freq: 1318.5, time: 0.70, dur: 0.12 },
        { freq: 1046.5, time: 0.82, dur: 0.12 },
        { freq: 1318.5, time: 0.94, dur: 0.12 },
        { freq: 1568.0, time: 1.06, dur: 0.4  },
      ];
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + time);
        osc.detune.setValueAtTime(5, now + time);
        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.18, now + time + 0.02);
        gain.gain.setValueAtTime(0.18, now + time + dur - 0.04);
        gain.gain.linearRampToValueAtTime(0, now + time + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + time); osc.stop(now + time + dur);
      });
      // Bass boom
      const bass = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bass.type = 'sawtooth';
      bass.frequency.setValueAtTime(130, ctx.currentTime);
      bass.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.3);
      bassGain.gain.setValueAtTime(0.3, ctx.currentTime);
      bassGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
      bass.connect(bassGain); bassGain.connect(ctx.destination);
      bass.start(ctx.currentTime); bass.stop(ctx.currentTime + 0.35);
    } catch(e) { console.warn('Y2KTimer audio error:', e); }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  /** Programmatically start the timer */
  start() { if (!this._running && this._remaining > 0) this._toggleTimer(); }
  /** Programmatically pause the timer */
  pause() { if (this._running) this._toggleTimer(); }
  /** Programmatically reset the timer */
  reset() { this._resetTimer(); }
}

customElements.define('y2k-timer', Y2KTimer);

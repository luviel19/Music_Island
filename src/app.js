// Ядро острова: интерфейс, перетаскивание, состояния. Про конкретные сервисы не знает —
// работает с активным провайдером (см. providers/registry.js).
const $ = (s, r = document) => r.querySelector(s);
const island = $('#island');
const bridge = window.electronBridge;

const S = {
  settings: { alwaysOnTop: true, hoverExpand: true, lockPosition: false, source: 'ym', mode: 'wave', shuffle: false },
  source: 'ym', mode: 'wave',
  open: false, sub: 'expanded', over: false, dragging: false, busy: false, volHold: 0,
};
const T = {
  track: null, status: '', playing: false, liked: false, shuffle: false,
  pos: 0, dur: 0, at: 0, volume: 0.7,
  queue: [], qCur: -1, authNeeded: false,
};
let P = null; // активный провайдер

const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const posNow = () => Math.min(T.dur || Infinity, T.pos + (T.playing ? performance.now() - T.at : 0));

async function call(name, ...args) {
  const r = await bridge.invoke(name, ...args);
  if (!r.ok) {
    if (r.error === 'auth' && P && name.startsWith(P.id + ':')) host.authRequired();
    throw new Error(r.error);
  }
  return r.data;
}

// ───────────────────── то, что видит провайдер ─────────────────────
const host = {
  call,
  // вызов без реакции на 'auth' (поиск по неактивным площадкам не должен открывать окно входа)
  async raw(name, ...args) {
    const r = await bridge.invoke(name, ...args);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  get settings() { return S.settings; },
  async setSetting(patch) { S.settings = await call('settings:set', patch); renderControls(); return S.settings; },
  isPlaying: () => T.playing,
  shuffleOn: () => T.shuffle,
  queueOpen: () => S.sub === 'queue',

  setTrack(track, status = '') {
    const changed = track?.id !== T.track?.id;
    T.track = track; T.status = status;
    if (changed) { T.pos = 0; T.at = performance.now(); T.dur = track?.durationMs || 0; T.liked = false; }
    setWaveFor(track);
    renderTrack(); renderDetails();
  },
  setPlaying(b) {
    if (b === T.playing) return;
    T.pos = posNow(); T.at = performance.now(); T.playing = b;
    renderPlay();
  },
  setProgress(pos, dur) {
    T.pos = pos; T.at = performance.now();
    if (dur) { T.dur = dur; $('#tDur').textContent = fmt(dur / 1000); }
    tick();
  },
  setVolume(v) {
    if (Date.now() < S.volHold) return;
    T.volume = v; renderVol();
  },
  setLiked(b) { T.liked = b; renderLike(); },
  setShuffle(b) { T.shuffle = b; renderControls(); },
  setQueue(items, cur = -1) { T.queue = items; T.qCur = cur; if (S.sub === 'queue') renderQueue(false); },
  flash(msg) { flash(msg); },
  setMode(id) { S.mode = id; call('settings:set', { mode: id }); renderControls(); },
  authRequired() {
    if (T.authNeeded) return;
    T.authNeeded = true;
    P.stop();
    host.setTrack(null, '');
    renderAuth(); applyState();
  },
};

// ───────────────────── состояние острова ─────────────────────
function applyState() {
  island.dataset.state = !S.open ? 'compact' : T.authNeeded ? 'auth' : S.sub;
  if (typeof Search !== 'undefined') Search.sync(island.dataset.state === 'search');
  // главному процессу нужен размер острова: свёрнутый можно прижать к самому углу, раскрытый должен целиком поместиться на экране
  const cs = getComputedStyle(island);
  bridge.send('win:box', parseFloat(cs.getPropertyValue('--w')) || 240, parseFloat(cs.getPropertyValue('--h')) || 38);
}
function setOpen(v) {
  S.open = v;
  if (!v) S.sub = 'expanded';
  applyState();
}
function setSub(v) {
  S.sub = v;
  if (v === 'queue') { T.queue = []; renderQueue(true); P.getQueue(); }
  if (v === 'eq') renderEq();
  if (v === 'tune') renderTune();
  applyState();
}

let openT, closeT;
function setOver(o, force) {
  if (o === S.over && !force) return;
  S.over = o;
  bridge.send('win:ignore', !o && !S.dragging && !S.busy);
  if (o) {
    clearTimeout(closeT);
    if (S.settings.hoverExpand && !S.open) openT = setTimeout(() => setOpen(true), 90);
  } else {
    clearTimeout(openT);
    closeT = setTimeout(() => { if (!S.over && !S.busy && !S.dragging) setOpen(false); }, 650);
  }
}
const evalOver = (x, y) => setOver(!!document.elementFromPoint(x, y)?.closest('#island, #menu'), true);
let lastMouse = { x: 0, y: 0 };
document.addEventListener('mousemove', (e) => { lastMouse = { x: e.clientX, y: e.clientY }; setOver(!!e.target.closest('#island, #menu')); });
document.addEventListener('mouseleave', () => setOver(false));

// ───────────────────── перетаскивание острова ─────────────────────
let pd = null, justDragged = false;
island.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || S.settings.lockPosition || e.target.closest('button, .bar, .qitem, .list, .sbox, .srow, .eq-bands, .eq-presets')) return;
  pd = { x: e.screenX, y: e.screenY, moved: false };
  island.setPointerCapture(e.pointerId);
});
island.addEventListener('pointermove', (e) => {
  if (!pd) return;
  if (!pd.moved && Math.hypot(e.screenX - pd.x, e.screenY - pd.y) > 4) {
    pd.moved = true; S.dragging = true;
    bridge.send('win:drag-start');
  }
  if (pd.moved) bridge.send('win:drag-move');
});
const endDrag = (e) => {
  if (!pd) return;
  if (pd.moved) { bridge.send('win:drag-end'); justDragged = true; setTimeout(() => (justDragged = false), 50); }
  pd = null; S.dragging = false;
  evalOver(e.clientX, e.clientY);
};
island.addEventListener('pointerup', endDrag);
island.addEventListener('pointercancel', endDrag);
island.addEventListener('click', () => { if (!justDragged && !S.open) setOpen(true); });

// ───────────────────── подсказки ─────────────────────
const tip = $('#tip'), stage = $('#stage');
// у края экрана раскрытый остров смещается внутрь на экран плавно, вместе со своей анимацией
bridge.on('shift', (dx, dy, instant) => {
  stage.classList.toggle('nofx', instant);
  stage.style.setProperty('--sx', dx + 'px'); stage.style.setProperty('--sy', dy + 'px');
});
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest('[data-tip]');
  if (!b) { tip.classList.remove('show'); return; }
  const r = b.getBoundingClientRect(), s = stage.getBoundingClientRect();
  tip.textContent = b.dataset.tip;
  tip.style.left = `${r.left + r.width / 2 - s.left}px`;
  tip.style.top = `${r.bottom - s.top + 6}px`;
  tip.classList.add('show');
});
island.addEventListener('mouseleave', () => tip.classList.remove('show'));

// ───────────────────── отрисовка ─────────────────────
function setCover(el, url) { if (url) el.src = url; else el.removeAttribute('src'); }

const DEFAULT_ACCENT = [255, 210, 31];
let ACC = DEFAULT_ACCENT;
const setAccent = (rgb) => { ACC = rgb; document.documentElement.style.setProperty('--accent', rgb.join(',')); };
let accentFor = null;
function ambient(url) {
  if (url === accentFor) return;
  accentFor = url;
  if (!url) return setAccent(DEFAULT_ACCENT);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (accentFor !== url) return;
    try {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const w = 0.15 + (mx ? (mx - mn) / mx : 0) * 3;
        r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
      }
      let rgb = [r / n, g / n, b / n];
      const m = Math.max(...rgb);
      if (m < 150) rgb = rgb.map((v) => v * (150 / Math.max(m, 1)));
      setAccent(rgb.map((v) => Math.min(255, Math.round(v))));
    } catch { setAccent(DEFAULT_ACCENT); }
  };
  img.onerror = () => setAccent(DEFAULT_ACCENT);
  img.src = url;
}

function renderTrack() {
  const t = T.track;
  if (!t) {
    $('#cTitle').textContent = T.authNeeded ? `Войти в ${P.name}` : P.name;
    $('#title').textContent = T.status || '—';
    $('#artist').innerHTML = '&nbsp;';
    setCover($('.cover-s'), null); setCover($('#cover'), null);
    $('#tCur').textContent = '0:00'; $('#tDur').textContent = '0:00';
    ambient(null);
    renderLike();
    return;
  }
  $('#cTitle').textContent = `${t.title} — ${t.artists}`;
  $('#title').textContent = t.title;
  $('#artist').textContent = t.artists;
  setCover($('.cover-s'), t.cover); setCover($('#cover'), t.cover);
  $('#tDur').textContent = fmt(T.dur / 1000);
  ambient(t.cover);
  renderLike();
}
function renderLike() { $('#like').classList.toggle('liked', !!T.track && T.liked); }
function renderPlay() {
  island.classList.toggle('playing', T.playing);
  $('#playIcon').setAttribute('href', T.playing ? '#i-pause' : '#i-play');
}
function tick() {
  if (!T.track) return;
  $('#tCur').textContent = fmt(posNow() / 1000);
}
setInterval(tick, 250);

// ───────────────────── волна и эквалайзер ─────────────────────
const waveCache = new Map();
function seeded(str) {
  let h = 2166136261;
  for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
// Правдоподобная «форма песни», когда настоящих данных нет: тихое начало, куплеты и припевы, спад в конце
function fakeWave(t, n = 120) {
  const r = seeded(`${t.id}|${t.title}`);
  const secs = 7 + Math.floor(r() * 4);
  const lv = Array.from({ length: secs }, (_, k) => {
    if (k === 0) return 0.28 + r() * 0.12;
    if (k === secs - 1) return 0.22 + r() * 0.1;
    return (k % 2 ? 0.5 : 0.82) + (r() - 0.5) * 0.28;
  });
  return Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * (secs - 1), a = Math.floor(x), f = x - a;
    const e = lv[a] + ((lv[Math.min(secs - 1, a + 1)] - lv[a]) * (1 - Math.cos(f * Math.PI))) / 2;
    return Math.min(1, Math.max(0.1, e * (0.62 + 0.38 * r()) * (i % 4 === 0 ? 1 : 0.9)));
  });
}
function setWaveFor(t) {
  if (!t) { T.wave = null; return; }
  if (waveCache.has(t.id)) { T.wave = waveCache.get(t.id); return; }
  T.wave = fakeWave(t);
  waveCache.set(t.id, T.wave);
  if (waveCache.size > 80) waveCache.delete(waveCache.keys().next().value);
  if (P.wave && t.waveUrl) {
    P.wave(t).then((w) => {
      if (!w?.length) return;
      waveCache.set(t.id, w);
      if (T.track?.id === t.id) T.wave = w;
    }).catch(() => {});
  }
}
const waveStats = new WeakMap();
function statsOf(d) {
  let st = waveStats.get(d);
  if (!st) {
    const sorted = Float32Array.from(d).sort();
    const lo = sorted[Math.floor(sorted.length * 0.08)], hi = sorted[Math.floor(sorted.length * 0.96)];
    st = { lo, span: Math.max(0.05, hi - lo) };
    waveStats.set(d, st);
  }
  return st;
}
// растягиваем диапазон: у сжатых треков (SoundCloud) палочки иначе почти одной высоты
const contrast = (v, st) => 0.16 + 0.84 * Math.pow(Math.min(1, Math.max(0, (v - st.lo) / st.span)), 1.15);

function waveAt(p, span = 0.02) { // средняя «энергия» вокруг доли p
  const d = T.wave;
  if (!d) return 0.6;
  const a = Math.max(0, Math.floor((p - span) * d.length)), b = Math.min(d.length, Math.ceil((p + span) * d.length) + 1);
  let sum = 0, k = 0;
  for (let i = a; i < b; i++) { sum += d[i]; k++; }
  return k ? contrast(sum / k, statsOf(d)) : 0.6;
}
function sizeCanvas(c) {
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return null;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
  return { w, h, dpr };
}
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };

const waveCv = $('#wave'), waveG = waveCv.getContext('2d');
let hoverX = null;
function drawWave(now) {
  const sz = sizeCanvas(waveCv); if (!sz) return;
  const { w, h, dpr } = sz, g = waveG;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const bw = 3, gap = 2.4, n = Math.max(12, Math.floor((w + gap) / (bw + gap)));
  const step = w / n, p = T.dur ? Math.min(1, posNow() / T.dur) : 0, head = p * n;
  const d = T.wave;
  for (let i = 0; i < n; i++) {
    // плавная выборка формы под текущее число палочек
    let v = 0.14;
    if (d) {
      const a = Math.floor((i / n) * d.length), b = Math.max(a + 1, Math.floor(((i + 1) / n) * d.length));
      let sum = 0; for (let k = a; k < b; k++) sum += d[k];
      v = contrast(sum / (b - a), statsOf(d));
    }
    const dist = Math.abs(i + 0.5 - head);
    let amp = v;
    if (T.playing && dist < 4.5) amp = Math.min(1, amp + 0.2 * (1 - dist / 4.5) * (0.5 + 0.5 * Math.sin(now / 120 + i * 0.9)));
    const bh = Math.max(3.5, amp * (h - 4)), x = i * step + (step - bw) / 2, y = (h - bh) / 2;
    const played = i + 0.5 < head;
    const hovered = hoverX != null && x + bw / 2 <= hoverX && !played;
    g.shadowBlur = 0;
    if (dist < 0.8 && T.track) {
      g.fillStyle = `rgb(${ACC.join(',')})`; g.shadowColor = `rgba(${ACC.join(',')},.9)`; g.shadowBlur = 10;
    } else if (played) g.fillStyle = '#fff';
    else g.fillStyle = hovered ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.22)';
    rr(g, x, y, bw, bh, bw / 2);
  }
  g.shadowBlur = 0;
}

const eqCv = $('#eq'), eqG = eqCv.getContext('2d');
const EQ_N = 7;
const eqV = Array(EQ_N).fill(0.1);
const eqPh = [0, 1.3, 2.9, 4.1, 5.2, 0.8, 3.6];
const eqSp = [4.1, 6.3, 5.0, 7.7, 4.6, 6.9, 5.4];

// оттенок обложки → второй цвет для градиента по палочкам (сдвиг по тону, чуть светлее)
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
const hsl = (h, s, l, a = 1) => `hsla(${Math.round(h) % 360},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${a})`;

function drawEq(now) {
  const sz = sizeCanvas(eqCv); if (!sz) return;
  const { w, h, dpr } = sz, g = eqG;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const [hue, sat0] = rgb2hsl(ACC);
  const sat = Math.min(1, Math.max(0.55, sat0 + 0.15));
  const energy = T.playing ? waveAt(T.dur ? posNow() / T.dur : 0) : 0;
  const bw = 3.1, pad = 4, gap = (w - pad * 2 - bw * EQ_N) / (EQ_N - 1), t = now / 1000; // pad — запас под свечение
  const mid = (EQ_N - 1) / 2;
  g.shadowBlur = 0;
  for (let i = 0; i < EQ_N; i++) {
    // центральные палочки живее краевых — получается «дышащий» силуэт, а не ровный гребень
    const shape = 1 - 0.38 * Math.abs(i - mid) / mid;
    const wob = 0.12 + 0.88 * Math.pow(Math.abs(Math.sin(t * eqSp[i] + eqPh[i])) * (0.62 + 0.38 * Math.sin(t * 2.3 + i * 1.7)), 1.15);
    const target = T.playing ? 0.2 + 0.8 * Math.min(1, 0.45 + 0.55 * energy) * wob * shape : 0.0;
    eqV[i] += (target - eqV[i]) * (T.playing ? 0.32 : 0.18);
    const bh = Math.max(bw, eqV[i] * (h - 6)), x = pad + i * (bw + gap), y = (h - bh) / 2;
    const k = i / (EQ_N - 1);
    const top = hsl(hue + 38 * k, sat, 0.74), bottom = hsl(hue + 38 * k - 10, sat, 0.52);
    const alpha = T.playing ? 1 : 0.5;
    const grad = g.createLinearGradient(0, y, 0, y + bh);
    grad.addColorStop(0, top); grad.addColorStop(1, bottom);
    g.globalAlpha = alpha;
    g.shadowColor = hsl(hue + 38 * k, sat, 0.6, T.playing ? 0.5 : 0.0);
    g.shadowBlur = T.playing ? 4 : 0;
    g.fillStyle = grad;
    rr(g, x, y, bw, bh, bw / 2);
  }
  g.globalAlpha = 1; g.shadowBlur = 0;
}

// ───────────────────── фон: светодиодная решётка ─────────────────────
const bgCv = $('#bgeq'), bgG = bgCv.getContext('2d');
const BG_W = 14, BG_H = 6.6, BG_GAP = 2;
const BG_COLS = Math.floor(460 / (BG_W + BG_GAP)), BG_ROWS = Math.floor(198 / (BG_H + BG_GAP));
const bgLv = Array(BG_COLS).fill(0), bgPeak = Array(BG_COLS).fill(0);
const bgPh = Array.from({ length: BG_COLS }, (_, i) => (i * 2.399) % 6.283);
const bgSp = Array.from({ length: BG_COLS }, (_, i) => 2.2 + ((i * 7) % 11) * 0.55);

function drawBg(now) {
  const g = bgG, W = bgCv.width, H = bgCv.height;
  g.clearRect(0, 0, W, H);
  const t = now / 1000;
  const e = T.playing ? waveAt(T.dur ? posNow() / T.dur : 0, 0.015) : 0;
  const [hue, sat0] = rgb2hsl(ACC);
  const sat = Math.min(1, Math.max(0.6, sat0 + 0.12));
  const cell = BG_W + BG_GAP, stepY = BG_H + BG_GAP;
  const x0 = (W - BG_COLS * cell + BG_GAP) / 2;
  const targets = new Array(BG_COLS);
  for (let c = 0; c < BG_COLS; c++) {
    const k = c / (BG_COLS - 1);
    const env = 1.05 - 0.38 * Math.pow(k, 0.85) + 0.2 * Math.sin(c * 0.55 + t * 0.9); // «басы» слева, мягкий плавающий горб
    const wob = 0.2 + 0.8 * Math.pow(Math.abs(Math.sin(t * bgSp[c] + bgPh[c])), 1.2);
    targets[c] = T.playing ? Math.min(1, Math.max(0.05, (0.2 + 0.8 * Math.min(1, 0.4 + 0.6 * e)) * env * (0.35 + 0.65 * wob))) : 0;
  }
  for (let c = 0; c < BG_COLS; c++) { // соседи слегка тянут друг друга — получается спектр, а не шум
    const sm = (targets[Math.max(0, c - 1)] + targets[c] * 2 + targets[Math.min(BG_COLS - 1, c + 1)]) / 4;
    bgLv[c] += (sm - bgLv[c]) * (sm > bgLv[c] ? 0.38 : 0.1);
    bgPeak[c] = Math.max(bgPeak[c] - 0.011, bgLv[c]);
  }
  const maxRows = BG_ROWS * 0.95;
  for (let c = 0; c < BG_COLS; c++) {
    const lit = Math.round(bgLv[c] * maxRows), peakRow = Math.round(bgPeak[c] * maxRows);
    for (let r = 0; r < BG_ROWS; r++) {
      const x = x0 + c * cell, y = H - (r + 1) * stepY + BG_GAP;
      const f = r / BG_ROWS;
      const dim = y > 88 && y < 144 ? 0.5 : 1; // за дорожкой-волной приглушаем, чтобы палочки читались
      if (r < lit) {
        // снизу — насыщеннее и темнее, выше — светлее и со сдвигом тона; плавное затухание к верху
        g.fillStyle = hsl(hue - 8 + 46 * f, Math.min(1, sat + 0.1), 0.5 + 0.22 * f, (0.7 - 0.38 * f) * dim);
      } else if (r === peakRow && peakRow > lit) {
        g.fillStyle = hsl(hue + 46 * f, sat, 0.8, 0.55 * dim);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.028)';
      }
      g.fillRect(x, y, BG_W, BG_H);
    }
  }
}

// на паузе перерисовываем только то, что изменилось (иначе процессор зря крутит анимацию)
let lastSig = '';
const settling = (st) => (st === 'compact' ? eqV.some((v) => v > 0.02) : bgLv.some((v, i) => v > 0.02 || bgPeak[i] > 0.02));
setInterval(() => {
  const st = island.dataset.state, now = performance.now();
  if (st !== 'compact' && st !== 'expanded') return;
  if (!T.playing && !settling(st)) {
    const sig = `${st}|${T.track?.id}|${Math.round(T.pos)}|${hoverX}|${ACC}|${T.wave?.length}|${T.wave?.[7]}`;
    if (sig === lastSig) return;
    lastSig = sig;
  } else lastSig = '';
  if (st === 'compact') drawEq(now);
  else if (st === 'expanded') { drawBg(now); drawWave(now); }
}, 33);

let modesFor = null;
function renderControls() {
  const seg = $('#seg');
  if (modesFor !== P.id) {
    modesFor = P.id;
    seg.replaceChildren();
    for (const m of P.modes) {
      const b = document.createElement('button');
      b.className = 'ib'; b.dataset.mode = m.id; b.dataset.tip = m.tip;
      b.innerHTML = `<svg><use href="#${m.icon}"/></svg>`;
      b.onclick = () => setMode(m.id);
      seg.append(b);
    }
    if (P.tune) {
      const b = document.createElement('button');
      b.className = 'ib'; b.id = 'tuneBtn'; b.dataset.tip = P.tune.tip;
      b.innerHTML = '<svg><use href="#i-tune"/></svg>';
      b.onclick = () => setSub('tune');
      seg.append(b);
    }
  }
  $('#tuneBtn')?.classList.toggle('tuned', Object.values(S.settings.tune?.[P.id] || {}).some(Boolean));
  seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === S.mode));
  $('#pin').classList.toggle('on', S.settings.alwaysOnTop);
  const sh = P.caps.shuffle;
  $('#shuffle').style.display = sh === true || (sh === 'fav' && S.mode === 'fav') ? '' : 'none';
  $('#shuffle').classList.toggle('on', T.shuffle);
  const cp = P.caps;
  $('#like').style.display = cp.like === false ? 'none' : '';
  $('#toQueue').style.display = cp.queue === false ? 'none' : '';
  $('#vol').style.display = cp.volume === false ? 'none' : '';
  $('#toPanel').style.display = cp.panel ? '' : 'none';
  $('#toInfo').style.display = cp.info === false ? 'none' : '';
  seg.style.display = P.modes.length ? '' : 'none';
  $('#toEq').style.display = cp.eq === false ? 'none' : '';
  $('#toEq').classList.toggle('on', !!S.settings.eq?.on && cp.eq !== false);
  $('#srcIcon').setAttribute('href', `#${P.icon}`);
  $('#src').dataset.tip = `Источник: ${P.name}`;
  $('#qTitle').textContent = `${P.name} · далее`;
}
function renderDetails() {
  const t = T.track; if (!t) return;
  $('#dOpen').style.display = P.trackUrl(t) ? '' : 'none';
  setCover($('#dCover'), t.cover);
  $('#dTitle').textContent = t.title;
  $('#dArtist').textContent = t.artists;
  const rows = [['Альбом', t.album], ['Год', t.year], ['Жанр', t.genre], ['Плеер', t.app], ['Длительность', fmt(t.durationMs / 1000)]];
  const dl = $('#dList'); dl.replaceChildren();
  for (const [k, v] of rows) {
    if (!v) continue;
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = v; dd.title = v;
    dl.append(dt, dd);
  }
}
function renderQueue(scrollTop) {
  const list = $('#list');
  list.replaceChildren();
  if (!T.queue.length) { list.innerHTML = '<div class="empty">Очередь пуста</div>'; return; }
  T.queue.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'qitem' + (i === T.qCur ? ' now' : '');
    const img = document.createElement('img'); if (t.cover) img.src = t.cover;
    const meta = document.createElement('div'); meta.className = 'q-meta';
    const a = document.createElement('div'); a.className = 'q-t'; a.textContent = t.title;
    const b = document.createElement('div'); b.className = 'q-a'; b.textContent = t.artists;
    meta.append(a, b);
    const d = document.createElement('div'); d.className = 'q-d'; d.textContent = t.durationMs ? fmt(t.durationMs / 1000) : '';
    row.append(img, meta, d);
    row.addEventListener('click', () => P.playFromQueue(i));
    list.append(row);
  });
  if (scrollTop) list.scrollTop = 0;
}

let flashT;
function flash(msg) {
  $('#artist').textContent = msg;
  clearTimeout(flashT);
  flashT = setTimeout(() => { $('#artist').textContent = T.track ? T.track.artists : ' '; }, 3500);
}

// ───────────────────── кнопки ─────────────────────
const guard = (fn) => (...a) => {
  try {
    const r = fn(...a);
    if (r?.catch) r.catch((e) => e.message !== 'auth' && flash(e.message));
  } catch (e) { flash(e.message); }
};

$('#play').onclick = guard(() => P.toggle());
$('#next').onclick = guard(() => P.next());
$('#prev').onclick = guard(() => P.prev());
$('#shuffle').onclick = guard(() => P.toggleShuffle());
$('#like').onclick = async () => {
  if (!T.track) return;
  const on = !T.liked;
  T.liked = on; renderLike();
  const btn = $('#like'); btn.classList.remove('pop'); void btn.offsetWidth; if (on) btn.classList.add('pop');
  try { await P.like(on); } catch { T.liked = !on; renderLike(); }
};
$('#pin').onclick = () => host.setSetting({ alwaysOnTop: !S.settings.alwaysOnTop });
$('#toQueue').onclick = () => setSub('queue');
$('#toInfo').onclick = () => setSub('details');
$('#toSearch').onclick = () => setSub('search');
$('#toEq').onclick = () => setSub('eq');
$('#toPanel').onclick = () => P.togglePanel?.().catch((e) => flash(e.message));
// ───────────────────── выпадающий список источников ─────────────────────
const menu = $('#menu');
function renderMenu() {
  menu.replaceChildren();
  for (const p of Providers.list) {
    const b = document.createElement('button');
    b.className = 'mi' + (p === P ? ' sel' : '');
    b.setAttribute('role', 'option');
    b.innerHTML = `<svg class="mi-ico"><use href="#${p.icon}"/></svg><span class="mi-txt"><div class="mi-name"></div><div class="mi-hint"></div></span><svg class="mi-ck"><use href="#i-check"/></svg>`;
    b.querySelector('.mi-name').textContent = p.name;
    b.querySelector('.mi-hint').textContent = p.hint || '';
    b.onclick = () => { closeMenu(); setSource(p.id); };
    menu.append(b);
  }
}
function openMenu() {
  renderMenu();
  const r = $('#src').getBoundingClientRect(), s = stage.getBoundingClientRect();
  menu.style.left = `${Math.max(-s.left + 8, r.left - s.left - 6)}px`;
  menu.style.top = `${island.getBoundingClientRect().bottom - s.top + 10}px`;
  tip.classList.remove('show');
  menu.classList.add('show');
  S.menuOpen = true; S.busy = true;
}
function closeMenu() {
  if (!S.menuOpen) return;
  menu.classList.remove('show');
  S.menuOpen = false; S.busy = false;
  evalOver(lastMouse.x, lastMouse.y);
}
$('#src').onclick = () => (S.menuOpen ? closeMenu() : openMenu());
document.addEventListener('pointerdown', (e) => { if (S.menuOpen && !e.target.closest('#menu, #src')) closeMenu(); });
document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => setSub('expanded')));
$('#dOpen').onclick = () => { const u = T.track && P.trackUrl(T.track); if (u) call('open:external', u); };

function setMode(mode) {
  S.mode = mode;
  call('settings:set', { mode });
  renderControls();
  if (!T.authNeeded) guard(() => P.setMode(mode, true))();
}

// колесо: на свёрнутом острове листает треки, на раскрытом меняет громкость
island.addEventListener('wheel', (e) => {
  const st = island.dataset.state;
  if (st === 'expanded') { e.preventDefault(); if (P.caps.volume !== false) setVol(T.volume + (e.deltaY < 0 ? 0.05 : -0.05)); return; }
  if (st !== 'compact') return;
  e.preventDefault();
  guard(() => (e.deltaY > 0 ? P.next() : P.prev()))();
}, { passive: false });

// перемотка
const bar = $('#bar');
function seekFrom(e) {
  if (!T.dur) return;
  const r = bar.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  T.pos = ratio * T.dur; T.at = performance.now(); tick();
  guard(() => P.seek(T.pos))();
}
bar.addEventListener('pointerdown', (e) => { S.busy = true; bar.setPointerCapture(e.pointerId); seekFrom(e); });
bar.addEventListener('pointermove', (e) => { hoverX = e.clientX - bar.getBoundingClientRect().left; });
bar.addEventListener('pointerleave', () => { hoverX = null; });
bar.addEventListener('pointermove', (e) => { if (S.busy && bar.hasPointerCapture(e.pointerId)) seekFrom(e); });
bar.addEventListener('pointerup', (e) => { S.busy = false; evalOver(e.clientX, e.clientY); });

// ───────────────────── громкость ─────────────────────
let volT, lastVol = 0.7;
function renderVol() {
  $('#vfill').style.width = `${T.volume * 100}%`;
  $('#vPct').textContent = Math.round(T.volume * 100);
  $('#volIcon').setAttribute('href', T.volume === 0 ? '#i-mute' : '#i-vol');
}
function showVol() {
  $('#volrow').classList.add('show'); $('.l-expanded').classList.add('vol-open');
  clearTimeout(volT);
  volT = setTimeout(() => { if (!S.busy) { $('#volrow').classList.remove('show'); $('.l-expanded').classList.remove('vol-open'); } }, 2500);
}
function setVol(v) {
  T.volume = Math.min(1, Math.max(0, v));
  if (T.volume > 0) lastVol = T.volume;
  S.volHold = Date.now() + 2500; // не даём провайдеру перебить значение устаревшим
  guard(() => P.setVolume(T.volume))();
  renderVol(); showVol();
}
const vbar = $('#vbar');
const volFrom = (e) => { const r = vbar.getBoundingClientRect(); setVol((e.clientX - r.left) / r.width); };
vbar.addEventListener('pointerdown', (e) => { S.busy = true; vbar.setPointerCapture(e.pointerId); volFrom(e); });
vbar.addEventListener('pointermove', (e) => { if (S.busy && vbar.hasPointerCapture(e.pointerId)) volFrom(e); });
vbar.addEventListener('pointerup', (e) => { S.busy = false; showVol(); evalOver(e.clientX, e.clientY); });
$('#vol').onclick = () => {
  const row = $('#volrow');
  if (row.classList.contains('show')) { row.classList.remove('show'); $('.l-expanded').classList.remove('vol-open'); } else { renderVol(); showVol(); }
};
$('#mute').onclick = () => setVol(T.volume === 0 ? lastVol || 0.7 : 0);

// ───────────────────── вход ─────────────────────
function renderAuth() {
  const v = P.authView();
  $('#authTitle').textContent = v.title;
  $('#authText').textContent = v.text;
  $('#login').textContent = v.primary;
  $('#paste').textContent = v.secondary || '';
  $('#paste').style.display = v.secondary ? '' : 'none';
  $('#devlink').textContent = v.link?.label || '';
  $('#devlink').style.display = v.link ? 'block' : 'none';
  $('#devlink').onclick = () => v.link && call('open:external', v.link.url);
  island.toggleAttribute('data-tall', !!v.tall);
  $('#authErr').textContent = '';
  // без входа в текущую площадку можно сразу выбрать другую
  const alt = $('#altSrc'); alt.replaceChildren();
  for (const p of Providers.list.filter((x) => x !== P)) {
    const b = document.createElement('button');
    b.className = 'alt'; b.dataset.tip = p.name;
    b.innerHTML = `<svg><use href="#${p.icon}"/></svg>`;
    b.onclick = () => setSource(p.id);
    alt.append(b);
  }
}
async function authAction(kind) {
  S.busy = true;
  try {
    const done = await P.authAction(kind);
    if (done) { T.authNeeded = false; applyState(); await startActive(); } else renderAuth();
  } catch (e) { if (e.message !== 'auth') $('#authErr').textContent = e.message; }
  S.busy = false;
}
$('#login').onclick = () => authAction('primary');
$('#paste').onclick = () => authAction('secondary');

// ───────────────────── эквалайзер ─────────────────────
const Fx = window.AudioFx;
let eqSaveT;
const eqState = () => Fx.normState(S.settings.eq);
function eqApply(next, save = true) {
  S.settings.eq = Fx.normState(next);
  Fx.set?.(S.settings.eq);
  renderEqValues();
  $('#toEq').classList.toggle('on', S.settings.eq.on && P.caps.eq !== false);
  if (!save) return;
  clearTimeout(eqSaveT); // пока тянут ползунок, файл настроек не трогаем
  eqSaveT = setTimeout(() => call('settings:set', { eq: S.settings.eq }).catch(() => {}), 500);
}
const presetOf = (id) => Fx.PRESETS.find((p) => p.id === id)
  || (id?.startsWith('c:') && eqState().custom.find((c) => `c:${c.name}` === id));
function pickPreset(id) {
  const p = presetOf(id); if (!p) return;
  eqApply({ ...eqState(), on: true, preset: id, bands: [...p.bands], preamp: p.preamp });
  renderEqPresets();
}

function renderEqPresets() {
  const st = eqState(), box = $('#eqPresets');
  box.replaceChildren();
  const chip = (id, name, del) => {
    const b = document.createElement('button');
    b.className = 'pchip' + (st.preset === id ? ' sel' : '');
    b.textContent = name;
    b.onclick = () => pickPreset(id);
    if (del) {
      const x = document.createElement('span');
      x.className = 'x'; x.dataset.tip = 'Удалить пресет';
      x.innerHTML = '<svg><use href="#i-close"/></svg>';
      x.onclick = (e) => {
        e.stopPropagation();
        const cur = eqState();
        eqApply({ ...cur, custom: cur.custom.filter((c) => `c:${c.name}` !== id), preset: cur.preset === id ? 'custom' : cur.preset });
        renderEqPresets();
      };
      b.append(x);
    }
    box.append(b);
  };
  if (st.preset === 'custom') chip('custom', 'Свой');
  for (const p of Fx.PRESETS) chip(p.id, p.name);
  for (const c of st.custom) chip(`c:${c.name}`, c.name, true);
  const add = document.createElement('button');
  add.className = 'pchip add'; add.dataset.tip = 'Сохранить как пресет';
  add.innerHTML = '<svg><use href="#i-plus"/></svg>';
  add.onclick = () => askPresetName(add);
  box.append(add);
}
// имя нового пресета: на время ввода окно берёт фокус (обычно остров его не забирает)
function askPresetName(addBtn) {
  const inp = document.createElement('input');
  inp.className = 'pname'; inp.maxLength = 24; inp.placeholder = 'Название пресета';
  addBtn.replaceWith(inp);
  inp.scrollIntoView({ inline: 'end' });
  S.busy = true;
  bridge.send('win:focusable', true);
  setTimeout(() => inp.focus(), 60);
  let done = false;
  const finish = (ok) => {
    if (done) return; done = true;
    S.busy = false;
    bridge.send('win:focusable', false);
    const name = inp.value.trim();
    if (ok && name) {
      const cur = eqState();
      const custom = [...cur.custom.filter((c) => c.name !== name), { name, bands: cur.bands, preamp: cur.preamp }];
      eqApply({ ...cur, custom, preset: `c:${name}` });
    }
    renderEqPresets();
    evalOver(lastMouse.x, lastMouse.y);
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}

const eqKnobs = [];
function buildEqBands() {
  const box = $('#eqBands');
  Fx.FREQS.forEach((f, i) => {
    const col = document.createElement('div'); col.className = 'eqb';
    col.innerHTML = '<span class="v"></span><div class="track"><div class="fill"></div><b class="knob"></b></div><span class="f"></span>';
    col.querySelector('.f').textContent = Fx.label(f);
    const tr = col.querySelector('.track');
    const fromY = (e) => {
      const r = tr.getBoundingClientRect();
      const k = 1 - 2 * Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); // верх +1, низ −1
      const bands = [...eqState().bands];
      bands[i] = Fx.clampDb(k * Fx.MAX_DB);
      eqApply({ ...eqState(), on: true, preset: 'custom', bands });
    };
    tr.addEventListener('pointerdown', (e) => {
      S.busy = true; tr.classList.add('drag'); tr.setPointerCapture(e.pointerId); fromY(e);
      renderEqPresets(); // появляется чип «Свой»
    });
    tr.addEventListener('pointermove', (e) => { if (tr.hasPointerCapture(e.pointerId)) fromY(e); });
    tr.addEventListener('pointerup', (e) => { S.busy = false; tr.classList.remove('drag'); evalOver(e.clientX, e.clientY); });
    tr.addEventListener('dblclick', () => {
      const bands = [...eqState().bands]; bands[i] = 0;
      eqApply({ ...eqState(), preset: 'custom', bands }); renderEqPresets();
    });
    eqKnobs.push({ v: col.querySelector('.v'), fill: col.querySelector('.fill'), knob: col.querySelector('.knob') });
    box.append(col);
  });
  const pre = $('#eqPre');
  const preFrom = (e) => {
    const r = pre.getBoundingClientRect();
    const k = 2 * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) - 1;
    eqApply({ ...eqState(), on: true, preamp: Fx.clampDb(k * Fx.MAX_DB) });
  };
  pre.addEventListener('pointerdown', (e) => { S.busy = true; pre.setPointerCapture(e.pointerId); preFrom(e); });
  pre.addEventListener('pointermove', (e) => { if (pre.hasPointerCapture(e.pointerId)) preFrom(e); });
  pre.addEventListener('pointerup', (e) => { S.busy = false; evalOver(e.clientX, e.clientY); });
  pre.addEventListener('dblclick', () => eqApply({ ...eqState(), preamp: 0 }));
}
const dbText = (v) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')}`;
function renderEqValues() {
  const st = eqState();
  eqKnobs.forEach((k, i) => {
    const v = st.bands[i], pos = 50 - (v / Fx.MAX_DB) * 50; // % сверху
    k.v.textContent = dbText(v);
    k.knob.style.top = `${pos}%`;
    k.fill.style.top = `${Math.min(pos, 50)}%`;
    k.fill.style.height = `${Math.abs(pos - 50)}%`;
  });
  const pp = 50 + (st.preamp / Fx.MAX_DB) * 50;
  $('#eqPreKnob').style.left = `${pp}%`;
  $('#eqPreFill').style.left = `${Math.min(pp, 50)}%`;
  $('#eqPreFill').style.width = `${Math.abs(pp - 50)}%`;
  $('#eqPreV').textContent = `${dbText(st.preamp)} дБ`;
  $('#eqOn').classList.toggle('on', st.on);
  $('.l-eq').classList.toggle('disabled', !st.on);
}
function renderEq() {
  const na = P.caps.eq === false;
  $('.l-eq').classList.toggle('na', na);
  $('#eqNote').textContent = na
    ? `${P.name}: звук играет ${P.id === 'yt' ? 'плеер YouTube' : 'другое приложение'}, эквалайзер острова к нему не подключить. Он работает в Яндекс Музыке и SoundCloud.`
    : '';
  renderEqPresets(); renderEqValues();
}
$('#eqOn').onclick = () => eqApply({ ...eqState(), on: !eqState().on });
$('#eqReset').onclick = () => pickPreset('flat');
buildEqBands();

// ───────────────────── настройка волны ─────────────────────
let tuneGroups = null, tuneFor = null, tuneRestartT;
async function renderTune() {
  const body = $('#tuneBody');
  if (!P.tune) { setSub('expanded'); return; }
  $('#tuneTitle').textContent = P.tune.title;
  if (tuneFor !== P.id) {
    tuneFor = P.id; tuneGroups = null;
    body.innerHTML = '<div class="empty">Загрузка…</div>';
    const pid = P.id;
    try {
      const g = await P.tune.groups(host);
      if (P.id !== pid) return;
      tuneGroups = g;
    } catch (e) {
      tuneFor = null;
      body.innerHTML = '<div class="empty"></div>';
      body.firstChild.textContent = e.message === 'auth' ? 'Нужен вход' : `Не удалось загрузить: ${e.message}`;
      return;
    }
  }
  if (!tuneGroups) return; // ещё грузится
  const val = S.settings.tune?.[P.id] || {};
  body.replaceChildren();
  for (const g of tuneGroups) {
    const box = document.createElement('div'); box.className = 'tgroup';
    const h = document.createElement('h4'); h.textContent = g.label;
    const chips = document.createElement('div'); chips.className = 'tchips';
    for (const o of g.options) {
      const b = document.createElement('button');
      b.className = 'pchip' + ((val[g.id] || '') === o.id ? ' sel' : '');
      b.textContent = o.label;
      b.onclick = () => setTune(g.id, o.id);
      chips.append(b);
    }
    box.append(h, chips); body.append(box);
  }
}
// выбор сохраняем сразу, а волну перезапускаем чуть позже: можно успеть выбрать несколько пунктов
function setTune(group, id) {
  const tune = { ...(S.settings.tune || {}) };
  tune[P.id] = { ...(tune[P.id] || {}), [group]: id };
  S.settings.tune = tune;
  call('settings:set', { tune }).catch(() => {});
  renderTune(); renderControls();
  clearTimeout(tuneRestartT);
  const p = P;
  tuneRestartT = setTimeout(() => { if (P === p && !T.authNeeded) setMode(p.tune.mode); }, 700);
}

// ───────────────────── смена источника ─────────────────────
async function startActive() {
  const id = P.id;
  let r;
  try { r = await P.start(host, S.mode); } catch (e) { if (e.message === 'auth') r = 'auth'; else { flash(e.message); r = 'ok'; } }
  if (P.id !== id) return; // успели переключить
  if (r === 'auth') host.authRequired();
}
function switchTo(id) {
  const next = Providers.get(id);
  if (!next || next === P) return false;
  P.stop();
  P = next; S.source = id;
  call('settings:set', { source: id });
  if (!P.modes.some((m) => m.id === S.mode)) S.mode = P.modes[0]?.id ?? '';
  T.authNeeded = false; T.playing = false; T.shuffle = false;
  host.setTrack(null, '');
  renderPlay(); renderControls(); renderVol(); applyState();
  return true;
}
async function setSource(id) {
  if (switchTo(id)) await startActive();
}
// трек из поиска: переключаемся на нужную площадку (если надо) и играем его
async function playResult(pid, track, list) {
  setSub('expanded');
  switchTo(pid);
  S.mode = ''; renderControls();
  T.authNeeded = false;
  try { await P.open(host, track, list); } catch (e) { if (e.message !== 'auth') flash(e.message); }
}

// ───────────────────── обновление приложения ─────────────────────
let autoCloseT;
function showUpdate(info) {
  T.update = info;
  island.classList.toggle('has-update', !!info);
  if (!info) return;
  $('#updText').textContent = `Music Island ${info.version} (у вас ${info.current})`;
  if (T.authNeeded || S.sub !== 'expanded') return;
  setOpen(true); setSub('update');
  clearTimeout(autoCloseT);
  autoCloseT = setTimeout(() => { if (!S.over && !S.busy) setOpen(false); }, 12000); // само закроется, если не наводили мышь
}
$('#updGo').onclick = () => { call('update:open'); setSub('expanded'); };
$('#updLater').onclick = () => setSub('expanded');
$('#updChip').onclick = () => setSub('update');
bridge.on('update', showUpdate);

// ───────────────────── команды из трея ─────────────────────
bridge.on('settings', (s) => { S.settings = s; renderControls(); });
bridge.on('cmd', (c) => {
  const [name, arg] = c.split(':');
  if (name === 'toggle') guard(() => P.toggle())();
  else if (name === 'next') guard(() => P.next())();
  else if (name === 'prev') guard(() => P.prev())();
  else if (name === 'source') setSource(arg);
  else if (name === 'mode') { if (P.modes.some((m) => m.id === arg)) setMode(arg); }
  else if (name === 'logout' && arg === P.id) { T.authNeeded = false; host.authRequired(); }
});

// ───────────────────── старт ─────────────────────
(async function init() {
  S.settings = await call('settings:get');
  S.source = S.settings.source;
  P = Providers.get(S.source) || Providers.list[0];
  S.mode = P.modes.some((m) => m.id === S.settings.mode) ? S.settings.mode : P.modes[0]?.id ?? '';
  Fx.set?.(eqState());
  renderControls(); renderTrack(); renderPlay(); renderVol(); applyState();
  call('update:get').then((u) => u && showUpdate(u)).catch(() => {});
  await startActive();
})();

// Эквалайзер: 10 полос + предусилитель поверх Web Audio. Работает для плееров на <audio>
// (Яндекс Музыка, SoundCloud). YouTube играет в чужом iframe, системный плеер — в другом приложении:
// их звук сюда не попадает.
//
// Цепочка: <audio> → предусилитель → 10 фильтров → ограничитель → выход.
// Выключенный эквалайзер обходит цепочку целиком: <audio> → выход.
(() => {
  const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const MAX_DB = 12;
  const flat = () => FREQS.map(() => 0);

  // встроенные пресеты: усиление по полосам 31 Гц … 16 кГц
  const PRESETS = [
    { id: 'flat', name: 'Ровно', bands: flat(), preamp: 0 },
    { id: 'bass', name: 'Бас', bands: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0], preamp: -4 },
    { id: 'rock', name: 'Рок', bands: [5, 4, 2, -1, -2, -1, 1, 3, 4, 4], preamp: -3 },
    { id: 'pop', name: 'Поп', bands: [-1, 1, 3, 4, 3, 0, -1, -1, 0, 1], preamp: -2 },
    { id: 'vocal', name: 'Вокал', bands: [-3, -2, -1, 1, 4, 5, 4, 2, 0, -1], preamp: -3 },
    { id: 'electro', name: 'Электроника', bands: [6, 5, 1, 0, -2, 1, 0, 2, 5, 6], preamp: -4 },
    { id: 'jazz', name: 'Джаз', bands: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3], preamp: -2 },
    { id: 'classic', name: 'Классика', bands: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4], preamp: -2 },
    { id: 'night', name: 'Тихо ночью', bands: [-4, -3, -1, 0, 1, 2, 2, 1, -1, -3], preamp: 0 },
  ];

  const clampDb = (v, max = MAX_DB) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(-max, n)) * 2) / 2 : 0; // шаг 0,5 дБ
  };
  const normBands = (b) => FREQS.map((_, i) => clampDb(Array.isArray(b) ? b[i] : 0));
  const normCustom = (list) => (Array.isArray(list) ? list : [])
    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
    .slice(0, 20)
    .map((p) => ({ name: p.name.trim().slice(0, 24), bands: normBands(p.bands), preamp: clampDb(p.preamp) }));
  // состояние из настроек — всегда приводим к правильному виду, даже если файл испорчен
  const normState = (s) => ({
    on: !!s?.on,
    preset: typeof s?.preset === 'string' ? s.preset : 'flat',
    bands: normBands(s?.bands),
    preamp: clampDb(s?.preamp),
    custom: normCustom(s?.custom),
  });
  const label = (f) => (f >= 1000 ? `${f / 1000}k` : String(f));

  const api = { FREQS, MAX_DB, PRESETS, flat, clampDb, normBands, normState, label };

  // ── звук (только в окне, в тестах не нужен) ──
  if (typeof window !== 'undefined' && window.AudioContext) {
    let ctx = null, pre, filters, limiter;
    const sources = new Map(); // <audio> → MediaElementSource
    let state = normState({});

    function graph() {
      if (ctx) return;
      ctx = new AudioContext({ latencyHint: 'playback' });
      pre = ctx.createGain();
      filters = FREQS.map((f, i) => {
        const b = ctx.createBiquadFilter();
        b.type = i === 0 ? 'lowshelf' : i === FREQS.length - 1 ? 'highshelf' : 'peaking';
        b.frequency.value = f;
        b.Q.value = 1.41;
        return b;
      });
      limiter = ctx.createDynamicsCompressor(); // мягкий ограничитель: подъём полос не хрипит
      limiter.threshold.value = -1.5; limiter.knee.value = 1; limiter.ratio.value = 20;
      limiter.attack.value = 0.003; limiter.release.value = 0.12;
      pre.connect(filters[0]);
      filters.forEach((b, i) => b.connect(filters[i + 1] || limiter));
      limiter.connect(ctx.destination);
      // браузер может приостановить контекст: будим его при каждом запуске звука
      const wake = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };
      document.addEventListener('pointerdown', wake);
      api._wake = wake;
    }

    function route(src) {
      src.disconnect();
      src.connect(state.on ? pre : ctx.destination);
    }
    function applyGains() {
      if (!ctx) return;
      const t = ctx.currentTime;
      pre.gain.setTargetAtTime(Math.pow(10, state.preamp / 20), t, 0.02);
      filters.forEach((b, i) => b.gain.setTargetAtTime(state.bands[i], t, 0.02));
    }

    // подключить <audio> к эквалайзеру (один раз на элемент)
    api.attach = (el) => {
      if (sources.has(el)) return;
      el.crossOrigin = 'anonymous'; // без этого Web Audio получает тишину от чужих доменов
      graph();
      const src = ctx.createMediaElementSource(el);
      sources.set(el, src);
      route(src);
      applyGains();
      el.addEventListener('play', () => api._wake());
    };
    api.set = (s) => {
      const wasOn = state.on;
      state = normState(s);
      applyGains();
      if (ctx && wasOn !== state.on) sources.forEach(route);
    };
    api.get = () => state;
  }

  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.AudioFx = api;
})();

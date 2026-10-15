// Общая логика провайдеров с очередью треков (SoundCloud, YouTube, Звук): очередь, переходы,
// догрузка, лайки, ошибки. Конкретный сервис задаёт только cfg, воспроизведение — engine.
//
// cfg: { id, name, hint, icon, modes, caps, tune?, search?(host, q) -> tracks, related?(host, track) -> tracks,
//        needsAuth(mode) -> bool, isAuthed(host) -> Promise<bool>,
//        load(host, mode) -> Promise<{ tracks, more?: (queue) => Promise<tracks> }>,
//        like?(host, track, on), trackUrl(track), authView(), authAction(kind, host),
//        engine?: movieEngine, resolveUrl?(host, track) -> Promise<url> }
//
// engine: { init(host, cb), load(track, host), pause(), resume(), isPaused(), seek(ms), volume(v), stop() }
// cb: { playing(bool), progress(posMs, durMs), ended(), error() }

window.audioEngine = (resolveUrl) => {
  const audio = new Audio();
  audio.preload = 'auto';
  window.AudioFx?.attach?.(audio);
  let cb = null, on = false, volume = 0.7;
  audio.addEventListener('playing', () => on && cb.playing(true));
  audio.addEventListener('pause', () => on && cb.playing(false));
  audio.addEventListener('ended', () => on && cb.ended());
  audio.addEventListener('error', () => on && audio.src && cb.error());
  audio.addEventListener('timeupdate', () => on && cb.progress(audio.currentTime * 1000, isFinite(audio.duration) ? audio.duration * 1000 : 0));
  return {
    init(_host, callbacks) { cb = callbacks; on = true; audio.volume = volume; },
    async load(track, host) {
      audio.pause();
      const url = await resolveUrl(host, track);
      audio.src = url;
      await audio.play();
    },
    pause: () => audio.pause(),
    resume: () => audio.play(),
    isPaused: () => audio.paused,
    seek(ms) { if (audio.src) audio.currentTime = ms / 1000; },
    volume(v) { volume = v; audio.volume = v; },
    stop() { on = false; audio.pause(); audio.removeAttribute('src'); },
  };
};

// YouTube: скрытый iframe со страницы http://localhost:порт (см. providers/yt.js и yt-frame.html)
window.youtubeEngine = () => {
  let frame = null, cb = null, ready = false, state = -1, volume = 70, on = false;
  const outbox = [];
  const send = (m) => (ready ? frame.contentWindow.postMessage(m, '*') : outbox.push(m));
  addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || !e.data?.yt) return;
    const m = e.data.yt;
    if (m.t === 'ready') { ready = true; send({ c: 'vol', v: volume }); outbox.splice(0).forEach(send); }
    else if (!on) return;
    else if (m.t === 'state') {
      state = m.s;
      if (m.s === 1) cb.playing(true);
      else if (m.s === 2) cb.playing(false);
      else if (m.s === 0) cb.ended();
    } else if (m.t === 'time') { if (m.s === 1 || m.s === 2) cb.progress(m.p * 1000, m.d * 1000); }
    else if (m.t === 'error') cb.error(m.c);
  });
  return {
    async init(host, callbacks) {
      cb = callbacks; on = true;
      if (frame) return;
      const port = await host.call('yt:port');
      frame = document.createElement('iframe');
      frame.allow = 'autoplay; encrypted-media';
      frame.style.cssText = 'position:fixed;left:-400px;top:0;width:200px;height:200px;border:0;pointer-events:none';
      frame.src = `http://localhost:${port}/yt.html`;
      document.body.append(frame);
    },
    async load(track) { send({ c: 'load', id: track.id }); },
    pause: () => send({ c: 'pause' }),
    resume: () => send({ c: 'play' }),
    isPaused: () => state !== 1,
    seek: (ms) => send({ c: 'seek', s: ms / 1000 }),
    volume(v) { volume = v * 100; send({ c: 'vol', v: volume }); },
    stop() { on = false; send({ c: 'stop' }); },
  };
};

window.makeQueueProvider = (cfg) => {
  const engine = cfg.engine || window.audioEngine(cfg.resolveUrl);
  let host = null, active = false;
  const Q = { queue: [], idx: -1, mode: null, status: '', more: null, loadSeq: 0, playSeq: 0, errStreak: 0, loadingMore: false, base: 0, loadedId: null };
  const cur = () => Q.queue[Q.idx];
  const quiet = (p) => p.catch(() => {});

  function publish() {
    const t = cur() || null;
    host.setTrack(t, t ? '' : Q.status);
    host.setLiked(!!t?.liked);
    if (host.queueOpen()) pushQueue();
  }
  function pushQueue() {
    Q.base = Math.max(0, Q.idx);
    host.setQueue(Q.queue.slice(Q.base, Q.idx + 40), Q.idx - Q.base);
  }

  async function loadMode(mode, autoplay) {
    const seq = ++Q.loadSeq;
    Q.mode = mode; Q.status = 'Загрузка…';
    Q.queue = []; Q.idx = -1; Q.more = null; Q.loadedId = null;
    engine.stop(); engine.init(host, callbacks);
    host.setPlaying(false); publish();
    try {
      const r = await cfg.load(host, mode);
      if (seq !== Q.loadSeq) return;
      Q.queue = r.tracks.filter((t) => t.available !== false);
      Q.more = r.more || null;
      if (!Q.queue.length) { Q.status = 'Ничего не найдено'; publish(); return; }
      Q.status = ''; Q.idx = 0; publish();
      if (autoplay) play(0);
    } catch (e) {
      if (seq !== Q.loadSeq || e.message === 'auth') return;
      Q.status = e.message; publish();
      host.flash(e.message);
    }
  }

  async function ensureMore() {
    if (Q.loadingMore || !Q.more || Q.queue.length - Q.idx > 3) return;
    Q.loadingMore = true;
    const seq = Q.loadSeq;
    try {
      const add = await Q.more(Q.queue);
      if (seq !== Q.loadSeq) return;
      const have = new Set(Q.queue.map((t) => t.id));
      Q.queue.push(...add.filter((t) => t.available !== false && !have.has(t.id)));
      if (Q.idx > 30) { Q.queue.splice(0, Q.idx - 10); Q.idx = 10; }
    } catch { /* повторим позже */ } finally {
      Q.loadingMore = false;
      if (host.queueOpen()) pushQueue();
    }
  }

  async function play(i) {
    const t = Q.queue[i]; if (!t) return;
    const seq = ++Q.playSeq;
    Q.idx = i; publish();
    host.setPlaying(false);
    try {
      await engine.load(t, host);
      if (seq !== Q.playSeq) return;
      Q.loadedId = t.id;
    } catch (e) {
      if (seq !== Q.playSeq || e.message === 'auth') return;
      skip();
    }
    ensureMore();
  }
  function skip() {
    if (++Q.errStreak < 5) next(false);
    else { Q.errStreak = 0; host.flash('Не удалось воспроизвести'); }
  }
  function next() {
    if (Q.idx + 1 < Q.queue.length) play(Q.idx + 1);
    else ensureMore().then(() => { if (Q.idx + 1 < Q.queue.length) play(Q.idx + 1); });
  }

  const callbacks = {
    playing(b) { if (b) Q.errStreak = 0; host.setPlaying(b); },
    progress: (p, d) => host.setProgress(p, d),
    ended: () => next(),
    error: () => skip(),
  };

  return {
    id: cfg.id, name: cfg.name, hint: cfg.hint, icon: cfg.icon, modes: cfg.modes, caps: cfg.caps, tune: cfg.tune,

    async start(h, mode) {
      host = h; active = true;
      if (cfg.needsAuth?.(mode) && !(await cfg.isAuthed(host))) return 'auth';
      await loadMode(mode, false);
      return 'ok';
    },
    // запуск конкретного трека из поиска: он первый, дальше — остальные результаты и «похожие»
    async open(h, track, list) {
      host = h; active = true;
      Q.loadSeq++; Q.playSeq++;
      Q.mode = null; Q.status = ''; Q.loadedId = null; Q.loadingMore = false;
      Q.more = cfg.related ? (queue) => cfg.related(host, queue[queue.length - 1]) : null;
      Q.queue = [track, ...list.filter((t) => t.id !== track.id && t.available !== false)];
      Q.idx = 0;
      engine.stop(); engine.init(host, callbacks);
      host.setPlaying(false); publish();
      play(0);
    },
    search: cfg.search,
    stop() { active = false; Q.loadSeq++; Q.playSeq++; engine.stop(); Q.queue = []; Q.idx = -1; },

    async setMode(mode, autoplay) {
      if (cfg.needsAuth?.(mode) && !(await cfg.isAuthed(host))) { host.authRequired(); return; }
      await loadMode(mode, autoplay);
    },
    toggle() {
      const t = cur();
      if (!t) return loadMode(Q.mode, true);
      if (Q.loadedId !== t.id) return play(Q.idx);
      engine.isPaused() ? engine.resume() : engine.pause();
    },
    next: () => next(),
    prev() { if (Q.idx <= 0) return engine.seek(0); play(Q.idx - 1); },
    seek: (ms) => engine.seek(ms),
    setVolume: (v) => engine.volume(v),
    async like(on) {
      const t = cur(); if (!t || !cfg.like) return;
      t.liked = on;
      try { await cfg.like(host, t, on); } catch (e) { t.liked = !on; throw e; }
    },
    toggleShuffle() {},
    getQueue: () => pushQueue(),
    playFromQueue: (i) => play(Q.base + i),
    trackUrl: cfg.trackUrl,
    wave: cfg.wave && ((t) => cfg.wave(t, host)),
    authView: cfg.authView,
    authAction: (kind) => cfg.authAction(kind, host),
    _active: () => active,
  };
};

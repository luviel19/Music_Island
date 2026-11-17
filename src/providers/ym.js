// Яндекс Музыка: свой плеер (<audio>), «Моя волна» и «Избранное».
Providers.register((() => {
  // два <audio>: пока играет один, второй заранее готовит следующий трек (без паузы между песнями и для кроссфейда)
  const els = [new Audio(), new Audio()];
  let audio = els[0];
  for (const el of els) { el.preload = 'auto'; window.AudioFx?.attach?.(el); }
  const on = (type, fn) => els.forEach((el) => el.addEventListener(type, (e) => { if (el === audio) fn(e); }));

  let host = null, active = false;
  let volume = 0.7;
  try { volume = Math.min(1, Math.max(0, parseFloat(localStorage.getItem('vol') ?? '0.7'))); } catch { /* ignore */ }
  let playback = null;
  const resumeKey = 'ym:resume';
  let lastSavedAt = 0;
  const Q = {
    queue: [], idx: -1, batchId: null, status: '',
    favIds: [], favLoaded: 0, liked: new Set(),
    loadSeq: 0, playSeq: 0, loadedId: null, loadingMore: false,
    mode: 'wave', base: 0, session: null, // session — id сессии волны с настройками
  };
  let listShuf = 0; // перемешивание списка из поиска: 0 — нет, 1 — обычное, 2 — умное
  // настройка волны: { группа: сид } из настроек приложения; пусто — обычная «Моя волна»
  const tuneValue = () => host.settings.tune?.ym || {};
  const tuned = () => Object.values(tuneValue()).some(Boolean);
  const cur = () => Q.queue[Q.idx];
  const quiet = (p) => p.catch(() => {});
  const shuffleArr = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function readResume() {
    try {
      const saved = JSON.parse(localStorage.getItem(resumeKey));
      if (saved?.track?.id && Number.isFinite(saved.position) && saved.position >= 0) return saved;
    } catch { /* storage unavailable */ }
    return null;
  }

  function saveResume(force = false) {
    if (!playback || (!force && Date.now() - lastSavedAt < 2000)) return;
    const { track, position } = playback;
    try {
      localStorage.setItem(resumeKey, JSON.stringify({ track, position }));
      lastSavedAt = Date.now();
    } catch { /* storage unavailable */ }
  }

  function showResume(saved) {
    const existing = Q.queue.findIndex((track) => track.id === saved.track.id);
    if (existing >= 0) Q.queue.splice(existing, 1);
    Q.queue.unshift(saved.track);
    Q.idx = 0;
    playback = { ...saved, retries: 0, started: true, failed: true, wantsPlay: false, restored: true };
    publish();
    host.setProgress(saved.position * 1000, saved.track.durationMs);
    host.setPlaybackStatus('resume');
  }

  function publish() {
    const t = cur() || null;
    host.setTrack(t, t ? '' : Q.status);
    host.setLiked(!!t && Q.liked.has(t.id));
    if (host.queueOpen()) pushQueue();
  }
  function pushQueue() {
    Q.base = Math.max(0, Q.idx);
    host.setQueue(Q.queue.slice(Q.base, Q.idx + 40), Q.idx - Q.base);
  }

  async function refreshLikes() {
    try { const ids = await host.call('ym:favIds'); Q.liked = new Set(ids); publish(); return ids; } catch { return []; }
  }

  let seedTrack = null;
  let trackSeed = null; // «волна по песне»: сид track:<id> вместо обычной волны
  async function loadMode(mode, autoplay = false, saved = null, seed = null) {
    if (mode === 'search') mode = 'wave';
    trackSeed = mode === 'wave' ? seed : null;
    const seq = ++Q.loadSeq;
    saveResume(true);
    Q.playSeq++; playback = null;
    host.setPlaybackStatus(null);
    Q.mode = mode; Q.status = 'Загрузка…';
    Q.queue = []; Q.idx = -1; Q.loadedId = null;
    Q.session = null; Q.batchId = null; Q.favIds = []; Q.favLoaded = 0;
    resetAudio();
    host.setShuffleAvail?.(false);
    host.setPlaying(false); publish();
    try {
      if (mode === 'wave' && (trackSeed || tuned())) {
        const r = await host.call('ym:tunedWave', trackSeed ? { seeds: [trackSeed] } : { value: tuneValue() });
        if (seq !== Q.loadSeq) return;
        Q.session = r.sessionId; Q.batchId = r.batchId;
        Q.queue = r.tracks.filter((t) => t.available);
        if (trackSeed && seedTrack) Q.queue = [seedTrack, ...Q.queue.filter((t) => t.id !== seedTrack.id)];
        feedback('radioStarted');
        refreshLikes();
      } else if (mode === 'wave') {
        const r = await host.call('ym:wave');
        if (seq !== Q.loadSeq) return;
        Q.session = null; Q.batchId = r.batchId;
        Q.queue = r.tracks.filter((t) => t.available);
        feedback('radioStarted');
        refreshLikes();
      } else {
        const ids = await refreshLikes();
        if (seq !== Q.loadSeq) return;
        Q.favIds = host.settings.shuffle ? shuffleArr(ids) : ids;
        Q.favLoaded = 0;
        await loadMoreFav(seq);
        if (seq !== Q.loadSeq) return;
      }
      if (saved) return showResume(saved);
      if (!Q.queue.length) { Q.status = mode === 'fav' ? 'В избранном пока пусто' : 'Не удалось получить треки'; publish(); return; }
      Q.status = '';
      Q.idx = 0;
      publish();
      if (autoplay) playIndex(0, true);
    } catch (e) {
      if (seq !== Q.loadSeq || e.message === 'auth') return;
      if (saved) return showResume(saved);
      Q.status = 'Ошибка сети — нажмите ▶';
      publish();
    }
  }

  async function loadMoreFav(seq = Q.loadSeq) {
    if (Q.favLoaded >= Q.favIds.length) return;
    const chunk = Q.favIds.slice(Q.favLoaded, Q.favLoaded + 50);
    Q.favLoaded += chunk.length;
    const tracks = await host.call('ym:tracks', chunk);
    if (seq !== Q.loadSeq) return;
    Q.queue.push(...tracks.filter((t) => t.available));
  }

  async function ensureMore() {
    if (Q.loadingMore) return;
    const seq = Q.loadSeq;
    try {
      if (Q.mode === 'wave' && Q.queue.length - Q.idx <= 3) {
        Q.loadingMore = true;
        const last = Q.queue[Q.queue.length - 1];
        const r = Q.session
          ? await host.call('ym:tunedMore', { sessionId: Q.session, queue: Q.queue.slice(-20).map((t) => t.id) })
          : await host.call('ym:wave', last?.id);
        if (seq !== Q.loadSeq) return;
        Q.batchId = r.batchId;
        const have = new Set(Q.queue.map((t) => t.id));
        Q.queue.push(...r.tracks.filter((t) => t.available && !have.has(t.id)));
        if (Q.idx > 30) { Q.queue.splice(0, Q.idx - 10); Q.idx = 10; }
      } else if (Q.mode === 'search' && Q.queue.length - Q.idx <= 3) {
        Q.loadingMore = true;
        const add = await host.call('ym:similar', Q.queue[Q.queue.length - 1].id);
        if (seq !== Q.loadSeq) return;
        const have = new Set(Q.queue.map((t) => t.id));
        Q.queue.push(...add.filter((t) => !have.has(t.id)));
      } else if (Q.mode === 'fav' && Q.idx >= Q.queue.length - 5 && Q.favLoaded < Q.favIds.length) {
        Q.loadingMore = true;
        await loadMoreFav(seq);
      }
    } catch { /* повторим на следующем треке */ } finally {
      Q.loadingMore = false;
      if (host.queueOpen()) pushQueue();
    }
  }

  // «Умное перемешивание»: в избранном при включённом shuffle после каждого любимого трека играет похожий на него, затем снова любимый
  let smart = false; // «умный» режим выбран (запоминается между запусками)
  try { smart = localStorage.getItem('ym:smart') === '1'; } catch { /* storage unavailable */ }
  const smartOn = () => (Q.mode === 'search' ? listShuf === 2 : smart && !!host.settings.shuffle);
  async function addSimilar(t) {
    if ((Q.mode !== 'fav' && Q.mode !== 'search') || !smartOn() || t.smart || Q.queue[Q.idx + 1]?.smart) return;
    const seq = Q.loadSeq;
    try {
      const add = await host.call('ym:similar', t.id);
      if (seq !== Q.loadSeq || cur()?.id !== t.id || Q.queue[Q.idx + 1]?.smart) return;
      const have = new Set(Q.queue.map((x) => x.id));
      const pool = add.filter((x) => !Q.liked.has(x.id) && !have.has(x.id)).slice(0, 5);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!pick) return;
      Q.queue.splice(Q.idx + 1, 0, { ...pick, smart: true });
      dropPre();
      if (host.queueOpen()) pushQueue();
    } catch { /* без похожего просто играет следующий любимый */ }
  }


  // ── без пауз между песнями и кроссфейд ──
  // В конце трека второй <audio> заранее получает следующий; потом он либо сразу подхватывает звук (gapless),
  // либо плавно перекрывает конец текущего (кроссфейд, если выбрана длительность).
  let xfade = 0; // секунд перекрытия; 0 — выключен
  try { xfade = Math.min(12, Math.max(0, parseInt(localStorage.getItem('ym:xfade') || '0', 10) || 0)); } catch { /* storage unavailable */ }
  let seekT = null, seekPending = false;
  let pre = null; // { id, el, failed } — подготовленный следующий трек
  let xf = null;  // идёт перекрытие: { old, timer }
  const spare = () => (audio === els[0] ? els[1] : els[0]);
  function clearEl(el) { try { el.pause(); el.removeAttribute('src'); } catch { /* ignore */ } }
  function dropPre() { if (pre) { clearEl(pre.el); pre = null; } }
  function endXf() {
    if (!xf) return;
    clearInterval(xf.timer);
    clearEl(xf.old);
    xf = null;
    els.forEach((el) => { el.volume = volume; });
  }
  function resetAudio() { dropPre(); endXf(); els.forEach(clearEl); }
  async function prepareNext() {
    if (pre || xf || !active || !playback || playback.failed) return;
    const nt = Q.queue[Q.idx + 1];
    if (!nt || nt.id === cur()?.id) return;
    const mine = pre = { id: nt.id, el: spare(), failed: false };
    const seq = Q.playSeq;
    try {
      const url = await host.call('ym:url', nt.id);
      if (pre !== mine || seq !== Q.playSeq) return;
      mine.el.volume = volume;
      mine.el.src = url;
      mine.el.load();
    } catch { if (pre === mine) mine.failed = true; }
  }
  // следующий трек становится текущим; sec > 0 — со сведением громкости
  function commitPre(sec) {
    const p = pre, nt = Q.queue[Q.idx + 1];
    if (!p || p.failed || !nt || nt.id !== p.id || !playback || playback.failed) return false;
    const old = audio, b = p.el;
    pre = null;
    endXf();
    feedbackLeave('trackFinished');
    Q.playSeq++; Q.idx++;
    audio = b;
    Q.loadedId = nt.id;
    playback = { track: nt, position: 0, retries: 0, started: true, failed: false, wantsPlay: true };
    try { localStorage.removeItem(resumeKey); } catch { /* storage unavailable */ }
    saveResume(true);
    host.setPlaybackStatus(null);
    publish();
    host.setProgress(0, nt.durationMs);
    addSimilar(nt);
    if (Q.mode === 'wave') feedback('trackStarted', { trackId: nt.id });
    ensureMore();
    b.volume = sec ? 0 : volume;
    const started = b.play();
    started?.catch((e) => { if (audio === b && e.name !== 'AbortError') recoverPlayback(); });
    if (sec) {
      const t0 = performance.now();
      xf = {
        old,
        timer: setInterval(() => {
          const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
          old.volume = volume * Math.cos(k * Math.PI / 2);
          b.volume = volume * Math.sin(k * Math.PI / 2);
          if (k >= 1) endXf();
        }, 80),
      };
    } else clearEl(old);
    return true;
  }
  // страж: если звук застрял (часы стоят, данных нет) несколько секунд подряд, перезагружаем трек с этого места
  let stuck = { t: -1, n: 0 };
  setInterval(() => {
    if (!active || !playback || playback.failed || !playback.wantsPlay || Q.loadedId !== cur()?.id || audio.paused || xf || seekPending) { stuck.n = 0; return; }
    const t = audio.currentTime;
    if (audio.readyState < 3 && Math.abs(t - stuck.t) < 0.05) { if (++stuck.n >= 3) { stuck.n = 0; recoverPlayback(); } } else stuck.n = 0;
    stuck.t = t;
  }, 2000);

  function watchEnd() {
    if (!playback || playback.failed || Q.loadedId !== cur()?.id) return;
    const dur = isFinite(audio.duration) ? audio.duration : (cur().durationMs || 0) / 1000;
    if (!dur) return;
    const left = dur - audio.currentTime;
    if (left < xfade + 15) prepareNext();
    if (xfade > 0 && left <= xfade && left > 0.5 && dur > xfade * 3) commitPre(xfade);
  }

  function playIndex(i, autoplay = true) {
    const t = Q.queue[i]; if (!t) return;
    Q.idx = i; publish();
    if (!autoplay) return;
    addSimilar(t);
    playback = { track: t, position: 0, retries: 0, started: false, failed: false, wantsPlay: true };
    saveResume(true);
    host.setPlaybackStatus(null);
    return loadPlayback(playback);
  }

  async function loadPlayback(attempt) {
    const seq = ++Q.playSeq;
    attempt.failed = false;
    attempt.wantsPlay = true;
    Q.loadedId = null;
    dropPre(); endXf();
    audio.pause(); host.setPlaying(false);
    try {
      const url = await host.call('ym:url', attempt.track.id);
      if (seq !== Q.playSeq) return;
      audio.src = url; Q.loadedId = attempt.track.id;
      if (attempt.position > 0) audio.currentTime = attempt.position;
      await audio.play();
      if (seq !== Q.playSeq || attempt.failed || !attempt.wantsPlay) return;
      if (!attempt.started && Q.mode === 'wave') feedback('trackStarted', { trackId: attempt.track.id });
      attempt.started = true;
      host.setPlaybackStatus(null);
      ensureMore();
    } catch (e) {
      if (seq !== Q.playSeq || e.message === 'auth' || e.name === 'AbortError') return;
      recoverPlayback();
    }
  }

  function recoverPlayback() {
    const attempt = playback;
    if (!active || !attempt?.wantsPlay || attempt.failed) return;
    attempt.failed = true;
    if (Q.loadedId === attempt.track.id && audio.readyState > 0) attempt.position = audio.currentTime;
    audio.pause();
    host.setPlaying(false);
    host.setProgress(attempt.position * 1000, attempt.track.durationMs);
    saveResume(true);
    if (attempt.retries >= 3) {
      host.setPlaybackStatus('offline');
      return;
    }
    host.setPlaybackStatus('retrying');
    const seq = Q.playSeq;
    const delay = 1000 * 2 ** attempt.retries++;
    setTimeout(() => {
      if (active && seq === Q.playSeq && attempt.wantsPlay) loadPlayback(attempt);
    }, delay);
  }

  function cancelRecovery() {
    if (!playback?.wantsPlay) return;
    playback.wantsPlay = false;
    if (playback.failed || !Q.loadedId) {
      Q.playSeq++;
      playback.failed = true;
      host.setPlaybackStatus('resume');
    } else {
      host.setPlaybackStatus(null);
    }
    saveResume(true);
  }

  window.addEventListener('online', () => {
    if (!active || !playback?.failed || !playback.wantsPlay) return;
    host.setPlaybackStatus('retrying');
    playback.retries = 0;
    loadPlayback(playback);
  });
  window.addEventListener('pagehide', () => saveResume(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveResume(true);
  });

  function feedbackLeave(type) {
    const t = cur();
    if (Q.mode !== 'wave' || !t || Q.loadedId !== t.id || playback?.restored) return;
    feedback(type, { trackId: t.id, seconds: audio.currentTime });
  }
  // обратная связь волне: в сессию с настройками или в обычную станцию
  function feedback(type, extra = {}) {
    const ev = { type, batchId: Q.batchId, ...extra };
    quiet(Q.session ? host.call('ym:tunedFeedback', { sessionId: Q.session, ...ev }) : host.call('ym:feedback', ev));
  }

  function next(user = true) {
    if (user) {
      feedbackLeave('skip');
      if (playback?.failed || (playback && !Q.loadedId)) cancelRecovery();
    }
    if (Q.idx + 1 < Q.queue.length) playIndex(Q.idx + 1, true);
    else if (Q.mode === 'fav' && Q.favLoaded >= Q.favIds.length && Q.queue.length) playIndex(0, true);
    else {
      const seq = Q.playSeq;
      ensureMore().then(() => {
        if (active && seq === Q.playSeq && Q.idx + 1 < Q.queue.length) playIndex(Q.idx + 1, true);
      });
    }
  }

  on('playing', () => {
    if (!active) return audio.pause();
    if (!playback?.wantsPlay) return audio.pause();
    if (!playback.failed && Q.loadedId === cur()?.id) host.setPlaying(true);
  });
  on('pause', () => {
    if (!active || !audio.paused) return;
    endXf();
    host.setPlaying(false);
    if (playback && !playback.failed && Q.loadedId === cur()?.id && audio.readyState > 0) {
      playback.position = audio.currentTime;
      saveResume(true);
    }
  });
  on('ended', () => {
    if (!active || !audio.ended || !playback || playback.failed || Q.loadedId !== cur()?.id) return;
    const expected = cur().durationMs / 1000;
    if (expected > 0 && audio.currentTime < expected - 2) return recoverPlayback();
    if (commitPre(0)) return;
    feedbackLeave('trackFinished');
    playback = null;
    try { localStorage.removeItem(resumeKey); } catch { /* storage unavailable */ }
    next(false);
  });
  on('error', () => {
    if (audio.error && Q.loadedId && Q.loadedId === cur()?.id) recoverPlayback();
  });
  on('timeupdate', () => {
    if (seekPending || !active || !playback || playback.failed || Q.loadedId !== cur()?.id || audio.readyState === 0) return;
    playback.position = audio.currentTime;
    saveResume();
    host.setProgress(audio.currentTime * 1000, isFinite(audio.duration) ? audio.duration * 1000 : 0);
    watchEnd();
  });

  els.forEach((el) => { el.volume = volume; });

  return {
    id: 'ym',
    name: 'Яндекс Музыка',
    hint: 'Моя волна и избранное',
    icon: 'i-ym',
    modes: [{ id: 'wave', icon: 'i-wave', tip: 'Моя волна' }, { id: 'fav', icon: 'i-heart', tip: 'Избранное' }],
    caps: { shuffle: 'fav' },
    // экран «Настроить волну»: группы из API Яндекса, выбор применяется к «Моей волне»
    tune: {
      title: 'Настроить Мою волну',
      tip: 'Настроить волну',
      mode: 'wave',
      groups: () => host.call('ym:waveSettings'),
    },

    async start(h, mode) {
      host = h; active = true;
      host.setVolume(volume);
      host.setShuffle(!!host.settings.shuffle, smartOn());
      host.setTrack(null, '');
      const seq = Q.loadSeq;
      const saved = readResume();
      let st;
      try {
        st = await host.call('ym:status');
      } catch (e) {
        if (!saved || e.message === 'auth') throw e;
      }
      if (!active || seq !== Q.loadSeq) return;
      if (st && !st.authed) return 'auth';
      await loadMode(mode, false, saved);
      return 'ok';
    },
    async open(h, track, list) {
      host = h; active = true;
      Q.loadSeq++; Q.playSeq++; playback = null;
      host.setPlaybackStatus(null);
      host.setVolume(volume); host.setShuffle(false);
      Q.mode = 'search'; Q.status = ''; Q.loadedId = null; Q.loadingMore = false;
      Q.queue = [track, ...list.filter((t) => t.id !== track.id)];
      Q.idx = 0; listShuf = 0; Q.tailOrig = null;
      host.setShuffleAvail?.(true);
      resetAudio();
      host.setPlaying(false); publish();
      refreshLikes();
      playIndex(0, true);
    },
    search: (h, q) => h.raw('ym:search', q),
    searchAlbums: (h, q) => h.raw('ym:searchAlbums', q),
    albumTracks: (h, album) => h.raw('ym:album', album.id),
    stop() {
      saveResume(true);
      host.setPlaybackStatus(null);
      active = false; Q.loadSeq++; Q.playSeq++; playback = null;
      resetAudio();
      host.setShuffleAvail?.(false);
      Q.queue = []; Q.idx = -1; Q.loadedId = null;
    },
    setMode: (mode, autoplay) => loadMode(mode, autoplay),
    // волна в стиле выбранной песни
    async trackWave(t, h) {
      if (!t?.id) return;
      if (h) { host = h; active = true; }
      seedTrack = t;
      host.setMode?.('wave');
      return loadMode('wave', true, null, `track:${t.id}`);
    },

    toggle() {
      const t = cur();
      if (!t) return loadMode(Q.mode, true);
      if (playback?.wantsPlay && (playback.failed || !Q.loadedId || !audio.paused)) {
        cancelRecovery();
        return audio.pause();
      }
      if (playback?.failed) {
        playback.retries = 0;
        host.setPlaybackStatus('retrying');
        return loadPlayback(playback);
      }
      if (!playback || Q.loadedId !== t.id || !audio.src) return playIndex(Q.idx, true);
      if (!audio.paused) return audio.pause();
      playback.wantsPlay = true;
      const seq = Q.playSeq;
      return audio.play().catch((e) => {
        if (seq === Q.playSeq && e.name !== 'AbortError') recoverPlayback();
      });
    },
    next: () => next(true),
    prev() {
      if (playback?.failed || (playback && !Q.loadedId)) cancelRecovery();
      if ((playback?.position ?? audio.currentTime) > 3 || Q.idx <= 0) return this.seek(0);
      playIndex(Q.idx - 1, true);
    },
    positionMs() {
      // Во время буферизации часы аудио стоят. При перезагрузке потока держим сохранённую позицию.
      if (Q.loadedId && Q.loadedId === cur()?.id && !playback?.failed && audio.readyState > 0) {
        return audio.currentTime * 1000;
      }
      return (playback?.position ?? 0) * 1000;
    },
    seek(ms) {
      if (!playback) return;
      playback.position = ms / 1000;
      if (Q.loadedId && !playback.failed) {
        // при перетаскивании полосы seek приходит десятками в секунду: применяем только последний, иначе поток запросов к звуку захлёбывается
        const target = playback.position, el = audio;
        seekPending = true;
        clearTimeout(seekT);
        seekT = setTimeout(() => { seekPending = false; if (el === audio && playback && !playback.failed) el.currentTime = target; }, 140);
      }
      host.setProgress(ms, playback.track.durationMs);
      saveResume(true);
    },
    setVolume(v) {
      volume = v;
      if (xf) return; // громкость выставит конец перекрытия
      els.forEach((el) => { el.volume = v; });
      try { localStorage.setItem('vol', v); } catch { /* ignore */ }
    },
    async like(on) {
      const t = cur(); if (!t) return;
      on ? Q.liked.add(t.id) : Q.liked.delete(t.id);
      try {
        await host.call('ym:like', { id: t.id, like: on });
        if (Q.mode === 'wave') feedback(on ? 'like' : 'unlike', { trackId: t.id });
      } catch (e) { on ? Q.liked.delete(t.id) : Q.liked.add(t.id); throw e; }
    },
    // «Не нравится»: Яндекс больше не предложит трек, и играет следующий
    async dislike() {
      const t = cur(); if (!t) return;
      try { await host.call('ym:dislike', { id: t.id }); } catch (e) { if (e.message !== 'auth') host.flash('Не удалось отметить трек'); return; }
      Q.liked.delete(t.id); publish();
      host.flash('Больше не предложим этот трек');
      next(true);
    },
    // перекрытие треков: 0 — выкл., иначе секунд; без перекрытия паузы между песнями всё равно нет
    crossfade: {
      values: [0, 3, 6, 9],
      get: () => xfade,
      set(v) { xfade = v; try { localStorage.setItem('ym:xfade', String(v)); } catch { /* storage unavailable */ } },
    },
    // выключено → перемешать → умное перемешивание (любимый, похожий, любимый…) → выключено
    async toggleShuffle() {
      if (Q.mode === 'search') { // список из поиска или альбом: перемешиваем остаток очереди
        listShuf = (listShuf + 1) % 3;
        const head = Q.queue.slice(0, Q.idx + 1);
        if (listShuf === 1) {
          Q.tailOrig = Q.queue.slice(Q.idx + 1).filter((t) => !t.smart);
          Q.queue = [...head, ...shuffleArr(Q.tailOrig)];
        } else if (listShuf === 2) {
          const t = cur(); if (t) addSimilar(t);
        } else {
          const played = new Set(head.map((t) => t.id));
          Q.queue = [...head, ...(Q.tailOrig || []).filter((t) => !played.has(t.id))];
          Q.tailOrig = null;
        }
        dropPre();
        host.setShuffle(listShuf > 0, listShuf === 2);
        if (host.queueOpen()) pushQueue();
        return;
      }
      const was = !!host.settings.shuffle;
      if (!was) { smart = false; await host.setSetting({ shuffle: true }); }
      else if (!smart) smart = true;
      else { smart = false; await host.setSetting({ shuffle: false }); }
      try { localStorage.setItem('ym:smart', smart ? '1' : '0'); } catch { /* storage unavailable */ }
      host.setShuffle(!!host.settings.shuffle, smartOn());
      if (Q.mode !== 'fav') return;
      if (was === !!host.settings.shuffle) { // переключился только режим «умный»
        if (smart) { const t = cur(); if (t) addSimilar(t); }
        else { Q.queue = Q.queue.filter((t, i) => !t.smart || i <= Q.idx); if (host.queueOpen()) pushQueue(); }
      } else loadMode('fav', true);
    },
    getQueue: () => pushQueue(),
    playFromQueue: (i) => playIndex(Q.base + i, true),
    trackUrl: (t) => (t.albumId ? `https://music.yandex.ru/album/${t.albumId}/track/${t.id}` : `https://music.yandex.ru/track/${t.id}`),

    authView: () => ({
      title: 'Яндекс Музыка',
      text: 'Войдите, чтобы слушать «Мою волну» и избранное',
      primary: 'Войти через Яндекс',
      secondary: 'Вставить токен из буфера обмена',
    }),
    async authAction(kind) {
      if (kind === 'primary') return host.call('ym:login');
      await host.call('ym:paste');
      return true;
    },
  };
})());

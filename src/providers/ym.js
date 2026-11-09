// Яндекс Музыка: свой плеер (<audio>), «Моя волна» и «Избранное».
Providers.register((() => {
  const audio = new Audio();
  audio.preload = 'auto';
  window.AudioFx?.attach?.(audio);

  let host = null, active = false;
  let playback = null;
  const resumeKey = 'ym:resume';
  let lastSavedAt = 0;
  const Q = {
    queue: [], idx: -1, batchId: null, status: '',
    favIds: [], favLoaded: 0, liked: new Set(),
    loadSeq: 0, playSeq: 0, loadedId: null, loadingMore: false,
    mode: 'wave', base: 0, session: null, // session — id сессии волны с настройками
  };
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

  async function loadMode(mode, autoplay = false, saved = null) {
    if (mode === 'search') mode = 'wave';
    const seq = ++Q.loadSeq;
    saveResume(true);
    Q.playSeq++; playback = null;
    host.setPlaybackStatus(null);
    Q.mode = mode; Q.status = 'Загрузка…';
    Q.queue = []; Q.idx = -1; Q.loadedId = null;
    Q.session = null; Q.batchId = null; Q.favIds = []; Q.favLoaded = 0;
    audio.pause(); audio.removeAttribute('src');
    host.setPlaying(false); publish();
    try {
      if (mode === 'wave' && tuned()) {
        const r = await host.call('ym:tunedWave', { value: tuneValue() });
        if (seq !== Q.loadSeq) return;
        Q.session = r.sessionId; Q.batchId = r.batchId;
        Q.queue = r.tracks.filter((t) => t.available);
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

  function playIndex(i, autoplay = true) {
    const t = Q.queue[i]; if (!t) return;
    Q.idx = i; publish();
    if (!autoplay) return;
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

  audio.addEventListener('playing', () => {
    if (!active) return audio.pause();
    if (!playback?.wantsPlay) return audio.pause();
    if (!playback.failed && Q.loadedId === cur()?.id) host.setPlaying(true);
  });
  audio.addEventListener('pause', () => {
    if (!active || !audio.paused) return;
    host.setPlaying(false);
    if (playback && !playback.failed && Q.loadedId === cur()?.id && audio.readyState > 0) {
      playback.position = audio.currentTime;
      saveResume(true);
    }
  });
  audio.addEventListener('ended', () => {
    if (!active || !audio.ended || !playback || playback.failed || Q.loadedId !== cur()?.id) return;
    const expected = cur().durationMs / 1000;
    if (expected > 0 && audio.currentTime < expected - 2) return recoverPlayback();
    feedbackLeave('trackFinished');
    playback = null;
    try { localStorage.removeItem(resumeKey); } catch { /* storage unavailable */ }
    next(false);
  });
  audio.addEventListener('error', () => {
    if (audio.error && Q.loadedId && Q.loadedId === cur()?.id) recoverPlayback();
  });
  audio.addEventListener('timeupdate', () => {
    if (!active || !playback || playback.failed || Q.loadedId !== cur()?.id || audio.readyState === 0) return;
    playback.position = audio.currentTime;
    saveResume();
    host.setProgress(audio.currentTime * 1000, isFinite(audio.duration) ? audio.duration * 1000 : 0);
  });

  let volume = 0.7;
  try { volume = Math.min(1, Math.max(0, parseFloat(localStorage.getItem('vol') ?? '0.7'))); } catch { /* ignore */ }
  audio.volume = volume;

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
      host.setVolume(audio.volume);
      host.setShuffle(!!host.settings.shuffle);
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
      host.setVolume(audio.volume); host.setShuffle(false);
      Q.mode = 'search'; Q.status = ''; Q.loadedId = null; Q.loadingMore = false;
      Q.queue = [track, ...list.filter((t) => t.id !== track.id)];
      Q.idx = 0;
      audio.pause(); audio.removeAttribute('src');
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
      audio.pause(); audio.removeAttribute('src');
      Q.queue = []; Q.idx = -1; Q.loadedId = null;
    },
    setMode: (mode, autoplay) => loadMode(mode, autoplay),

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
    seek(ms) {
      if (!playback) return;
      playback.position = ms / 1000;
      if (Q.loadedId && !playback.failed) audio.currentTime = playback.position;
      host.setProgress(ms, playback.track.durationMs);
      saveResume(true);
    },
    setVolume(v) {
      audio.volume = v;
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
    async toggleShuffle() {
      const v = !host.settings.shuffle;
      await host.setSetting({ shuffle: v });
      host.setShuffle(v);
      if (Q.mode === 'fav') loadMode('fav', true);
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

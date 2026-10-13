// Яндекс Музыка: свой плеер (<audio>), «Моя волна» и «Избранное».
Providers.register((() => {
  const audio = new Audio();
  audio.preload = 'auto';

  let host = null, active = false;
  const Q = {
    queue: [], idx: -1, batchId: null, status: '',
    favIds: [], favLoaded: 0, liked: new Set(),
    loadSeq: 0, playSeq: 0, loadedId: null, errStreak: 0, loadingMore: false,
    mode: 'wave', base: 0,
  };
  const cur = () => Q.queue[Q.idx];
  const quiet = (p) => p.catch(() => {});
  const shuffleArr = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

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

  async function loadMode(mode, autoplay = false) {
    if (mode === 'search') mode = 'wave';
    const seq = ++Q.loadSeq;
    Q.mode = mode; Q.status = 'Загрузка…';
    Q.queue = []; Q.idx = -1; Q.loadedId = null;
    audio.pause(); audio.removeAttribute('src');
    host.setPlaying(false); publish();
    try {
      if (mode === 'wave') {
        const r = await host.call('ym:wave');
        if (seq !== Q.loadSeq) return;
        Q.batchId = r.batchId;
        Q.queue = r.tracks.filter((t) => t.available);
        quiet(host.call('ym:feedback', { type: 'radioStarted' }));
        refreshLikes();
      } else {
        const ids = await refreshLikes();
        if (seq !== Q.loadSeq) return;
        Q.favIds = host.settings.shuffle ? shuffleArr(ids) : ids;
        Q.favLoaded = 0;
        await loadMoreFav(seq);
        if (seq !== Q.loadSeq) return;
      }
      if (!Q.queue.length) { Q.status = mode === 'fav' ? 'В избранном пока пусто' : 'Не удалось получить треки'; publish(); return; }
      Q.status = '';
      Q.idx = 0;
      publish();
      if (autoplay) playIndex(0, true);
    } catch (e) {
      if (seq !== Q.loadSeq || e.message === 'auth') return;
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
        const r = await host.call('ym:wave', last?.id);
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

  async function playIndex(i, autoplay = true) {
    const t = Q.queue[i]; if (!t) return;
    const seq = ++Q.playSeq;
    Q.idx = i; publish();
    if (!autoplay) return;
    audio.pause(); host.setPlaying(false);
    try {
      const url = await host.call('ym:url', t.id);
      if (seq !== Q.playSeq) return;
      audio.src = url; Q.loadedId = t.id;
      await audio.play();
      if (Q.mode === 'wave') quiet(host.call('ym:feedback', { type: 'trackStarted', trackId: t.id, batchId: Q.batchId }));
    } catch (e) {
      if (seq !== Q.playSeq || e.message === 'auth') return;
      if (++Q.errStreak < 4) next(false);
      else { Q.errStreak = 0; host.flash('Не удалось воспроизвести'); }
    }
    ensureMore();
  }

  function feedbackLeave(type) {
    const t = cur();
    if (Q.mode !== 'wave' || !t || Q.loadedId !== t.id) return;
    quiet(host.call('ym:feedback', { type, trackId: t.id, seconds: audio.currentTime, batchId: Q.batchId }));
  }

  function next(user = true) {
    if (user) feedbackLeave('skip');
    if (Q.idx + 1 < Q.queue.length) playIndex(Q.idx + 1, true);
    else if (Q.mode === 'fav' && Q.favLoaded >= Q.favIds.length && Q.queue.length) playIndex(0, true);
    else ensureMore().then(() => { if (Q.idx + 1 < Q.queue.length) playIndex(Q.idx + 1, true); });
  }

  audio.addEventListener('playing', () => { if (!active) return audio.pause(); Q.errStreak = 0; host.setPlaying(true); });
  audio.addEventListener('pause', () => active && host.setPlaying(false));
  audio.addEventListener('ended', () => { if (!active) return; feedbackLeave('trackFinished'); next(false); });
  audio.addEventListener('error', () => { if (active && audio.src && Q.loadedId && ++Q.errStreak < 4) next(false); });
  audio.addEventListener('timeupdate', () => {
    if (active) host.setProgress(audio.currentTime * 1000, isFinite(audio.duration) ? audio.duration * 1000 : 0);
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

    async start(h, mode) {
      host = h; active = true;
      host.setVolume(audio.volume);
      host.setShuffle(!!host.settings.shuffle);
      host.setTrack(null, '');
      const st = await host.call('ym:status');
      if (!st.authed) return 'auth';
      await loadMode(mode, false);
      return 'ok';
    },
    async open(h, track, list) {
      host = h; active = true;
      Q.loadSeq++; Q.playSeq++;
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
    stop() {
      active = false; Q.loadSeq++; Q.playSeq++;
      audio.pause(); audio.removeAttribute('src');
      Q.queue = []; Q.idx = -1; Q.loadedId = null;
    },
    setMode: (mode, autoplay) => loadMode(mode, autoplay),

    toggle() {
      const t = cur();
      if (!t) return loadMode(Q.mode, true);
      if (Q.loadedId !== t.id || !audio.src) return playIndex(Q.idx, true);
      return audio.paused ? audio.play() : audio.pause();
    },
    next: () => next(true),
    prev() {
      if (audio.currentTime > 3 || Q.idx <= 0) { audio.currentTime = 0; return; }
      playIndex(Q.idx - 1, true);
    },
    seek(ms) { if (audio.src) audio.currentTime = ms / 1000; },
    setVolume(v) {
      audio.volume = v;
      try { localStorage.setItem('vol', v); } catch { /* ignore */ }
    },
    async like(on) {
      const t = cur(); if (!t) return;
      on ? Q.liked.add(t.id) : Q.liked.delete(t.id);
      try {
        await host.call('ym:like', { id: t.id, like: on });
        if (Q.mode === 'wave') quiet(host.call('ym:feedback', { type: on ? 'like' : 'unlike', trackId: t.id, batchId: Q.batchId }));
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

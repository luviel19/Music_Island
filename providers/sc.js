// SoundCloud (неофициальный api-v2): тренды без входа, лайки после входа, ссылка из буфера обмена.
// client_id берётся с главной страницы сайта (как это делает веб-плеер); вход — окно soundcloud.com.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const API = 'https://api-v2.soundcloud.com';

module.exports = function createSoundCloud(ctx) {
  const d = () => ctx.data('sc');
  const getToken = () => ctx.dec(d().token);
  let cid = null;

  async function getCid(force) {
    if (cid && !force) return cid;
    const home = await (await fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } })).text();
    const urls = [...home.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1]).reverse();
    for (const u of urls) {
      const js = await (await fetch(u, { headers: { 'User-Agent': UA } })).text();
      const m = /client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/.exec(js);
      if (m) {
        cid = m[1];
        return cid;
      }
    }
    throw new Error('Не удалось получить ключ SoundCloud');
  }

  async function api(pathOrUrl, { query, auth, method = 'GET' } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl);
      for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
      url.searchParams.set('client_id', await getCid(attempt > 0));
      const headers = { 'User-Agent': UA, Accept: 'application/json' };
      const token = auth ? getToken() : null;
      if (token) headers.Authorization = `OAuth ${token}`;
      const r = await fetch(url, { headers, method });
      if ((r.status === 401 || r.status === 403) && attempt === 0) continue; // возможно протух client_id
      if (r.status === 401 || r.status === 403) throw new Error(token ? 'auth' : `HTTP ${r.status}`);
      if (!r.ok) { console.error('[sc]', method, url.pathname, r.status); throw new Error(`HTTP ${r.status}`); }
      return r.status === 204 ? null : r.json().catch(() => null);
    }
  }

  function norm(t) {
    const tc = (t.media?.transcodings || []).find((x) => x.format?.protocol === 'progressive');
    if (!t.title || !tc) return null;
    const art = (t.artwork_url || t.user?.avatar_url || '').replace('-large.', '-t500x500.');
    return {
      id: String(t.id), title: t.title, artists: t.user?.username || '',
      album: '', year: (t.created_at || '').slice(0, 4), genre: t.genre || '',
      cover: art || null, durationMs: t.duration || t.full_duration || 0, available: true,
      tc: tc.url, ta: t.track_authorization || '', url: t.permalink_url || null, waveUrl: (t.waveform_url || '').replace(/\.png$/, '.json') || null, liked: false,
    };
  }
  const normList = (arr) => arr.map(norm).filter(Boolean);

  async function hydrate(items) {
    const stubs = items.filter((t) => !t.title && t.id);
    let full = [];
    for (let i = 0; i < stubs.length; i += 30) {
      full = full.concat((await api('/tracks', { query: { ids: stubs.slice(i, i + 30).map((s) => s.id).join(',') } })) || []);
    }
    const byId = new Map(full.map((t) => [t.id, t]));
    return items.map((t) => (t.title ? t : byId.get(t.id))).filter(Boolean); // порядок сохраняется
  }

  async function myId() {
    if (d().uid) return d().uid;
    const me = await api('/me', { auth: true });
    d().uid = me.id; ctx.save();
    return me.id;
  }

  const page = (j, pick) => ({ tracks: normList((j.collection || []).map(pick).filter(Boolean)), next: j.next_href || null });

  const handlers = {
    status: () => ({ authed: !!getToken() }),

    login: () => new Promise((resolve) => {
      const ses = ctx.session.fromPartition('persist:soundcloud');
      const w = new ctx.BrowserWindow({ width: 520, height: 720, title: 'Вход в SoundCloud', autoHideMenuBar: true, alwaysOnTop: true, webPreferences: { partition: 'persist:soundcloud' } });
      let done = false;
      const finish = (t) => {
        if (done) return; done = true; clearInterval(iv);
        if (t) { d().token = ctx.enc(t); d().uid = null; ctx.save(); }
        resolve(!!t); if (!w.isDestroyed()) w.close();
      };
      const iv = setInterval(async () => {
        const c = (await ses.cookies.get({ name: 'oauth_token' }))[0];
        if (c?.value) finish(decodeURIComponent(c.value));
      }, 1200);
      w.on('closed', () => finish(null));
      w.loadURL('https://soundcloud.com/signin');
    }),
    logout: () => { d().token = null; d().uid = null; ctx.save(); return true; },

    // режимы: trend | likes | link
    load: async ({ mode }) => {
      if (mode === 'trend') {
        // самый первый ответ после получения ключа приходит без mp3-потоков — повторяем при пустом результате
        for (let attempt = 0; ; attempt++) {
          const j = await api('/charts', { query: { kind: 'trending', genre: 'soundcloud:genres:all-music', limit: 40 } });
          const r = page(j, (c) => c.track);
          if (r.tracks.length || attempt >= 2) return r;
        }
      }
      if (mode === 'likes') {
        const uid = await myId();
        const j = await api(`/users/${uid}/track_likes`, { auth: true, query: { limit: 50 } });
        const r = page(j, (c) => c.track);
        r.tracks.forEach((t) => { t.liked = true; });
        r.liked = true;
        return r;
      }
      if (mode === 'link') {
        const m = /https?:\/\/(?:on\.|m\.|www\.)?soundcloud\.com\/\S+/i.exec(ctx.clipboard.readText());
        if (!m) throw new Error('В буфере нет ссылки на SoundCloud');
        const o = await api('/resolve', { query: { url: m[0].replace(/[)\].,;]+$/, '') } });
        if (o.kind === 'track') {
          const first = normList([o]);
          const rel = await api(`/tracks/${o.id}/related`, { query: { limit: 30 } }).catch(() => ({ collection: [] }));
          return { tracks: first.concat(normList(rel.collection || [])), next: null };
        }
        if (o.kind === 'playlist' || o.kind === 'system-playlist') return { tracks: normList(await hydrate(o.tracks || [])), next: null };
        if (o.kind === 'user') {
          const j = await api(`/users/${o.id}/tracks`, { query: { limit: 50 } });
          return { tracks: normList(j.collection || []), next: j.next_href || null };
        }
        throw new Error('Эту ссылку не удалось открыть');
      }
      throw new Error('unknown mode');
    },
    more: async ({ next, liked }) => {
      if (!next) return { tracks: [], next: null };
      const j = await api(next, { auth: !!liked });
      const r = page(j, (c) => c.track || (c.title ? c : null));
      if (liked) r.tracks.forEach((t) => { t.liked = true; });
      return r;
    },
    search: async (q) => {
      q = String(q).slice(0, 100);
      for (let attempt = 0; ; attempt++) { // первый ответ после получения ключа бывает без mp3-потоков
        const j = await api('/search/tracks', { query: { q, limit: 25 } });
        const tracks = normList(j.collection || []);
        if (tracks.length || attempt >= 1) return tracks.slice(0, 20);
      }
    },
    related: async ({ id }) => {
      const j = await api(`/tracks/${encodeURIComponent(id)}/related`, { query: { limit: 30 } });
      return normList(j.collection || []);
    },
    url: async ({ tc, ta }) => {
      const j = await api(tc, { query: { track_authorization: ta }, auth: !!getToken() });
      if (!j?.url) throw new Error('Трек недоступен');
      return j.url;
    },
    wave: async (url) => {
      if (!/^https:\/\/wave\.sndcdn\.com\//.test(url)) throw new Error('bad url');
      const j = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
      return { samples: j.samples, height: j.height };
    },
    like: async ({ id, like }) => {
      const uid = await myId();
      await api(`/users/${uid}/track_likes/${id}`, { auth: true, method: like ? 'PUT' : 'DELETE' });
      return true;
    },
  };

  return {
    id: 'sc',
    name: 'SoundCloud',
    hosts: ['soundcloud.com'],
    modes: [{ id: 'trend', label: 'Тренды' }, { id: 'likes', label: 'Мои лайки' }, { id: 'link', label: 'Ссылка из буфера' }],
    handlers,
  };
};

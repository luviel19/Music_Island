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
    const hr = await ctx.fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } });
    const home = await hr.text();
    const urls = [...home.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1]).reverse();
    for (const u of urls) {
      const js = await (await ctx.fetch(u, { headers: { 'User-Agent': UA } })).text();
      const m = /client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/.exec(js);
      if (m) {
        cid = m[1];
        return cid;
      }
    }
    throw new Error(urls.length ? 'Не удалось получить ключ SoundCloud' : `SoundCloud ответил странно (HTTP ${hr.status}): прокси его блокирует или подменяет страницу`);
  }

  // SoundCloud защищает изменяющие запросы (лайк) проверкой DataDome. Поэтому такие запросы выполняются
  // внутри настоящей страницы soundcloud.com (скрытое окно с сессией входа): её скрипт держит куки в порядке.
  // Если нужна капча, окно показывается с капчей внутри страницы; после решения запрос повторяется.
  let sw = null;
  const scWin = () => {
    if (sw && !sw.win.isDestroyed()) return sw;
    const win = new ctx.BrowserWindow({ width: 520, height: 720, show: false, title: 'Проверка SoundCloud', autoHideMenuBar: true, alwaysOnTop: true, webPreferences: { partition: 'persist:soundcloud' } });
    const ready = new Promise((resolve) => { win.webContents.once('did-finish-load', () => setTimeout(resolve, 1500)); win.webContents.once('did-fail-load', () => resolve()); });
    win.webContents.setAudioMuted(true); // страница сайта не должна ничего проигрывать
    win.on('closed', () => { sw = null; }); // закрытие окна = отмена проверки
    win.loadURL('https://soundcloud.com/');
    sw = { win, ready };
    return sw;
  };
  const dd = async () => (await ctx.session.fromPartition('persist:soundcloud').cookies.get({ name: 'datadome' }))[0]?.value || '';

  async function pageFetch(url, token, method) {
    const { win, ready } = scWin();
    await ready;
    const js = `fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: { Authorization: ${JSON.stringify('OAuth ' + token)}, Accept: 'application/json' }, credentials: 'include' })
      .then(async (r) => ({ status: r.status, text: await r.text().catch(() => '') }))`;
    return win.webContents.executeJavaScript(js);
  }

  let captcha = null;
  function solveCaptcha(link) {
    if (captcha) return captcha;
    captcha = new Promise((resolve) => {
      let host = ''; try { host = new URL(link).hostname; } catch { /* нет ссылки */ }
      if (!/(^|\.)captcha-delivery\.com$/.test(host)) { resolve(false); return; }
      const { win } = scWin();
      let done = false;
      const finish = (ok) => { if (done) return; done = true; clearInterval(iv); clearTimeout(to); win.removeListener('closed', onHide); if (!win.isDestroyed()) win.hide(); resolve(ok); };
      const onHide = () => finish(false);
      dd().then((first) => {
        if (done) return;
        iv = setInterval(async () => { const v = await dd(); if (v && v !== first) setTimeout(() => finish(true), 1500); }, 1000);
      });
      let iv; const to = setTimeout(() => finish(false), 180000);
      const js = `(() => { document.getElementById('mi-cap')?.remove(); const f = document.createElement('iframe'); f.id = 'mi-cap'; f.src = ${JSON.stringify(link)}; f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:#fff'; document.body.appendChild(f); })()`;
      win.webContents.executeJavaScript(js).then(() => { win.show(); win.once('closed', onHide); }).catch(() => finish(false));
    }).finally(() => { captcha = null; });
    return captcha;
  }

  async function api(pathOrUrl, { query, auth, method = 'GET' } = {}) {
    let askedCaptcha = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl);
      for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
      url.searchParams.set('client_id', await getCid(attempt > 0 && !askedCaptcha));
      const headers = { 'User-Agent': UA, Accept: 'application/json' };
      const token = auth ? getToken() : null;
      if (token) headers.Authorization = `OAuth ${token}`;
      const web = !!token && method !== 'GET'; // изменяющий запрос от имени пользователя — из страницы soundcloud.com
      let status, text, r;
      if (web) { ({ status, text } = await pageFetch(url.href, token, method)); } else { r = await ctx.fetch(url, { headers, method }); status = r.status; }
      if (status === 401 || status === 403) {
        const body = web ? text : await r.text().catch(() => '');
        const link = web && status === 403 && /captcha-delivery\.com/.test(body) ? (() => { try { return JSON.parse(body).url; } catch { return ''; } })() : '';
        if (link && !askedCaptcha) {
          askedCaptcha = true;
          if (await solveCaptcha(link)) continue;
          throw new Error('Нужно пройти проверку SoundCloud, чтобы поставить лайк');
        }
        if (link) throw new Error('SoundCloud просит пройти проверку, попробуйте ещё раз');
        console.error('[sc]', method, url.pathname, status);
        if (attempt === 0) continue; // возможно протух client_id
        throw new Error(token && (!web || status === 401) ? 'auth' : `HTTP ${status}`);
      }
      const ok = status >= 200 && status < 300;
      if (!ok) { console.error('[sc]', method, url.pathname, status); throw new Error(`HTTP ${status}`); }
      if (status === 204) return null;
      if (web) { try { return JSON.parse(text); } catch { return null; } }
      return r.json().catch(() => null);
    }
  }

  // SoundCloud всё чаще отдаёт только HLS: берём progressive, иначе HLS с mp3, иначе HLS с AAC (без шифрования)
  function pickTranscoding(t) {
    const list = t.media?.transcodings || [];
    const mime = (x) => x.format?.mime_type || '';
    const aac = list.filter((x) => x.format?.protocol === 'hls' && /mp4a/.test(mime(x)));
    return list.find((x) => x.format?.protocol === 'progressive')
      || list.find((x) => x.format?.protocol === 'hls' && mime(x) === 'audio/mpeg')
      || aac.find((x) => x.preset === 'aac_160k') || aac[0];
  }
  function norm(t) {
    const tc = pickTranscoding(t);
    if (!t.title || !tc) return null;
    const art = (t.artwork_url || t.user?.avatar_url || '').replace('-large.', '-t500x500.');
    return {
      id: String(t.id), title: t.title, artists: t.user?.username || '',
      album: '', year: (t.created_at || '').slice(0, 4), genre: t.genre || '',
      cover: art || null, durationMs: t.duration || t.full_duration || 0, available: true,
      tc: tc.url, tf: tc.format.protocol === 'progressive' ? 'p' : /mp4a/.test(tc.format.mime_type) ? 'a' : 'm', ta: t.track_authorization || '', url: t.permalink_url || null, waveUrl: (t.waveform_url || '').replace(/\.png$/, '.json') || null, liked: false,
    };
  }
  // HLS: плейлист → сегменты → один буфер (Chromium без HLS, а mp3/fMP4-сегменты склеиваются как есть)
  async function hlsDownload(playlistUrl, mime) {
    const text = await (await ctx.fetch(playlistUrl, { headers: { 'User-Agent': UA } })).text();
    if (/#EXT-X-KEY:(?!METHOD=NONE)/.test(text)) throw new Error('Трек зашифрован, его нельзя воспроизвести');
    const urls = [];
    const map = /#EXT-X-MAP:URI="([^"]+)"/.exec(text);
    if (map) urls.push(new URL(map[1], playlistUrl).href);
    for (const line of text.split(/\r?\n/)) if (line && !line.startsWith('#')) urls.push(new URL(line.trim(), playlistUrl).href);
    if (!urls.length) throw new Error('Пустой плейлист SoundCloud');
    const parts = new Array(urls.length);
    let next = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (next < urls.length) {
        const i = next++;
        const r = await ctx.fetch(urls[i], { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`Сегмент недоступен (HTTP ${r.status})`);
        parts[i] = Buffer.from(await r.arrayBuffer());
      }
    }));
    return { bytes: Buffer.concat(parts), mime };
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
        if (t) { try { d().token = ctx.enc(t); d().uid = null; ctx.save(); } catch { t = null; } } // хранилище Windows недоступно: токен не сохраняем
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
    load: async ({ mode, tag }) => {
      // тренды с настройкой: жанровые чарты SoundCloud больше не наполняются, поэтому — поиск по тегу
      if (mode === 'trend' && tag) {
        const j = await api('/search/tracks', { query: { q: '*', 'filter.genre_or_tag': String(tag).slice(0, 40), limit: 40 } });
        return page(j, (c) => c);
      }
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
        const m = /https?:\/\/(?:on\.|m\.|www\.)?soundcloud\.com\/\S+/i.exec(await ctx.readClip());
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
    url: async ({ tc, ta, tf }) => {
      const j = await api(tc, { query: { track_authorization: ta }, auth: !!getToken() });
      if (!j?.url) throw new Error('Трек недоступен');
      if (tf === 'p' || !tf) return j.url;
      return hlsDownload(j.url, tf === 'a' ? 'audio/mp4' : 'audio/mpeg');
    },
    wave: async (url) => {
      if (!/^https:\/\/wave\.sndcdn\.com\//.test(url)) throw new Error('bad url');
      const j = await (await ctx.fetch(url, { headers: { 'User-Agent': UA } })).json();
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

// Яндекс Музыка (неофициальный API): свой плеер, «Моя волна» и «Избранное».
const crypto = require('crypto');

const API = 'https://api.music.yandex.net';
// Публичный client_id официального Android-клиента (его же используют неофициальные библиотеки)
const CLIENT_ID = '23cabbbdc6cd418abb4b39c32c41195d';
const STATION = 'user:onyourwave';

module.exports = function createYandex(ctx) {
  const d = () => ctx.data('ym');
  const getToken = () => ctx.dec(d().token);
  const setToken = (t) => { d().token = t ? ctx.enc(t) : null; uid = null; ctx.save(); };
  let uid = null;

  async function api(pathname, { method = 'GET', query, form, json } = {}) {
    const token = getToken();
    if (!token) throw new Error('auth');
    const url = new URL(API + pathname);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
    const headers = {
      Authorization: `OAuth ${token}`,
      'X-Yandex-Music-Client': 'YandexMusicAndroid/24023231',
      'User-Agent': 'Yandex-Music-API',
    };
    let body;
    if (form) { body = new URLSearchParams(form); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    if (json) { body = JSON.stringify(json); headers['Content-Type'] = 'application/json'; }
    const res = await fetch(url, { method, headers, body });
    if (res.status === 401) throw new Error('auth');
    if (!res.ok) { console.error('[ym]', method, pathname, res.status); throw new Error(`HTTP ${res.status}`); }
    return (await res.json()).result;
  }

  async function getUid() {
    if (!uid) uid = (await api('/account/status')).account.uid;
    return uid;
  }

  function norm(t) {
    const al = (t.albums || [])[0] || {};
    const cover = t.coverUri || al.coverUri;
    return {
      id: String(t.id),
      albumId: al.id != null ? String(al.id) : null,
      title: t.title + (t.version ? ` (${t.version})` : ''),
      artists: (t.artists || []).map((a) => a.name).join(', '),
      album: al.title || '',
      year: al.year || '',
      genre: al.genre || '',
      cover: cover ? 'https://' + cover.replace('%%', '400x400') : null,
      durationMs: t.durationMs || 0,
      available: t.available !== false,
    };
  }

  async function directUrl(trackId) {
    // Актуальный способ: get-file-info с HMAC-подписью
    try {
      const ts = Math.floor(Date.now() / 1000);
      const quality = 'nq', codecs = 'mp3', transports = 'encraw';
      const sign = crypto.createHmac('sha256', 'kzqU4XhfCaY6B6JTHODeq5')
        .update(`${ts}${trackId}${quality}${codecs.replace(',', '')}${transports}`)
        .digest('base64').replace(/=+$/, '');
      const r = await api('/get-file-info', { query: { ts, trackId, quality, codecs, transports, sign } });
      if (r?.downloadInfo?.url) return r.downloadInfo.url;
    } catch (e) { console.error('[ym] get-file-info failed:', e.message); }

    // Запасной: старый download-info + md5
    const infos = await api(`/tracks/${trackId}/download-info`);
    const best = infos.filter((i) => i.codec === 'mp3').sort((a, b) => b.bitrateInKbps - a.bitrateInKbps)[0];
    if (!best) throw new Error('Нет доступного потока');
    const xml = await (await fetch(best.downloadInfoUrl + '&format=json')).text();
    let host, p, ts, s;
    try { ({ host, path: p, ts, s } = JSON.parse(xml)); } catch {
      const g = (n) => new RegExp(`<${n}>([^<]+)</${n}>`).exec(xml)?.[1];
      host = g('host'); p = g('path'); ts = g('ts'); s = g('s');
    }
    const sign = crypto.createHash('md5').update('XGRlBW9FXlekgbPrRHuSiA' + p.slice(1) + s).digest('hex');
    return `https://${host}/get-mp3/${sign}/${ts}${p}`;
  }

  const handlers = {
    status: async () => {
      if (!getToken()) return { authed: false };
      try {
        const st = await api('/account/status');
        uid = st.account.uid;
        return { authed: true, name: st.account.login || st.account.displayName };
      } catch { return { authed: false }; }
    },
    login: () => new Promise((resolve) => {
      const w = new ctx.BrowserWindow({
        width: 520, height: 700, title: 'Вход в Яндекс', autoHideMenuBar: true,
        alwaysOnTop: true, webPreferences: { partition: 'persist:yandex-login' },
      });
      let done = false;
      const finish = (t) => { if (done) return; done = true; if (t) setToken(t); resolve(!!t); if (!w.isDestroyed()) w.close(); };
      const check = (url) => { const m = /access_token=([^&]+)/.exec(url); if (m) finish(m[1]); };
      w.webContents.on('will-redirect', (_e, url) => check(url));
      w.webContents.on('did-navigate', (_e, url) => check(url));
      w.webContents.on('did-navigate-in-page', (_e, url) => check(url));
      w.on('closed', () => finish(null));
      w.loadURL(`https://oauth.yandex.ru/authorize?response_type=token&client_id=${CLIENT_ID}`);
    }),
    paste: async () => {
      let t = (await ctx.readClip()).trim();
      const m = /access_token=([^&\s]+)/.exec(t);
      if (m) t = m[1];
      if (!t || /\s/.test(t) || t.length < 20) throw new Error('В буфере обмена нет токена');
      setToken(t);
      try { await getUid(); } catch { setToken(null); throw new Error('Токен не подошёл'); }
      return true;
    },
    logout: () => { setToken(null); return true; },

    wave: async (lastTrackId) => {
      const r = await api(`/rotor/station/${STATION}/tracks`, {
        query: { settings2: 'true', ...(lastTrackId ? { queue: lastTrackId } : {}) },
      });
      return { batchId: r.batchId, tracks: r.sequence.map((s) => norm(s.track)) };
    },
    feedback: async ({ type, trackId, seconds, batchId }) => {
      const ev = { type, timestamp: new Date().toISOString() };
      if (trackId) ev.trackId = trackId;
      if (seconds != null) ev.totalPlayedSeconds = seconds;
      if (type === 'radioStarted') ev.from = 'radio-mobile-user-onyourwave-default';
      await api(`/rotor/station/${STATION}/feedback`, {
        method: 'POST', query: batchId ? { 'batch-id': batchId } : {}, json: ev,
      });
      return true;
    },
    favIds: async () => {
      const r = await api(`/users/${await getUid()}/likes/tracks`);
      return r.library.tracks.map((t) => String(t.id));
    },
    tracks: async (ids) => {
      const r = await api('/tracks', { method: 'POST', form: { 'track-ids': ids.join(',') } });
      const byId = new Map(r.map((t) => [String(t.id), norm(t)]));
      return ids.map((id) => byId.get(String(id))).filter(Boolean);
    },
    search: async (q) => {
      q = String(q).slice(0, 100);
      const r = await api('/search', { query: { text: q, type: 'track', page: 0, nocorrect: 'false' } });
      return (r.tracks?.results || []).map(norm).filter((t) => t.available).slice(0, 20);
    },
    similar: async (id) => {
      const r = await api(`/tracks/${encodeURIComponent(id)}/similar`);
      return (r.similarTracks || []).map(norm).filter((t) => t.available);
    },
    url: (id) => directUrl(id),
    like: async ({ id, like }) => {
      await api(`/users/${await getUid()}/likes/tracks/${like ? 'add-multiple' : 'remove'}`, {
        method: 'POST', form: { 'track-ids': id },
      });
      return true;
    },
  };

  return {
    id: 'ym',
    name: 'Яндекс Музыка',
    hosts: ['music.yandex.ru', 'music.yandex.com'],
    modes: [{ id: 'wave', label: 'Моя волна' }, { id: 'fav', label: 'Избранное' }],
    handlers,
  };
};

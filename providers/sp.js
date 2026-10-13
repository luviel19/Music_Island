// Spotify Web API: остров управляет проигрыванием в приложении Spotify (нужен Premium).
// Вход — OAuth PKCE. Пока приложение Spotify в режиме Development, пускает только добавленных
// пользователей, а у владельца Client ID должна быть активная подписка Premium.
const crypto = require('crypto');

// Client ID приложения Spotify (developer.spotify.com). Если пусто — каждый вставляет свой.
const BUILTIN_CLIENT_ID = '531d37fcc425477a857b655424e8c9b1';
const REDIRECT = 'http://127.0.0.1:53682/callback';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-library-read user-library-modify';

module.exports = function createSpotify(ctx) {
  const d = () => ctx.data('sp');
  const cid = () => BUILTIN_CLIENT_ID || d().clientId;
  let access = null, expires = 0;

  async function tokenReq(params) {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cid(), ...params }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || 'Ошибка авторизации');
    access = j.access_token;
    expires = Date.now() + (j.expires_in - 60) * 1000;
    if (j.refresh_token) { d().refresh = ctx.enc(j.refresh_token); ctx.save(); }
  }

  async function ensureToken() {
    if (access && Date.now() < expires) return;
    const rt = ctx.dec(d().refresh);
    if (!rt || !cid()) throw new Error('auth');
    try { await tokenReq({ grant_type: 'refresh_token', refresh_token: rt }); } catch { throw new Error('auth'); }
  }

  async function api(pathname, { method = 'GET', query, json } = {}) {
    await ensureToken();
    const url = new URL('https://api.spotify.com/v1' + pathname);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${access}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
      body: json ? JSON.stringify(json) : undefined,
    });
    if (res.status === 401) { access = null; throw new Error('auth'); }
    if (res.status === 204 || res.status === 202) return null;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* не json */ }
    if (!res.ok) {
      const reason = data?.error?.reason;
      console.error('[sp]', method, pathname, res.status, text.slice(0, 300));
      if (reason === 'PREMIUM_REQUIRED') throw new Error('premium');
      if (reason === 'NO_ACTIVE_DEVICE') throw new Error('NO_ACTIVE_DEVICE');
      if (res.status === 403 && !reason) {
        const m = data?.error?.message || text.slice(0, 120) || '403';
        if (/premium subscription required for the owner/i.test(m)) throw new Error('ownerpremium');
        throw new Error(/register|allowlist|user may not/i.test(m) ? 'notallowed' : `Spotify отказал (403): ${m}`);
      }
      if (res.status === 429) throw new Error('Слишком много запросов, подождите');
      throw new Error(reason || data?.error?.message || `HTTP ${res.status}`);
    }
    return data;
  }

  function norm(t) {
    const imgs = t.album?.images || [];
    const img = imgs.find((i) => i.width >= 250 && i.width <= 400) || imgs[0];
    return {
      id: t.id, uri: t.uri, title: t.name,
      artists: (t.artists || []).map((a) => a.name).join(', '),
      album: t.album?.name || '', year: (t.album?.release_date || '').slice(0, 4), genre: '',
      cover: img?.url || null, durationMs: t.duration_ms || 0, albumId: null, available: true,
    };
  }

  async function withDevice(fn) {
    try { return await fn({}); } catch (e) {
      if (e.message !== 'NO_ACTIVE_DEVICE') throw e;
      const dv = await api('/me/player/devices');
      const dev = dv.devices.find((x) => x.is_active) || dv.devices.find((x) => x.type === 'Computer') || dv.devices[0];
      if (!dev) throw new Error('Откройте Spotify на компьютере');
      return fn({ device_id: dev.id });
    }
  }

  const handlers = {
    status: async () => {
      const hasClientId = !!cid();
      const builtin = !!BUILTIN_CLIENT_ID;
      if (!hasClientId || !d().refresh) return { hasClientId, builtin, authed: false };
      try { await ensureToken(); return { hasClientId, builtin, authed: true }; } catch { return { hasClientId, builtin, authed: false }; }
    },
    clientId: () => {
      const id = /[0-9a-f]{32}/i.exec(ctx.clipboard.readText())?.[0];
      if (!id) throw new Error('В буфере обмена нет Client ID (32 символа)');
      d().clientId = id; d().refresh = null; access = null; ctx.save();
      return true;
    },
    logout: () => { d().refresh = null; access = null; ctx.save(); return true; },

    login: () => new Promise((resolve, reject) => {
      if (!cid()) return reject(new Error('Сначала вставьте Client ID'));
      const verifier = crypto.randomBytes(48).toString('base64url');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      const state = crypto.randomBytes(8).toString('hex');
      const w = new ctx.BrowserWindow({ width: 480, height: 720, title: 'Вход в Spotify', autoHideMenuBar: true, alwaysOnTop: true });
      let done = false;
      const finish = (err) => { if (done) return; done = true; if (!w.isDestroyed()) w.close(); err ? reject(err) : resolve(true); };
      const onNav = async (e, url) => {
        if (!url.startsWith(REDIRECT)) return;
        e?.preventDefault?.();
        const u = new URL(url);
        const code = u.searchParams.get('code');
        if (u.searchParams.get('state') !== state || !code) return finish(new Error(u.searchParams.get('error') || 'Вход отменён'));
        try { await tokenReq({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier }); finish(); } catch (er) { finish(er); }
      };
      w.webContents.on('will-redirect', onNav);
      w.webContents.on('will-navigate', onNav);
      w.on('closed', () => finish(new Error('Окно входа закрыто')));
      w.loadURL('https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id: cid(), response_type: 'code', redirect_uri: REDIRECT,
        code_challenge_method: 'S256', code_challenge: challenge, state, scope: SCOPES,
      }));
    }),

    state: async () => {
      const r = await api('/me/player');
      if (!r || !r.item || r.item.type !== 'track') return { active: false };
      return {
        active: true, playing: r.is_playing, progressMs: r.progress_ms || 0,
        shuffle: r.shuffle_state, volume: r.device?.volume_percent, device: r.device?.name,
        track: norm(r.item),
      };
    },
    queue: async () => {
      const r = await api('/me/player/queue');
      return (r?.queue || []).filter((t) => t.type === 'track').map(norm);
    },
    likedUris: async () => {
      const pages = await Promise.all([0, 50].map((offset) => api('/me/tracks', { query: { limit: 50, offset } })));
      return pages.flatMap((p) => p.items.map((i) => i.track.uri));
    },
    contains: async (id) => (await api('/me/tracks/contains', { query: { ids: id } }))[0],
    like: async ({ id, like }) => { await api('/me/tracks', { method: like ? 'PUT' : 'DELETE', query: { ids: id } }); return true; },

    cmd: async ({ type, value, uris }) => {
      switch (type) {
        case 'play': return withDevice((q) => api('/me/player/play', { method: 'PUT', query: q }));
        case 'pause': return api('/me/player/pause', { method: 'PUT' });
        case 'next': return api('/me/player/next', { method: 'POST' });
        case 'previous': return api('/me/player/previous', { method: 'POST' });
        case 'seek': return api('/me/player/seek', { method: 'PUT', query: { position_ms: Math.round(value) } });
        case 'volume': return api('/me/player/volume', { method: 'PUT', query: { volume_percent: Math.round(value) } });
        case 'shuffle': return api('/me/player/shuffle', { method: 'PUT', query: { state: !!value } });
        case 'playUris': return withDevice((q) => api('/me/player/play', { method: 'PUT', query: q, json: { uris: uris.slice(0, 100) } }));
        default: throw new Error('unknown cmd');
      }
    },
  };

  return {
    id: 'sp',
    name: 'Spotify',
    hosts: ['open.spotify.com', 'developer.spotify.com'],
    modes: [{ id: 'wave', label: 'Сейчас играет' }, { id: 'fav', label: 'Играть избранное' }],
    handlers,
  };
};

// Звук (zvuk.com, неофициальный API): рекомендации редакции без входа, «Моё» после входа.
// Эндпоинты и запросы взяты из открытой библиотеки zvuk-music. Все запросы идут через сетевой стек
// Chromium (session.fetch), потому что сайт ставит cookie и редиректит ботов.
const API = 'https://zvuk.com/api/v1/graphql';
const TINY = 'https://zvuk.com/api/tiny';
const HEAD = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://zvuk.com/',
  Origin: 'https://zvuk.com',
};

const TRACK_FIELDS = `id title duration explicit artists { id title } release { id title date image { src } }`;
const Q = {
  playlistTracks: `query getPlaylistTracks($id: ID!, $limit: Int = 5, $offset: Int = 0) { playlistTracks(id: $id, limit: $limit, offset: $offset) { ${TRACK_FIELDS} } }`,
  getTracks: `query getTracks($ids: [ID!]!) { getTracks(ids: $ids) { ${TRACK_FIELDS} } }`,
  userTracks: `query userTracks($orderBy: TrackOrderByType, $orderDirection: OrderDirectionType) { collection { tracks(orderBy: $orderBy, orderDirection: $orderDirection) { id } } }`,
  like: `mutation addItemToCollection($id: ID, $type: CollectionItemType) { collection { addItem(id: $id, type: $type) } }`,
  unlike: `mutation removeItemFromCollection($id: ID, $type: CollectionItemType) { collection { removeItem(id: $id, type: $type) } }`,
};

module.exports = function createZvuk(ctx) {
  const d = () => ctx.data('zv');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  let sesInit = false;
  const ses = () => {
    const s = ctx.session.fromPartition('persist:zvuk');
    if (!sesInit) { sesInit = true; s.setUserAgent(UA); } // сайт режет «Electron» в User-Agent
    return s;
  };
  const userToken = () => ctx.dec(d().token);
  let anon = null;

  async function raw(url, { token, method = 'GET', json } = {}) {
    const headers = { ...HEAD };
    if (token) headers['X-Auth-Token'] = token;
    if (json) headers['Content-Type'] = 'application/json';
    const r = await ses().fetch(url, { method, headers, body: json ? JSON.stringify(json) : undefined });
    if (r.status === 401) throw new Error('auth');
    const text = await r.text();
    if (!r.ok) { console.error('[zv]', method, url.replace('https://zvuk.com', ''), r.status, text.slice(0, 200)); throw new Error(`HTTP ${r.status}`); }
    try { return JSON.parse(text); } catch { throw new Error('Звук вернул не JSON (возможно, защита от ботов)'); }
  }

  async function token() {
    const t = userToken();
    if (t) return t;
    if (!anon) anon = (await raw(`${TINY}/profile`)).result.token;
    return anon;
  }

  async function gql(operationName, query, variables) {
    const j = await raw(API, { token: await token(), method: 'POST', json: { operationName, query, variables } });
    if (j.errors?.length) throw new Error(j.errors[0].message || 'Ошибка GraphQL');
    return j.data;
  }

  const img = (src) => {
    if (!src) return null;
    const u = new URL(src.startsWith('/') ? `https://zvuk.com${src}` : src);
    u.searchParams.set('size', '400x400');
    return u.toString();
  };
  const norm = (t) => ({
    id: String(t.id), title: t.title, artists: (t.artists || []).map((a) => a.title).join(', '),
    album: t.release?.title || '', year: (t.release?.date || '').slice(0, 4), genre: '',
    cover: img(t.release?.image?.src), durationMs: (t.duration || 0) * 1000, available: true, liked: false,
  });

  async function hydrateIds(ids, liked) {
    const data = await gql('getTracks', Q.getTracks, { ids });
    const byId = new Map((data.getTracks || []).map((t) => [String(t.id), norm(t)]));
    return ids.map((id) => byId.get(String(id))).filter(Boolean).map((t) => ({ ...t, liked: !!liked }));
  }

  const handlers = {
    status: async () => {
      if (!userToken()) return { authed: false };
      try {
        const p = await raw(`${TINY}/profile`, { token: userToken() });
        return { authed: p.result?.profile?.is_anonymous === false };
      } catch { return { authed: false }; }
    },
    login: () => new Promise((resolve) => {
      const w = new ctx.BrowserWindow({ width: 520, height: 720, title: 'Вход в Звук', autoHideMenuBar: true, alwaysOnTop: true, webPreferences: { partition: 'persist:zvuk' } });
      let done = false;
      const finish = (t) => {
        if (done) return; done = true; clearInterval(iv);
        if (t) { d().token = ctx.enc(t); ctx.save(); }
        resolve(!!t); if (!w.isDestroyed()) w.close();
      };
      const iv = setInterval(async () => {
        try {
          const p = (await raw(`${TINY}/profile`)).result?.profile;
          if (p && p.is_anonymous === false && p.token) finish(p.token);
        } catch { /* ждём дальше */ }
      }, 2500);
      w.on('closed', () => finish(null));
      w.loadURL('https://zvuk.com/');
    }),
    logout: () => { d().token = null; ctx.save(); return true; },

    // режимы: rec (редакционные плейлисты) | likes
    load: async ({ mode }) => {
      if (mode === 'rec') {
        const g = await raw(`${TINY}/grid/content?name=editorial_playlist&ranker_enabled=true`, { token: await token() });
        const pls = (g.result?.page?.data || g.page?.data || []).filter((i) => i.type === 'playlist');
        if (!pls.length) throw new Error('Звук не вернул плейлисты');
        const pl = pls[Math.floor(Math.random() * Math.min(pls.length, 12))];
        const data = await gql('getPlaylistTracks', Q.playlistTracks, { id: String(pl.id), limit: 100, offset: 0 });
        return { tracks: (data.playlistTracks || []).map(norm), rest: [] };
      }
      if (mode === 'likes') {
        if (!userToken()) throw new Error('auth');
        const data = await gql('userTracks', Q.userTracks, { orderBy: 'dateAdded', orderDirection: 'desc' });
        const ids = (data.collection?.tracks || []).map((t) => String(t.id));
        return { tracks: await hydrateIds(ids.slice(0, 50), true), rest: ids.slice(50) };
      }
      throw new Error('unknown mode');
    },
    tracks: ({ ids, liked }) => hydrateIds(ids, liked),
    url: async (id) => {
      const j = await raw(`${TINY}/track/stream?id=${encodeURIComponent(id)}&quality=mid`, { token: await token() });
      const u = j.result?.stream || j.stream;
      if (!u) throw new Error('Трек недоступен');
      return u;
    },
    like: async ({ id, like }) => {
      if (!userToken()) throw new Error('auth');
      await gql(like ? 'addItemToCollection' : 'removeItemFromCollection', like ? Q.like : Q.unlike, { id: String(id), type: 'track' });
      return true;
    },
  };

  return {
    id: 'zv',
    name: 'Звук',
    hosts: ['zvuk.com'],
    modes: [{ id: 'rec', label: 'Рекомендации' }, { id: 'likes', label: 'Моё' }],
    handlers,
  };
};

// Скробблинг в Last.fm: песня засчитывается, когда прослушана половина (или 4 минуты), если она длиннее 30 секунд.
// Ключ API и секрет пользователь создаёт у себя на last.fm/api/account/create; пароль нигде не хранится (нужен один раз для входа),
// а сессия лежит зашифрованной в защищённом хранилище Windows. Если сети нет, прослушанное ждёт в очереди.
const crypto = require('node:crypto');

const API = 'https://ws.audioscrobbler.com/2.0/';
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

module.exports = (ctx) => {
  const data = () => ctx.data('lastfm');
  const conf = () => {
    try { const c = JSON.parse(ctx.dec(data().cfg) || 'null'); return c?.session ? c : null; } catch { return null; }
  };

  async function call(key, secret, sk, method, params) {
    const all = { ...params, method, api_key: key };
    if (sk) all.sk = sk;
    const sig = md5(Object.keys(all).sort().map((k) => k + all[k]).join('') + secret);
    const body = new URLSearchParams({ ...all, api_sig: sig, format: 'json' });
    const r = await ctx.fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10000) });
    return r.json().catch(() => ({}));
  }

  // ── очередь отправки ──
  let sending = false;
  async function flush() {
    const c = conf(); const q = data().queue;
    if (!c || sending || !Array.isArray(q) || !q.length) return;
    sending = true;
    try {
      const batch = q.slice(0, 50), p = {};
      batch.forEach((o, i) => {
        p[`artist[${i}]`] = o.a; p[`track[${i}]`] = o.t; p[`timestamp[${i}]`] = String(o.ts);
        if (o.d > 0) p[`duration[${i}]`] = String(o.d);
      });
      const r = await call(c.key, c.secret, c.session, 'track.scrobble', p);
      // ответ получен (даже с отказом по плохой записи): убираем отправленное, иначе очередь застрянет
      if (!r.error || r.error === 6) { data().queue = data().queue.slice(batch.length); ctx.save(); }
    } catch { /* нет сети: отправим позже */ } finally { sending = false; }
  }
  function enqueue(a, t, ts, d) {
    const q = (data().queue ||= []);
    q.push({ a, t, ts, d });
    if (q.length > 200) q.splice(0, q.length - 200);
    ctx.save();
    flush();
  }

  // ── что играет ──
  const f = { id: '', title: '', artist: '', dur: 0, playing: false, started: 0, acc: 0, last: 0, done: false };
  function tick() { const n = Date.now(); if (f.playing && f.last) f.acc += n - f.last; f.last = n; }
  function check() {
    if (f.done || !f.id || f.dur < 30) return;
    if (f.acc >= Math.min(f.dur * 500, 240000)) { f.done = true; enqueue(f.artist, f.title, f.started, Math.round(f.dur)); }
  }
  function nowPlaying() {
    const c = conf(); if (!c) return;
    const p = { artist: f.artist, track: f.title };
    if (f.dur > 0) p.duration = String(Math.round(f.dur));
    call(c.key, c.secret, c.session, 'track.updateNowPlaying', p).catch(() => {});
  }
  const timer = setInterval(() => { tick(); check(); flush(); }, 10000);
  timer.unref?.();

  const text = (v, n) => String(v ?? '').slice(0, n);

  return {
    handlers: {
      status: async () => ({ user: conf()?.user || null }),
      logout: async () => { delete data().cfg; delete data().queue; ctx.save(); return true; },
      login: async ({ key, secret, user, pass } = {}) => {
        key = text(key, 64).trim(); secret = text(secret, 64).trim(); user = text(user, 64).trim(); pass = text(pass, 200);
        if (!key || !secret || !user || !pass) throw new Error('Заполните все четыре поля');
        const r = await call(key, secret, null, 'auth.getMobileSession', { username: user, password: pass });
        if (!r.session) throw new Error(r.message || 'Не удалось войти в Last.fm');
        data().cfg = ctx.enc(JSON.stringify({ key, secret, session: r.session.key, user: r.session.name }));
        ctx.save();
        return { user: r.session.name };
      },
      // состояние плеера из окна острова: { t, a, d (секунды), p }
      state: async (s = {}) => {
        if (!conf()) return false;
        const title = text(s.t, 300), artist = text(s.a, 300).split(/,\s*/)[0];
        tick();
        if (!title && !artist) { f.id = ''; f.playing = false; return true; }
        const id = `${title}|${artist}`, playing = !!s.p, dur = Number(s.d) > 0 ? Number(s.d) : 0;
        if (id !== f.id) {
          Object.assign(f, { id, title, artist, dur, acc: 0, done: false, started: Math.floor(Date.now() / 1000) });
          if (playing) nowPlaying();
        } else {
          if (dur) f.dur = dur;
          if (playing && !f.playing && f.acc === 0) nowPlaying();
        }
        f.playing = playing; f.last = Date.now();
        check();
        return true;
      },
    },
    user: () => conf()?.user || null,
  };
};

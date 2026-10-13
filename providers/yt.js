// YouTube: поиск и «микс» через внутренний API youtubei, воспроизведение — официальный IFrame-плеер.
// Плеер живёт в скрытом iframe со страницы http://localhost:порт (с file:// YouTube отвечает ошибкой 153,
// а с адреса 127.0.0.1 — ошибкой 150, поэтому именно localhost).
const http = require('http');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const CTX = { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'ru', gl: 'RU' } };
const FRAME = path.join(__dirname, '..', 'src', 'providers', 'yt-frame.html');

module.exports = function createYouTube(ctx) {
  let server = null, port = 0;

  async function ensureServer() {
    if (server) return port;
    server = http.createServer((req, res) => {
      if (req.url.split('?')[0] !== '/yt.html') { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
      res.end(fs.readFileSync(FRAME));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
    return port;
  }

  async function post(endpoint, body) {
    const r = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Origin: 'https://www.youtube.com' },
      body: JSON.stringify({ context: CTX, ...body }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  const txt = (o) => o?.simpleText || (o?.runs || []).map((r) => r.text).join('') || '';
  const dur = (s) => (s ? s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0) * 1000 : 0);
  const cover = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const track = (id, title, artist, length) => ({
    id, title, artists: artist, album: '', year: '', genre: '', cover: cover(id), durationMs: dur(length), available: true,
  });

  // песни, а не часовые сборники: от 1:30 до 9 минут
  const isSong = (t) => t.durationMs >= 90000 && t.durationMs <= 9 * 60000;

  async function search(query) {
    const s = await post('search', { query, params: 'EgIQAQ%3D%3D' });
    const out = [];
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (o.videoRenderer?.videoId) {
        const v = o.videoRenderer;
        out.push(track(v.videoId, txt(v.title), txt(v.ownerText), txt(v.lengthText)));
      }
      for (const k in o) walk(o[k]);
    };
    walk(s);
    return out.filter(isSong);
  }

  async function mix(videoId, playlistId) {
    const n = await post('next', { videoId, playlistId: playlistId || `RD${videoId}` });
    const list = n?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents || [];
    return list.map((c) => c.playlistPanelVideoRenderer).filter(Boolean)
      .map((v) => track(v.videoId, txt(v.title), txt(v.longBylineText).split(' • ')[0], txt(v.lengthText)))
      .filter(isSong);
  }

  function parseLink(text) {
    const v = /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/.exec(text)?.[1];
    const list = /[?&]list=([\w-]+)/.exec(text)?.[1];
    return { v, list };
  }

  return {
    id: 'yt',
    name: 'YouTube',
    hosts: ['www.youtube.com', 'music.youtube.com', 'youtu.be'],
    modes: [{ id: 'trend', label: 'Популярное' }, { id: 'link', label: 'Ссылка из буфера' }],
    dispose: () => server?.close(),
    handlers: {
      port: () => ensureServer(),
      logout: () => true,
      load: async ({ mode }) => {
        if (mode === 'trend') {
          const seed = (await search('official music video new songs')).slice(0, 12);
          if (!seed.length) throw new Error('YouTube ничего не вернул');
          return { tracks: seed };
        }
        if (mode === 'link') {
          const { v, list } = parseLink(ctx.clipboard.readText());
          if (!v && !list) throw new Error('В буфере нет ссылки на YouTube');
          const tracks = await mix(v || '', list && !list.startsWith('RD') ? list : undefined).catch(() => []);
          if (v && !tracks.some((t) => t.id === v)) {
            const one = await post('next', { videoId: v }).then((n) => {
              const t = n?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]?.videoPrimaryInfoRenderer;
              return track(v, txt(t?.title) || v, '', '');
            }).catch(() => track(v, v, '', ''));
            tracks.unshift(one);
          }
          if (!tracks.length) throw new Error('Не удалось открыть ссылку');
          return { tracks };
        }
        throw new Error('unknown mode');
      },
      // продолжение — микс по последнему треку (как «радио»)
      more: async ({ lastId }) => (lastId ? mix(lastId) : []),
    },
  };
};

// Тексты песен для «Караоке»: сервис LRCLIB (открытая база, без ключей и аккаунтов, https://lrclib.net).
// Туда уходят только название, исполнитель, альбом и длительность трека. Ничего другого не отправляется.
const API = 'https://lrclib.net/api';
const UA = 'MusicIsland (https://github.com/luviel19/Music_Island)';

// строки вида «[01:23.45] слова»; несколько меток на строку допускаются, служебные теги ([ar:...]) пропускаются
function parseLrc(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const s = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
      out.push({ t: Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac, s });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

const plainLines = (text) => String(text || '').split(/\r?\n/).map((s) => ({ t: null, s: s.trim() }));

// «Песня (feat. X) - Remastered 2011» -> «Песня»: у разных сервисов названия оформлены по-разному
function cleanTitle(title) {
  return String(title || '').replace(/[(\[][^)\]]*[)\]]/g, ' ').replace(/\s+[-–—]\s+.*$/, ' ').replace(/\s+/g, ' ').trim();
}

const str = (v, n) => String(v == null ? '' : v).slice(0, n);

function pick(list, durSec) {
  const ok = (list || []).filter((x) => x && (x.syncedLyrics || x.plainLyrics));
  if (!ok.length) return null;
  const near = (x) => (durSec && x.duration ? Math.abs(x.duration - durSec) : 0);
  const good = ok.filter((x) => !durSec || !x.duration || near(x) <= 6);
  const pool = good.length ? good : [];
  return pool.sort((a, b) => (!!b.syncedLyrics - !!a.syncedLyrics) || near(a) - near(b))[0] || null;
}

function shape(hit) {
  if (!hit) return { lines: [], synced: false };
  const synced = hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : [];
  if (synced.length) return { lines: synced, synced: true };
  return { lines: plainLines(hit.plainLyrics), synced: false };
}

// fetchJson(url) -> объект или null при 404
async function find(track, fetchJson) {
  const title = str(track.title, 200), artist = str(track.artist, 200);
  if (!title) return { lines: [], synced: false };
  const durSec = track.durationMs > 0 ? Math.round(track.durationMs / 1000) : 0;
  const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

  let exact = null;
  try { exact = await fetchJson(`${API}/get?${q({ track_name: title, artist_name: artist, album_name: str(track.album, 200), duration: durSec })}`); } catch { /* сервис занят: пробуем поиск */ }
  const hit = pick(exact ? [exact] : [], durSec);
  if (hit) return shape(hit);

  const clean = cleanTitle(title) || title;
  for (const query of [q({ track_name: clean, artist_name: artist }), q({ q: `${artist} ${clean}`.trim() })]) {
    const found = pick(await fetchJson(`${API}/search?${query}`), durSec);
    if (found) return shape(found);
  }
  return { lines: [], synced: false };
}

module.exports = { parseLrc, plainLines, cleanTitle, pick, find, UA };

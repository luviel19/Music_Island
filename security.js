// Проверки данных и источников: настройки, сообщения окна, адреса медиа. Без зависимостей от Electron (проверяется тестами).

const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bool = (v) => typeof v === 'boolean';
const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const str = (v, max) => typeof v === 'string' && v.length <= max;
const ID = /^[A-Za-z0-9_-]{1,32}$/;

// копия без опасных ключей (__proto__ и т.п.) и с ограничением глубины
function clean(v, depth = 0) {
  if (depth > 6) return undefined;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => clean(x, depth + 1));
  if (isObj(v)) {
    const o = {};
    for (const k of Object.keys(v).slice(0, 200)) if (!DANGEROUS.has(k)) o[k] = clean(v[k], depth + 1);
    return o;
  }
  return typeof v === 'string' ? v.slice(0, 8192) : v;
}

function eq(v) {
  if (!isObj(v)) return undefined;
  const db = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(12, Math.max(-12, x)) : 0);
  const bands = (b) => Array.from({ length: 10 }, (_, i) => db(Array.isArray(b) ? b[i] : 0));
  return {
    on: !!v.on,
    preset: str(v.preset, 32) ? v.preset : 'flat',
    bands: bands(v.bands),
    preamp: db(v.preamp),
    custom: (Array.isArray(v.custom) ? v.custom : [])
      .filter((p) => isObj(p) && str(p.name, 64) && p.name.trim())
      .slice(0, 20)
      .map((p) => ({ name: p.name.trim().slice(0, 24), bands: bands(p.bands), preamp: db(p.preamp) })),
  };
}

function tune(v) {
  if (!isObj(v)) return undefined;
  const out = {};
  for (const id of Object.keys(v).slice(0, 16)) {
    if (!ID.test(id) || DANGEROUS.has(id) || !isObj(v[id])) continue;
    out[id] = {};
    for (const g of Object.keys(v[id]).slice(0, 32)) {
      if (ID.test(g) && !DANGEROUS.has(g) && str(v[id][g], 64)) out[id][g] = v[id][g];
    }
  }
  return out;
}

// Значения, которые окно может менять через settings:set. Некорректные значения отбрасываются.
function sanitizePatch(patch, sources) {
  const p = isObj(patch) ? patch : {};
  const out = {};
  for (const k of ['alwaysOnTop', 'hoverExpand', 'lockPosition', 'shuffle']) if (bool(p[k])) out[k] = p[k];
  if (str(p.source, 32) && sources.includes(p.source)) out.source = p.source;
  if (str(p.mode, 32) && ID.test(p.mode)) out.mode = p.mode;
  if ('eq' in p) { const e = eq(p.eq); if (e) out.eq = e; }
  if ('tune' in p) { const t = tune(p.tune); if (t) out.tune = t; }
  return out;
}

// Содержимое settings.json: берём только известные ключи с правильными типами
function sanitizeStored(raw, sources) {
  const r = isObj(raw) ? raw : {};
  const out = sanitizePatch(r, sources);
  for (const k of ['x', 'y']) out[k] = num(r[k], -100000, 100000) ? r[k] : null;
  if (bool(r.autoStart)) out.autoStart = r.autoStart;
  if (isObj(r.providers)) out.providers = clean(r.providers);
  if (['off', 'builtin', 'custom'].includes(r.proxyMode)) out.proxyMode = r.proxyMode;
  for (const k of ['proxy', 'proxyCustom', 'proxyLast', 'token', 'spClientId', 'spRefresh']) if (str(r[k], 8192)) out[k] = r[k];
  if (Array.isArray(r.insecureOk)) out.insecureOk = r.insecureOk.filter((x) => str(x, 255)).slice(0, 50);
  return out;
}

// Каналы, которые интерфейс острова может вызывать (дублируются в preload.js: там нельзя подключать файлы)
const PROVIDER_IDS = ['ym', 'sc', 'yt', 'sp', 'zv', 'media'];
const INVOKE = new RegExp(`^(settings:(get|set)|update:(get|open)|open:external|lyrics:get|(${PROVIDER_IDS.join('|')}):[A-Za-z]{1,32})$`);
const SEND = new Set(['win:ignore', 'win:focusable', 'win:box', 'win:drag-start', 'win:drag-move', 'win:drag-end']);
const RECEIVE = new Set(['update', 'settings', 'cmd', 'shift']);

// Сервисы, чьи аудиопотоки нужны эквалайзеру (Яндекс Музыка и SoundCloud)
const MEDIA_HOST = /(^|\.)(yandex\.(net|ru|com|by|kz|uz)|sndcdn\.com|soundcloud\.com)$/i;
function isMediaHost(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && MEDIA_HOST.test(u.hostname); } catch { return false; }
}

module.exports = { sanitizePatch, sanitizeStored, clean, INVOKE, SEND, RECEIVE, PROVIDER_IDS, isMediaHost };

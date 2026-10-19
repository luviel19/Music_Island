const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const sec = require('../security');
const { configFor } = require('../tunnel');

const IDS = ['ym', 'sc', 'yt', 'sp', 'media'];

test('settings:set отбрасывает неизвестные ключи и неверные значения', () => {
  const p = sec.sanitizePatch({ alwaysOnTop: 'yes', hoverExpand: false, source: 'evil', mode: 'a b', token: 'x', __proto__: { polluted: 1 }, shuffle: true }, IDS);
  assert.deepStrictEqual(p, { hoverExpand: false, shuffle: true });
  assert.strictEqual(({}).polluted, undefined);
  assert.deepStrictEqual(sec.sanitizePatch({ source: 'sp', mode: 'tracks' }, IDS), { source: 'sp', mode: 'tracks' });
  assert.deepStrictEqual(sec.sanitizePatch(null, IDS), {});
});

test('эквалайзер и настройка волны приводятся к безопасному виду', () => {
  const p = sec.sanitizePatch({ eq: { on: 1, preset: 'x'.repeat(99), bands: [99, -99, 'a'], preamp: 50, custom: [{ name: ' мой ', bands: [1] }, { name: '' }, 5] }, tune: { ym: { mood: 'sad', bad: 1 }, 'a b': {}, evil: 'x' } }, IDS);
  assert.strictEqual(p.eq.on, true);
  assert.strictEqual(p.eq.preset, 'flat');
  assert.strictEqual(p.eq.bands.length, 10);
  assert.deepStrictEqual(p.eq.bands.slice(0, 3), [12, -12, 0]);
  assert.strictEqual(p.eq.preamp, 12);
  assert.deepStrictEqual(p.eq.custom.map((c) => c.name), ['мой']);
  assert.deepStrictEqual(p.tune, { ym: { mood: 'sad' } });
});

test('settings.json: берутся только известные поля, __proto__ не проходит', () => {
  const raw = JSON.parse('{"x":10,"y":"bad","alwaysOnTop":true,"proxyMode":"hack","proxy":"1.2.3.4:80","providers":{"ym":{"token":"enc:abc"},"__proto__":{"p":1}},"unknown":1,"insecureOk":["h:1",5]}');
  const s = sec.sanitizeStored(raw, IDS);
  assert.strictEqual(s.x, 10);
  assert.strictEqual(s.y, null);
  assert.strictEqual(s.proxyMode, undefined);
  assert.strictEqual(s.unknown, undefined);
  assert.strictEqual(s.providers.ym.token, 'enc:abc');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(s.providers, '__proto__'), false);
  assert.deepStrictEqual(s.insecureOk, ['h:1']);
  assert.deepStrictEqual(sec.sanitizeStored('мусор', IDS), { x: null, y: null });
});

test('разрешённые каналы IPC', () => {
  for (const ok of ['settings:get', 'settings:set', 'update:open', 'open:external', 'sp:queuePlay', 'ym:wave', 'media:cmd']) assert.ok(sec.INVOKE.test(ok), ok);
  for (const bad of ['app:quit', 'shell:run', 'sp:', 'sp:a-b', 'evil:wave', 'settings:delete', 'ym:wave;x']) assert.ok(!sec.INVOKE.test(bad), bad);
});

test('preload.js дублирует списки security.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.ok(src.includes(sec.INVOKE.source), 'INVOKE');
  for (const c of sec.SEND) assert.ok(src.includes(`'${c}'`), c);
  for (const c of sec.RECEIVE) assert.ok(src.includes(`'${c}'`), c);
});

test('все каналы из интерфейса разрешены', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const used = new Set();
  for (const f of walk(path.join(__dirname, '..', 'src'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:call|raw|invoke)\('([a-z]+:[A-Za-z]+)'/g)) used.add(m[1]);
  assert.ok(used.size > 30);
  for (const c of used) assert.ok(sec.INVOKE.test(c), c);
});

test('CORS добавляется только для аудио Яндекс Музыки и SoundCloud', () => {
  assert.ok(sec.isMediaHost('https://s1.storage.yandex.net/get-mp3/x'));
  assert.ok(sec.isMediaHost('https://cf-media.sndcdn.com/a.mp3'));
  assert.ok(!sec.isMediaHost('http://s1.storage.yandex.net/x'));
  assert.ok(!sec.isMediaHost('https://evilyandex.net/x'));
  assert.ok(!sec.isMediaHost('https://example.com/a.mp3'));
});

test('hysteria2: проверка сертификата включена, insecure только с согласием', () => {
  const link = 'hysteria2://pass@example.com:443/?sni=example.com&insecure=1';
  assert.ok(!/insecure/.test(configFor(link, 1080)));
  assert.ok(!/insecure/.test(configFor(link, 1080, false)));
  assert.ok(/insecure: true/.test(configFor(link, 1080, true)));
  assert.ok(!/insecure/.test(configFor('hysteria2://pass@example.com:443/', 1080, true)));
});

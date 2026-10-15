// Проверка чистой логики эквалайзера: пресеты и нормализация настроек.
const test = require('node:test');
const assert = require('node:assert');
const Fx = require('../src/audio-fx.js');

test('10 полос от 31 Гц до 16 кГц', () => {
  assert.deepStrictEqual(Fx.FREQS, [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
  assert.strictEqual(Fx.label(16000), '16k');
  assert.strictEqual(Fx.label(500), '500');
});

test('пресеты: 10 значений в пределах ±12 дБ, уникальные id', () => {
  const ids = new Set();
  for (const p of Fx.PRESETS) {
    assert.strictEqual(p.bands.length, 10, p.id);
    assert.ok(p.bands.every((v) => Math.abs(v) <= Fx.MAX_DB), p.id);
    assert.ok(!ids.has(p.id)); ids.add(p.id);
  }
  assert.ok(ids.has('flat'));
});

test('clampDb ограничивает и округляет до 0,5 дБ', () => {
  assert.strictEqual(Fx.clampDb(40), 12);
  assert.strictEqual(Fx.clampDb(-40), -12);
  assert.strictEqual(Fx.clampDb(3.3), 3.5);
  assert.strictEqual(Fx.clampDb('мусор'), 0);
  assert.strictEqual(Fx.clampDb(undefined), 0);
});

test('normState чинит пустые и испорченные настройки', () => {
  const d = Fx.normState(null);
  assert.deepStrictEqual(d, { on: false, preset: 'flat', bands: Fx.flat(), preamp: 0, custom: [] });
  const s = Fx.normState({ on: 1, bands: [99, 'x'], preamp: -50, custom: [{ name: '  Мой  ', bands: [1] }, { name: '' }, null] });
  assert.strictEqual(s.on, true);
  assert.deepStrictEqual(s.bands, [12, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.strictEqual(s.preamp, -12);
  assert.strictEqual(s.custom.length, 1);
  assert.strictEqual(s.custom[0].name, 'Мой');
  assert.strictEqual(s.custom[0].bands.length, 10);
});

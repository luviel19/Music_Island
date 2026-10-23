const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLrc, cleanTitle, pick, find } = require('../lyrics');

test('parseLrc: метки времени, несколько меток, служебные теги', () => {
  const r = parseLrc('[ar:Artist]\n[ti:Song]\n[00:12.50] первая\n[00:05.00][00:30.5]повтор\n[01:02]без долей\nбез метки');
  assert.deepEqual(r.map((x) => x.t), [5000, 12500, 30500, 62000]);
  assert.equal(r[0].s, 'повтор');
  assert.equal(r[3].s, 'без долей');
});

test('cleanTitle: скобки и приписки после тире убираются', () => {
  assert.equal(cleanTitle('Song (feat. X) - Remastered 2011'), 'Song');
  assert.equal(cleanTitle('Plain'), 'Plain');
});

test('pick: учитывает длительность и предпочитает синхронный текст', () => {
  const list = [
    { duration: 300, plainLyrics: 'a' },
    { duration: 201, plainLyrics: 'b' },
    { duration: 203, syncedLyrics: '[00:01.00]c' },
  ];
  assert.equal(pick(list, 200).syncedLyrics, '[00:01.00]c');
  assert.equal(pick(list, 500), null); // ничего подходящего по длительности
  assert.equal(pick([{ duration: 10 }], 10), null); // без текста
});

test('find: точное совпадение, затем поиск', async () => {
  const urls = [];
  const lines = await find({ title: 'Song (Live)', artist: 'Art', album: 'Al', durationMs: 200000 }, async (u) => {
    urls.push(u);
    if (u.includes('/get?')) return null;
    if (u.includes('/search?track_name=Song')) return [{ duration: 199, syncedLyrics: '[00:02.00]hi' }];
    return [];
  });
  assert.equal(lines.synced, true);
  assert.equal(lines.lines[0].s, 'hi');
  assert.ok(urls[0].startsWith('https://lrclib.net/api/get?'));
});

test('find: нет названия — пусто, не обращается в сеть', async () => {
  const r = await find({ title: '' }, async () => { throw new Error('не должно вызываться'); });
  assert.deepEqual(r, { lines: [], synced: false });
});

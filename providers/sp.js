// Spotify: официальный веб-плеер open.spotify.com внутри острова на Microsoft Edge WebView2.
// Нужен только WebView2 Runtime (есть в Windows 10/11). Web API, Client ID и Premium не нужны: человек входит
// на настоящей странице Spotify, а профиль (cookie) хранит сам WebView2 в папке пользователя.
// Страница живёт в отдельном процессе native/spotify-host (SpotifyHost.exe): окно без рамки,
// принадлежащее окну острова. Название, обложку и прогресс берём из медиа-контроля Windows (SMTC),
// кнопки острова нажимают системные медиа-команды. В страницу Spotify ничего не внедряется.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PANEL_W = 760, PANEL_H = 640, TOP_GAP = 236; // панель под островом (самая высокая форма входа — 226)

module.exports = function createSpotify(ctx) {
  let proc = null, buf = '', ready = false, visible = false, authed = null, title = '', error = '';
  let pids = {}, lastHint = null, lastMedia = null, volume = null, ownAudio = false;
  const PAGES = { home: 'https://open.spotify.com/', tracks: 'https://open.spotify.com/collection/tracks', playlists: 'https://open.spotify.com/collection/playlists', queue: 'https://open.spotify.com/queue' };
  let pageUrl = '', preloaded = false;
  const events = []; // кольцевой журнал: только имена событий и ошибки, без cookie, токенов и данных аккаунта
  const log = (m) => { events.push(`${new Date().toISOString().slice(11, 19)} ${m}`); if (events.length > 40) events.shift(); };

  const exe = () => path.join(
    ctx.app.isPackaged ? process.resourcesPath : ctx.root,
    'bin', 'spotify-host', 'SpotifyHost.exe',
  );
  const profileDir = () => path.join(ctx.app.getPath('userData'), 'spotify-profile');
  const available = () => process.platform === 'win32' && fs.existsSync(exe());
  const send = (o) => { try { proc?.stdin.write(JSON.stringify(o) + '\n'); } catch { /* процесс уже закрыт */ } };
  const media = () => ctx.provider('media').handlers;

  function onEvent(o) {
    if (o.ev !== 'title' && o.ev !== 'url' && o.ev !== 'loaded') log(o.ev === 'error' ? `error ${o.msg}` : o.ev === 'auth' ? `auth ${o.authed}` : o.ev);
    if (o.ev === 'ready') {
      ready = true; error = ''; pids = { helper: o.pid, webview2: o.browserPid };
      const v = ctx.data('sp').volume;
      if (typeof v === 'number') send({ cmd: 'volume', v }); // громкость запоминается между запусками
    }
    else if (o.ev === 'auth') {
      authed = !!o.authed;
      if (authed && !visible && !preloaded) { preloaded = true; send({ cmd: 'nav', url: PAGES.tracks }); } // «Моя музыка» потом срабатывает сразу
    }
    else if (o.ev === 'url') pageUrl = String(o.url || '');
    else if (o.ev === 'volume') volume = o.v;
    else if (o.ev === 'loaded') loadedWaiters.splice(0).forEach((f) => f());
    else if (o.ev === 'queue') queueWaiters.splice(0).forEach((f) => f(o));
    else if (o.ev === 'audiodbg') {
      log('audio ' + o.d);
      const own = Number(String(o.d).split('|')[2]) > 0; // у нашего процесса есть звуковая сессия Windows
      if (own !== ownAudio) { ownAudio = own; media().cmd({ type: 'own', value: own }); }
    }
    else if (o.ev === 'loggedout') authed = false;
    else if (o.ev === 'title') title = String(o.title || '');
    else if (o.ev === 'hidden') visible = false;
    else if (o.ev === 'shown') visible = true;
    else if (o.ev === 'error') error = o.msg === 'noruntime' ? 'noruntime' : String(o.msg || 'Ошибка веб-плеера');
  }

  function launch() {
    if (proc) return;
    if (!available()) throw new Error('Не найден модуль веб-плеера Spotify (bin/spotify-host)');
    const win = ctx.getWindow();
    const hwnd = win ? win.getNativeWindowHandle().readBigUInt64LE(0).toString() : '0';
    ready = false; visible = false; authed = null; title = ''; error = ''; buf = ''; pageUrl = ''; preloaded = false;
    proc = spawn(exe(), ['--owner', hwnd, '--profile', profileDir()], { windowsHide: false });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try { onEvent(JSON.parse(line)); } catch { /* битая строка */ }
      }
    });
    proc.stderr.on('data', () => {});
    proc.on('exit', (code) => { log(`exit ${code}`); proc = null; ready = false; visible = false; pids = {}; });
    proc.on('error', (e) => { log(`spawn error ${e.message}`); proc = null; error = e.message; });
  }

  function stop() {
    if (proc) { send({ cmd: 'quit' }); const p = proc; setTimeout(() => p.kill(), 1500); }
    proc = null; ready = false; visible = false;
  }

  // Прямоугольник панели в физических пикселях: под островом по центру окна, а если не влезает — над ним
  function panelRect() {
    const win = ctx.getWindow();
    const b = win.getBounds();
    const wa = ctx.screen.getDisplayMatching(b).workArea;
    const w = Math.min(PANEL_W, wa.width), h = Math.min(PANEL_H, wa.height);
    let x = Math.round(b.x + (b.width - w) / 2);
    let y = b.y + TOP_GAP;
    if (y + h > wa.y + wa.height) y = Math.max(wa.y, b.y - h + 10);
    x = Math.min(Math.max(x, wa.x), wa.x + wa.width - w);
    return ctx.screen.dipToScreenRect(win, { x, y, width: w, height: h });
  }

  // «Моя музыка»: открываем «Любимые треки» в фоне и нажимаем на странице зелёную кнопку Play (как пользователь,
  // но без показа панели). Положение кнопки привязано к вёрстке Spotify, поэтому при неудаче панель открывается сама.
  const loadedWaiters = [], queueWaiters = [];
  const waitLoaded = (ms) => new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    loadedWaiters.push(() => { clearTimeout(t); resolve(true); });
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isPlaying = async () => !!(await media().state()).playing;
  async function playLiked() {
    if (!ready) return false;
    const onPage = pageUrl.startsWith(PAGES.tracks); // страница уже открыта (заранее или прошлым нажатием): ждать нечего
    if (!onPage) {
      const loaded = waitLoaded(15000);
      send({ cmd: 'nav', url: PAGES.tracks });
      if (!(await loaded)) throw new Error('Страница Spotify не загрузилась');
      await sleep(1200); // страница дорисовывается уже после загрузки
    }
    for (let i = 0; i < 2; i++) { // второй клик нужен только если до первого уже играло и клик поставил паузу
      const was = await media().state();
      send({ cmd: 'click', x: 128, y: 290 });
      for (let t = 0; t < 14; t++) { // ждём реакции до 7 с: трек может подгружаться, второй клик в это время поставил бы паузу
        await sleep(500);
        const now = await media().state();
        if (now.playing && (!was.playing || now.title !== was.title)) return true; // заиграло или сменился трек
        if (was.playing && !now.playing) break; // поставило на паузу: нажмём ещё раз
      }
      if (!was.playing) break;
    }
    handlers.show(); // не вышло: показываем страницу, чтобы нажать Play вручную
    throw new Error('Не удалось запустить «Любимые треки» сами, нажмите Play на странице');
  }

  // Очередь: читаем правую панель страницы из дерева доступности (панель сама открывается кнопкой плеера, без перехода по адресу,
  // чтобы не перезагрузить страницу и не остановить музыку)
  let queueBusy = null;
  function readQueue() { // одно чтение за раз: два нажатия кнопки очереди подряд закрыли бы панель
    if (!queueBusy) queueBusy = readQueueNow().finally(() => { queueBusy = null; });
    return queueBusy;
  }
  async function readQueueNow() {
    if (!ready) throw new Error('Spotify ещё запускается');
    for (let attempt = 0; attempt < 1; attempt++) {
      const got = new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), 10000);
        queueWaiters.push((o) => { clearTimeout(t); resolve(o); });
      });
      send({ cmd: 'queue' });
      const o = await got;
      if (o?.items?.length) return o.items;
    }
    return [];
  }

  const handlers = {
    // запуск веб-плеера; сам плеер остаётся скрытым, пока он не нужен (вход или просмотр библиотеки)
    start: () => {
      launch();
      media().start();
      // Сессия нашего плеера: свой AppUserModelId, а если Windows его не применила — только WebView2-сессия, чьё название совпало с заголовком страницы (чужие плееры не берём)
      media().cmd({ type: 'filter', value: 'MusicIsland.Spotify', fallback: 'msedgewebview2' });
      lastHint = null; ownAudio = false;
      return { available: true };
    },
    stop: () => { stop(); return true; },
    state: async () => {
      const st = { proc: proc ? (ready ? 'ready' : 'starting') : 'off', authed, visible, title, error, volume };
      if (ready && authed) {
        if (title !== lastHint) { lastHint = title; media().cmd({ type: 'hint', value: title }); }
        st.media = lastMedia = await media().state();
      }
      return st;
    },
    diag: () => {
      const m = lastMedia || {};
      return {
        webview2Runtime: ready ? 'ok' : error === 'noruntime' ? 'missing' : proc ? 'starting' : 'off',
        pids, authed, panelVisible: visible, pageTitle: title, error,
        smtc: { note: m.note, aumid: m.aumid, active: m.active, track: m.title ? `${m.artist} - ${m.title}` : '', playing: m.playing },
        events,
      };
    },
    queue: async () => {
      const items = await readQueue();
      const fresh = await media().state();
      const m = fresh && fresh.active ? fresh : null;
      return { items, current: m && { title: m.title, artist: m.artist, cover: m.cover, durMs: m.durMs } };
    },
    queuePlay: ({ n }) => { send({ cmd: 'queueplay', n: +n }); return true; },
    show: () => { if (!ready) return false; const r = panelRect(); send({ cmd: 'show', x: r.x, y: r.y, w: r.width, h: r.height }); send({ cmd: 'focus' }); return true; },
    hide: () => { send({ cmd: 'hide' }); return true; },
    volume: ({ v }) => {
      v = Math.min(1, Math.max(0, +v || 0));
      ctx.data('sp').volume = v; ctx.save();
      send({ cmd: 'volume', v });
      return true;
    },
    // разделы своей музыки открываются на официальных страницах Spotify в панели
    nav: async ({ to }) => {
      if (!PAGES[to]) throw new Error('bad page');
      if (to === 'tracks') return playLiked();
      // переход по адресу перезагружает страницу и обрывает музыку: пока что-то играет, просто показываем панель
      if (ready && (await media().state()).playing) return handlers.show();
      send({ cmd: 'nav', url: PAGES[to] });
      return handlers.show();
    },
    // поиск: официальная страница поиска Spotify в панели (своего списка результатов у встроенного плеера нет)
    search: ({ q, kind }) => {
      const t = String(q || '').trim().slice(0, 100);
      if (!t) return false;
      send({ cmd: 'nav', url: 'https://open.spotify.com/search/' + encodeURIComponent(t) + (kind === 'albums' ? '/albums' : '') });
      return handlers.show();
    },
    home: () => { send({ cmd: 'home' }); return true; },
    logout: () => {
      if (proc) send({ cmd: 'logout' });
      else { try { fs.rmSync(profileDir(), { recursive: true, force: true }); } catch { /* занято */ } authed = false; }
      return true;
    },
  };

  return { id: 'sp', name: 'Spotify', hosts: ['open.spotify.com', 'spotify.com'], modes: [], handlers, dispose: stop };
};

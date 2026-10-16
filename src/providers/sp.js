// Spotify: официальный веб-плеер внутри острова (Microsoft Edge WebView2, процесс native/spotify-host).
// Вход и библиотека — на настоящей странице open.spotify.com в панели под островом. Название, обложка и прогресс
// приходят из медиа-контроля Windows, команды — системные медиа-клавиши. Лайка, очереди, громкости и
// собственного поиска у такого способа нет, поэтому в caps они выключены (поиск и библиотека — в самой странице).
// Обложек у строк очереди страница не отдаёт, поэтому вместо них логотип Spotify
const SP_LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1ed760"/><path d="M6.5 9.3c3.6-1.1 7.6-.8 11 1M7.2 12.6c3-.9 6.2-.6 9 .9M8 15.7c2.4-.7 4.8-.4 6.9.7" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>');
Providers.register((() => {
  let host = null, active = false, timer = null, busy = false, panel = false;
  let qNodes = []; // узлы страницы очереди для кнопок Play (0 — текущий трек)
  let key = null, hold = 0, idle = false, lastCover = '', status = '';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = () => host.call('sp:state');

  function say(text) {
    if (text === status) return;
    status = text;
    host.setTrack(null, text);
  }

  async function poll() {
    if (busy || !active) return;
    busy = true;
    try { apply(await state()); } catch (e) { say(e.message); } finally { busy = false; }
  }

  function apply(st) {
    if (!active) return;
    panel = !!st.visible;
    if (st.proc === 'off') { say('Не подключён'); return; }
    if (st.error === 'noruntime') { say('Ошибка: не найден Microsoft Edge WebView2 Runtime'); return; }
    if (st.error) { say(`Ошибка: ${st.error}`); return; }
    if (st.proc === 'starting') { say('Запуск Spotify…'); return; }
    if (!st.authed) { say(st.visible ? 'Авторизация…' : 'Не подключён'); return; }
    const m = st.media;
    if (!m?.ready || !m.active) {
      if (key !== null || !idle || status !== 'Подключён: включите песню в Spotify') {
        key = null; idle = true; lastCover = ''; status = 'Подключён: включите песню в Spotify';
        host.setPlaying(false);
        host.setTrack(null, status);
      }
      return;
    }
    idle = false; status = '';
    const k = `${m.title}|${m.artist}`;
    if (k !== key || m.cover !== lastCover) {
      key = k; lastCover = m.cover;
      host.setTrack({
        id: k, title: m.title, artists: m.artist || 'Spotify', album: m.album || '', year: '', genre: '',
        app: 'Spotify', cover: m.cover || null, durationMs: m.durMs || 0,
      }, '');
    }
    if (Date.now() > hold) host.setPlaying(!!m.playing);
    if (typeof st.volume === 'number') host.setVolume(st.volume);
    host.setProgress(m.posMs || 0, m.durMs || 0);
  }

  const cmd = async (type, value) => {
    await host.call('media:cmd', { type, value });
    setTimeout(poll, 250);
  };

  async function waitReady() {
    for (let i = 0; i < 80; i++) {
      const st = await state();
      if (st.error) throw new Error(st.error === 'noruntime' ? 'Не найден Microsoft Edge WebView2 Runtime (ставится вместе с Edge)' : st.error);
      if (st.proc === 'ready') return st;
      await sleep(250);
    }
    throw new Error('Веб-плеер Spotify не запустился');
  }

  return {
    id: 'sp',
    name: 'Spotify',
    hint: 'Официальный веб-плеер внутри острова',
    icon: 'i-sp',
    // свои разделы Spotify: открываются в панели на официальных страницах
    modes: [
      { id: 'home', icon: 'i-trend', tip: 'Главная' },
      { id: 'tracks', icon: 'i-heart', tip: 'Моя музыка' },
      { id: 'playlists', icon: 'i-list', tip: 'Плейлисты' },
    ],
    // только то, что реально работает: перемешивание и лайк убраны (состояние страницы Spotify прочитать нельзя), эквалайзер недоступен
    caps: { shuffle: false, like: false, queue: true, info: false, volume: true, eq: false, panel: true, search: 'web' },

    async start(h) {
      host = h;
      status = ''; say('Запуск Spotify…');
      await host.call('sp:start');
      active = true; key = null; idle = false; lastCover = '';
      const st = await waitReady();
      if (!st.authed) {
        // даём странице секунду определить вход по cookie, чтобы не просить вход зря
        await sleep(3200);
        if (!(await state()).authed) { active = false; return 'auth'; }
      }
      poll();
      timer = setInterval(poll, 1000);
      return 'ok';
    },
    stop() {
      active = false; clearInterval(timer); panel = false;
      host?.call('sp:stop').catch(() => {});
      host?.call('media:stop').catch(() => {}); // фильтр SMTC действует только на время Spotify
    },

    async togglePanel() {
      const on = !panel;
      await host.call(on ? 'sp:show' : 'sp:hide');
      panel = on;
    },

    setMode: (mode) => host.call('sp:nav', { to: mode }),
    async searchWeb(q) { if (await host.call('sp:search', { q })) host.flash('Результаты поиска Spotify открыты в панели'); },
    toggle() {
      const was = host.isPlaying();
      host.setPlaying(!was); hold = Date.now() + 1200;
      return cmd('toggle');
    },
    next: () => cmd('next'),
    prev: () => cmd('prev'),
    seek: (ms) => cmd('seek', ms),
    // громкость звуковой сессии веб-плеера в Windows: точная, значение читается обратно
    setVolume: (v) => host.call('sp:volume', { v }),
    like() {},
    toggleShuffle() {},
    // очередь читается со страницы /queue (текущий трек + «Далее»); выбор строки нажимает Play на странице
    async getQueue() {
      try {
        const { items, current } = await host.call('sp:queue');
        qNodes = [0, ...items.map((x) => x.n)];
        const list = [];
        if (current) list.push({ id: 'now', title: current.title, artists: current.artist, cover: current.cover || SP_LOGO, durationMs: current.durMs || 0 });
        else list.push(null);
        for (const x of items) list.push({ id: String(x.n), title: x.title, artists: x.artists, cover: SP_LOGO, durationMs: x.dur || 0 });
        const q = list.filter(Boolean);
        if (!current) qNodes.shift();
        host.setQueue(q, current ? 0 : -1);
      } catch (e) { host.setQueue([], -1); host.flash(e.message); }
    },
    playFromQueue(i) {
      const n = qNodes[i];
      if (!n) return;
      host.call('sp:queuePlay', { n }).then(() => setTimeout(poll, 1500));
    },
    trackUrl: () => null,

    authView: () => ({
      title: 'Подключите Spotify',
      text: 'Войдите на официальной странице Spotify. Подойдёт Free и Premium, пароль остаётся только у Spotify.',
      primary: 'Подключить аккаунт',
    }),
    async authAction() {
      await host.call('sp:start');
      await waitReady();
      await host.call('sp:show');
      for (let i = 0; i < 600; i++) { // ждём вход до 10 минут
        await sleep(1000);
        const st = await state();
        if (st.authed) { await host.call('sp:hide'); return true; }
        if (st.proc === 'off') throw new Error('Окно Spotify закрыто');
      }
      await host.call('sp:hide');
      return false;
    },
  };
})());

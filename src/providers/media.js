// Системный плеер: показывает и переключает то, что играет в Windows (Spotify, браузер, любой плеер).
// Без входа и без Premium. Лайка, очереди и своей громкости нет — их нет у системного медиа-контроля.
Providers.register((() => {
  let host = null, active = false, timer = null, busy = false;
  let key = null, hold = 0, idle = false, lastCover = '';

  async function poll() {
    if (busy || !active) return;
    busy = true;
    try { apply(await host.call('media:state')); } catch (e) { host.flash(e.message); } finally { busy = false; }
  }

  function apply(st) {
    if (!active || !st.ready) return;
    if (!st.active) {
      if (key !== null || !idle) {
        key = null; idle = true; lastCover = '';
        host.setPlaying(false);
        host.setTrack(null, 'Ничего не играет');
      }
      return;
    }
    idle = false;
    const k = `${st.app}|${st.title}|${st.artist}`;
    const cover = st.cover || st.appIcon || ''; // нет обложки — значок приложения
    const sig = `${cover.length}|${st.appName}`;
    if (k !== key || sig !== lastCover) {
      key = k; lastCover = sig;
      host.setTrack({
        id: k, title: st.title, artists: st.artist || st.appName || st.app, album: st.album || '', year: '', genre: '',
        app: st.appName || st.app, cover: cover || null, durationMs: st.durMs || 0,
      }, '');
    }
    if (Date.now() > hold) host.setPlaying(!!st.playing);
    host.setProgress(st.posMs || 0, st.durMs || 0);
  }

  const cmd = async (type, value) => {
    await host.call('media:cmd', { type, value });
    setTimeout(poll, 250);
  };

  return {
    id: 'media',
    name: 'Spotify и другие',
    hint: 'Spotify в браузере, любой плеер',
    icon: 'i-media',
    modes: [],
    caps: { shuffle: false, like: false, queue: false, volume: false, eq: false },

    async start(h) {
      host = h;
      host.setTrack(null, 'Подключение…');
      await host.call('media:start');
      active = true; key = null; idle = false; lastCover = '';
      poll();
      timer = setInterval(poll, 1000);
      return 'ok';
    },
    stop() {
      active = false; clearInterval(timer);
      host?.call('media:stop').catch(() => {});
    },

    setMode() {},
    toggle() {
      const was = host.isPlaying();
      host.setPlaying(!was); hold = Date.now() + 1200;
      return cmd('toggle');
    },
    next: () => cmd('next'),
    prev: () => cmd('prev'),
    seek: (ms) => cmd('seek', ms),
    setVolume() {},
    like() {},
    toggleShuffle() {},
    getQueue() { host.setQueue([], -1); },
    playFromQueue() {},
    trackUrl: () => null,

    authView: () => ({ title: 'Spotify и другие', text: '', primary: '' }),
    authAction: async () => true,
  };
})());

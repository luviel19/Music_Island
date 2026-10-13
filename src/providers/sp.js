// Spotify: остров как пульт к приложению Spotify (Web API, нужен Premium).
Providers.register((() => {
  let host = null, active = false, timer = null, busy = false;
  const sp = { id: null, hold: 0, hasId: false, builtin: false, items: [], idle: false };

  const fail = (e) => {
    if (!e || e.message === 'auth') return;
    const m = {
      premium: 'Для управления нужен Spotify Premium',
      ownerpremium: 'У владельца приложения Spotify нет Premium',
      notallowed: 'Аккаунт не добавлен в приложение Spotify (User Management)',
      NO_ACTIVE_DEVICE: 'Откройте Spotify на ПК',
    }[e.message] || e.message;
    if (!sp.id) host.setTrack(null, m);
    host.flash(m);
  };
  async function cmd(c) {
    try { await host.call('sp:cmd', c); } catch (e) { fail(e); }
    setTimeout(poll, 400);
  }

  async function poll() {
    if (busy || !active) return;
    busy = true;
    try { apply(await host.call('sp:state')); } catch (e) { fail(e); } finally { busy = false; }
  }
  function apply(st) {
    if (!active) return;
    if (!st.active) {
      if (sp.id || !sp.idle) { sp.id = null; sp.idle = true; host.setPlaying(false); host.setTrack(null, 'Включите музыку в Spotify'); }
      return;
    }
    sp.idle = false;
    const t = st.track;
    if (sp.id !== t.id) { sp.id = t.id; host.setTrack(t, ''); likeCheck(t); }
    if (Date.now() > sp.hold) host.setPlaying(st.playing);
    host.setProgress(st.progressMs, t.durationMs);
    if (st.volume != null) host.setVolume(st.volume / 100);
    host.setShuffle(!!st.shuffle);
  }
  async function likeCheck(t) {
    try { host.setLiked(await host.call('sp:contains', t.id)); } catch { /* ignore */ }
  }

  let volT, seekT;
  return {
    id: 'sp',
    name: 'Spotify',
    icon: 'i-sp',
    modes: [{ id: 'wave', icon: 'i-wave', tip: 'Сейчас играет' }, { id: 'fav', icon: 'i-heart', tip: 'Играть избранное' }],
    caps: { shuffle: true },

    async start(h) {
      host = h;
      host.setTrack(null, '');
      const st = await host.call('sp:status');
      sp.hasId = st.hasClientId; sp.builtin = st.builtin;
      if (!st.authed) return 'auth';
      active = true; sp.id = null; sp.idle = false;
      poll();
      timer = setInterval(poll, 1500);
      return 'ok';
    },
    stop() { active = false; clearInterval(timer); sp.id = null; },

    async setMode(mode, autoplay) {
      if (mode === 'fav' && autoplay) {
        try {
          let uris = await host.call('sp:likedUris');
          if (!uris.length) return host.flash('В избранном пока пусто');
          if (host.settings.shuffle) uris = uris.sort(() => Math.random() - 0.5);
          await host.call('sp:cmd', { type: 'playUris', uris });
        } catch (e) { fail(e); }
      }
      setTimeout(poll, 500);
    },

    toggle() {
      const was = host.isPlaying();
      host.setPlaying(!was); sp.hold = Date.now() + 1500;
      return cmd({ type: was ? 'pause' : 'play' });
    },
    next: () => cmd({ type: 'next' }),
    prev: () => cmd({ type: 'previous' }),
    seek(ms) {
      clearTimeout(seekT);
      seekT = setTimeout(() => { host.call('sp:cmd', { type: 'seek', value: ms }).catch(fail); }, 250);
    },
    setVolume(v) {
      clearTimeout(volT);
      volT = setTimeout(() => host.call('sp:cmd', { type: 'volume', value: v * 100 }).catch(fail), 120);
    },
    async like(on) {
      if (!sp.id) return;
      await host.call('sp:like', { id: sp.id, like: on });
    },
    toggleShuffle() { return cmd({ type: 'shuffle', value: !host.shuffleOn() }); },
    async getQueue() {
      try { sp.items = await host.call('sp:queue'); } catch { sp.items = []; }
      host.setQueue(sp.items, -1);
    },
    playFromQueue: (i) => cmd({ type: 'playUris', uris: sp.items.slice(i).map((x) => x.uri) }),
    trackUrl: (t) => `https://open.spotify.com/track/${t.id}`,

    authView() {
      if (!sp.hasId) {
        return {
          title: 'Spotify', tall: true,
          text: 'Создайте приложение на developer.spotify.com (Redirect URI: http://127.0.0.1:53682/callback), скопируйте его Client ID и нажмите кнопку ниже.',
          primary: 'Вставить Client ID из буфера',
          link: { label: 'Открыть developer.spotify.com', url: 'https://developer.spotify.com/dashboard' },
        };
      }
      return {
        title: 'Spotify', tall: true,
        text: 'Остров управляет Spotify на вашем ПК. Нужен аккаунт Premium.',
        primary: 'Войти через Spotify',
        secondary: sp.builtin ? '' : 'Заменить Client ID (из буфера обмена)',
      };
    },
    async authAction(kind) {
      if (kind === 'secondary' || !sp.hasId) {
        await host.call('sp:clientId');
        sp.hasId = true;
        return false;
      }
      return host.call('sp:login');
    },
  };
})());

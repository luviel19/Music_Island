// SoundCloud: тренды без входа, лайки после входа, любая ссылка из буфера обмена.
Providers.register(makeQueueProvider({
  id: 'sc', name: 'SoundCloud', hint: 'Тренды, лайки, ссылки', icon: 'i-sc',
  modes: [
    { id: 'trend', icon: 'i-trend', tip: 'Тренды' },
    { id: 'likes', icon: 'i-heart', tip: 'Мои лайки' },
    { id: 'link', icon: 'i-link', tip: 'Играть ссылку из буфера' },
  ],
  caps: { shuffle: false },
  needsAuth: (mode) => mode === 'likes',
  isAuthed: async (host) => (await host.call('sc:status')).authed,
  async load(host, mode) {
    const r = await host.call('sc:load', { mode });
    let next = r.next;
    return {
      tracks: r.tracks,
      more: next ? async () => { const m = await host.call('sc:more', { next, liked: r.liked }); next = m.next; return m.tracks; } : null,
    };
  },
  resolveUrl: (host, t) => host.call('sc:url', { tc: t.tc, ta: t.ta }),
  like: (host, t, on) => host.call('sc:like', { id: t.id, like: on }),
  trackUrl: (t) => t.url || null,
  async wave(t, host) {
    const j = await host.call('sc:wave', t.waveUrl);
    const mx = j.height || Math.max(...j.samples);
    return j.samples.map((v) => v / mx);
  },
  authView: () => ({
    title: 'SoundCloud', text: 'Войдите, чтобы слушать свои лайки. Тренды и ссылки работают без входа.',
    primary: 'Войти через SoundCloud', secondary: 'Слушать тренды без входа',
  }),
  async authAction(kind, host) {
    if (kind === 'primary') return host.call('sc:login');
    host.setMode('trend');
    return true;
  },
}));

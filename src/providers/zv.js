// Звук: рекомендации редакции без входа, «Моё» (лайки) после входа.
Providers.register(makeQueueProvider({
  id: 'zv', name: 'Звук', hint: 'Рекомендации и Моё', icon: 'i-zvuk',
  modes: [
    { id: 'rec', icon: 'i-trend', tip: 'Рекомендации' },
    { id: 'likes', icon: 'i-heart', tip: 'Моё' },
  ],
  caps: { shuffle: false },
  needsAuth: (mode) => mode === 'likes',
  isAuthed: async (host) => (await host.call('zv:status')).authed,
  async load(host, mode) {
    const r = await host.call('zv:load', { mode });
    const rest = r.rest || [];
    return {
      tracks: r.tracks,
      more: rest.length ? () => host.call('zv:tracks', { ids: rest.splice(0, 50), liked: mode === 'likes' }) : null,
    };
  },
  resolveUrl: (host, t) => host.call('zv:url', t.id),
  like: (host, t, on) => host.call('zv:like', { id: t.id, like: on }),
  trackUrl: (t) => `https://zvuk.com/track/${t.id}`,
  authView: () => ({
    title: 'Звук', text: 'Войдите, чтобы слушать свою коллекцию. Рекомендации работают без входа.',
    primary: 'Войти через Звук', secondary: 'Слушать рекомендации без входа',
  }),
  async authAction(kind, host) {
    if (kind === 'primary') return host.call('zv:login');
    host.setMode('rec');
    return true;
  },
}));

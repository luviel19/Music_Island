// YouTube: популярные песни или «радио» по ссылке из буфера обмена (продолжение — микс по последнему треку).
Providers.register(makeQueueProvider({
  id: 'yt', name: 'YouTube', hint: 'Популярное, ссылки, микс', icon: 'i-yt',
  modes: [
    { id: 'trend', icon: 'i-trend', tip: 'Популярное' },
    { id: 'link', icon: 'i-link', tip: 'Играть ссылку из буфера' },
  ],
  caps: { shuffle: false, like: false, eq: false },
  // настроение и жанр для «Популярного»: подборки YouTube Music
  tune: {
    title: 'Настроение и жанр', tip: 'Настроение и жанр', mode: 'trend',
    async groups(host) {
      const g = await host.call('yt:moods');
      return g.map((x, i) => ({ id: 'mood', label: x.label, options: i === 0 ? [{ id: '', label: 'Популярное' }, ...x.options] : x.options }));
    },
  },
  engine: window.youtubeEngine(),
  search: (host, q) => host.raw('yt:search', q),
  related: (host, t) => host.raw('yt:more', { lastId: t.id }),
  async load(host, mode) {
    const r = await host.call('yt:load', { mode, mood: host.settings.tune?.yt?.mood || '' });
    return { tracks: r.tracks, more: (queue) => host.call('yt:more', { lastId: queue[queue.length - 1]?.id }) };
  },
  trackUrl: (t) => `https://www.youtube.com/watch?v=${t.id}`,
  authView: () => ({ title: 'YouTube', text: '', primary: '' }),
  authAction: async () => true,
}));

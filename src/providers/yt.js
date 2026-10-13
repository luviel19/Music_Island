// YouTube: популярные песни или «радио» по ссылке из буфера обмена (продолжение — микс по последнему треку).
Providers.register(makeQueueProvider({
  id: 'yt', name: 'YouTube', hint: 'Популярное, ссылки, микс', icon: 'i-yt',
  modes: [
    { id: 'trend', icon: 'i-trend', tip: 'Популярное' },
    { id: 'link', icon: 'i-link', tip: 'Играть ссылку из буфера' },
  ],
  caps: { shuffle: false, like: false },
  engine: window.youtubeEngine(),
  async load(host, mode) {
    const r = await host.call('yt:load', { mode });
    return { tracks: r.tracks, more: (queue) => host.call('yt:more', { lastId: queue[queue.length - 1]?.id }) };
  },
  trackUrl: (t) => `https://www.youtube.com/watch?v=${t.id}`,
  authView: () => ({ title: 'YouTube', text: '', primary: '' }),
  authAction: async () => true,
}));

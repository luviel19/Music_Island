// Провайдер для съёмки ролика: только внешний вид, данные выдуманные
const cov = (a, b, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="70" cy="30" r="16" fill="#fff" opacity=".35"/><path d="M0 78C25 60 45 92 100 66V100H0z" fill="#000" opacity=".28"/></svg>`);
const LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1ed760"/><path d="M6.5 9.3c3.6-1.1 7.6-.8 11 1M7.2 12.6c3-.9 6.2-.6 9 .9M8 15.7c2.4-.7 4.8-.4 6.9.7" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>');
const TR = [
  { id: 'a', title: 'Night Drive', artists: 'Aurora Lane', cover: cov('#ffb347', '#ff4d94', '#4b2bb8'), durationMs: 213000 },
  { id: 'b', title: 'Neon Rain', artists: 'Kite & The Static', cover: cov('#27d3ff', '#6a5cff', '#1b0f4a'), durationMs: 198000 },
  { id: 'c', title: 'Golden Hour', artists: 'Marlo Vance', cover: cov('#ffd45e', '#ff7a45', '#8a1f4d'), durationMs: 187000 },
  { id: 'd', title: 'Slow Motion', artists: 'Aurora Lane', cover: cov('#7bffb0', '#1ea7a1', '#0d2a52'), durationMs: 245000 },
  { id: 'e', title: 'Afterglow', artists: 'Piper Hale', cover: cov('#ff9cc4', '#b64bff', '#240e5a'), durationMs: 176000 },
  { id: 'f', title: 'City Lights', artists: 'Marlo Vance', cover: cov('#ffe27a', '#ff4d6d', '#32105a'), durationMs: 204000 },
];
Providers.register((() => {
  let host, cur = 0, vol = 0.7;
  const play = (i, pos = 0) => { cur = i; host.setTrack(TR[i], ''); host.setPlaying(true); host.setProgress(pos, TR[i].durationMs); };
  return {
    id: 'sp', name: 'Spotify', hint: '', icon: 'i-sp',
    modes: [{ id: 'home', icon: 'i-trend', tip: 'Главная' }, { id: 'tracks', icon: 'i-heart', tip: 'Моя музыка' }, { id: 'playlists', icon: 'i-list', tip: 'Плейлисты' }],
    caps: { shuffle: false, like: false, queue: true, info: false, volume: true, eq: false, panel: true, search: 'web' },
    async start(h) { host = h; play(0, 71000); host.setVolume(vol); return 'ok'; },
    stop() {},
    setMode() {},
    toggle() { host.setPlaying(!host.isPlaying()); },
    next() { play((cur + 1) % TR.length); },
    prev() { play((cur + TR.length - 1) % TR.length); },
    seek() {}, setVolume(v) { vol = v; }, like() {}, toggleShuffle() {},
    getQueue() {
      const list = [TR[cur], ...TR.slice(cur + 1), ...TR.slice(0, cur)].map((t, k) => ({ id: k ? t.id : 'now', title: t.title, artists: t.artists, cover: k ? LOGO : t.cover, durationMs: k ? t.durationMs : t.durationMs }));
      host.setQueue(list, 0);
    },
    playFromQueue(i) { const t = [TR[cur], ...TR.slice(cur + 1), ...TR.slice(0, cur)][i]; play(TR.indexOf(t)); this.getQueue(); },
    trackUrl: () => null,
    authView: () => ({ title: '', text: '', primary: '' }), async authAction() { return true; },
  };
})());

// Провайдер для съёмки ролика: только внешний вид, данные выдуманные
const cov = (a, b, c, k = 0) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>${[
  '<circle cx="50" cy="42" r="26" fill="#fff" opacity=".55"/><rect y="62" width="100" height="38" fill="#000" opacity=".45"/>',
  '<path d="M0 100L35 30 60 70 78 45 100 100z" fill="#000" opacity=".55"/><circle cx="76" cy="22" r="11" fill="#fff" opacity=".7"/>',
  '<circle cx="30" cy="70" r="34" fill="#fff" opacity=".4"/><circle cx="72" cy="34" r="22" fill="#000" opacity=".4"/>',
  '<path d="M0 20H100M0 40H100M0 60H100M0 80H100" stroke="#fff" stroke-width="7" opacity=".4"/><circle cx="50" cy="50" r="20" fill="#000" opacity=".5"/>',
  '<path d="M0 100C20 30 60 90 100 10V100z" fill="#fff" opacity=".45"/><circle cx="25" cy="25" r="12" fill="#000" opacity=".4"/>',
  '<rect x="12" y="12" width="76" height="76" fill="none" stroke="#fff" stroke-width="9" opacity=".6"/><circle cx="50" cy="50" r="14" fill="#000" opacity=".5"/>'][k]}</svg>`);
const LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1ed760"/><path d="M6.5 9.3c3.6-1.1 7.6-.8 11 1M7.2 12.6c3-.9 6.2-.6 9 .9M8 15.7c2.4-.7 4.8-.4 6.9.7" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>');
const TR = [
  { id: 'a', title: 'Night Drive', artists: 'Aurora Lane', cover: cov('#ffb347', '#ff4d94', '#4b2bb8', 0), durationMs: 213000 },
  { id: 'b', title: 'Neon Rain', artists: 'Kite & The Static', cover: cov('#27d3ff', '#0a6cff', '#06123a', 1), durationMs: 198000 },
  { id: 'c', title: 'Golden Hour', artists: 'Marlo Vance', cover: cov('#ffd45e', '#ff7a45', '#8a1f4d', 2), durationMs: 187000 },
  { id: 'd', title: 'Slow Motion', artists: 'Aurora Lane', cover: cov('#b6ff4d', '#12b886', '#052a2a', 3), durationMs: 245000 },
  { id: 'e', title: 'Afterglow', artists: 'Piper Hale', cover: cov('#ff9cc4', '#b64bff', '#240e5a', 4), durationMs: 176000 },
  { id: 'f', title: 'City Lights', artists: 'Marlo Vance', cover: cov('#ffe27a', '#ff4d6d', '#32105a', 5), durationMs: 204000 },
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

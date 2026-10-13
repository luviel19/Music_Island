// Реестр провайдеров интерфейса. Контракт провайдера (все методы async-совместимы):
//
//   id, name, icon          — идентификатор, название, символ из <svg> спрайта (#i-…)
//   modes: [{ id, icon, tip }]   (пустой список — переключателя режимов нет)
//   caps: { shuffle: true | 'fav' | false, like?: false, queue?: false, volume?: false }  (по умолчанию всё есть)
//   async start(host, mode) -> 'ok' | 'auth'     запуск при выборе источника
//   stop()                                        остановка при переключении
//   setMode(mode, autoplay)
//   toggle() next() prev() seek(ms) setVolume(0..1) like(bool) toggleShuffle()
//   getQueue()  playFromQueue(i)  trackUrl(track)
//   authView() -> { title, text, primary, secondary?, link?: {label,url}, tall? }
//   async authAction('primary'|'secondary') -> true (вошли) | false (перерисовать форму)
//
// host (его даёт ядро) принимает состояние от провайдера:
//   setTrack(track|null, status) setPlaying(b) setProgress(posMs, durMs) setVolume(0..1)
//   setLiked(b) setShuffle(b) setQueue(items, currentIndex) flash(msg)
//   call(канал, ...args) settings setSetting(patch) isPlaying() queueOpen()
window.Providers = {
  list: [],
  register(p) { this.list.push(p); },
  get(id) { return this.list.find((p) => p.id === id); },
};

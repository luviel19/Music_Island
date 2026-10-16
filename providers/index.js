// Реестр провайдеров (основной процесс). Чтобы добавить площадку: создайте файл рядом
// и добавьте его в список ниже. Контракт провайдера:
//   { id, name, hosts: [домены для open:external], modes: [{ id, label }],
//     handlers: { имя: async (...args) => данные, logout() } }
// Каждый handler доступен интерфейсу как IPC-канал `${id}:${имя}`.
const FACTORIES = [
  require('./ym'),
  require('./sp'),  // Spotify: веб-плеер на WebView2 (native/spotify-host)
  require('./sc'),
  require('./yt'),
  // require('./zv'),  // Звук: стриминг закрыт антибот-защитой (HTTP 418); код оставлен, включите вместе со скриптом в index.html
  require('./media'),
];

module.exports = (ctx) => FACTORIES.map((make) => make(ctx));

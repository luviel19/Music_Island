// Собирает двуязычный сайт для GitHub Pages: docs/index.html (English) и docs/ru/index.html (русский),
// sitemap.xml и robots.txt. Запуск: node scripts/build-site.js
const fs = require('fs');
const path = require('path');

const SITE = 'https://luviel19.github.io/Music_Island/';
const REPO = 'https://github.com/luviel19/Music_Island';
const VERSION = require('../package.json').version;
const docs = path.join(__dirname, '..', 'docs');

const T = {
  en: {
    lang: 'en', url: SITE, other: SITE + 'ru/', base: '', otherHref: 'ru/', label: 'RU',
    title: 'Music Island — Free Dynamic Island for Windows | Spotify & Yandex Music',
    desc: 'Music Island is a free, open-source Dynamic Island music player for Windows 10/11. Control Spotify, Yandex Music, YouTube and SoundCloud in a beautiful floating desktop widget.',
    ogLocale: 'en_US',
    nav: { feat: 'Features', svc: 'Services', gal: 'Gallery', faq: 'FAQ', dl: 'Download' },
    h1: 'A free <span class="grad">Dynamic Island</span> music player for Windows',
    lead: 'Music Island is a small floating island on your desktop. It shows what is playing, expands on hover and controls Spotify, Yandex Music, YouTube and SoundCloud. Open source, MIT license, Windows 10/11.',
    download: 'Download for Windows', github: 'View on GitHub', releases: 'All releases',
    meta: 'Version', metaTail: 'Windows 10/11 x64 · unsigned installer (SmartScreen may warn) · MIT',
    badges: ['Open source', 'MIT license', 'No ads in the app', 'Windows 10 / 11'],
    islandT: 'Night Drive', islandA: 'Aurora Lane (demo)',
    demoH: 'See it in action', demoSub: 'This is the real island interface running with demo tracks: hover to expand, move through the waveform, switch tracks and open the queue.',
    demoAlt: 'Animated demo of the Music Island interface: collapsed island, expanding on hover, waveform, next track and queue with Spotify',
    demoCap: 'Demo with made-up tracks. Recorded from the actual app interface.',
    featH: 'What you get', featSub: 'Everything here is implemented in the current release.',
    feats: [
      ['Floating island', 'Always on top of your windows, expands on hover, never leaves the screen and can sit in the very corner. Click-through where it is transparent.'],
      ['Several services, one island', 'Spotify, Yandex Music, SoundCloud, YouTube and any system media player. Switch from the island or the tray.'],
      ['Search across services', 'One query searches Yandex Music, SoundCloud and YouTube. The same song is merged into one row with service icons.'],
      ['Waveform progress', 'Bars that follow the shape of the song. Click to seek. Colours adapt to the cover art.'],
      ['10-band equalizer', 'For Yandex Music and SoundCloud: manual bands, presets and a colourful grid in the island background.'],
      ['Queue, likes, media keys', 'Browse the next tracks, like songs (Yandex Music, SoundCloud), use global media keys and the tray menu. Autostart with Windows.'],
    ],
    svcH: 'Supported services', svcSub: 'What works depends on what each service allows. The table shows what is really available in the island.',
    cols: ['', 'Spotify', 'Yandex Music', 'YouTube', 'SoundCloud', 'System player'],
    rows: [
      ['Play / pause / next / previous / seek', 'y', 'y', 'y', 'y', 'y'],
      ['Track, cover and progress in the island', 'y', 'y', 'y', 'y', 'y'],
      ['Queue inside the island', 'y', 'y', 'y', 'y', 'n'],
      ['Volume control', 'y', 'y', 'y', 'y', 'n'],
      ['Like', 'n', 'y', 'n', 'p', 'n'],
      ['Shuffle', 'n', 'p', 'n', 'n', 'n'],
      ['10-band equalizer', 'n', 'y', 'n', 'y', 'n'],
      ['Search from the island', 'p', 'y', 'y', 'y', 'n'],
      ['Sign-in', 'Your Spotify account', 'OAuth token', 'Not needed', 'Optional (for likes)', 'Not needed'],
    ],
    legend: '<b class="y">✓</b> works · <b class="p">◐</b> partly (Spotify: search opens the official page in a panel; Yandex Music: shuffle in Favorites only; SoundCloud: likes need sign-in) · <b class="n">—</b> not available',
    spH: 'Spotify and Yandex Music', spSub: 'The two main services, and how they connect.',
    sp: ['Spotify: the official web player', 'The island embeds the official open.spotify.com web player in Microsoft Edge WebView2. You sign in on the real Spotify page (Free or Premium), the password stays with Spotify. No Web API, no Client ID, no developer keys, no cookie extraction and no ad blocking. Playback is controlled through Windows media controls, the queue is read from the page, volume is the Windows audio session of the player. Ads in the Free plan play as in a normal browser.'],
    ym: ['Yandex Music: My Wave and Favorites', 'My Wave with mood and activity tuning, Favorites, likes, queue, equalizer and search. Sign-in uses an OAuth token that is stored encrypted on your PC. The Yandex API used here is unofficial and may change.'],
    noteSp: 'Spotify in the island has no like, shuffle or equalizer: the embedded web player does not expose them, so the island does not fake them.',
    galH: 'Gallery', galSub: 'Screenshots of the island. The last two use demo tracks.',
    gal: [['screenshot.png', 'Music Island expanded: cover, waveform and controls', 'Expanded island'], ['screenshot-compact.png', 'Music Island in compact mode', 'Compact island'], ['shot-expanded.png', 'Music Island with Spotify, expanded, with equalizer grid in the cover colours', 'Expanded with Spotify (demo)'], ['shot-queue.png', 'Music Island queue with Spotify logos', 'Queue (demo)']],
    dlH: 'Download Music Island', dlSub: 'Free. Windows 10 or 11, 64-bit. The Microsoft Edge WebView2 Runtime (included in modern Windows) is needed for Spotify.',
    dlBtn: 'Download the latest installer',
    steps: ['Download <code>Music-Island-Setup-*.exe</code> from the latest release.', 'Run it and choose the folder.', 'The island appears on the screen, the tray icon opens settings.'],
    trust: 'The installer is not digitally signed, so Windows SmartScreen may show “Windows protected your PC”. Check that the file comes from the official release page and compare its SHA-256 with the value in the release notes, then choose “More info → Run anyway”. Do not turn off Windows Defender. Details: <a href="' + REPO + '/blob/main/SECURITY.md">SECURITY.md</a>.',
    faqH: 'Questions and answers',
    faq: [
      ['Is Music Island free?', 'Yes. It is free and open source under the MIT license. The app has no ads and no paid features.'],
      ['Do I need Spotify Premium?', 'No. The island embeds the official Spotify web player, so Free and Premium accounts both work. Free-plan ads play as in a browser; the island does not block them.'],
      ['Does it work on Windows 10 and Windows 11?', 'Yes, both 64-bit versions. It needs the Microsoft Edge WebView2 Runtime for Spotify, which is part of current Windows installations.'],
      ['Why is there no like or equalizer for Spotify?', 'Audio plays inside the embedded Spotify page, which does not expose like or shuffle state. The island only shows functions it can perform honestly.'],
      ['Is it safe? The installer is not signed.', 'The source code is open, the app has no keys of its own, and sign-in happens on the official service pages. The installer is not code-signed, so SmartScreen may warn. Download only from the official releases and verify the SHA-256 hash.'],
      ['SoundCloud or YouTube do not open', 'If a service is blocked in your country, enable VPN or proxy in the tray menu. It is used only for SoundCloud and YouTube.'],
      ['Is it affiliated with Spotify, Yandex, YouTube or SoundCloud?', 'No. It is an independent project. All trademarks belong to their owners.'],
    ],
    foot: ['Made by', 'Source code', 'Report an issue', 'MIT License', 'Not affiliated with Spotify, Yandex, YouTube or SoundCloud.'],
  },
  ru: {
    lang: 'ru', url: SITE + 'ru/', other: SITE, base: '../', otherHref: '../', label: 'EN',
    title: 'Music Island — бесплатный Dynamic Island для Windows | Spotify и Яндекс Музыка',
    desc: 'Music Island — бесплатный музыкальный Dynamic Island для Windows 10/11 с открытым кодом. Управляйте Spotify, Яндекс Музыкой, YouTube и SoundCloud из плавающего виджета на рабочем столе.',
    ogLocale: 'ru_RU',
    nav: { feat: 'Возможности', svc: 'Сервисы', gal: 'Галерея', faq: 'Вопросы', dl: 'Скачать' },
    h1: 'Бесплатный музыкальный <span class="grad">Dynamic Island</span> для Windows',
    lead: 'Music Island — маленький остров на рабочем столе: показывает, что играет, раскрывается при наведении и управляет Spotify, Яндекс Музыкой, YouTube и SoundCloud. Открытый код, лицензия MIT, Windows 10/11.',
    download: 'Скачать для Windows', github: 'Открыть на GitHub', releases: 'Все релизы',
    meta: 'Версия', metaTail: 'Windows 10/11 x64 · установщик без подписи (SmartScreen может предупредить) · MIT',
    badges: ['Открытый код', 'Лицензия MIT', 'Без рекламы в приложении', 'Windows 10 / 11'],
    islandT: 'Night Drive', islandA: 'Aurora Lane (демо)',
    demoH: 'Как это выглядит', demoSub: 'Настоящий интерфейс острова с демонстрационными треками: наведение, перемотка по волне, смена трека и очередь.',
    demoAlt: 'Анимированная демонстрация Music Island: свёрнутый остров, раскрытие при наведении, волна, следующий трек и очередь со Spotify',
    demoCap: 'Демо с выдуманными треками, записано с настоящего интерфейса приложения.',
    featH: 'Что умеет', featSub: 'Всё перечисленное реализовано в текущем релизе.',
    feats: [
      ['Плавающий остров', 'Поверх окон, раскрывается при наведении, не уходит за экран и встаёт в самый угол. Прозрачные области пропускают клики.'],
      ['Несколько сервисов в одном месте', 'Spotify, Яндекс Музыка, SoundCloud, YouTube и любой системный плеер. Переключение с острова или из трея.'],
      ['Поиск по сервисам', 'Один запрос ищет в Яндекс Музыке, SoundCloud и YouTube. Одна песня склеивается в одну строку со значками сервисов.'],
      ['Волновой прогресс', 'Палочки повторяют форму песни, клик по волне перематывает. Цвета подстраиваются под обложку.'],
      ['Эквалайзер на 10 полос', 'Для Яндекс Музыки и SoundCloud: ручная настройка, пресеты и цветная сетка на фоне острова.'],
      ['Очередь, лайки, медиаклавиши', 'Список следующих треков, лайки (Яндекс Музыка, SoundCloud), глобальные медиаклавиши, меню в трее, автозапуск с Windows.'],
    ],
    svcH: 'Поддерживаемые сервисы', svcSub: 'Что доступно, зависит от самого сервиса. В таблице только то, что реально работает в острове.',
    cols: ['', 'Spotify', 'Яндекс Музыка', 'YouTube', 'SoundCloud', 'Системный плеер'],
    rows: [
      ['Пауза, следующий, предыдущий, перемотка', 'y', 'y', 'y', 'y', 'y'],
      ['Трек, обложка и прогресс в острове', 'y', 'y', 'y', 'y', 'y'],
      ['Очередь в острове', 'y', 'y', 'y', 'y', 'n'],
      ['Громкость', 'y', 'y', 'y', 'y', 'n'],
      ['Лайк', 'n', 'y', 'n', 'p', 'n'],
      ['Перемешивание', 'n', 'p', 'n', 'n', 'n'],
      ['Эквалайзер на 10 полос', 'n', 'y', 'n', 'y', 'n'],
      ['Поиск из острова', 'p', 'y', 'y', 'y', 'n'],
      ['Вход', 'Ваш аккаунт Spotify', 'OAuth-токен', 'Не нужен', 'Необязателен (для лайков)', 'Не нужен'],
    ],
    legend: '<b class="y">✓</b> работает · <b class="p">◐</b> частично (Spotify: поиск открывает официальную страницу в панели; Яндекс Музыка: перемешивание только в «Избранном»; SoundCloud: для лайков нужен вход) · <b class="n">—</b> недоступно',
    spH: 'Spotify и Яндекс Музыка', spSub: 'Два главных сервиса и то, как они подключаются.',
    sp: ['Spotify: официальный веб-плеер', 'Остров встраивает официальный веб-плеер open.spotify.com в Microsoft Edge WebView2. Вы входите на настоящей странице Spotify (Free или Premium), пароль остаётся у Spotify. Без Web API, Client ID, ключей разработчика, извлечения cookie и блокировки рекламы. Воспроизведением управляют медиа-команды Windows, очередь читается со страницы, громкость — звуковая сессия плеера в Windows. Реклама в Free играет как в обычном браузере.'],
    ym: ['Яндекс Музыка: «Моя волна» и избранное', '«Моя волна» с настройкой по настроению и занятию, избранное, лайки, очередь, эквалайзер и поиск. Вход по OAuth-токену, который хранится на вашем ПК в зашифрованном виде. Используемый API Яндекса неофициальный и может измениться.'],
    noteSp: 'У Spotify в острове нет лайка, перемешивания и эквалайзера: встроенный веб-плеер их не отдаёт, поэтому остров их не имитирует.',
    galH: 'Галерея', galSub: 'Скриншоты острова. Последние два сделаны с демо-треками.',
    gal: [['screenshot.png', 'Music Island раскрыт: обложка, волна и кнопки управления', 'Раскрытый остров'], ['screenshot-compact.png', 'Music Island в компактном режиме', 'Компактный остров'], ['shot-expanded.png', 'Music Island со Spotify: раскрытый вид с цветной сеткой эквалайзера', 'Раскрытый вид со Spotify (демо)'], ['shot-queue.png', 'Очередь Music Island с логотипами Spotify', 'Очередь (демо)']],
    dlH: 'Скачать Music Island', dlSub: 'Бесплатно. Windows 10 или 11, 64 бита. Для Spotify нужен Microsoft Edge WebView2 Runtime (есть в современных Windows).',
    dlBtn: 'Скачать последний установщик',
    steps: ['Скачайте <code>Music-Island-Setup-*.exe</code> из последнего релиза.', 'Запустите и выберите папку.', 'Остров появится на экране, значок в трее открывает настройки.'],
    trust: 'Установщик не имеет цифровой подписи, поэтому Windows SmartScreen может показать «Windows защитила ваш компьютер». Убедитесь, что файл скачан со страницы официального релиза, сверьте его SHA-256 со значением в описании релиза и выберите «Подробнее → Выполнить в любом случае». Не отключайте Защитник Windows. Подробнее: <a href="' + REPO + '/blob/main/SECURITY.md">SECURITY.md</a>.',
    faqH: 'Вопросы и ответы',
    faq: [
      ['Music Island бесплатный?', 'Да. Приложение бесплатное, с открытым кодом под лицензией MIT. В нём нет рекламы и платных функций.'],
      ['Нужен ли Spotify Premium?', 'Нет. Остров встраивает официальный веб-плеер Spotify, поэтому работают и Free, и Premium. Реклама в Free играет как в браузере, остров её не блокирует.'],
      ['Работает ли на Windows 10 и Windows 11?', 'Да, на обеих 64-битных версиях. Для Spotify нужен Microsoft Edge WebView2 Runtime, он входит в современные Windows.'],
      ['Почему у Spotify нет лайка и эквалайзера?', 'Звук играет внутри встроенной страницы Spotify, которая не отдаёт состояние лайка и перемешивания. Остров показывает только те функции, которые может честно выполнить.'],
      ['Это безопасно? Установщик не подписан.', 'Исходный код открыт, собственных ключей у приложения нет, вход происходит на официальных страницах сервисов. Установщик не подписан цифровой подписью, поэтому SmartScreen может предупредить. Скачивайте только из официальных релизов и сверяйте SHA-256.'],
      ['SoundCloud или YouTube не открываются', 'Если сервис недоступен в вашей стране, включите VPN или прокси в меню трея. Он используется только для SoundCloud и YouTube.'],
      ['Связан ли проект со Spotify, Яндексом, YouTube или SoundCloud?', 'Нет, проект независимый. Все торговые марки принадлежат их владельцам.'],
    ],
    foot: ['Автор', 'Исходный код', 'Сообщить об ошибке', 'Лицензия MIT', 'Проект не связан со Spotify, Яндексом, YouTube и SoundCloud.'],
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const strip = (s) => String(s).replace(/<[^>]+>/g, '');
const mark = { y: '<span class="y" aria-label="yes">✓</span>', n: '<span class="n" aria-label="no">—</span>', p: '<span class="p" aria-label="partly">◐</span>' };

function page(l) {
  const t = T[l], b = t.base;
  const ld = [{
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Music Island',
    alternateName: ['Music Island for Windows', 'Dynamic Island для Windows'],
    description: T.en.desc, applicationCategory: 'MultimediaApplication', operatingSystem: 'Windows 10, Windows 11',
    softwareVersion: VERSION, license: 'https://opensource.org/licenses/MIT', isAccessibleForFree: true,
    url: SITE, downloadUrl: REPO + '/releases/latest', image: SITE + 'og-image.png',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Person', name: 'luviel19', url: 'https://github.com/luviel19' },
    codeRepository: REPO, inLanguage: ['en', 'ru'],
  }, {
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: l,
    mainEntity: t.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }];
  const wave = Array.from({ length: 28 }, (_, i) => `<i class="${i < 9 ? 'p' : ''}" style="height:${6 + Math.round(18 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)))}px"></i>`).join('');
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.desc)}">
<link rel="canonical" href="${t.url}">
<link rel="alternate" hreflang="en" href="${SITE}">
<link rel="alternate" hreflang="ru" href="${SITE}ru/">
<link rel="alternate" hreflang="x-default" href="${SITE}">
<meta name="theme-color" content="#0a0a12">
<meta name="author" content="luviel19">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Music Island">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.desc)}">
<meta property="og:url" content="${t.url}">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:image" content="${SITE}og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Music Island: expanded Dynamic Island music player on a dark gradient">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t.title)}">
<meta name="twitter:description" content="${esc(t.desc)}">
<meta name="twitter:image" content="${SITE}og-image.png">
<link rel="icon" href="${b}favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="48x48" href="${b}favicon-48.png">
<link rel="apple-touch-icon" href="${b}apple-touch-icon.png">
<link rel="stylesheet" href="${b}style.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<a class="skip" href="#main">${l === 'ru' ? 'К содержимому' : 'Skip to content'}</a>
<header class="nav"><div class="wrap">
  <a class="brand" href="./"><img src="${b}favicon-48.png" width="30" height="30" alt="">Music Island</a>
  <nav aria-label="${l === 'ru' ? 'Разделы' : 'Sections'}">
    <a class="opt" href="#features">${t.nav.feat}</a><a class="opt" href="#services">${t.nav.svc}</a><a class="opt" href="#gallery">${t.nav.gal}</a><a class="opt" href="#faq">${t.nav.faq}</a>
    <a href="#download">${t.nav.dl}</a>
    <a class="lang" href="${t.otherHref}" hreflang="${l === 'ru' ? 'en' : 'ru'}" lang="${l === 'ru' ? 'en' : 'ru'}">${t.label}</a>
  </nav>
</div></header>

<main id="main" class="wrap">
<section class="hero" aria-labelledby="h1">
  <div class="island" tabindex="0" role="img" aria-label="${esc(t.demoAlt)}">
    <span class="cv"></span>
    <span class="t">${t.islandT}<small>${t.islandA}</small></span>
    <span class="bars"><i></i><i></i><i></i><i></i></span>
    <span class="more"><span class="w">${wave}</span><span class="c"><span></span><b></b><span class="n"></span></span></span>
  </div>
  <h1 id="h1">${t.h1}</h1>
  <p class="lead">${t.lead}</p>
  <div class="cta">
    <a class="btn dl-link" href="${REPO}/releases/latest">⬇ ${t.download}</a>
    <a class="btn ghost" href="${REPO}">${t.github}</a>
    <a class="btn ghost" href="${REPO}/releases">${t.releases}</a>
  </div>
  <p class="meta">${t.meta} <span id="ver">${VERSION}</span> · ${t.metaTail}</p>
  <div class="badges">${t.badges.map((x) => `<span>${x}</span>`).join('')}</div>
</section>

<section class="demo" aria-labelledby="demo-h">
  <h2 id="demo-h">${t.demoH}</h2>
  <p class="sub" style="margin-inline:auto">${t.demoSub}</p>
  <div class="frame"><img src="${b}promo.gif" width="540" height="360" alt="${esc(t.demoAlt)}"></div>
  <p class="cap">${t.demoCap}</p>
</section>

<section id="features" aria-labelledby="feat-h">
  <h2 id="feat-h">${t.featH}</h2><p class="sub">${t.featSub}</p>
  <div class="grid">${t.feats.map(([h, p]) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`).join('')}</div>
</section>

<section id="services" aria-labelledby="svc-h">
  <h2 id="svc-h">${t.svcH}</h2><p class="sub">${t.svcSub}</p>
  <div class="tablewrap"><table>
    <thead><tr>${t.cols.map((c, i) => `<th scope="col">${c || (l === 'ru' ? 'Функция' : 'Feature')}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map(([name, ...v]) => `<tr><th scope="row" style="text-align:left;font-weight:600;background:none">${name}</th>${v.map((x) => `<td>${mark[x] || x}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>
  <p class="cap">${t.legend}</p>
</section>

<section aria-labelledby="sp-h">
  <h2 id="sp-h">${t.spH}</h2><p class="sub">${t.spSub}</p>
  <div class="two">
    <div class="card"><h3>${t.sp[0]}</h3><p>${t.sp[1]}</p></div>
    <div class="card"><h3>${t.ym[0]}</h3><p>${t.ym[1]}</p></div>
  </div>
  <p class="note" style="margin-top:14px">${t.noteSp}</p>
</section>

<section id="gallery" aria-labelledby="gal-h">
  <h2 id="gal-h">${t.galH}</h2><p class="sub">${t.galSub}</p>
  <div class="gallery">${t.gal.map(([f, alt, cap]) => `<figure><img src="${b}${f}" loading="lazy" alt="${esc(alt)}"><figcaption>${cap}</figcaption></figure>`).join('')}</div>
</section>

<section id="download" aria-labelledby="dl-h">
  <div class="dl">
    <h2 id="dl-h">${t.dlH}</h2>
    <p class="sub" style="margin-inline:auto">${t.dlSub}</p>
    <p><a class="btn dl-link" href="${REPO}/releases/latest">⬇ ${t.dlBtn}</a></p>
    <p class="meta"><span id="size"></span></p>
    <ol style="text-align:left;max-width:560px;margin:18px auto;color:var(--dim)">${t.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
    <p class="note" style="text-align:left;max-width:720px;margin:0 auto">${t.trust}</p>
  </div>
</section>

<section id="faq" aria-labelledby="faq-h">
  <h2 id="faq-h">${t.faqH}</h2>
  ${t.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n  ')}
</section>
</main>

<footer><div class="wrap">
  <p>${t.foot[0]} <a href="https://github.com/luviel19">luviel19</a> · <a href="${REPO}">${t.foot[1]}</a> · <a href="${REPO}/issues">${t.foot[2]}</a> · <a href="${REPO}/blob/main/LICENSE">${t.foot[3]}</a></p>
  <p>${t.foot[4]}</p>
</div></footer>

<script>
// Необязательное улучшение: показать актуальную версию и прямую ссылку на установщик. Без JS работает ссылка на страницу релиза.
(function () {
  try {
    fetch('https://api.github.com/repos/luviel19/Music_Island/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.tag_name) return;
        var a = (j.assets || []).filter(function (x) { return /^Music-Island-Setup-.*\\.exe$/.test(x.name); })[0];
        document.getElementById('ver').textContent = String(j.tag_name).replace(/^v/, '');
        if (a) {
          document.querySelectorAll('.dl-link').forEach(function (el) { el.href = a.browser_download_url; });
          document.getElementById('size').textContent = a.name + ' · ' + Math.round(a.size / 1048576) + ' MB';
        }
      }).catch(function () {});
  } catch (e) {}
})();
</script>
</body>
</html>
`;
}

fs.mkdirSync(path.join(docs, 'ru'), { recursive: true });
fs.writeFileSync(path.join(docs, 'index.html'), page('en'));
fs.writeFileSync(path.join(docs, 'ru', 'index.html'), page('ru'));
fs.writeFileSync(path.join(docs, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>${SITE}</loc><xhtml:link rel="alternate" hreflang="en" href="${SITE}"/><xhtml:link rel="alternate" hreflang="ru" href="${SITE}ru/"/></url>
  <url><loc>${SITE}ru/</loc><xhtml:link rel="alternate" hreflang="en" href="${SITE}"/><xhtml:link rel="alternate" hreflang="ru" href="${SITE}ru/"/></url>
</urlset>
`);
fs.writeFileSync(path.join(docs, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
fs.writeFileSync(path.join(docs, '.nojekyll'), '');
fs.rmSync(path.join(docs, 'icon.png'), { force: true });
console.log('site built');

// Оформление острова: бегущая строка, полоска прогресса, анимация смены трека и размытая обложка вместо цветного свечения.
// Общий файл для ПК и телефона.
(function () {
  function css() {
    if (!document.head) return false;
    var st = document.createElement('style');
    st.textContent =
      // фон: размытая обложка (две накладки сменяют друг друга плавно) и затемнение под текстом
      '#miBg{position:absolute;inset:0;pointer-events:none;border-radius:inherit;overflow:hidden}' +
      '#miBg div{position:absolute;inset:-6%;background-size:100% 100%;background-repeat:no-repeat;opacity:0;transition:opacity .9s ease}' +
      '#miBg div.on{opacity:1}' +
      '#miBg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.5))}' +
      '#miBg{opacity:.62;transition:opacity .5s}' +
      '#island[data-state="compact"] #miBg{opacity:.8}' +
      '.glow{display:none!important}' +
      // включённые кнопки читаются на любом фоне: белый значок на подсвеченной плашке
      '.ib.on{color:#fff!important;background:rgba(var(--accent),.42)!important}' +
      // полоска прогресса в свёрнутом виде
      '#miProg{position:absolute;left:18px;right:18px;bottom:3px;height:2px;border-radius:1px;background:rgba(255,255,255,.16);overflow:hidden;pointer-events:none}' +
      '#miProg i{display:block;height:100%;width:0;background:rgb(var(--accent));transition:width .6s linear}' +
      // смена трека: обложка «вылетает», название выезжает, пилюля на мгновение расширяется
      '@keyframes miCov{0%{transform:scale(.55) rotate(-24deg);opacity:0}60%{transform:scale(1.1) rotate(4deg);opacity:1}100%{transform:none;opacity:1}}' +
      '@keyframes miTxt{0%{transform:translateX(16px);opacity:0}100%{transform:none;opacity:1}}' +
      '@keyframes miPulse{0%,100%{transform:translateX(-50%) scale(1,1)}35%{transform:translateX(-50%) scale(1.07,1.04)}}' +
      '.mq::after{content:attr(data-mq)}' +
      '#island.mi-chg .cover-s,#island.mi-chg .cover-m{animation:miCov .6s cubic-bezier(.2,.8,.2,1)}' +
      '#island.mi-chg .c-title,#island.mi-chg .title,#island.mi-chg .artist{animation:miTxt .5s ease-out}' +
      '#island.mi-chg[data-state="compact"]{animation:miPulse .8s cubic-bezier(.3,1.25,.45,1)}';
    document.head.appendChild(st); return true;
  }
  if (!css()) new MutationObserver(function (_, o) { if (css()) o.disconnect(); }).observe(document, { childList: true, subtree: true });

  document.addEventListener('DOMContentLoaded', function () {
    var isl = document.getElementById('island'); if (!isl) return;

    // ── размытая обложка ──
    var bg = document.createElement('div'); bg.id = 'miBg';
    bg.appendChild(document.createElement('div')); bg.appendChild(document.createElement('div'));
    isl.insertBefore(bg, isl.firstChild);
    var cover = document.getElementById('cover'), shown = '', flip = 0;
    function paint() {
      var url = cover && cover.getAttribute('src') || '';
      if (url === shown) return;
      shown = url;
      var layers = bg.children;
      if (!url) { layers[0].classList.remove('on'); layers[1].classList.remove('on'); return; }
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () {
        if (shown !== url) return;
        try {
          var c = document.createElement('canvas'); c.width = c.height = 20; // 20×20 при растяжении сам даёт мягкое размытие, без дорогого blur()
          c.getContext('2d').drawImage(im, 0, 0, 20, 20);
          var url2 = c.toDataURL('image/png');
          flip ^= 1;
          layers[flip].style.backgroundImage = 'url(' + url2 + ')';
          layers[flip].classList.add('on'); layers[flip ^ 1].classList.remove('on');
        } catch (e) { /* обложка без CORS: остаётся прежний фон */ }
      };
      im.src = url;
    }
    if (cover) new MutationObserver(paint).observe(cover, { attributes: true, attributeFilter: ['src'] });
    paint();

    // ── анимация смены трека ──
    var title = document.getElementById('title'), lastTitle = title ? title.textContent : '', cd = null;
    function changed() {
      if (!title || title.textContent === lastTitle) return;
      var was = lastTitle; lastTitle = title.textContent;
      if (!was || was === '—' || lastTitle === '—') return; // первый показ и пустое состояние без анимации
      isl.classList.remove('mi-chg'); void isl.offsetWidth; isl.classList.add('mi-chg');
      clearTimeout(cd); cd = setTimeout(function () { isl.classList.remove('mi-chg'); }, 900);
    }
    if (title) new MutationObserver(changed).observe(title, { childList: true, characterData: true, subtree: true });

    // ── полоска прогресса ──
    var comp = isl.querySelector('.l-compact');
    var prog = document.createElement('div'); prog.id = 'miProg'; prog.innerHTML = '<i></i>';
    if (comp) comp.appendChild(prog);
    var bar = prog.firstChild;
    function secs(t) {
      var m = /^(?:(\d+):)?(\d+):(\d\d)$/.exec((t || '').trim());
      return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
    }
    var cur = document.getElementById('tCur'), dur = document.getElementById('tDur');
    setInterval(function () {
      if (isl.dataset.state !== 'compact' && isl.dataset.state !== 'karaoke') return;
      var d = secs(dur && dur.textContent), c = secs(cur && cur.textContent);
      bar.style.width = (d > 0 ? Math.min(100, c / d * 100) : 0) + '%';
    }, 500);

    // ── бегущая строка: длинное название ползёт по кругу, без остановки на конце ──
    // Второй экземпляр текста рисуется псевдоэлементом (.mq::after), поэтому textContent не меняется: его читают уведомление и Last.fm
    var items = {}, GAP = '\u2003\u2003\u2022\u2003\u2003';
    ['cTitle', 'title', 'artist'].forEach(function (id) { items[id] = { text: null, on: false, until: 0, last: 0, period: 0 }; });
    setInterval(function () {
      var now = performance.now();
      Object.keys(items).forEach(function (id) {
        var el = document.getElementById(id), s = items[id];
        if (!el || !el.offsetParent) return;
        if (el.textContent !== s.text) { // новое название: возвращаем строку в начало
          s.text = el.textContent; s.on = false; s.until = now + 1600;
          el.classList.remove('mq'); el.style.textOverflow = ''; el.scrollLeft = 0;
        }
        if (!s.on) {
          if (el.scrollWidth - el.clientWidth <= 2) return;
          var textW = el.scrollWidth;
          el.dataset.mq = GAP + s.text; el.classList.add('mq'); el.style.textOverflow = 'clip';
          s.period = el.scrollWidth - textW; s.on = true; s.last = now;
        }
        if (now < s.until) { s.last = now; return; }
        el.scrollLeft += (now - s.last) * 0.035; s.last = now; // 35 пикселей в секунду
        if (s.period > 0 && el.scrollLeft >= s.period) el.scrollLeft -= s.period;
      });
    }, 40);
  });
})();

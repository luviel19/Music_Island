// «Караоке»: большое окно со словами, сверху остаётся свёрнутый остров (при наведении он раскрывается).
// Под текст с метками времени отведено 4 строки: прошлая, текущая и две следующие; клик по строке перематывает.
// Если меток времени нет, текст просто листается. Тексты берутся из открытой базы LRCLIB: туда уходят
// название, исполнитель, альбом и длительность трека.
const Lyrics = (() => {
  const body = $('#lyrBody'), win = $('#lyrWin'), btn = $('#toLyrics');
  const [ep, ec, en1, en2] = win.children;
  let key = '', data = null, seq = 0, cur = -2;
  let off = 0, browseT = 0, wheelAcc = 0; // off: на сколько строк пользователь «пролистал» текст от текущей

  const visible = () => island.dataset.state === 'karaoke';
  const line = (i) => (data?.lines[i] ? data.lines[i].s || '♪' : '');

  function note(msg) {
    data = null; cur = -2; off = 0;
    win.hidden = true; body.hidden = false; body.classList.remove('plain');
    const d = document.createElement('div');
    d.className = 'lyr-note'; d.textContent = msg;
    body.replaceChildren(d);
  }

  function show(res) {
    data = res; cur = -2; off = 0;
    if (!res.lines.length) { note('Текст этой песни не найден'); return; }
    if (res.synced) {
      body.hidden = true; win.hidden = false;
      [[ep, -1], [ec, 0], [en1, 1], [en2, 2]].forEach(([el, d]) => { el.onclick = () => { seekTo(center() + d); off = 0; render(); }; });
      return;
    }
    win.hidden = true; body.hidden = false; body.classList.add('plain');
    const frag = document.createDocumentFragment();
    for (const l of res.lines) {
      const d = document.createElement('div');
      d.className = 'll' + (l.s ? '' : ' gap');
      d.textContent = l.s || '♪';
      frag.append(d);
    }
    body.replaceChildren(frag);
    body.scrollTop = 0;
  }

  const center = () => Math.max(0, Math.min(data.lines.length - 1, cur + off));

  // показать окно из 4 строк вокруг текущей (или вокруг выбранной прокруткой)
  function render() {
    if (!data?.synced) return;
    const c = off === 0 ? cur : center();
    ep.textContent = line(c - 1); ec.textContent = c >= 0 ? line(c) : '♪'; en1.textContent = line(c + 1); en2.textContent = line(c + 2);
    win.classList.toggle('browse', off !== 0);
    win.classList.remove('step'); void win.offsetWidth; win.classList.add('step'); // короткая анимация смены строки
  }

  function seekTo(i) {
    const l = data?.lines[i];
    if (l && l.t != null) { try { P.seek?.(l.t); } catch { /* ignore */ } }
  }

  async function load() {
    const t = T.track;
    key = t ? String(t.id) : '';
    const my = ++seq;
    if (!t) { note('Сейчас ничего не играет'); return; }
    note('Ищем текст…');
    try {
      const res = await host.raw('lyrics:get', { title: t.title, artist: t.artists, album: t.album, durationMs: t.durationMs || T.dur });
      if (my === seq) show(res);
    } catch (e) {
      if (my !== seq) return;
      note(`Не удалось загрузить текст: ${e.message}`);
      setTimeout(() => { if (my === seq) key = ''; }, 10000); // через 10 секунд пробуем ещё раз
    }
  }

  function tick() {
    if (!visible()) return;
    const id = T.track ? String(T.track.id) : '';
    if (id !== key) { load(); return; }
    if (!data?.synced) return;
    const pos = posNow() + 200; // мс; подсвечиваем чуть заранее
    let i = -1;
    for (let k = 0; k < data.lines.length; k++) { if (data.lines[k].t <= pos) i = k; else break; }
    if (i === cur) return;
    cur = i;
    if (off === 0) render(); // пока текст листают вручную, окно не прыгает за песней
  }
  setInterval(tick, 200);

  function toggle() {
    const on = S.sub !== 'karaoke';
    setSub(on ? 'karaoke' : 'expanded');
    if (on) { key = ''; tick(); }
  }
  btn.onclick = toggle;

  // колесо мыши листает слова: центральная строка меняется, клик по ней перематывает песню на эту строку
  $('.l-karaoke').addEventListener('wheel', (e) => {
    if (!data?.synced) return; // у обычного текста листает сам список
    e.preventDefault();
    wheelAcc += e.deltaY;
    const steps = Math.trunc(wheelAcc / 40);
    if (!steps) return;
    wheelAcc -= steps * 40;
    const to = Math.max(0, Math.min(data.lines.length - 1, center() + steps));
    off = to - cur;
    render();
    clearTimeout(browseT);
    browseT = setTimeout(() => { off = 0; render(); }, 4000); // через 4 секунды без прокрутки возвращаемся к песне
  }, { passive: false });

  // При наведении на «чёлку» сверху остров раскрывается поверх слов, при уходе курсора сворачивается обратно
  let peekT;
  const setPeek = (on) => { island.classList.toggle('peek', on); btn.classList.toggle('on', on && visible()); };
  document.addEventListener('mousemove', (e) => {
    if (!visible()) { if (island.classList.contains('peek')) setPeek(false); return; }
    const r = island.getBoundingClientRect(), peeking = island.classList.contains('peek');
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const inside = peeking ? (x >= 0 && x <= r.width && y >= 0 && y <= 198) : (x >= r.width / 2 - 120 && x <= r.width / 2 + 120 && y >= 0 && y <= 40);
    clearTimeout(peekT);
    if (inside) { if (!peeking) setPeek(true); } else if (peeking) peekT = setTimeout(() => setPeek(false), 250);
  });
  document.addEventListener('mouseleave', () => { clearTimeout(peekT); peekT = setTimeout(() => setPeek(false), 250); });
  new MutationObserver(() => { if (!visible()) setPeek(false); }).observe(island, { attributes: true, attributeFilter: ['data-state'] });
  return { toggle };
})();

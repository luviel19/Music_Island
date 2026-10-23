// Поиск песни по всем площадкам сразу. Одна песня, найденная на нескольких площадках, склеивается
// в одну строку, и справа появляются значки площадок: клик по значку — играть именно там.
// Провайдер участвует в поиске, если у него есть search(host, query) -> tracks.
const Search = (() => {
  const input = $('#sq'), box = $('.sbox'), list = $('#slist'), stat = $('#sstat');
  let seq = 0, timer = null, active = false;
  let res = new Map(); // id площадки -> { state: 'load' | 'ok' | 'auth' | 'err', tracks }
  let lastQuery = '';
  let only = null; // выбранная площадка-фильтр (null — все)
  let kind = 'tracks'; // что ищем: песни или альбомы
  const kindBox = $('#skind');

  const sources = () => Providers.list.filter((p) => (kind === 'albums' ? p.searchAlbums : p.search));

  // ── сопоставление одной песни на разных площадках ──
  // пояснения в скобках отбрасываем, но версии (remix, live…) оставляем: это другая запись
  const VARIANT = /remix|live|acoustic|cover|version|mix\b|instrumental|slowed|sped|nightcore|edit|ремикс|кавер|вживую/i;
  const clean = (s) => String(s || '').toLowerCase()
    .replace(/[(\[{]([^)\]}]*)[)\]}]/g, (_m, x) => (VARIANT.test(x) ? ` ${x} ` : ' '))
    .replace(/\b(feat|ft|featuring)\b.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  function describe(pid, t, rank) {
    const keys = new Set([clean(t.title)]);
    let art = clean(t.artists);
    // «Исполнитель - Песня» в названии (типично для YouTube и SoundCloud)
    const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(t.title);
    if (m) { keys.add(clean(m[2])); art += ` ${clean(m[1])}`; }
    keys.delete('');
    return { pid, t, rank, keys, art, toks: art.split(' ').filter((x) => x.length >= 3) };
  }
  function same(a, b) {
    if (a.pid === b.pid) return false;
    if (![...a.keys].some((k) => b.keys.has(k))) return false;
    const da = a.t.durationMs, db = b.t.durationMs;
    if (da && db && Math.abs(da - db) > 12000) return false;
    return a.toks.some((x) => b.art.includes(x)) || b.toks.some((x) => a.art.includes(x));
  }

  function group() {
    const order = sources().map((p) => p.id);
    const groups = [];
    for (const pid of order) {
      const r = res.get(pid);
      if (!r?.tracks) continue;
      r.tracks.forEach((t, i) => {
        const it = describe(pid, t, i);
        const g = groups.find((x) => !x.items[pid] && [...Object.values(x.items)].some((o) => same(o, it)));
        if (g) g.items[pid] = it; else groups.push({ items: { [pid]: it } });
      });
    }
    for (const g of groups) {
      const its = Object.values(g.items);
      g.main = its[0].t; // порядок площадок задаёт, чьи название и обложка красивее
      g.cover = (its.find((i) => i.t.cover) || its[0]).t.cover;
      g.score = its.reduce((s, i) => s + 1 / (1 + i.rank), 0) * (1 + 0.15 * (its.length - 1));
    }
    return groups.sort((a, b) => b.score - a.score).slice(0, 40);
  }

  // ── отрисовка ──
  function renderStat() {
    stat.replaceChildren();
    if (!lastQuery) return;
    for (const p of sources()) {
      const r = res.get(p.id) || { state: 'load' };
      const el = document.createElement('button');
      const n = r.tracks?.length || 0; // для альбомов — тоже список (альбомов)
      el.className = `sp ${r.state === 'ok' && !n ? 'off' : r.state === 'auth' ? 'need' : r.state}${only === p.id ? ' sel' : ''}${r.state === 'ok' && n ? ' pick' : ''}`;
      el.innerHTML = `<svg><use href="#${p.icon}"/></svg><span></span>`;
      const label = r.state === 'load' ? '…' : r.state === 'auth' ? 'нужен вход' : r.state === 'err' ? 'ошибка' : String(n);
      el.querySelector('span').textContent = label;
      el.dataset.tip = r.state === 'auth' ? `${p.name}: войдите, чтобы искать` : p.name;
      if (r.state === 'auth') el.onclick = () => { setSub('expanded'); setSource(p.id); };
      else if (r.state === 'ok' && n) {
        el.dataset.tip = only === p.id ? 'Показать все площадки' : `Показать только ${p.name}`;
        el.onclick = () => { only = only === p.id ? null : p.id; list.scrollTop = 0; render(); };
      }
      stat.append(el);
    }
  }

  function renderList() {
    list.replaceChildren();
    if (!lastQuery) {
      const names = sources().map((p) => p.name).join(', ');
      list.innerHTML = '<div class="empty"></div>';
      list.firstChild.textContent = `${kind === 'albums' ? 'Ищем альбомы в' : 'Ищем сразу в'}: ${names}`;
      return;
    }
    if (kind === 'albums') { renderAlbums(); return; }
    if (only && !res.get(only)?.tracks?.length) only = null;
    const groups = group().filter((g) => !only || g.items[only]);
    const loading = sources().some((p) => (res.get(p.id)?.state || 'load') === 'load');
    if (!groups.length) {
      list.innerHTML = '<div class="empty"></div>';
      list.firstChild.textContent = loading ? 'Ищем…' : 'Ничего не найдено';
      return;
    }
    for (const g of groups) {
      const row = document.createElement('div');
      row.className = 'srow';
      const img = document.createElement('img'); if (g.cover) img.src = g.cover;
      const meta = document.createElement('div'); meta.className = 'q-meta';
      const a = document.createElement('div'); a.className = 'q-t'; a.textContent = g.main.title;
      const b = document.createElement('div'); b.className = 'q-a'; b.textContent = g.main.artists;
      meta.append(a, b);
      const d = document.createElement('div'); d.className = 'q-d'; d.textContent = g.main.durationMs ? fmt(g.main.durationMs / 1000) : '';
      const pcs = document.createElement('div'); pcs.className = 'pcs';
      const present = Object.keys(g.items);
      for (const p of sources()) {
        const it = g.items[p.id]; if (!it) continue;
        const c = document.createElement('button');
        c.className = 'pc' + (p.id === P.id ? ' cur' : '');
        c.dataset.tip = `Слушать в ${p.name}`;
        c.innerHTML = `<svg><use href="#${p.icon}"/></svg>`;
        c.onclick = (e) => { e.stopPropagation(); play(p.id, it.t); };
        pcs.append(c);
      }
      row.append(img, meta, d, pcs);
      // клик по строке: там, где сейчас играет (если песня есть), иначе на первой найденной площадке
      row.onclick = () => play(present.includes(P.id) ? P.id : present[0], g.items[present.includes(P.id) ? P.id : present[0]].t);
      list.append(row);
    }
  }

  // ── альбомы ──
  function renderAlbums() {
    // у Spotify своего списка нет (встроенный веб-плеер): открываем официальную страницу альбомов в панели
    if (P.searchWebAlbums) {
      const row = document.createElement('div');
      row.className = 'srow';
      const ic = document.createElement('div'); ic.className = 'sp-ico'; ic.innerHTML = `<svg><use href="#${P.icon}"/></svg>`;
      const meta = document.createElement('div'); meta.className = 'q-meta';
      const a = document.createElement('div'); a.className = 'q-t'; a.textContent = `Альбомы Spotify: «${lastQuery}»`;
      const b = document.createElement('div'); b.className = 'q-a'; b.textContent = 'Открыть на странице Spotify в панели';
      meta.append(a, b);
      row.append(ic, meta);
      row.onclick = () => P.searchWebAlbums(lastQuery).catch((e) => e.message !== 'auth' && host.flash(e.message));
      list.append(row);
    }
    const items = [];
    for (const p of sources()) (res.get(p.id)?.tracks || []).forEach((al) => items.push({ p, al }));
    if (only) items.splice(0, items.length, ...items.filter((x) => x.p.id === only));
    const loading = sources().some((p) => (res.get(p.id)?.state || 'load') === 'load');
    if (!items.length) {
      if (P.searchWebAlbums) return;
      list.innerHTML = '<div class="empty"></div>';
      list.firstChild.textContent = loading ? 'Ищем…' : 'Альбомы не найдены';
      return;
    }
    for (const { p, al } of items) {
      const row = document.createElement('div');
      row.className = 'srow';
      const img = document.createElement('img'); if (al.cover) img.src = al.cover;
      const meta = document.createElement('div'); meta.className = 'q-meta';
      const a = document.createElement('div'); a.className = 'q-t'; a.textContent = al.title;
      const b = document.createElement('div'); b.className = 'q-a'; b.textContent = [al.artists, al.year].filter(Boolean).join(' · ');
      meta.append(a, b);
      const d = document.createElement('div'); d.className = 'q-d'; d.textContent = al.trackCount ? `${al.trackCount} тр.` : '';
      const pcs = document.createElement('div'); pcs.className = 'pcs';
      const c = document.createElement('div'); c.className = 'pc'; c.innerHTML = `<svg><use href="#${p.icon}"/></svg>`;
      pcs.append(c);
      row.append(img, meta, d, pcs);
      row.onclick = () => playAlbum(p, al);
      list.append(row);
    }
  }
  async function playAlbum(p, al) {
    try {
      const tracks = await p.albumTracks(host, al);
      if (!tracks?.length) { host.flash('В альбоме нет доступных треков'); return; }
      playResult(p.id, tracks[0], tracks);
    } catch (e) { if (e.message !== 'auth') host.flash(e.message); }
  }

  function render() { renderStat(); renderList(); }

  function play(pid, track) {
    const tracks = res.get(pid)?.tracks || [track];
    playResult(pid, track, tracks);
  }

  // ── запросы ──
  function run(q) {
    q = q.trim();
    const my = ++seq;
    lastQuery = q.length >= 2 ? q : '';
    res = new Map();
    list.scrollTop = 0;
    if (!lastQuery) { render(); return; }
    for (const p of sources()) {
      res.set(p.id, { state: 'load', tracks: null });
      Promise.resolve().then(() => (kind === 'albums' ? p.searchAlbums(host, lastQuery) : p.search(host, lastQuery))).then(
        (tracks) => { if (my === seq) { res.set(p.id, { state: 'ok', tracks: tracks || [] }); render(); } },
        (e) => { if (my === seq) { res.set(p.id, { state: e.message === 'auth' ? 'auth' : 'err', tracks: null }); render(); } },
      );
    }
    render();
  }

  input.addEventListener('input', () => {
    box.classList.toggle('has', !!input.value);
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 380);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(timer); run(input.value); if (kind === 'tracks') P.searchWeb?.(input.value); } // Spotify: результаты на его странице в панели (альбомы — по клику на строку)
    else if (e.key === 'Escape') { e.preventDefault(); setSub('expanded'); }
  });
  kindBox.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kind]');
    if (!b || b.dataset.kind === kind) return;
    kind = b.dataset.kind; only = null;
    kindBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    input.placeholder = kind === 'albums' ? 'Название альбома или исполнитель' : 'Название песни или исполнитель';
    run(input.value);
    input.focus();
  });
  $('#sclear').onclick = () => { input.value = ''; box.classList.remove('has'); run(''); input.focus(); };
  input.addEventListener('focus', () => { S.busy = true; });
  input.addEventListener('blur', () => { S.busy = false; evalOver(lastMouse.x, lastMouse.y); });

  // окно острова обычно не берёт фокус; на время поиска разрешаем, чтобы можно было печатать
  function sync(on) {
    if (on === active) return;
    active = on;
    bridge.send('win:focusable', on);
    if (on) {
      render();
      setTimeout(() => { if (active) input.focus(); }, 120);
    } else {
      clearTimeout(timer);
      input.blur();
    }
  }

  // для проверок: совпадают ли два трека разных площадок
  const match = (pa, a, pb, b) => same(describe(pa, a, 0), describe(pb, b, 0));
  return { sync, match };
})();

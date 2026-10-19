const {
  app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell,
  globalShortcut, safeStorage, clipboard, session, net, dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const security = require('./security');

const WIN_W = 560;
const WIN_H = 520;

// Папка данных не зависит от имени пакета. Старые настройки (ya-island) переносятся один раз.
if (!process.argv.some((a) => a.startsWith('--user-data-dir'))) {
  const dataDir = path.join(app.getPath('appData'), 'Music Island');
  const oldFile = path.join(app.getPath('appData'), 'ya-island', 'settings.json');
  try {
    if (!fs.existsSync(path.join(dataDir, 'settings.json')) && fs.existsSync(oldFile)) {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.copyFileSync(oldFile, path.join(dataDir, 'settings.json'));
    }
  } catch { /* не критично */ }
  app.setPath('userData', dataDir);
}

if (!app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Остров маленький, а процесс GPU с аппаратным ускорением раздувался до 200–300 МБ ОЗУ: рисуем на CPU
app.disableHardwareAcceleration();

// ───────────────────────── настройки ─────────────────────────
const S = {
  x: null, y: null,
  alwaysOnTop: true, hoverExpand: true, lockPosition: false, autoStart: false,
  source: 'ym', mode: 'wave', shuffle: false,
  eq: null, // эквалайзер: { on, preset, bands[10], preamp, custom[] } (проверяет src/audio-fx.js)
  tune: {}, // настройка волны по площадкам: { ym: { группа: значение }, … }
  providers: {}, // приватные данные провайдеров (токены и т.п.)
};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  // берём только известные поля с правильными типами: испорченный или подменённый файл не должен ломать настройки
  try { Object.assign(S, security.sanitizeStored(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')), providers.map((p) => p.id))); } catch { /* первый запуск */ }
  // миграция со старого формата, где токены лежали в корне
  const p = (S.providers ||= {});
  if (S.token) { (p.ym ||= {}).token = S.token; delete S.token; }
  if (S.spClientId) { (p.sp ||= {}).clientId = S.spClientId; delete S.spClientId; }
  if (S.spRefresh) { (p.sp ||= {}).refresh = S.spRefresh; delete S.spRefresh; }
  migrateSecrets();
}
// Секреты, сохранённые старыми версиями открытым текстом, шифруются при первом запуске (если хранилище Windows доступно)
function migrateSecrets() {
  if (!safeStorage.isEncryptionAvailable()) return;
  let changed = false;
  const fix = (o, k) => { if (typeof o[k] === 'string' && o[k] && !o[k].startsWith('enc:')) { o[k] = enc(o[k]); changed = true; } };
  for (const d of Object.values(S.providers || {})) if (d && typeof d === 'object') fix(d, 'token');
  fix(S, 'proxyCustom'); fix(S, 'proxyLast');
  if (changed) saveSettings();
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(S)); } catch { /* ignore */ }
}
const publicSettings = () => ({
  alwaysOnTop: S.alwaysOnTop, hoverExpand: S.hoverExpand, lockPosition: S.lockPosition,
  source: S.source, mode: S.mode, shuffle: S.shuffle, eq: S.eq, tune: S.tune || {},
});
// эти ключи меняют только то, что внутри окна: сохраняем без перестройки трея и окна
const QUIET_KEYS = ['eq', 'tune'];

// ───────────────────────── провайдеры ─────────────────────────
// Секреты хранятся только зашифрованными. Если хранилище Windows недоступно, не сохраняем их открытым текстом
const enc = (v) => {
  if (!v) return null;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Защищённое хранилище Windows недоступно: данные для входа не сохранены, чтобы не лежать открытым текстом');
  return 'enc:' + safeStorage.encryptString(v).toString('base64');
};
const dec = (v) => {
  if (!v) return null;
  try { return v.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')) : v; } catch { return null; }
};
const ctx = {
  data: (id) => (S.providers[id] ||= {}),
  save: saveSettings,
  enc, dec, clipboard, readClip: async () => String((await clipboard.readText()) || ''), shell, session, BrowserWindow,
  fetch: (u, o) => net.fetch(u, o), // идёт через сессию Electron, поэтому учитывает прокси
  app, screen, root: __dirname,
  getWindow: () => win,
  provider: (id) => providers.find((p) => p.id === id),
};
const providers = require('./providers')(ctx);
const updater = require('./updater')((info) => { win?.webContents.send('update', info); tray?.setContextMenu(buildMenu()); });
// прокси только для SoundCloud и YouTube: остальные площадки ходят напрямую
const SC_HOSTS = String.raw`(^|\.)(soundcloud\.com|sndcdn\.com|soundcloud\.cloud|youtube\.com|youtu\.be|youtube-nocookie\.com|googlevideo\.com|ytimg\.com|ggpht\.com|gstatic\.com|googleapis\.com|google\.com|recaptcha\.net|facebook\.com|fbcdn\.net|apple\.com|datadome\.co|captcha-delivery\.com|hcaptcha\.com|cloudflare\.com)$`;
function proxyRule(v) {
  const m = /^(?:(socks5|socks4|socks|http|https):\/\/)?([^\s/:]+:\d+)\/?$/i.exec(String(v || '').trim());
  if (!m) return null;
  const k = (m[1] || 'http').toLowerCase();
  return `${k.startsWith('socks') ? (k === 'socks4' ? 'SOCKS4' : 'SOCKS5') : k === 'https' ? 'HTTPS' : 'PROXY'} ${m[2]}`;
}
const tunnel = require('./tunnel')(app);
const builtinLink = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'builtin-proxy.json'), 'utf8')).link || null; } catch { return null; } };
const hasBuiltin = () => !!builtinLink() && tunnel.available();
// режим: off (системные настройки) | builtin (наш прокси) | custom (адрес или ссылка hysteria2 пользователя)
const proxyMode = () => S.proxyMode || (S.proxy ? 'custom' : 'off');
const customTarget = () => (S.proxyCustom ? dec(S.proxyCustom) : S.proxy) || '';
const isSub = (v) => /^https?:\/\/[^\s/]+\/\S+$/i.test(String(v || '').trim()) && !proxyRule(v);
// подписка VPN: список ссылок (обычно в base64) — берём из неё hysteria2-серверы
async function subscriptionLinks(url) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'v2rayN/6.0' } });
  if (!r.ok) throw new Error(`Подписка недоступна (HTTP ${r.status})`);
  let t = (await r.text()).trim();
  if (!/:\/\//.test(t)) { try { t = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { /* не base64 */ } }
  const all = t.split(/\s+/).filter((x) => /^[a-z0-9]+:\/\//i.test(x));
  const hy = all.filter((x) => tunnel.isHy(x));
  if (!hy.length) throw new Error(`В подписке нет серверов hysteria2 (всего ссылок: ${all.length}). Другие протоколы, например vless, остров не поддерживает`);
  return hy;
}
// перебираем серверы по порядку; первый, к которому удалось подключиться, остаётся (недавно рабочий — первым)
// Ссылка с insecure=1 просит не проверять сертификат сервера. Включаем это только после явного согласия пользователя
// для этого сервера (запоминается); встроенный прокси автора считается доверенным.
function insecureAllowed(link, trusted) {
  if (!tunnel.wantsInsecure(link)) return false;
  if (trusted) return true;
  let host = '';
  try { host = new URL(String(link).trim().replace(/^hy2:/i, 'hysteria2:')).host; } catch { return false; }
  S.insecureOk ||= [];
  if (S.insecureOk.includes(host)) return true;
  const r = dialog.showMessageBoxSync({
    type: 'warning', title: 'Music Island', buttons: ['Не разрешать', 'Разрешить для этого сервера'], defaultId: 0, cancelId: 0,
    message: `Сервер ${host} просит отключить проверку сертификата (insecure=1).`,
    detail: 'Без проверки сертификата трафик может перехватить посторонний. Разрешайте, только если доверяете этому серверу. Если отказаться, подключение пойдёт с обычной проверкой и может не удаться.',
  });
  if (r !== 1) return false;
  S.insecureOk.push(host); saveSettings();
  return true;
}
async function startFromSub(url, trustedLink = false) {
  let links;
  try { links = await subscriptionLinks(url); } catch (e) { if (!S.proxyLast) throw e; links = []; }
  const last = S.proxyLast ? dec(S.proxyLast) : null;
  if (last) links = [last, ...links.filter((x) => x !== last)];
  let err;
  for (const l of links) {
    try { const addr = await tunnel.start(l, 6000, { allowInsecure: insecureAllowed(l, trustedLink) }); try { S.proxyLast = enc(l); } catch { S.proxyLast = null; } saveSettings(); return addr; } catch (e) { err = e; }
  }
  throw err || new Error('Нет доступных серверов');
}
// ссылка хранится в настройках зашифрованной, в меню показываем только сервер (без паролей и ключей)
function describeTarget(v) {
  try { const u = new URL(String(v).trim().replace(/^hy2:/i, 'hysteria2:')); return isSub(v) ? `подписка ${u.hostname}` : `${u.protocol.replace(':', '')} ${u.host}`; } catch { return String(v).split('@').pop().slice(0, 40); }
}
function setProxyMode(m) {
  S.proxyMode = m; saveSettings();
  tray?.setContextMenu(buildMenu());
  return applyProxy().finally(() => tray?.setContextMenu(buildMenu()));
}
async function applyProxy() {
  const mode = proxyMode();
  const target = mode === 'builtin' ? builtinLink() : mode === 'custom' ? customTarget() : '';
  let rule = null;
  try {
    if (target && isSub(target)) rule = proxyRule(await startFromSub(target.trim(), mode === 'builtin'));
    else if (target && tunnel.isHy(target)) rule = proxyRule(await tunnel.start(target, 10000, { allowInsecure: insecureAllowed(target, mode === 'builtin') }));
    else { tunnel.stop(); rule = target ? proxyRule(target) : null; }
  } catch (e) {
    tunnel.stop();
    dialog.showErrorBox('Music Island', `Прокси не запустился.
${e.message}`);
  }
  const cfg = rule
    ? { mode: 'pac_script', pacScript: 'data:application/x-ns-proxy-autoconfig;base64,' + Buffer.from(
      `function FindProxyForURL(u,h){return /${SC_HOSTS}/.test(h)?"${rule}":"DIRECT";}`).toString('base64') }
    : { mode: 'system' };
  // окно входа SoundCloud живёт в своём разделе сессии, поэтому прокси ставим и туда
  for (const ses of [session.defaultSession, session.fromPartition('persist:soundcloud')]) {
    await ses.setProxy(cfg);
    await ses.closeAllConnections();
  }
}
const activeProvider = () => providers.find((p) => p.id === S.source) || providers[0];

// сетевые ошибки Chromium по-человечески (особенно про прокси)
function friendly(e) {
  const m = String(e.message || e);
  if (/ERR_PROXY_CERTIFICATE_INVALID/.test(m)) return 'Прокси с недействительным сертификатом: возьмите socks5://… или http://…';
  if (/ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED/.test(m)) return 'Прокси не отвечает или не пускает: проверьте адрес';
  if (/ERR_CERT_/.test(m)) return 'Ошибка сертификата: прокси подменяет трафик, это небезопасно';
  return m;
}
// Принимаем сообщения только от главной страницы острова (src/index.html) в нашем окне
const UI_URL = () => pathToFileURL(path.join(__dirname, 'src', 'index.html')).href;
function trusted(e) {
  try {
    return !!win && !win.isDestroyed() && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame
      && e.senderFrame.url.split(/[?#]/)[0] === UI_URL();
  } catch { return false; }
}
function on(channel, fn) { ipcMain.on(channel, (e, ...args) => { if (trusted(e)) fn(e, ...args); }); }
function handle(name, fn) {
  ipcMain.handle(name, async (e, ...args) => {
    if (!trusted(e)) return { ok: false, error: 'forbidden' };
    try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: friendly(e) }; }
  });
}
for (const p of providers) {
  for (const [name, fn] of Object.entries(p.handlers)) handle(`${p.id}:${name}`, fn);
}

handle('settings:get', () => publicSettings());
handle('settings:set', (patch) => {
  patch = security.sanitizePatch(patch, providers.map((p) => p.id)); // неизвестные ключи и неверные значения отбрасываются
  for (const k of ['alwaysOnTop', 'hoverExpand', 'lockPosition', 'source', 'mode', 'shuffle', ...QUIET_KEYS]) {
    if (k in patch) S[k] = patch[k];
  }
  if (Object.keys(patch).every((k) => QUIET_KEYS.includes(k))) saveSettings();
  else applySettings();
  return publicSettings();
});
handle('update:get', () => updater.latest);
handle('update:open', () => { if (updater.latest) shell.openExternal(updater.latest.url); });
handle('open:external', (url) => {
  const u = new URL(url);
  if (u.protocol === 'https:' && providers.some((p) => (p.hosts || []).includes(u.hostname))) shell.openExternal(url);
});

// окно: прозрачные области пропускают клики, остров перетаскивается вручную
let win, tray, drag = null, quitting = false;
app.on('before-quit', () => { quitting = true; });
on('win:ignore', (_e, ignore) => win?.setIgnoreMouseEvents(ignore, { forward: true }));
on('win:focusable', (_e, on) => {
  if (!win) return;
  win.setFocusable(!!on);
  if (on) { win.focus(); win.webContents.focus(); }
});
// Остров не выходит за экран. vp — желаемое положение окна, при котором остров стоит как надо (свёрнутый может быть в самом углу).
// Само окно всегда целиком на мониторе, а остров внутри него смещается (CSS), поэтому раскрытие у края идёт плавно.
on('win:box', (_e, w, h) => {
  box = { w: Math.min(Math.max(+w || 240, 100), WIN_W), h: Math.min(Math.max(+h || 38, 30), WIN_H) };
  lastShift = ''; // окно могло загрузиться позже первой отправки
  place(false);
});
on('win:drag-start', () => {
  const c = screen.getCursorScreenPoint();
  drag = { cx: c.x, cy: c.y, x: vp.x, y: vp.y };
});
on('win:drag-move', () => {
  if (!drag) return;
  const c = screen.getCursorScreenPoint();
  vp = clampPill(drag.x + c.x - drag.cx, drag.y + c.y - drag.cy, COMPACT, c); // тащим в углы по размеру свёрнутого
  place(true);
});
on('win:drag-end', () => {
  drag = null;
  S.x = vp.x; S.y = vp.y;
  saveSettings();
  place(false);
});

// ───────────────────────── окно и трей ─────────────────────────
// Остров нельзя вынести за границы экрана: окно целиком остаётся в рабочей области ближайшего монитора
let box = { w: 240, h: 38 }; // текущий размер острова (он по центру окна сверху, отступ 8)
const COMPACT = { w: 240, h: 38 };
let vp = { x: 0, y: 0 }, lastShift = '';
const pillDisplay = (x, y, near) => screen.getDisplayNearestPoint(near || { x: Math.round(x + WIN_W / 2), y: Math.round(y + 27) });
function clampPill(x, y, bx = COMPACT, near) {
  const a = pillDisplay(x, y, near).workArea;
  const sx = (WIN_W - bx.w) / 2;
  const lo = { x: a.x - sx, y: a.y - 8 };
  const hi = { x: a.x + a.width - sx - bx.w, y: a.y + a.height - 8 - bx.h };
  return {
    x: Math.round(Math.min(Math.max(x, lo.x), Math.max(lo.x, hi.x))),
    y: Math.round(Math.min(Math.max(y, lo.y), Math.max(lo.y, hi.y))),
  };
}
function place(instant) {
  if (!win || win.isDestroyed()) return;
  const a = pillDisplay(vp.x, vp.y).workArea;
  const w = {
    x: Math.round(Math.min(Math.max(vp.x, a.x), Math.max(a.x, a.x + a.width - WIN_W))),
    y: Math.round(Math.min(Math.max(vp.y, a.y), Math.max(a.y, a.y + a.height - WIN_H))),
  };
  const b = win.getBounds();
  if (b.x !== w.x || b.y !== w.y || b.width !== WIN_W || b.height !== WIN_H) win.setBounds({ x: w.x, y: w.y, width: WIN_W, height: WIN_H });
  const p = clampPill(vp.x, vp.y, box);
  const key = `${p.x - w.x},${p.y - w.y},${instant}`;
  if (key !== lastShift) { lastShift = key; win.webContents.send('shift', p.x - w.x, p.y - w.y, !!instant); }
}
// Сворачивание (Win+D, «свернуть все окна») и сброс видимости не должны убирать остров
function keepAlive() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.showInactive();
  if (!drag) place(false);
  if (S.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');
}
function defaultPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: Math.round(wa.x + (wa.width - WIN_W) / 2), y: wa.y };
}
function savedPosition() {
  if (S.x == null || S.y == null) return defaultPosition();
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea, cx = S.x + WIN_W / 2;
    return cx >= a.x && cx <= a.x + a.width && S.y >= a.y - 8 && S.y <= a.y + a.height - 40;
  });
  return visible ? clampPill(S.x, S.y) : defaultPosition();
}

function createWindow() {
  vp = savedPosition();
  const pos = { x: Math.round(Math.min(Math.max(vp.x, pillDisplay(vp.x, vp.y).workArea.x), pillDisplay(vp.x, vp.y).workArea.x + pillDisplay(vp.x, vp.y).workArea.width - WIN_W)), y: vp.y };
  win = new BrowserWindow({
    ...pos, width: WIN_W, height: WIN_H,
    frame: false, transparent: true, resizable: false, maximizable: false,
    hasShadow: false, skipTaskbar: true, focusable: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // окно острова показывает только свой интерфейс: чужие адреса и новые окна не открываем
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => { win.showInactive(); place(false); applySettings(); });
  for (const ev of ['minimize', 'hide']) win.on(ev, () => { if (!quitting) setTimeout(keepAlive, 50); });
  const onDisplays = () => { vp = savedPosition(); keepAlive(); };
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, onDisplays);
  setInterval(keepAlive, 2000);
}

function applySettings() {
  if (!win || win.isDestroyed()) return;
  if (S.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');
  else win.setAlwaysOnTop(false);
  app.setLoginItemSettings({ openAtLogin: !!S.autoStart });
  tray?.setContextMenu(buildMenu());
  win.webContents.send('settings', publicSettings());
  saveSettings();
}

function buildMenu() {
  const send = (cmd) => win.webContents.send('cmd', cmd);
  const toggle = (key) => () => { S[key] = !S[key]; applySettings(); };
  return Menu.buildFromTemplate([
    ...(updater.latest ? [{ label: `Доступна версия ${updater.latest.version}: скачать`, click: () => shell.openExternal(updater.latest.url) }, { type: 'separator' }] : []),
    { label: 'Показать остров', click: () => { win.showInactive(); win.moveTop(); } },
    { type: 'separator' },
    ...providers.map((p) => ({ label: `Источник: ${p.name}`, type: 'radio', checked: S.source === p.id, click: () => send(`source:${p.id}`) })),
    { type: 'separator' },
    ...(activeProvider().modes || []).map((m) => ({ label: m.label, type: 'radio', checked: S.mode === m.id, click: () => send(`mode:${m.id}`) })),
    { type: 'separator' },
    { label: 'Поверх всех окон', type: 'checkbox', checked: S.alwaysOnTop, click: toggle('alwaysOnTop') },
    { label: 'Раскрывать при наведении', type: 'checkbox', checked: S.hoverExpand, click: toggle('hoverExpand') },
    { label: 'Закрепить положение', type: 'checkbox', checked: S.lockPosition, click: toggle('lockPosition') },
    { label: 'Запускать с Windows', type: 'checkbox', checked: S.autoStart, click: toggle('autoStart') },
    { label: `VPN/прокси: ${proxyMode() === 'off' ? 'выключен' : proxyMode() === 'builtin' ? 'наш' : 'включён'}`, submenu: [
      ...(hasBuiltin() ? [{ label: 'Использовать наш прокси', type: 'radio', checked: proxyMode() === 'builtin', click: () => setProxyMode('builtin') }] : []),
      { label: customTarget() ? `Включить: ${describeTarget(customTarget())}` : 'Включить (сначала вставьте ссылку)', type: 'checkbox', checked: proxyMode() === 'custom', enabled: !!customTarget(), click: () => setProxyMode(proxyMode() === 'custom' ? 'off' : 'custom') },
      { label: 'Вставить новый VPN или прокси (из буфера)', click: async () => {
        const v = (await ctx.readClip()).trim();
        if (!proxyRule(v) && !tunnel.isHy(v) && !isSub(v)) { dialog.showErrorBox('Music Island', 'В буфере обмена нет адреса прокси.\nПодходит: ссылка на подписку VPN (https://…), hysteria2://…, socks5://host:port или 127.0.0.1:1080'); return; }
        try { S.proxyCustom = enc(v); } catch (e) { dialog.showErrorBox('Music Island', e.message); return; }
        S.proxy = ''; S.proxyLast = null;
        setProxyMode('custom');
      } },
      { label: 'Забыть сохранённую ссылку', enabled: !!customTarget(), click: () => { S.proxyCustom = null; S.proxy = ''; S.proxyLast = null; setProxyMode(proxyMode() === 'builtin' ? 'builtin' : 'off'); } },
    ] },
    { label: 'Вернуть в центр экрана', click: () => { const p = defaultPosition(); vp = p; S.x = p.x; S.y = p.y; saveSettings(); place(false); } },
    { type: 'separator' },
    ...providers.map((p) => ({ label: `Выйти из ${p.name}`, click: () => { p.handlers.logout(); send(`logout:${p.id}`); } })),
    { label: 'Spotify: скопировать диагностику', click: () => clipboard.writeText(JSON.stringify(providers.find((p) => p.id === 'sp').handlers.diag(), null, 2)) },
    { label: 'Закрыть', click: () => app.quit() },
  ]);
}

// Эквалайзер (Web Audio) подключает <audio> с crossOrigin. Со страницы file:// Chromium сейчас пускает
// звук и без CORS, но если сочтёт поток чужим — будет тишина. Страхуемся: дописываем заголовок медиа-ответам.
function allowMediaCors() {
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['https://*/*'] }, (d, cb) => {
    // только аудио Яндекс Музыки и SoundCloud (нужны эквалайзеру) и только для окна острова, не для окон входа
    if (d.resourceType !== 'media' || !security.isMediaHost(d.url) || !win || d.webContentsId !== win.webContents.id) return cb({});
    const h = d.responseHeaders || {};
    if (Object.keys(h).some((k) => k.toLowerCase() === 'access-control-allow-origin')) return cb({});
    cb({ responseHeaders: { ...h, 'Access-Control-Allow-Origin': ['*'] } });
  });
}

app.whenReady().then(() => {
  loadSettings();
  allowMediaCors();
  applyProxy().catch(() => {});
  createWindow();

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')).resize({ width: 32, height: 32 }));
  tray.setToolTip('Music Island');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => { win.showInactive(); win.moveTop(); });

  // раз в 15 минут чистим кэш Chromium (обложки, ответы сервисов, код): память не копится часами
  const trim = () => { session.defaultSession.clearCache().catch(() => {}); session.defaultSession.clearCodeCaches({}).catch(() => {}); };
  setInterval(trim, Number(process.env.MI_TRIM_MS) || 15 * 60 * 1000);

  setTimeout(() => updater.check(), 8000);
  setInterval(() => updater.check(), 6 * 3600 * 1000);

  const media = { MediaPlayPause: 'toggle', MediaNextTrack: 'next', MediaPreviousTrack: 'prev' };
  for (const [key, cmd] of Object.entries(media)) {
    globalShortcut.register(key, () => win.webContents.send('cmd', cmd));
  }
});

app.on('will-quit', () => tunnel.stop());
app.on('second-instance', () => { if (win) { win.showInactive(); win.moveTop(); } });
app.on('will-quit', () => { globalShortcut.unregisterAll(); providers.forEach((p) => p.dispose?.()); });
app.on('window-all-closed', (e) => e.preventDefault()); // живём в трее

const {
  app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell,
  globalShortcut, safeStorage, clipboard, session, net, dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');

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
  providers: {}, // приватные данные провайдеров (токены и т.п.)
};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try { Object.assign(S, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch { /* первый запуск */ }
  // миграция со старого формата, где токены лежали в корне
  const p = (S.providers ||= {});
  if (S.token) { (p.ym ||= {}).token = S.token; delete S.token; }
  if (S.spClientId) { (p.sp ||= {}).clientId = S.spClientId; delete S.spClientId; }
  if (S.spRefresh) { (p.sp ||= {}).refresh = S.spRefresh; delete S.spRefresh; }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(S)); } catch { /* ignore */ }
}
const publicSettings = () => ({
  alwaysOnTop: S.alwaysOnTop, hoverExpand: S.hoverExpand, lockPosition: S.lockPosition,
  source: S.source, mode: S.mode, shuffle: S.shuffle,
});

// ───────────────────────── провайдеры ─────────────────────────
const enc = (v) => (!v ? null : safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(v).toString('base64') : v);
const dec = (v) => {
  if (!v) return null;
  try { return v.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')) : v; } catch { return null; }
};
const ctx = {
  data: (id) => (S.providers[id] ||= {}),
  save: saveSettings,
  enc, dec, clipboard, shell, session, BrowserWindow,
  fetch: (u, o) => net.fetch(u, o), // идёт через сессию Electron, поэтому учитывает прокси
};
const providers = require('./providers')(ctx);
const updater = require('./updater')((info) => { win?.webContents.send('update', info); tray?.setContextMenu(buildMenu()); });
// прокси только для SoundCloud (в РФ он закрыт): остальные площадки ходят напрямую
const SC_HOSTS = String.raw`(^|\.)(soundcloud\.com|sndcdn\.com|soundcloud\.cloud)$`;
function proxyRule(v) {
  const m = /^(?:(socks5|socks4|socks|http|https):\/\/)?([^\s/:]+:\d+)\/?$/i.exec(String(v || '').trim());
  if (!m) return null;
  const k = (m[1] || 'http').toLowerCase();
  return `${k.startsWith('socks') ? (k === 'socks4' ? 'SOCKS4' : 'SOCKS5') : k === 'https' ? 'HTTPS' : 'PROXY'} ${m[2]}`;
}
function applyProxy() {
  const rule = proxyRule(S.proxy);
  const cfg = rule
    ? { mode: 'pac_script', pacScript: 'data:application/x-ns-proxy-autoconfig;base64,' + Buffer.from(
      `function FindProxyForURL(u,h){return /${SC_HOSTS}/.test(h)?"${rule}":"DIRECT";}`).toString('base64') }
    : { mode: 'system' };
  return session.defaultSession.setProxy(cfg).then(() => session.defaultSession.closeAllConnections());
}
const activeProvider = () => providers.find((p) => p.id === S.source) || providers[0];

function handle(name, fn) {
  ipcMain.handle(name, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: e.message }; }
  });
}
for (const p of providers) {
  for (const [name, fn] of Object.entries(p.handlers)) handle(`${p.id}:${name}`, fn);
}

handle('settings:get', () => publicSettings());
handle('settings:set', (patch) => {
  for (const k of ['alwaysOnTop', 'hoverExpand', 'lockPosition', 'source', 'mode', 'shuffle']) {
    if (k in patch) S[k] = patch[k];
  }
  applySettings();
  return publicSettings();
});
handle('update:get', () => updater.latest);
handle('update:open', () => { if (updater.latest) shell.openExternal(updater.latest.url); });
handle('open:external', (url) => {
  const u = new URL(url);
  if (u.protocol === 'https:' && providers.some((p) => (p.hosts || []).includes(u.hostname))) shell.openExternal(url);
});

// окно: прозрачные области пропускают клики, остров перетаскивается вручную
let win, tray, drag = null;
ipcMain.on('win:ignore', (_e, ignore) => win?.setIgnoreMouseEvents(ignore, { forward: true }));
ipcMain.on('win:focusable', (_e, on) => {
  if (!win) return;
  win.setFocusable(!!on);
  if (on) { win.focus(); win.webContents.focus(); }
});
ipcMain.on('win:drag-start', () => {
  const c = screen.getCursorScreenPoint();
  const b = win.getBounds();
  drag = { cx: c.x, cy: c.y, x: b.x, y: b.y };
});
ipcMain.on('win:drag-move', () => {
  if (!drag) return;
  const c = screen.getCursorScreenPoint();
  win.setBounds({ x: drag.x + c.x - drag.cx, y: drag.y + c.y - drag.cy, width: WIN_W, height: WIN_H });
});
ipcMain.on('win:drag-end', () => {
  drag = null;
  const b = win.getBounds();
  S.x = b.x; S.y = b.y;
  saveSettings();
});

// ───────────────────────── окно и трей ─────────────────────────
function defaultPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: Math.round(wa.x + (wa.width - WIN_W) / 2), y: wa.y };
}
function savedPosition() {
  if (S.x == null || S.y == null) return defaultPosition();
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return S.x + WIN_W / 2 > a.x && S.x + WIN_W / 2 < a.x + a.width && S.y > a.y - 40 && S.y < a.y + a.height - 40;
  });
  return visible ? { x: S.x, y: S.y } : defaultPosition();
}

function createWindow() {
  const pos = savedPosition();
  win = new BrowserWindow({
    ...pos, width: WIN_W, height: WIN_H,
    frame: false, transparent: true, resizable: false, maximizable: false,
    hasShadow: false, skipTaskbar: true, focusable: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => { win.showInactive(); applySettings(); });
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
    { label: S.proxy ? `Прокси SoundCloud: ${S.proxy}` : 'Прокси SoundCloud: выключен', submenu: [
      { label: 'Взять из буфера обмена (host:port, socks5://host:port)', click: () => {
        const v = clipboard.readText().trim();
        if (!proxyRule(v)) { dialog.showErrorBox('Music Island', 'В буфере обмена нет адреса прокси.\nСкопируйте, например: 127.0.0.1:1080 или socks5://127.0.0.1:1080'); return; }
        S.proxy = v; saveSettings(); applyProxy(); tray?.setContextMenu(buildMenu());
      } },
      { label: 'Выключить', enabled: !!S.proxy, click: () => { S.proxy = ''; saveSettings(); applyProxy(); tray?.setContextMenu(buildMenu()); } },
    ] },
    { label: 'Вернуть в центр экрана', click: () => { const p = defaultPosition(); win.setPosition(p.x, p.y); S.x = p.x; S.y = p.y; saveSettings(); } },
    { type: 'separator' },
    ...providers.map((p) => ({ label: `Выйти из ${p.name}`, click: () => { p.handlers.logout(); send(`logout:${p.id}`); } })),
    { label: 'Закрыть', click: () => app.quit() },
  ]);
}

app.whenReady().then(() => {
  loadSettings();
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

app.on('second-instance', () => { if (win) { win.showInactive(); win.moveTop(); } });
app.on('will-quit', () => { globalShortcut.unregisterAll(); providers.forEach((p) => p.dispose?.()); });
app.on('window-all-closed', (e) => e.preventDefault()); // живём в трее

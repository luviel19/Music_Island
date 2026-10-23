// Системный плеер: читает «Сейчас играет» из медиа-контроля Windows (SMTC) и управляет им.
// Подхватывает Spotify (приложение и веб-плеер), YouTube Music, браузер и любые плееры — без аккаунтов.
const { spawn, execFile } = require('child_process');
const path = require('path');
const { app } = require('electron');

// Имя и значок приложения, которое сейчас играет (по AppUserModelId из SMTC). Нужны, когда плеер не передаёт обложку.
// Имя берём из меню «Пуск», значок — из ярлыка или запущенного процесса. Для приложений из Store значка нет — остаётся заглушка.
const INFO_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$id = $env:MI_AUMID
$name = ''; $target = ''
$a = Get-StartApps | Where-Object { $_.AppID -eq $id } | Select-Object -First 1
if ($a) {
  $name = $a.Name
  if ($a.AppID -match '^[A-Za-z]:\\') { $target = $a.AppID }
  elseif ($a.AppID -notmatch '!') {
    $sh = New-Object -ComObject WScript.Shell
    foreach ($dir in @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")) {
      $l = Get-ChildItem $dir -Recurse -Filter '*.lnk' | Where-Object { $_.BaseName -eq $name } | Select-Object -First 1
      if ($l) { $t = $sh.CreateShortcut($l.FullName).TargetPath; if ($t -and (Test-Path $t)) { $target = $t; break } }
    }
  }
}
if (-not $target -and $id -match '\.exe$') {
  $p = Get-Process -Name ($id -replace '\.exe$', '') | Select-Object -First 1
  if ($p) { $target = $p.Path }
  if (-not $name) { $name = $id -replace '\.exe$', '' }
}
@{ name = $name; target = $target } | ConvertTo-Json -Compress
`;
const infoCache = new Map(); // aumid -> { name, icon } | 'wait'
function appInfo(aumid) {
  if (!aumid) return null;
  const c = infoCache.get(aumid);
  if (c) return c === 'wait' ? null : c;
  infoCache.set(aumid, 'wait');
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(INFO_PS, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 20000, env: { ...process.env, MI_AUMID: aumid } }, async (err, out) => {
      const r = { name: '', icon: '' };
      try {
        const o = JSON.parse(String(out).trim());
        r.name = o.name || '';
        if (o.target) r.icon = (await app.getFileIcon(o.target, { size: 'large' })).resize({ width: 64, height: 64 }).toDataURL();
      } catch { /* нет сведений: останется как есть */ }
      infoCache.set(aumid, r);
    });
  return null;
}

module.exports = function createMedia() {
  let proc = null, buf = '', cover = '';
  let state = { ready: false };

  function start() {
    if (proc) return;
    if (process.platform !== 'win32') throw new Error('Системный плеер доступен только в Windows');
    const me = proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'media.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep), // PowerShell не читает из asar
    ], { windowsHide: true });
    proc.stdout.setEncoding('utf8');
    me.stdout.on('data', (chunk) => {
      if (proc !== me) return;
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const o = JSON.parse(line);
          if ('thumb' in o) { cover = o.thumb || ''; delete o.thumb; }
          if (!o.active) cover = '';
          const info = o.active ? appInfo(o.aumid) : null;
          state = { ready: true, ...o, cover, appName: info?.name || '', appIcon: info?.icon || '' };
        } catch { /* битая строка */ }
      }
    });
    proc.stderr.on('data', (d) => console.error('[media]', String(d).slice(0, 300)));
    // событие exit старого процесса не должно сбрасывать ссылку на новый (иначе новый процесс терялся и не закрывался)
    me.on('exit', () => { if (proc === me) { proc = null; state = { ready: false }; } });
  }

  function stop() {
    proc?.kill();
    proc = null; state = { ready: false }; cover = ''; buf = '';
  }

  return {
    id: 'media',
    name: 'Spotify и другие',
    hosts: [],
    modes: [],
    dispose: stop,
    handlers: {
      start: () => { start(); return true; },
      stop: () => { stop(); return true; },
      state: () => state,
      cmd: ({ type, value, fallback }) => {
        if (!['toggle', 'next', 'prev', 'seek', 'filter', 'hint', 'own'].includes(type)) throw new Error('unknown cmd');
        proc?.stdin.write(JSON.stringify({ type, value, fallback }) + '\n');
        return true;
      },
      logout: () => true,
    },
  };
};

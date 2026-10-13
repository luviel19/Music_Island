// Системный плеер: читает «Сейчас играет» из медиа-контроля Windows (SMTC) и управляет им.
// Подхватывает Spotify (приложение и веб-плеер), YouTube Music, браузер и любые плееры — без аккаунтов.
const { spawn } = require('child_process');
const path = require('path');

module.exports = function createMedia() {
  let proc = null, buf = '', cover = '';
  let state = { ready: false };

  function start() {
    if (proc) return;
    if (process.platform !== 'win32') throw new Error('Системный плеер доступен только в Windows');
    proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'media.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep), // PowerShell не читает из asar
    ], { windowsHide: true });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
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
          state = { ready: true, ...o, cover };
        } catch { /* битая строка */ }
      }
    });
    proc.stderr.on('data', (d) => console.error('[media]', String(d).slice(0, 300)));
    proc.on('exit', () => { proc = null; state = { ready: false }; });
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
      cmd: ({ type, value }) => {
        if (!['toggle', 'next', 'prev', 'seek'].includes(type)) throw new Error('unknown cmd');
        proc?.stdin.write(JSON.stringify({ type, value }) + '\n');
        return true;
      },
      logout: () => true,
    },
  };
};

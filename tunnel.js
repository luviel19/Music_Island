// Встроенный клиент Hysteria2: поднимает локальный HTTP-прокси, через который идёт SoundCloud.
// Ссылка вида hysteria2://пароль@host:port/?sni=...&insecure=1 (внутри — только запуск процесса, ключей здесь нет).
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isHy = (v) => /^(hysteria2|hy2):\/\//i.test(String(v || '').trim());

function binary(app) {
  const p = app.isPackaged ? path.join(process.resourcesPath, 'bin', 'hysteria.exe') : path.join(__dirname, 'bin', 'hysteria.exe');
  return fs.existsSync(p) ? p : null;
}

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
    s.on('error', rej);
  });
}

function configFor(link, port) {
  const u = new URL(String(link).trim().replace(/^hy2:/i, 'hysteria2:'));
  if (!u.hostname || !(u.username || u.password)) throw new Error('В ссылке hysteria2 нет сервера или пароля');
  const auth = decodeURIComponent(u.password ? `${u.username}:${u.password}` : u.username);
  const q = u.searchParams;
  const lines = [
    `server: ${u.hostname.includes(':') ? `[${u.hostname}]` : u.hostname}:${u.port || 443}`,
    `auth: ${JSON.stringify(auth)}`,
    'tls:',
    ...(q.get('sni') ? [`  sni: ${JSON.stringify(q.get('sni'))}`] : []),
    ...(/^(1|true)$/i.test(q.get('insecure') || '') ? ['  insecure: true'] : []),
    'http:',
    `  listen: 127.0.0.1:${port}`,
  ];
  return lines.join('\n');
}

module.exports = function createTunnel(app) {
  let child = null, cfgFile = null;

  function stop() {
    if (child) { try { child.kill(); } catch { /* уже завершён */ } child = null; }
    if (cfgFile) { try { fs.unlinkSync(cfgFile); } catch { /* ignore */ } cfgFile = null; }
  }

  // запускает клиент и возвращает адрес локального SOCKS5 'host:port'
  async function start(link, wait = 10000) {
    stop();
    const exe = binary(app);
    if (!exe) throw new Error('В этой сборке нет клиента Hysteria (bin/hysteria.exe)');
    const port = await freePort();
    cfgFile = path.join(os.tmpdir(), `mi-hy-${process.pid}.yaml`);
    fs.writeFileSync(cfgFile, configFor(link, port), { mode: 0o600 });
    const p = spawn(exe, ['client', '-c', cfgFile], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child = p;
    await new Promise((resolve, reject) => {
      let log = '', done = false;
      const fin = (err) => { if (done) return; done = true; clearTimeout(t); try { fs.unlinkSync(cfgFile); cfgFile = null; } catch { /* ignore */ } err ? reject(err) : resolve(); };
      const t = setTimeout(() => { stop(); fin(new Error(`Сервер не ответил за ${wait / 1000} секунд`)); }, wait);
      const on = (d) => {
        log += d;
        if (/HTTP proxy server listening/.test(log)) fin();
        else if (/failed to|FATAL|error/i.test(log) && /FATAL|failed to initialize/i.test(log)) { stop(); fin(new Error(`Не удалось подключиться: ${log.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').pop().slice(0, 160)}`)); }
      };
      p.stdout.on('data', on); p.stderr.on('data', on);
      p.on('exit', () => { if (child === p) child = null; fin(new Error('Клиент Hysteria завершился')); });
    });
    return `127.0.0.1:${port}`;
  }

  return { start, stop, isHy, available: () => !!binary(app) };
};

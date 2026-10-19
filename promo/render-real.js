// Съёмка настоящего интерфейса острова: npx electron promo/render-real.js <папка кадров>
// Остров показывается с выдуманными данными (promo/fake-sp.js), мышь двигается и нажимает как у человека.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[2] || path.join(__dirname, 'frames-real'));
const W = 720, H = 400, FPS = 30, DUR = +process.argv[3] || 16;
const src = path.join(__dirname, '..', 'src');
const tmp = path.join(src, '__promo.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
    html = html.replace(/<script src="providers\/(ym|sc|yt|sp|media)\.js"><\/script>\n?/g, '')
      .replace('<script src="app.js">', '<script src="../promo/fake-sp.js"></script>\n<script src="app.js">')
      .replace('</head>', `<style>html{background:radial-gradient(70% 90% at 12% 0%,rgba(255,77,148,.42),transparent 60%),radial-gradient(60% 80% at 95% 100%,rgba(123,97,255,.5),transparent 60%),linear-gradient(135deg,#0b0b14,#14102a 55%,#240e36)!important}</style></head>`);
    fs.writeFileSync(tmp, html);
    fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

    const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true,
      webPreferences: { offscreen: true, preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true } });
    win.webContents.setFrameRate(FPS);
    await win.loadFile(tmp);
    await sleep(1500);

    const rect = (sel) => win.webContents.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),l:r.left,w:r.width}})()`);
    const cur = { x: W - 40, y: H - 40 };
    const mouse = (x, y) => { cur.x = x; cur.y = y; win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) }); };
    const glide = async (x, y, ms) => { const a = { ...cur }, n = Math.max(1, Math.round(ms / 16)); for (let i = 1; i <= n; i++) { const k = 1 - Math.pow(1 - i / n, 3); mouse(a.x + (x - a.x) * k, a.y + (y - a.y) * k); await sleep(16); } };
    const click = async () => { const { x, y } = cur; win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await sleep(60); win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); };

    // запись кадров в памяти с отметками времени, потом ровная раскладка по 25 кадров в секунду
    const shots = [];
    let t0 = 0;
    win.webContents.on('paint', (_e, _d, img) => { if (t0) shots.push({ t: Date.now() - t0, img: img.crop({ x: 90, y: 0, width: 540, height: 360 }) }); });
    mouse(cur.x, cur.y);
    t0 = Date.now();
    const rec = sleep(DUR * 1000);

    const at = async (sec) => { const d = sec * 1000 - (Date.now() - t0); if (d > 0) await sleep(d); };
    await at(1.2);  await glide(W / 2, 30, 700);               // наводим — остров раскрывается
    await at(3.6);  const bar = await rect('#bar'); await glide(bar.l + bar.w * 0.35, bar.y, 600); await at(4.6); await glide(bar.l + bar.w * 0.7, bar.y, 700);
    await at(6.0);  const nx = await rect('#next'); await glide(nx.x, nx.y, 600); await at(6.7); await click(); // следующий трек
    await at(8.2);  const tq = await rect('#toQueue'); await glide(tq.x, tq.y, 600); await at(8.9); await click(); // очередь
    await at(11.0); const q = await rect('.qitem:nth-child(3)').catch(() => null); if (q) { await glide(q.x, q.y, 500); await at(11.8); await click(); }
    await at(13.4); await glide(W - 60, H - 50, 600);          // уводим мышь — остров сворачивается
    await rec;
    const OUT_FPS = 25; let n = 0, j = 0;
    for (let k = 0; k < DUR * OUT_FPS; k++) {
      const tk = (k / OUT_FPS) * 1000;
      while (j + 1 < shots.length && shots[j + 1].t <= tk) j++;
      fs.writeFileSync(path.join(out, `f${String(n++).padStart(4, '0')}.png`), shots[j].img.toPNG());
    }
    console.log('paints', shots.length, 'frames', n);
  } catch (e) { console.log('ERR', e.stack); }
  try { fs.unlinkSync(tmp); } catch {}
  app.quit();
});

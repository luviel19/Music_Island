// Рендер промо-ролика: npx electron promo/render.js [папка кадров] [fps] [секунды]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[2] || path.join(__dirname, 'frames'));
const fps = +process.argv[3] || 30, secs = +process.argv[4] || 20;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: 1280, height: 720, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, 'index.html'));
  const total = fps * secs;
  for (let i = 0; i < total; i++) {
    await win.webContents.executeJavaScript(`setT(${(i / fps).toFixed(4)})`);
    await new Promise((r) => setTimeout(r, 30));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `f${String(i).padStart(4, '0')}.png`), img.toPNG());
  }
  app.quit();
});

// Проверка новой версии на GitHub: сравниваем тег последнего релиза с версией приложения.
const { app } = require('electron');

const REPO = 'luviel19/Music_Island';
const PAGE = `https://github.com/${REPO}/`;

const parse = (v) => String(v).replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
function newer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

module.exports = function createUpdater(onFound) {
  let latest = null;

  async function check() {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Music-Island' },
      });
      if (!r.ok) return null;
      const j = await r.json();
      const version = String(j.tag_name || '').replace(/^v/i, '');
      const current = process.env.MI_FAKE_VERSION || app.getVersion(); // переменная — для проверки уведомления
      if (!/^\d+(\.\d+)*$/.test(version) || !newer(version, current)) return null;
      const isNew = !latest || latest.version !== version;
      latest = { version, current, url: String(j.html_url || '').startsWith(PAGE) ? j.html_url : `${PAGE}releases/latest` };
      if (isNew) onFound(latest);
      return latest;
    } catch { return null; }
  };

  return { check, get latest() { return latest; } };
};

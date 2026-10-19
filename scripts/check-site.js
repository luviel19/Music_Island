// Проверка сайта (docs/): локальные ссылки и картинки существуют, есть обязательные мета-теги, JSON-LD корректен.
// Запуск: node scripts/check-site.js (код выхода 1 при ошибках)
const fs = require('fs');
const path = require('path');

const docs = path.join(__dirname, '..', 'docs');
const SITE = 'https://luviel19.github.io/Music_Island/';
const pages = ['index.html', 'ru/index.html'];
const errors = [];
const err = (m) => errors.push(m);

for (const p of pages) {
  const file = path.join(docs, p);
  if (!fs.existsSync(file)) { err(`${p}: нет файла`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  const need = ['<title>', 'name="description"', 'rel="canonical"', 'property="og:title"', 'property="og:image"', 'name="twitter:card"', 'hreflang="en"', 'hreflang="ru"', 'rel="icon"', 'application/ld+json', '<h1'];
  for (const n of need) if (!html.includes(n)) err(`${p}: нет ${n}`);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  if (title.length > 80) err(`${p}: title длиннее 80 символов (${title.length})`);
  const desc = (html.match(/name="description" content="([^"]*)"/) || [])[1] || '';
  if (desc.length < 70 || desc.length > 200) err(`${p}: description ${desc.length} символов`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) err(`${p}: должен быть ровно один h1`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) err(`${p}: img без alt: ${m[0].slice(0, 60)}`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { err(`${p}: JSON-LD не разбирается: ${e.message}`); }
  }
  for (const m of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|data:)/.test(u)) {
      if (u.startsWith(SITE)) { const rel = u.slice(SITE.length) || 'index.html'; if (!fs.existsSync(path.join(docs, rel.endsWith('/') ? rel + 'index.html' : rel))) err(`${p}: нет файла для ${u}`); }
      continue;
    }
    const target = path.join(dir, u.endsWith('/') ? u + 'index.html' : u);
    if (!fs.existsSync(target)) err(`${p}: битая ссылка ${u}`);
  }
  for (const m of html.matchAll(/href="#([^"]+)"/g)) if (m[1] && !html.includes(`id="${m[1]}"`)) err(`${p}: нет якоря #${m[1]}`);
}
for (const f of ['sitemap.xml', 'robots.txt', '.nojekyll', 'style.css', 'og-image.png', 'favicon.ico']) if (!fs.existsSync(path.join(docs, f))) err(`docs/${f}: нет файла`);
const sm = fs.existsSync(path.join(docs, 'sitemap.xml')) ? fs.readFileSync(path.join(docs, 'sitemap.xml'), 'utf8') : '';
for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const rel = m[1].slice(SITE.length) || 'index.html';
  if (!m[1].startsWith(SITE) || !fs.existsSync(path.join(docs, rel.endsWith('/') ? rel + 'index.html' : rel))) err(`sitemap: ${m[1]} не соответствует файлу`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('site ok');

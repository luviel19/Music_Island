# Регистрация сайта в поисковиках (Search Console, Bing, Яндекс)

Адрес сайта: `https://luviel19.github.io/Music_Island/` (русская версия: `/ru/`). Карта сайта: `https://luviel19.github.io/Music_Island/sitemap.xml`.

**Статус:** индексация не проверялась и не гарантируется. Ниже шаги, которые нужно выполнить вручную в вашем аккаунте.

Важно про `robots.txt`: поисковики читают его только в корне домена, то есть `https://luviel19.github.io/robots.txt`. Файл `docs/robots.txt` для проектного сайта по адресу `/Music_Island/` ими не учитывается, он нужен лишь как справка. Закрывать сайт от индексации не требуется, по умолчанию он открыт. Карту сайта надо отправлять вручную в каждом сервисе.

## Google Search Console
1. Откройте https://search.google.com/search-console и нажмите «Добавить ресурс».
2. Выберите **«Префикс URL»** и введите `https://luviel19.github.io/Music_Island/`.
3. Подтверждение: самый простой способ — **HTML-тег**. Скопируйте метатег `<meta name="google-site-verification" content="...">` и добавьте его в `<head>` обеих страниц (внесите в `scripts/build-site.js`, затем `node scripts/build-site.js`, закоммитьте и дождитесь публикации Pages). Нажмите «Подтвердить».
4. Раздел «Файлы Sitemap»: добавьте `sitemap.xml`.
5. Раздел «Проверка URL»: вставьте адрес главной и нажмите «Запросить индексирование».

## Bing Webmaster Tools
1. https://www.bing.com/webmasters, войдите аккаунтом Microsoft.
2. Добавьте сайт `https://luviel19.github.io/Music_Island/` (можно импортировать из Google Search Console, если он уже подтверждён).
3. При ручном подтверждении используйте метатег `msvalidate.01` так же, как в Google.
4. «Карты сайта»: отправьте `https://luviel19.github.io/Music_Island/sitemap.xml`.

## Яндекс Вебмастер
1. https://webmaster.yandex.ru, войдите аккаунтом Яндекса.
2. «Добавить сайт» и введите `https://luviel19.github.io/Music_Island/`.
3. Подтверждение: метатег `<meta name="yandex-verification" content="..." />` в `<head>` (так же, как выше).
4. «Индексирование» → «Файлы Sitemap»: добавьте `sitemap.xml`.
5. «Индексирование» → «Переобход страниц»: отправьте главную и `/ru/`.

## После подтверждения
- Через несколько дней-недель проверьте отчёты об индексации и ошибки. Результат зависит от поисковиков, ускорить его нельзя.
- Добавьте ссылки на сайт из README, профиля GitHub и публикаций (не накручивайте ссылки искусственно).
- В About репозитория укажите Website: `https://luviel19.github.io/Music_Island/`.

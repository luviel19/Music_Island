## Music Island 0.2.12 — исправление лайков SoundCloud / SoundCloud likes fix

### Что нового

- **SoundCloud: лайк больше не выкидывает из аккаунта.** SoundCloud защищает лайки проверкой на робота. Раньше остров принимал её за потерю входа и показывал экран входа. Теперь лайк и его снятие идут через страницу soundcloud.com с вашей сессией. Если SoundCloud всё же попросит капчу, откроется окно с проверкой, а после её решения лайк повторится сам.
- Ошибки лайка теперь показываются подсказкой, а сердечко возвращается обратно. Экран входа появляется только при настоящем окончании сессии.

### What's new

- **SoundCloud: liking a track no longer signs you out.** SoundCloud guards likes with a bot check, which the app used to mistake for a lost sign-in. Likes and unlikes now go through the soundcloud.com page using your sign-in session. If SoundCloud still asks for a captcha, a window with the check opens and the like is retried after you solve it.
- Like errors are now shown as a hint and the heart reverts. The sign-in screen appears only when the session has really expired.

### Установка / Install

Установщик не подписан цифровой подписью, SmartScreen может предупредить. / The installer is not code-signed, SmartScreen may warn.

SHA-256 (Music-Island-Setup-0.2.12.exe, 119 467 198 bytes):

```
08ae16ed05f5642c21535de8d221949513668cbca758f84c9cd807cd379c2925
```

```powershell
Get-FileHash .\Music-Island-Setup-0.2.12.exe -Algorithm SHA256
```

Сайт / Website: https://luviel19.github.io/Music_Island/

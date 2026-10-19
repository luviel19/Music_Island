# Release notes: v0.2.11 (RU / EN)

Copy into the GitHub release description and attach `Music-Island-Setup-0.2.11.exe`.

---

## Music Island 0.2.11 — безопасность / security

### Что нового
- Окно острова может обращаться только к разрешённому списку внутренних каналов, а главный процесс принимает сообщения лишь от собственной страницы острова.
- Настройки проверяются при сохранении и при загрузке: лишние поля и неверные значения отбрасываются.
- Токены и ссылка VPN хранятся только в зашифрованном виде. Если защищённое хранилище Windows недоступно, они не сохраняются; открытые токены старых версий шифруются при первом запуске.
- VPN: проверка сертификата сервера включена по умолчанию. Параметр `insecure=1` в ссылке применяется только после вашего подтверждения для конкретного сервера.
- Заголовок CORS для эквалайзера добавляется только к аудио Яндекс Музыки и SoundCloud и только в окне острова.
- Включена песочница окна (`sandbox`), переходы на чужие страницы из окна запрещены.

### What's new
- The island window can call only an allow-list of internal channels; the main process accepts messages only from the island's own page.
- Settings are validated on save and on load: unknown fields and invalid values are dropped.
- Tokens and the VPN link are stored only encrypted. If Windows secure storage is unavailable they are not saved; plain-text tokens from older versions are encrypted on first start.
- VPN: server certificate verification is on by default. `insecure=1` in a link is honoured only after you confirm it for that server.
- The CORS header needed by the equalizer is added only to Yandex Music and SoundCloud audio, and only in the island window.
- The window sandbox is enabled and navigation to foreign pages is blocked.

### Установка / Install
Установщик **не подписан цифровой подписью**, SmartScreen может предупредить. / The installer is **not code-signed**, SmartScreen may warn.

SHA-256 (`Music-Island-Setup-0.2.11.exe`, 119 466 034 bytes):
```
663431a0a59db2d5f31c9f6024b03c68ce50384a54b151463de03c618369161b
```
```powershell
Get-FileHash .\Music-Island-Setup-0.2.11.exe -Algorithm SHA256
```

Сайт / Website: https://luviel19.github.io/Music_Island/

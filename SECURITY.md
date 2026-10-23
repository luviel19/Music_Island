# Security / Безопасность

## Reporting a vulnerability / Сообщить об уязвимости

Please do **not** open a public issue for a vulnerability. Use GitHub's private reporting
(**Security → Report a vulnerability** in this repository) or contact [@luviel19](https://github.com/luviel19) through GitHub.
Не создавайте публичный Issue для уязвимости: используйте приватное сообщение через вкладку Security репозитория.

## Verifying the download / Проверка загрузки

The installer is **not code-signed**, so Windows SmartScreen may warn about an unknown publisher. This is expected for the current releases; it is not hidden.
Установщик **не подписан цифровой подписью**, поэтому SmartScreen может предупредить о неизвестном издателе. Это не скрывается.

1. Download only from the [official releases](https://github.com/luviel19/Music_Island/releases).
2. Compare the SHA-256 of the file with the value in the release notes:

   ```powershell
   Get-FileHash .\Music-Island-Setup-0.2.14.exe -Algorithm SHA256
   ```

   SHA-256 of `Music-Island-Setup-0.2.14.exe`:
   `638cac6aabdb9f4d53d3ba9f8a01025e73ad1366bc967b2d39a788caf0f1ef86`
3. Then choose **More info → Run anyway**. Do not disable Windows Defender or SmartScreen.
4. You can also build the app yourself from the source (see README).

## What the app stores and sends / Что хранится и куда уходит

| Data | Where | Notes |
|---|---|---|
| Yandex Music token, SoundCloud token, VPN link | `%APPDATA%\Music Island\settings.json` | Always encrypted with Windows (Electron `safeStorage`). If Windows secure storage is unavailable, secrets are not saved at all (never as plain text). Plain-text values written by older versions are encrypted on first start |
| Spotify session | `%APPDATA%\Music Island\spotify-profile` (WebView2 profile) | Sign-in happens on the real Spotify page; the app only checks that the sign-in cookie exists and never reads or transmits its value |
| Network | Directly to the services you use (Spotify, Yandex Music, YouTube, SoundCloud) to `api.github.com` for the update check and to `lrclib.net` for the Karaoke lyrics (only title, artist, album and duration of the current track are sent, and only when you open Karaoke) | No telemetry, no servers of our own. Only SoundCloud and YouTube go through VPN/proxy if you enable it |

## Design notes / Устройство

- The island window uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, denies new windows and in-window navigation.
- The window can call only an explicit allow-list of IPC channels (`preload.js`, mirrored in `security.js` and covered by tests). The main process also accepts messages only from the island's own page (`src/index.html` in the main frame of its own window).
- `settings:set` and `settings.json` are validated: unknown keys are dropped, types, ranges and lengths are checked.
- `open:external` opens only `https` links to hosts that providers declare.
- VPN (hysteria2): certificate verification is on by default. A link with `insecure=1` is honoured only after you explicitly allow it for that server in a warning dialog.
- The CORS header that the equalizer needs is added only to audio responses from Yandex Music and SoundCloud hosts, and only for the island window.
- The updater reads the latest release tag from the GitHub API and opens the release page in the browser. It does not download or run code.
- The Spotify helper (`SpotifyHost.exe`) is a separate process with an allow-list of navigation hosts; it does not log cookies or tokens, does not block ads and does not bypass DRM.
- Dependencies: `npm audit --omit=dev` reports no known vulnerabilities at the time of writing; dev tools (Electron, electron-builder) are not shipped except Electron itself, which is updated regularly.
- Third-party binaries are not bundled in the repository (`hysteria.exe` is user-provided for the VPN mode).

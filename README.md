<div align="center">

<img src="assets/icon.png" width="112" alt="Music Island logo" />

# Music Island

**A free, open-source Dynamic Island music player for Windows 10/11.**
Control Spotify, Yandex Music, YouTube and SoundCloud from one floating desktop widget.

**English** · [Русский](README.ru.md)

[![Download](https://img.shields.io/badge/%E2%AC%87%20Download-latest%20release-ff4d94?style=for-the-badge)](https://github.com/luviel19/Music_Island/releases/latest)
[![Website](https://img.shields.io/badge/Website-luviel19.github.io-7B61FF?style=for-the-badge)](https://luviel19.github.io/Music_Island/)
[![Releases](https://img.shields.io/badge/Releases-all%20versions-ffb347?style=for-the-badge)](https://github.com/luviel19/Music_Island/releases)

![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows11&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
[![Release](https://img.shields.io/github/v/release/luviel19/Music_Island?color=ffb347)](https://github.com/luviel19/Music_Island/releases/latest)
[![License](https://img.shields.io/github/license/luviel19/Music_Island?color=ff4d94)](LICENSE)
[![CI](https://github.com/luviel19/Music_Island/actions/workflows/ci.yml/badge.svg)](https://github.com/luviel19/Music_Island/actions/workflows/ci.yml)

<br>

<img src="assets/promo.gif" width="540" alt="Music Island demo: collapsed island, hover to expand, waveform, next track and queue with Spotify" />

<sub>Demo with made-up tracks, recorded from the real app interface.</sub>

</div>

<br>

## Why Music Island

Music Island is a small always-on-top «island» in the spirit of Apple's Dynamic Island, made for the Windows desktop. Collapsed, it is a thin pill with a live indicator. Hover over it and it expands into the cover, title, a waveform progress bar and playback controls. Colours adapt to the cover art.

- **One island for several services:** Spotify, Yandex Music, SoundCloud, YouTube and any system media player.
- **Spotify without developer keys:** the official web player runs inside the island, so Free and Premium both work.
- **Free and open source** under the MIT license. No ads in the app, no accounts with us, no telemetry.
- **Stays out of the way:** click-through where transparent, never leaves the screen, snaps into the very corner.

**[⬇ Download the latest release](https://github.com/luviel19/Music_Island/releases/latest)** · Windows 10/11 x64 · the installer is not code-signed (see [Security](#-security-and-verifying-the-download)).

<br>

## ✨ Features

| | |
|---|---|
| 🏝 **Floating island** | Always on top, expands on hover, draggable, can be pinned, survives Win+D and monitor changes |
| 🔎 **Search across services** | One query searches Yandex Music, SoundCloud and YouTube; the same song is merged into one row with service icons |
| 🌊 **Waveform progress** | Bars follow the shape of the song, click to seek |
| 🎚 **10-band equalizer** | Yandex Music and SoundCloud: manual bands, presets, colour grid in the island background |
| 🧭 **My Wave tuning** | Yandex Music: pick by mood, activity and character of the songs |
| 📜 **Queue and track card** | Browse upcoming tracks, open details, like songs (where the service supports it) |
| ⌨️ **Media keys and tray** | Global media keys, tray menu, autostart with Windows |
| 🔔 **Update notice** | Checks GitHub Releases and shows a notice with a download button (it does not install anything by itself) |

<br>

## 🎵 Supported services

| Feature | Spotify | Yandex Music | YouTube | SoundCloud | System player |
|---|:-:|:-:|:-:|:-:|:-:|
| Play / pause / next / previous / seek | ✅ | ✅ | ✅ | ✅ | ✅ |
| Track, cover and progress in the island | ✅ | ✅ | ✅ | ✅ | ✅ |
| Queue inside the island | ✅ | ✅ | ✅ | ✅ | — |
| Volume control | ✅ | ✅ | ✅ | ✅ | — |
| Like | — | ✅ | — | ◐ needs sign-in | — |
| Shuffle | — | ◐ Favorites only | — | — | — |
| 10-band equalizer | — | ✅ | — | ✅ | — |
| Search from the island | ◐ opens the official page in a panel | ✅ | ✅ | ✅ | — |
| Sign-in | Your Spotify account | OAuth token | Not needed | Optional (likes) | Not needed |

The table lists only what works in the current release. A missing function is hidden in the interface instead of being faked.

### 🟢 Spotify in detail

Spotify is connected **through the official web player** `open.spotify.com` embedded in Microsoft Edge WebView2 (a helper process `SpotifyHost.exe`, source in [`native/spotify-host`](https://github.com/luviel19/Music_Island/tree/main/native/spotify-host)).

- You sign in on the real Spotify page. The password stays with Spotify, the session is stored on your PC.
- The island shows title, cover and progress and controls playback through Windows media controls. Volume is the Windows audio session of the player.
- **My music** starts your Liked Songs without showing the window. The queue is read from the page and shown inside the island.
- Library, playlists and search open the official page in a panel under the island.
- Not used: Spotify Web API, Client ID, developer keys, Premium requirement, private APIs, cookie extraction, ad blocking, DRM or TLS bypass. Ads in the Free plan play as in a normal browser.
- Spotify Desktop and a separate Edge window are not needed. The WebView2 Runtime ships with current Windows 10/11.

> [!NOTE]
> The embedded web player does not expose like or shuffle state, so Spotify has no like, shuffle or equalizer in the island. These are limits of the method, not bugs.

<br>

## 🖼 Screenshots

<p align="center">
  <img src="assets/screenshot.png" width="420" alt="Music Island expanded: cover, waveform and controls" />
  <img src="docs/shot-queue.png" width="420" alt="Music Island queue with Spotify logos (demo tracks)" />
</p>
<p align="center">
  <img src="assets/screenshot-compact.png" width="320" alt="Music Island in compact mode" />
  <img src="docs/shot-expanded.png" width="420" alt="Music Island with Spotify, expanded (demo tracks)" />
</p>

<br>

## 📥 Installation

1. Download `Music-Island-Setup-*.exe` from the **[latest release](https://github.com/luviel19/Music_Island/releases/latest)**.
2. Run the installer, choose a folder and wait for it to finish.
3. The island appears on the screen. The tray icon opens the settings.

> [!NOTE]
> The installer is **not digitally signed**, so Windows SmartScreen may show “Windows protected your PC”. Verify the download first (see below), then choose **More info → Run anyway**. Do not turn off Windows Defender.

### Sign-in

| Service | How to connect |
|---|---|
| **Yandex Music** | The island explains how to get a token and shows a paste button. The token is stored only on your PC, encrypted |
| **SoundCloud** | Listening works without sign-in. For likes, paste the `oauth_token` cookie value |
| **Spotify** | Choose “Spotify”, press “Connect account” and sign in on the Spotify page |
| **YouTube, system player** | No sign-in |

### VPN or proxy for SoundCloud and YouTube

If a service is blocked in your country, open **VPN/proxy** in the tray menu and paste a link from the clipboard: a VPN subscription link (hysteria2 servers are tried in turn), a `hysteria2://…` link, or `socks5://host:port` / `http://host:port`. Only **SoundCloud and YouTube** (with their sign-in and captchas) go through it; other services connect directly. The link is stored encrypted and VPN is toggled with one checkbox in the tray.

<br>

## ❓ FAQ

<details>
<summary><b>Is Music Island free?</b></summary>

Yes. It is free and open source under the MIT license. The app has no ads and no paid features.
</details>

<details>
<summary><b>Do I need Spotify Premium?</b></summary>

No. The island opens the regular Spotify web player, so Free (with ads, as in a browser) and Premium both work.
</details>

<details>
<summary><b>Why does Spotify have no like or equalizer?</b></summary>

Audio plays inside the embedded Spotify page, which does not expose like or shuffle state. The island only shows functions it can perform honestly.
</details>

<details>
<summary><b>SoundCloud or YouTube do not open</b></summary>

Enable VPN or proxy in the tray menu. It does not affect other services.
</details>

<details>
<summary><b>The island blocks clicks on windows under it</b></summary>

It should not: transparent areas are click-through. When collapsed it occupies only its small pill.
</details>

<details>
<summary><b>Is it affiliated with Spotify, Yandex, YouTube or SoundCloud?</b></summary>

No. It is an independent project and all trademarks belong to their owners.
</details>

<br>

## 🔒 Security and verifying the download

- The installer is **not code-signed**. SmartScreen may warn about unknown publishers. Download only from the [official releases](https://github.com/luviel19/Music_Island/releases) and compare the SHA-256 hash printed in the release notes:

  ```powershell
  Get-FileHash .\Music-Island-Setup-0.2.12.exe -Algorithm SHA256
  ```

- Sign-in tokens (Yandex Music, SoundCloud, VPN link) are stored encrypted with Windows (Electron `safeStorage`). The Spotify session lives in the WebView2 profile in `%APPDATA%\Music Island\spotify-profile`.
- The island window runs with `contextIsolation`, no Node integration and a sandbox, and refuses navigation to other pages. The update check only reads the latest release tag from GitHub and opens the release page in your browser.
- Full details and how to report a vulnerability: [SECURITY.md](SECURITY.md).

## ⚠️ Limitations

- Windows 10 and 11 only.
- Yandex Music and SoundCloud use unofficial APIs, which may change without notice.
- Spotify works through the embedded web player. The queue and “My music” are read from the Spotify page and may break if Spotify changes its layout. Ads in the Free plan play as in a normal web player; the island does not block them.
- Zvuk and VK are not supported: the first has bot protection, the second has a closed API.

<br>

## 🛠 Build from source

Requires Windows 10/11 and [Node.js](https://nodejs.org) 20+.

```bash
git clone https://github.com/luviel19/Music_Island.git
cd Music_Island
npm install
npm run build:spotify   # builds the Spotify web player helper (needs only .NET Framework 4.8 from Windows)
npm start
```

Installer: `npm run dist` produces `dist/Music-Island-Setup-*.exe`. For the VPN mode put `hysteria.exe` into `bin/` (it is not part of the repository). Tests: `npm test`. Website checks: `node scripts/check-site.js`.

### Architecture

Each service is a **provider** made of two parts:

```
providers/<id>.js        main process: network, tokens, system access
src/providers/<id>.js    interface: playback, queue, controls
```

The contract is described in `src/providers/registry.js`. A provider lists its abilities in `caps`; a disabled function simply isn't shown and nothing is imitated. To join the cross-service search add `search(host, query)`, and `open(host, track, list)` to play a result.

```
.
├── main.js                  window, tray, settings, VPN, dragging, screen limits
├── tunnel.js                hysteria2 launcher for VPN mode
├── updater.js               new-release check on GitHub
├── preload.js               bridge between window and main process
├── providers/               main-process providers (+ SMTC bridge in PowerShell)
├── native/spotify-host/     Spotify web player on WebView2 (C#, .NET Framework 4.8)
├── src/                     island interface (app.js, search.js, audio-fx.js, providers/)
├── docs/                    GitHub Pages site (built by scripts/build-site.js)
├── promo/                   demo recording tools and publication drafts
├── scripts/                 site build and checks
└── tests/                   logic tests (npm test)
```

<br>

## 🤝 Contributing

Bug reports and ideas are welcome in **[Issues](https://github.com/luviel19/Music_Island/issues)**. Pull requests are welcome too: read [CONTRIBUTING.md](CONTRIBUTING.md) first (run `npm test`, keep changes focused, don't add features that can't be verified).

## 👤 Author

Made by **[luviel19](https://github.com/luviel19)** · [MIT License](LICENSE)

## 📜 Disclaimer

Independent project, not affiliated with or endorsed by Spotify, Yandex, YouTube, SoundCloud or other mentioned services. All trademarks belong to their owners. Use the app with your own accounts and for personal purposes.

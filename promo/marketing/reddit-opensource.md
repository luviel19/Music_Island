# r/opensource post

**Before posting:** check the sub's rules for project announcements and use the correct flair.

**Title:** Music Island: an MIT-licensed Dynamic Island music player for Windows (Electron + a small WebView2 helper)

Music Island is an open-source desktop widget for Windows 10/11 that controls several music services from one floating "island".

Some technical parts that may interest you:
- Electron 44 app with a provider architecture: each service is a `providers/<id>.js` (main process) plus `src/providers/<id>.js` (UI), with honest `caps` so unsupported functions are hidden, not faked.
- Spotify without Web API or keys: the official web player is hosted in a separate C# WebView2 process (`native/spotify-host`); playback goes through Windows media controls (SMTC), volume through the Windows audio session, and the queue is read from the page's accessibility tree.
- The window is kept inside the screen with a virtual position plus a CSS offset, so expansion near a corner is smooth.
- CI on GitHub Actions (tests, site checks, helper build).

Repo: https://github.com/luviel19/Music_Island. Issues and PRs are welcome (see CONTRIBUTING.md). The installer is not code-signed yet; the SHA-256 is in each release.

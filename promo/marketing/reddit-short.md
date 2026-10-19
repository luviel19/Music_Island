# Short Reddit description (generic)

**Title:** Music Island: a free, open-source Dynamic Island music player for Windows (Spotify, Yandex Music, YouTube, SoundCloud)

I made a small floating "island" for the Windows desktop. Collapsed it is a thin pill with a live indicator; on hover it expands into cover, title, a waveform progress bar and playback controls, and it takes its colours from the cover art.

It controls Spotify, Yandex Music, YouTube, SoundCloud and any system media player. Spotify runs through the official web player embedded in WebView2, so it works with Free and Premium and needs no developer keys. Search covers several services at once.

Free, MIT, no ads or telemetry. Windows 10/11 only. The installer is not code-signed yet, so SmartScreen may warn; the SHA-256 is in the release notes and you can build it from source.

Code and download: https://github.com/luviel19/Music_Island
Site: https://luviel19.github.io/Music_Island/

Honest limits: Spotify has no like/shuffle/equalizer in the island (the web player doesn't expose them), and Yandex Music/SoundCloud use unofficial APIs. Feedback and bug reports are welcome.

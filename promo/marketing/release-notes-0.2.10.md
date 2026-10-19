# Release notes: v0.2.10 (RU / EN)

Copy into the GitHub release description. The SHA-256 below is for the installer built locally and attached to the release; re-check it against the uploaded file.

---

## Music Island 0.2.10

### Что нового
- Остров нельзя вынести за границы экрана: при перетаскивании он упирается в край монитора.
- Свёрнутый остров встаёт вплотную к любому углу экрана.
- Раскрытый остров у края плавно сдвигается внутрь экрана, а при сворачивании возвращается в угол.
- Остров не пропадает при сворачивании окон (Win+D) и восстанавливается при смене мониторов или разрешения.

### What's new
- The island can no longer be dragged off screen.
- When collapsed it snaps into the very corner of the screen.
- When expanded near an edge it slides smoothly into view and returns to the corner on collapse.
- It no longer disappears on Win+D («show desktop») and recovers after monitor or resolution changes.

### Установка / Install
Скачайте `Music-Island-Setup-0.2.10.exe` / Download `Music-Island-Setup-0.2.10.exe`.
Установщик **не подписан цифровой подписью**, SmartScreen может предупредить. / The installer is **not code-signed**, SmartScreen may warn.

SHA-256:
```
65d90449f7a398fb51887ffb0ecb972f20c15e27abf4c92423708d25841ca82e
```
```powershell
Get-FileHash .\Music-Island-Setup-0.2.10.exe -Algorithm SHA256
```

Сайт / Website: https://luviel19.github.io/Music_Island/

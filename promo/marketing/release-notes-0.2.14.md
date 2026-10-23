## Music Island 0.2.14 — исправление листания в караоке / Karaoke scrolling fix

### Что нового

- **Караоке: колесо мыши теперь листает слова везде.** Раньше оно не срабатывало, если курсор находился над раскрытым при наведении островом, а слова лежат как раз в этой зоне. Теперь колесо работает над всем окном: один щелчок сдвигает на одну строку, клик по выбранной строке перематывает песню на неё. Обычный текст без меток времени тоже листается колесом.
- Выбранная прокруткой строка держится 8 секунд, потом окно возвращается к тому, что играет.

### What's new

- **Karaoke: the mouse wheel now scrolls the lyrics everywhere.** It used to do nothing while the cursor was over the island expanded on hover, which covers exactly the area where the lyrics are. Now the wheel works over the whole window: one notch moves one line, a click on the selected line seeks the song to it. Plain lyrics without timestamps scroll with the wheel too.
- A line picked by scrolling stays for 8 seconds, then the window returns to what is playing.

### Установка / Install

Установщик не подписан цифровой подписью, SmartScreen может предупредить. / The installer is not code-signed, SmartScreen may warn.

SHA-256 (Music-Island-Setup-0.2.14.exe, 119 474 536 bytes):

```
638cac6aabdb9f4d53d3ba9f8a01025e73ad1366bc967b2d39a788caf0f1ef86
```

```powershell
Get-FileHash .\Music-Island-Setup-0.2.14.exe -Algorithm SHA256
```

Сайт / Website: https://luviel19.github.io/Music_Island/

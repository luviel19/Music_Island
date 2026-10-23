## Music Island 0.2.15 — клик по строке в караоке / Karaoke line click fix

### Что нового

- **Караоке: клик по строке снова перематывает песню.** Нажатие мыши на строку слов принималось за начало перетаскивания острова, и клик терялся. Теперь область со слов исключена из перетаскивания: клик по любой из четырёх строк перематывает песню на неё. Остров по-прежнему можно двигать за остальные места.
- Колесо мыши листает слова везде, в том числе над раскрытым при наведении островом (0.2.14).

### What's new

- **Karaoke: clicking a line seeks the song again.** A mouse press on a lyrics line was treated as the start of dragging the island, so the click was lost. The lyrics area is now excluded from dragging: a click on any of the four lines seeks the song to it. The island can still be moved by the other areas.
- The mouse wheel scrolls the lyrics everywhere, including over the island expanded on hover (0.2.14).

### Установка / Install

Установщик не подписан цифровой подписью, SmartScreen может предупредить. / The installer is not code-signed, SmartScreen may warn.

SHA-256 (Music-Island-Setup-0.2.15.exe, 119 474 528 bytes):

```
8ec9de72480a517700bee77d1ade8dc9ba05234100109eb3a5f4408d18354975
```

```powershell
Get-FileHash .\Music-Island-Setup-0.2.15.exe -Algorithm SHA256
```

Сайт / Website: https://luviel19.github.io/Music_Island/

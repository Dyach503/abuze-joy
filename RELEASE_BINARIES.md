# Бинарники для сборки

Эти файлы **не хранятся в репозитории** (они тяжёлые и обновляются отдельно).
Перед сборкой портативной версии скачайте их и положите в папку `resources/`
в точности по этой раскладке:

```
resources/
├── sing-box.exe                              ← sing-box (VPN / TUN / per-app)
├── wintun.dll                                ← Wintun-драйвер (нужен sing-box для TUN)
└── zapret2/
    └── binaries/
        └── windows-x86_64/
            └── winws2.exe                    ← zapret/winws2 (обход DPI)
```

Остальное содержимое `zapret2/` (папки `lua/`, `files/fake/*.bin`, `manual.md`,
`config.default`) уже лежит в репозитории — трогать не нужно.

## Где скачать

| Файл | Источник |
|------|----------|
| `sing-box.exe` | https://github.com/SagerNet/sing-box/releases (windows-amd64) |
| `wintun.dll` | https://www.wintun.net/ (из `bin/amd64/`) |
| `winws2.exe` | https://github.com/bol-van/zapret/releases (windows-x86_64) |

После того как файлы на месте, соберите портативную папку:

```powershell
./build-portable.ps1
```

Готовый результат — `dist-portable/AbuzeJoy/` (exe + `resources/`). Заархивируйте
его в zip и приложите к GitHub-релизу.

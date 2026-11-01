# BlockLauncher

Автономный Minecraft-лаунчер (Windows `.exe` без установленного Node.js).

## Для игрока (без Node.js)

1. Собери `.exe` один раз (см. ниже) **или** возьми готовый файл из папки `release`
2. Запусти **`BlockLauncher-Portable.exe`**
3. Node.js **не нужен**

Нужна только **Java** для самого Minecraft.

## Сборка автономного .exe (один раз)

Нужен Node.js **только для сборки**:

```bash
git clone https://github.com/fima4335/BlockLauncher.git
cd BlockLauncher
npm install
npm run dist:win
```

Готовые файлы появятся в папке **`release/`**:

| Файл | Описание |
|------|----------|
| `BlockLauncher-Portable.exe` | Портативный, без установки |
| `BlockLauncher-*-setup.exe` | Установщик с ярлыком |

После этого можно копировать `.exe` на другой ПК — Node.js там не нужен.

## Разработка

```bash
npm install
npm run dev
```

## Возможности

- Русский интерфейс
- Инстансы + offline-аккаунты
- Автоустановка Fabric
- Моды с Modrinth
- Запуск Minecraft

## Java

| Версия Minecraft | Java |
|------------------|------|
| 1.20.x | 17+ |
| 1.21+ / новые | 21+ |

Скачать Java: https://adoptium.net

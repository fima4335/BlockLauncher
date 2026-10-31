# BlockLauncher 🧱

**Современный открытый лаунчер Minecraft с уникальной системой анализа модов (Mod Intelligence).**

Аналог T-Launcher с современным UI, системой инстансов и умным анализом зависимостей модов.

## Возможности (v0.2.0)

### ✅ Реализовано

1. **Electron-оболочка** — полноценное десктопное приложение
2. **Скачивание Minecraft** — манифест версий + клиент + библиотеки (Mojang API)
3. **Лоадеры** — выбор Vanilla / Fabric / Forge / NeoForge / Quilt при создании инстанса
4. **Система инстансов** — изолированные папки с модами, сейвами, ресурспаками
5. **Авторизация** — Offline-аккаунты (Microsoft — в планах)
6. **Запуск игры** — сборка classpath, аргументы JVM, запуск процесса
7. **Mod Intelligence** — уникальный анализ зависимостей (required / optional / incompatible / addons)

### 🧠 Mod Intelligence

При добавлении мода (например `create`) лаунчер показывает:
- Обязательные зависимости
- Рекомендуемые моды
- Несовместимые
- Популярные аддоны

## Быстрый старт

```bash
git clone https://github.com/fima4335/BlockLauncher.git
cd BlockLauncher
npm install
npm run dev
```

Команда `npm run dev` запускает Vite + Electron одновременно.

### Только веб-интерфейс (без запуска Minecraft)

```bash
npm run dev:web
```

### Сборка

```bash
npm run build
npm start          # запуск собранной версии
npm run dist       # сборка установщика (electron-builder)
```

## Структура

```
BlockLauncher/
├── electron/
│   ├── main.js          # Главный процесс Electron + логика лаунчера
│   └── preload.js       # Безопасный мост в renderer
├── src/
│   ├── App.tsx          # UI лаунчера
│   ├── core/
│   │   └── mod-intelligence.ts   # ★ Уникальный модуль
│   ├── services/        # Скины, серверы, Modrinth
│   └── types/
├── package.json
└── README.md
```

## Как пользоваться

1. Запустите `npm run dev`
2. Перейдите во вкладку **Аккаунты** → добавьте Offline-аккаунт
3. Перейдите в **Инстансы** → Создать
4. Выберите версию Minecraft и лоадер
5. Нажмите **Играть** (версия скачается автоматически при первом запуске)
6. Используйте **Mod Intelligence** для анализа модов перед установкой

## Планы

- [ ] Microsoft OAuth
- [ ] Полноценная установка Fabric/Forge/NeoForge (installer)
- [ ] Установка модов из Modrinth одним кликом в инстанс
- [ ] Скины + Ely.by в UI
- [ ] Список серверов
- [ ] Автообновление лаунчера

## Лицензия

MIT

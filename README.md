# BlockLauncher 🧱

**Современный открытый лаунчер Minecraft с уникальной системой анализа модов (Mod Intelligence).**

## Возможности (v0.3.0)

### ✅ Реализовано

1. **Electron-оболочка** — десктопное приложение
2. **Скачивание Minecraft** — Mojang API (клиент + библиотеки)
3. **Установка лоадеров**
   - **Fabric** — через официальный Meta API (профиль + библиотеки)
   - **Forge** — через installer JAR (+ BMCL mirror)
   - **NeoForge** — через официальный maven installer
4. **Система инстансов** — изолированные `mods` / `saves` / `resourcepacks`
5. **Offline-аккаунты**
6. **Запуск игры** — classpath + JVM args
7. **Mod Intelligence** — анализ зависимостей
8. **Установка модов из Modrinth** — поиск + установка в инстанс **с автоматическим резолвом required-зависимостей**

## Быстрый старт

```bash
git clone https://github.com/fima4335/BlockLauncher.git
cd BlockLauncher
npm install
npm run dev
```

Нужна Java в PATH (`java -version`).

## Как пользоваться

### Создать инстанс с Fabric/Forge
1. **Аккаунты** → добавь Offline-ник  
2. **Инстансы** → Создать → выбери версию MC и лоадер (Fabric/Forge/NeoForge)  
3. Дождись установки лоадера → **Играть**

### Установить моды из Modrinth
1. Вкладка **Моды (Modrinth)**  
2. Выбери инстанс  
3. Найди мод (например `create` или `sodium`)  
4. **Установить** — скачается мод и все **required** зависимости  

### Mod Intelligence
Вкладка **Mod Intelligence** — анализ зависимостей до установки.

## Структура

```
electron/
  main.js
  preload.js
  launcher/
    fabric.js           # Установка Fabric
    forge.js            # Установка Forge / NeoForge
    modrinth-install.js # Поиск и установка модов + deps
src/
  App.tsx               # UI
  core/mod-intelligence.ts
```

## Планы

- [ ] Microsoft OAuth
- [ ] Quilt (полноценно)
- [ ] Скачивание assets
- [ ] Скины + серверы в UI
- [ ] Обновление модов одной кнопкой

## Лицензия

MIT

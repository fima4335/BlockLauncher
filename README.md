# BlockLauncher 🧱

**Современный открытый лаунчер Minecraft с уникальной системой анализа модов и модпаков.**

BlockLauncher — это лаунчер в стиле T-Launcher, но с акцентом на удобство работы с модами. Главная фишка — **Mod Intelligence**: при добавлении любого мода (например, Create) лаунчер автоматически показывает:

- 🔗 **Обязательные зависимости** (required)
- ✨ **Рекомендуемые / дополнительные** (optional)
- ⚠️ **Несовместимые** (incompatible)
- 🧩 **Аддоны и поддерживаемые моды** (моды, которые зависят от выбранного или хорошо с ним работают)

Также поддерживаются:
- Скины (официальные + Ely.by)
- Список серверов
- Мульти-инстансы
- Модпаки с Modrinth и CurseForge
- Microsoft / Offline аккаунты

> Проект находится в стадии активного развития. Это готовый каркас репозитория с рабочей уникальной функцией анализа зависимостей.

## Уникальная функция: Mod Intelligence

Когда ты создаёшь модпак и добавляешь мод **Create**:

1. Лаунчер запрашивает данные с Modrinth API
2. Показывает дерево зависимостей
3. Предлагает установить обязательные моды одним кликом
4. Показывает популярные аддоны Create (Create: Steam 'n' Rails, Create Big Cannons и т.д.)
5. Предупреждает о конфликтах

Это делает сборку модпаков значительно удобнее и безопаснее.

## Технологии

- **Frontend**: React + TypeScript + Vite + Tailwind
- **Desktop**: Electron (легко перейти на Tauri)
- **API**: Modrinth v2 / v3
- **Язык**: TypeScript + Node.js

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Сборка
npm run build
```

## Структура проекта

```
BlockLauncher/
├── src/
│   ├── core/                 # Ядро лаунчера
│   │   └── mod-intelligence.ts   # ★ Уникальный модуль анализа зависимостей
│   ├── services/             # Сервисы (Modrinth, auth, skins, servers)
│   ├── ui/                   # React компоненты
│   └── types/                # TypeScript типы
├── public/
├── docs/
└── package.json
```

## Как использовать Mod Intelligence (пример)

```ts
import { ModIntelligence } from './src/core/mod-intelligence';

const intel = new ModIntelligence();

// Анализ мода Create
const report = await intel.analyzeMod('create');

console.log(report.required);     // обязательные
console.log(report.optional);     // рекомендуемые
console.log(report.incompatible); // конфликты
console.log(report.addons);       // популярные аддоны
```

## Планы развития

- [x] Базовая структура репозитория
- [x] Mod Intelligence (анализ зависимостей)
- [ ] Полноценный UI лаунчера
- [ ] Скачивание версий Minecraft + лоадеров
- [ ] Система инстансов
- [ ] Скины + Ely.by
- [ ] Список серверов
- [ ] Установка модпаков одним кликом
- [ ] Поддержка CurseForge
- [ ] Автообновления

## Лицензия

MIT — делай что хочешь, но желательно оставлять упоминание.

## Вклад

Pull Request'ы и Issues приветствуются. Особенно по UI и системе запуска Minecraft.

---

Сделано с ❤️ для сообщества моддеров Minecraft.

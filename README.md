# Watch Together

Сайт для совместного просмотра видео. Работает с телефона и компьютера.

## Постоянный сайт в интернете (без bat-файлов)

### Способ 1 — Render.com (бесплатно, карта не нужна)

1. Зайди на [github.com/new](https://github.com/new) → создай репозиторий `watch-together`
2. Загрузи туда файлы проекта (или через GitHub Desktop)
3. Зайди на [render.com](https://render.com) → войди через GitHub
4. **New → Blueprint** → выбери репозиторий
5. Render прочитает `render.yaml` и задеплоит сайт
6. Получишь ссылку вида `https://watch-together.onrender.com`

> Первый запуск после простоя ~30–60 сек (бесплатный тариф).

### Способ 2 — Fly.io (быстрее, нужна карта)

1. Добавь карту: [fly.io/dashboard/filmerst/billing](https://fly.io/dashboard/filmerst/billing)
2. Дважды нажми **`deploy-cloud.bat`**
3. Ссылка появится в конце: `https://watch-together-app.fly.dev`

---

## Локальный запуск (для тестов)

```bash
npm run install:all
npm run build
npm run start:prod
```

Открой http://localhost:3001

---

## Как пользоваться

1. Открой сайт (ссылку из Render или Fly)
2. Введи имя → **Создать комнату**
3. Нажми **Пригласить друга** → отправь ссылку
4. Вставь URL видео (YouTube, VK, Rutube) → **Загрузить**
5. Смотрите вместе, пишите в чат

## Картинки персонажей

Замени файлы в `client/public/characters/`:
- `mortis.png`, `angela.png`, `maelstroy.png`, `taksa.png`, `lelouch.png`, `cc.png`

После замены пересобери: `npm run build` (или redeploy на сервере).

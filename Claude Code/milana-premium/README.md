# MILANA PREMIUM — сайт + магазин + админ-панель

Трёхъязычный (EN / RU / UZ) сайт премиального бренда домашней одежды:
лендинг, каталог-маркетплейс, корзина с оформлением заказа и админ-панель
для ручного управления товарами, заказами и контактами.

Production database target: **PostgreSQL**. SQLite remains available as a local
fallback while existing data is migrated.

---

## Запуск

Самый простой способ — двойной клик по файлу **`START-SITE.bat`**.
Откроется чёрное окно: пока оно открыто — сайт работает (если сервер
упадёт, окно перезапустит его само через 2 секунды). Закрыли окно — сайт остановился.

Либо из терминала:

```bash
npm start              # или: node server.js
npm test               # backend smoke tests
npm run postgres:migrate:dry
```

| Адрес | Что это |
|---|---|
| http://localhost:4173 | Лендинг |
| http://localhost:4173/shop | Каталог (фильтры, поиск, сортировка) |
| http://localhost:4173/p/`slug` | Страница товара |
| http://localhost:4173/signin | Вход / регистрация клиента |
| http://localhost:4173/admin | Админ-панель |

Порт меняется переменной окружения: `PORT=80 npm start`.
Папку с базой и загрузками можно вынести отдельно: `DATA_DIR=/var/lib/milana npm start`.

## Источник каталога

Публичный магазин (`/shop`, `/p/:slug`, корзина и оформление заказа) берёт товары
из Supabase-каталога Milana Premium:

- URL проекта задаётся через `SUPABASE_URL`;
- приватный серверный ключ — через `SUPABASE_SERVICE_KEY`;
- таблица — `SUPABASE_PRODUCTS_TABLE` (по умолчанию `milana_products`);
- bucket изображений — `SUPABASE_IMAGE_BUCKET` (по умолчанию `product-images`).

Для локального запуска можно хранить эти значения в `data/supabase.env`. Этот файл
добавлен в `.gitignore`, поэтому секреты не попадают в репозиторий. Если Supabase
временно недоступен, сервер откатывается на локальные товары из SQLite.

Отключить живой каталог можно так:

```bash
CATALOG_SOURCE_ENABLED=0 npm start
```

## Клиентские аккаунты и Firebase

На сайте есть страница `/signin` для входа и регистрации оптовых клиентов.
Если Firebase не настроен, локальная разработка работает через встроенные
email/password аккаунты в SQLite. Для production можно включить Firebase Auth:

```bash
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_APP_ID=...
FIREBASE_STORAGE_BUCKET=...              # optional
FIREBASE_MESSAGING_SENDER_ID=...         # optional
```

Для локального запуска эти значения можно положить в `data/firebase.env`
(файл игнорируется git). Браузер получает только публичный web config через
`/api/auth/config`; ID token проверяется на сервере по публичным сертификатам
Google. В заказах сохраняется `customer_id`, чтобы позже связать сайт, Flutter
приложения и ERP (`Shmirzaev/Milana-ERP`) через один профиль клиента.

## Вход в админку

Логин по умолчанию — **admin**. Пароль при первом запуске генерируется случайно:
- печатается в консоль,
- сохраняется в `data/ADMIN-PASSWORD.txt`.

Панель администратора отдаётся сервером **только после входа** — без авторизации
по адресу `/admin` виден исключительно экран логина.

Сменить логин и пароль: **Админ → Настройки → Доступ в админку**
(файл с первичным паролем после смены удалится автоматически).

Забыли пароль — выполните на компьютере с сайтом:

```bash
node tools/reset-password.js МойНовыйПароль
```

## Что умеет админка

- **Товары** — добавление/редактирование: **фото и видео** (загрузка с компьютера,
  несколько штук, перестановка, обложка), название, категория, цена и старая цена,
  размеры, тег (Бестселлер/Новинка/Скидка), рейтинг, описание и состав на
  трёх языках, показать/скрыть на сайте, удаление.
- **Заказы** — список с контактами клиента и составом, смена статуса
  (Новый → В работе → Отправлен → Выполнен/Отменён), бейдж с числом новых.
- **Дизайн** — главный экран (фото **или видео** + постер) и фирменный цвет
  (6 готовых палитр). Применяется по всему сайту.
- **Настройки** — логин, телефон, WhatsApp, Telegram, Instagram, e-mail, адрес
  фабрики на трёх языках, валюта и её положение ($189 или 189 000 so'm).
  Эти данные автоматически подставляются по всему сайту.

### Видео
Сайт поддерживает видео в карточках и на странице товара (MP4 / WebM, до 64 МБ),
а также видео на главном экране. Видео воспроизводится без звука, зациклено,
с поддержкой перемотки (HTTP Range). Форматы фото: JPG / PNG / WebP (до 8 МБ).

## Единая база данных: PostgreSQL

Мы выбрали PostgreSQL как главный источник данных для сайта, Flutter app и
будущей ERP-интеграции. Серверный API должен быть единственной точкой доступа:

```
Website + Flutter app -> Milana backend API -> PostgreSQL -> ERP/payment workers
```

Firebase можно оставить для push notifications, analytics или Auth, но товары,
остатки qop, клиенты, заказы, оплаты, support tickets и ERP outbox должны жить в
PostgreSQL.

Локальный Postgres:

```bash
docker compose -f docker-compose.postgres.yml up -d
export DATABASE_URL=postgres://milana:milana_dev_password@127.0.0.1:5432/milana
npm run postgres:schema
npm run postgres:migrate:dry
npm run postgres:migrate
```

Файлы:

- `postgres/schema.sql` — production schema для products, customers, orders,
  payments, support, audit, payment webhook idempotency и ERP events.
- `tools/apply-postgres-schema.js` — применяет schema к `DATABASE_URL`.
- `tools/migrate-sqlite-to-postgres.js` — переносит текущие данные из
  `data/milana.db` в PostgreSQL с сохранением ID.
- `.env.postgres.example` — пример `DATABASE_URL`.

Во время перехода текущий сервер ещё может читать SQLite, но целевая архитектура
для сайта и приложения — один общий Postgres-backed API.

## Как устроено хранение сейчас

Всё лежит в папке `data/` (создаётся сама):

```
data/
  milana.db        ← база SQLite (товары, заказы, настройки, сессии)
  uploads/         ← загруженные фотографии товаров
```

**Бэкап = скопировать папку `data/`.** Перенос на сервер — тоже.

Подписки из формы в футере сохраняются в таблицу `subscribers`.
Клиенты сохраняются в `customers`, их сессии — в `customer_sessions`.
Операции администратора и новые заказы пишутся в `audit_events`.

## API и мониторинг

Основные публичные API:

| Метод | Адрес | Что делает |
|---|---|---|
| GET | `/api/health` | Проверка сервера, базы и базовых счётчиков |
| GET | `/api/settings` | Публичные контакты, валюта, дизайн |
| GET | `/api/products` | Живой Supabase-каталог с фильтрами `gender`, `category`, `tag`, `q`, `sort`, `limit` |
| GET | `/api/products/:slug` | Карточка товара + похожие товары |
| POST | `/api/orders` | Создание заказа, сумма считается на сервере |
| POST | `/api/newsletter` | Подписка e-mail, повторная подписка идемпотентна |
| GET | `/api/auth/config` | Режим авторизации и публичный Firebase web config |
| GET | `/api/auth/me` | Текущий клиент по httpOnly cookie |
| POST | `/api/auth/signup` | Локальная регистрация клиента |
| POST | `/api/auth/signin` | Локальный вход клиента |
| POST | `/api/auth/firebase` | Создание клиентской сессии по Firebase ID token |
| POST | `/api/auth/logout` | Выход клиента |

Админские API находятся в `/api/admin/*` и доступны только после входа.

## Telegram-уведомления о заказах

Пока онлайн-оплата остаётся ручной, сайт и Flutter app отправляют заказы в один
backend endpoint: `POST /api/orders`. После сохранения заказа backend может
отправить сообщение менеджерам в Telegram.

Настройки:

```bash
TELEGRAM_BOT_TOKEN=123456:bot-token-from-botfather
TELEGRAM_ORDER_CHAT_ID=-1001234567890
TELEGRAM_ORDERS_ENABLED=1
# optional, only for Telegram forum/topic groups
TELEGRAM_ORDER_THREAD_ID=
```

Локально эти значения можно положить в `data/telegram.env`. На сервере лучше
держать их в systemd EnvironmentFile / shared env рядом с остальными backend
секретами. Если токен или chat id не заданы, заказ всё равно создаётся, просто
без Telegram-уведомления.

Flutter app должен использовать тот же endpoint и передавать `source: "flutter"`
в JSON payload. Сумма, qop-правила и size mix всё равно считаются сервером.

## Деплой на сервер (когда появится)

1. Скопируйте папку проекта на сервер (вместе с `data/`, если нужно сохранить контент).
2. `node server.js` (Node 22.5+). Для автозапуска:
   - Linux: `pm2 start server.js --name milana` или systemd-юнит;
   - Windows: NSSM или Планировщик задач.
3. Поставьте впереди reverse-proxy с HTTPS (Caddy — самый простой вариант:
   две строчки конфига, сертификат сам). Cookie сессии автоматически становится
   `Secure` за прокси с заголовком `x-forwarded-proto: https`.

## Безопасность (встроено)

- Пароль хранится как scrypt-хэш; сессии — httpOnly cookie, 30 дней.
- Сессионные токены хранятся в базе как SHA-256-хэши.
- Админские POST/PUT/DELETE-запросы проверяют same-origin, чтобы снижать риск CSRF.
- Все ответы получают защитные заголовки: CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Лимиты: 8 попыток входа / 15 мин, 10 заказов / час с одного IP.
- Подписки: 5 попыток / час с одного IP.
- Загрузка фото: только JPG/PNG/WebP (проверка по сигнатуре файла), до 8 МБ.
- Суммы заказов считаются на сервере по ценам из базы.
- Защита от path traversal, XSS-экранирование, `X-Content-Type-Options: nosniff`.
- SQLite работает в WAL-режиме с индексами для каталога, заказов, сессий и аудита.

## Структура

```
server.js        ← весь бэкенд (API + статика), ~600 строк
seed.js          ← демо-каталог (13 товаров), срабатывает один раз
public/
  index.html     ← лендинг
  shop.html      ← каталог
  product.html   ← товар
  admin.html     ← админка
  css/  js/  lang/  assets/
```

Демо-товары можно удалить прямо из админки.

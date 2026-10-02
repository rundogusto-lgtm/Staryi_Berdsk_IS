# Компонентная диаграмма (Mermaid)

Диаграмма описывает связь модулей интегрированного приложения «Старый Бердск».
Отрисовывается в GitHub, VS Code (плагин Mermaid) или на mermaid.live.

```mermaid
graph TD
  subgraph Server["Сервер · Node.js + Express"]
    direction TB
    HTTP["HTTP слой<br/>src/server.js"]
    RouterObj["routes/objects.js"]
    RouterBook["routes/bookings.js"]
    MW["middleware/asyncHandler.js<br/>asyncHandler · errorHandler"]
    SvcObj["services/objectService.js<br/>getAllObjects · getOccupancyForDate"]
    SvcBook["services/bookingService.js<br/>validate · calcPrice · CRUD"]
    Exc["exceptions.js<br/>ApiError · ValidationError<br/>NotFoundError · ConflictError"]
    DB["db.js<br/>SQLite · migrate · seed"]
  end

  subgraph Client["Браузер · ES-модули"]
    direction TB
    APP["app.js<br/>точка входа · роутинг"]
    MAP["map.js<br/>SVG-схема парка"]
    BOOK["booking.js<br/>форма бронирования"]
    ADMIN["admin.js<br/>панель администратора"]
    DIR["director.js<br/>дашборд и чек"]
    API["api.js<br/>fetch-обёртка"]
    UI["ui.js<br/>формат и уведомления"]
  end

  APP --> MAP
  APP --> BOOK
  APP --> ADMIN
  APP --> DIR
  MAP --> API
  BOOK --> API
  ADMIN --> API
  DIR --> API
  MAP --> UI
  BOOK --> UI
  ADMIN --> UI
  DIR --> UI

  API -->|"REST /api/*"| HTTP
  HTTP --> MW
  MW --> RouterObj
  MW --> RouterBook
  RouterObj --> SvcObj
  RouterBook --> SvcBook
  SvcObj --> DB
  SvcBook --> DB
  SvcBook --> Exc
  SvcObj --> Exc
  MW --> Exc

  classDef server fill:#2e8b57,stroke:#1f6b40,color:#fff
  classDef client fill:#d6eef7,stroke:#4682b4,color:#1f2933
  class HTTP,RouterObj,RouterBook,MW,SvcObj,SvcBook,Exc,DB server
  class APP,MAP,BOOK,ADMIN,DIR,API,UI client
```

## Связи между модулями

Связи реализованы подписками, а не прямыми импортами: ни один экранный модуль
не знает о существовании остальных. `app.js` выступает шиной событий.

| Источник | Событие | Подписчик | Действие |
|----------|---------|-----------|----------|
| `map.js` | `onSelect(object)` | `app.js` | Открывает карточку объекта в `booking.js` |
| `map.js` | `onBusyChange(objects)` | `app.js` | Складывает актуальные объекты в состояние приложения |
| `booking.js` | `onBookingCreated(booking)` | `app.js` | Перезагружает карту, чтобы занятый слот стал красным |
| `admin.js` | `onBookingsChanged()` | `app.js` | Обновляет карту после смены статуса или отмены |

## Слои и правило зависимостей

Зависимости направлены строго внутрь. Обратных связей нет.

```
app.js  ->  map / booking / admin / director  ->  api.js  ->  HTTP
                                                          |
routes -> services -> db.js + exceptions.js  <------------+
```

- `routes` не знает про `services` деталей реализации, только про их имена.
- `services` не знают про Express и `req`/`res`.
- `exceptions.js` не зависит ни от чего, кроме встроенного `Error`.
- Фронтенд не импортирует серверные модули: граница проходит по REST API.

## Точки, где менялась схема

Дни 4–7: серверная часть выросла из трёх модулей (`db`, `bookingService`,
`routes`) до полного слоя REST API с типизированными исключениями. Появились
`middleware/asyncHandler.js` и `exceptions.js`, отделённые от бизнес-логики.
Фронтенд вынесен в `src/public/` и общается с сервером только через `api.js`.

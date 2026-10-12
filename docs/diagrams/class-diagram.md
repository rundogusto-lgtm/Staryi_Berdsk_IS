# Диаграмма классов (Class Diagram)

**Дата:** 2026-10-09
**Проект:** «Старый Бердск»
**Версия диаграммы:** 1.1

Диаграмма отражает реальную структуру кода: слева — серверный слой,
справа — модули фронтенда. Имена классов и методов совпадают с исходниками.

## Серверный слой

```mermaid
classDiagram
  class ObjectService {
    +getAllObjects(type) Object[]
    +getObjectById(id) Object
    +getOccupancyForDate(date) Map
    +mapRow(row) Object
  }

  class BookingService {
    +validateDate(date) Result
    +isSlotAvailable(objectId, date) bool
    +getSeasonCoefficient(date) number
    +calcPrice(objectId, hours, date) number
    +getPriceQuote(objectId, hours, date) Quote
    +validateBookingInput(input) string
    +assertBookingInput(input) void
    +createBooking(input) Booking
    +getBookings(filters) Booking[]
    +getBookingById(id) Booking
    +setStatus(id, status) Booking
    +cancelBooking(id) Booking
    +getDashboardSummary() Summary
  }

  class ApiError {
    +string message
    +number status
    +toUserMessage() Dialog
  }

  class ValidationError {
    +number status = 400
  }

  class NotFoundError {
    +number status = 404
  }

  class ConflictError {
    +number status = 409
  }

  class Database {
    +migrate() void
    +seed() void
    +query(sql, params) Row[]
  }

  ApiError <|-- ValidationError
  ApiError <|-- NotFoundError
  ApiError <|-- ConflictError

  BookingService ..> ObjectService : использует
  BookingService ..> ApiError : выбрасывает
  BookingService ..> Database : запросы
  ObjectService ..> Database : запросы
  ObjectService ..> ApiError : выбрасывает
```

## Модель данных

```mermaid
classDiagram
  class Object {
    +int id
    +string type
    +string name
    +int capacity
    +int pricePerHour
    +int parkingCapacity
    +Position position
    +bool busy
  }

  class Booking {
    +int id
    +int objectId
    +string date
    +int hours
    +int guests
    +int cars
    +int totalPrice
    +string status
    +string createdAt
  }

  class Position {
    +int x
    +int y
  }

  class Quote {
    +int totalPrice
    +number seasonCoefficient
  }

  class Summary {
    +int total
    +Map byStatus
    +int revenue
  }

  Object "1" *-- "1" Position : содержит
  Object "1" --> "0..*" Booking : имеет брони
```

## Фронтенд

```mermaid
classDiagram
  class App {
    +initApp() void
    +showScreen(name) void
    +refreshAll() void
    +bindControls() void
    +bindModules() void
  }

  class MapModule {
    +init() void
    +reload(filters) void
    +render() void
    +subscribe(listeners) void
  }

  class BookingModule {
    +init() void
    +renderPanel(object) void
    +onBookingCreated(cb) void
  }

  class AdminModule {
    +init() void
    +reload() void
    +onBookingsChanged(cb) void
  }

  class DirectorModule {
    +init() void
    +reload() void
  }

  class Api {
    +fetchObjects(filters) Promise
    +fetchBookings(filters) Promise
    +createBooking(input) Promise
    +setBookingStatus(id, status) Promise
    +cancelBooking(id) Promise
    +fetchPriceQuote(input) Promise
    +fetchSummary() Promise
  }

  class Ui {
    +showToast(message) void
    +formatMoney(value) string
    +formatDate(date) string
    +todayIso() string
  }

  App --> MapModule
  App --> BookingModule
  App --> AdminModule
  App --> DirectorModule
  MapModule ..> Api
  BookingModule ..> Api
  AdminModule ..> Api
  DirectorModule ..> Api
  MapModule ..> Ui
  BookingModule ..> Ui
  AdminModule ..> Ui
  DirectorModule ..> Ui
```

## Ключевые решения

| Решение | Обоснование |
|---------|-------------|
| `BookingService` и `ObjectService` — набор функций, а не классы | Бизнес-логика не хранит состояние, экземпляры не нужны. Модуль проще тестировать и подменять |
| `exceptions.js` отдельно от сервисов | Иерархия ошибок используется и сервером, и браузером; вынесение убрало бы циклическую зависимость |
| `bookingStatus.js` отдельно | Чтобы `objectService` ссылался на `CANCELLED`, не импортируя весь `bookingService` |
| Модули фронтенда связаны подписками, а не наследованием | Экраны независимы: панель администратора не должна знать о карте |
| `Api` и `Ui` — единственные точки выхода наружу | Смена транспорта или оформления уведомлений затрагивает один файл |

## Соответствие коду

| Класс на диаграмме | Файл |
|---|---|
| `BookingService` | `src/services/bookingService.js` |
| `ObjectService` | `src/services/objectService.js` |
| `ApiError` и наследники | `src/exceptions.js` |
| `Database` | `src/db.js` |
| `MapModule`, `BookingModule`, `AdminModule`, `DirectorModule` | `src/public/*.js` |
| `Api` | `src/public/api.js` |
| `Ui` | `src/public/ui.js` |
| `App` | `src/public/app.js` |
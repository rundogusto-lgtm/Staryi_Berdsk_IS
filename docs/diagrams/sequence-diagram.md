# Диаграмма последовательностей (Sequence Diagram)

**Дата:** 2026-10-09
**Проект:** «Старый Бердск»
**Версия:** 1.0

Показывает порядок взаимодействия модулей при создании брони — тот сценарий,
ради которого в проекте настроены подписки между экранами.

## Создание брони

```mermaid
sequenceDiagram
  autonumber
  actor V as Посетитель
  participant M as map.js
  participant B as booking.js
  participant A as api.js
  participant S as server.js
  participant R as routes/bookings.js
  participant C as bookingService
  participant O as objectService
  participant D as SQLite

  V->>M: клик по объекту
  M->>V: показать карточку (booking.renderPanel)

  V->>B: изменить дату или часы
  B->>B: отложить пересчёт на 350 мс
  B->>A: fetchPriceQuote(objectId, hours, date)
  A->>S: POST /api/bookings/quote
  S->>R: передать в маршрут
  R->>C: getPriceQuote
  C->>O: getObjectById(objectId)
  O->>D: SELECT
  D-->>O: строка объекта
  O-->>C: объект
  C-->>R: { totalPrice, seasonCoefficient }
  R-->>A: 200 + JSON
  A-->>B: сумма
  B-->>V: «К оплате: 1 600 ₽»

  V->>B: нажать «Забронировать»
  B->>A: createBooking(payload)
  A->>S: POST /api/bookings
  S->>R: передать в маршрут
  R->>C: createBooking (в try/catch asyncHandler)
  C->>D: BEGIN TRANSACTION
  C->>D: SELECT COUNT(*) — занят ли слот
  D-->>C: 0
  C->>D: INSERT INTO bookings (status = pending)
  D-->>C: lastInsertRowid
  C->>D: COMMIT
  C-->>R: { ok: true, booking }
  R-->>A: 201 + JSON
  A-->>B: бронь

  alt Слот занят
    C-->>R: ConflictError
    R-->>A: 409 «Слот уже занят»
    A-->>B: ошибка
    B-->>V: предупреждение: выберите другой объект или дату
  else Ошибка валидации
    C-->>R: ValidationError / NotFoundError
    R-->>A: 400 / 404 с текстом
    A-->>B: ошибка
    B-->>V: предупреждение: проверьте заполненные поля
  else Успех
    B->>B: onBookingCreated(booking)
    B->>M: app.refreshAll()
    M->>A: fetchObjects(date)
    A->>S: GET /api/objects?date=...
    S->>O: getAllObjects + getOccupancyForDate
    O->>D: SELECT
    D-->>O: объекты с флагом busy
    O-->>M: 8 объектов, бронь видна
    M-->>V: карта перерисована, объект красный
  end
```

## Смена статуса администратором

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Администратор
  participant AdM as admin.js
  participant A as api.js
  participant S as server.js
  participant R as routes/bookings.js
  participant C as bookingService
  participant D as SQLite
  participant M as map.js

  Ad->>AdM: нажать «Подтвердить оплату»
  AdM->>A: setBookingStatus(id, paid)
  A->>S: PATCH /api/bookings/:id/status
  S->>R: передать в маршрут
  R->>C: setStatus(id, status)
  C->>D: UPDATE bookings SET status
  D-->>C: changes = 1
  C->>D: SELECT * FROM bookings WHERE id
  D-->>C: строка брони
  C-->>R: бронь
  R-->>A: 200 + JSON
  A-->>AdM: бронь со статусом paid
  AdM-->>Ad: уведомление «Статус изменён»
  AdM->>AdM: reload() — перерисовать таблицу
  AdM->>M: onBookingsChanged() → map.reload()
  M->>A: fetchObjects(date)
  A->>S: GET /api/objects?date=...
  S-->>A: актуальная занятость
  A-->>M: объекты
  M-->>Ad: карта обновлена
```

## Ключевая особенность

Обратите внимание на `alt`-ветку в первой диаграмме: **фронтенд не знает,
какой именно код вернёт сервер**. Модуль `booking.js` получает отказ из
`api.js` и передаёт его в показ сообщения, а `map.js` узнаёт об изменении
только через подписку `onBookingCreated`. Прямой связи между экранами нет —
поэтому админку можно переписать, не трогая карту, и наоборот.

Исключение — смена статуса: она порождает событие `onBookingsChanged`, и
`app.js` сам решает обновить карту. Это решение находится в точке входа
приложения, а не внутри экранов.
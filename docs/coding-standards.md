# Стандарты кодирования проекта «Старый Бердск»

## Именование
- Переменные: camelCase — objectId, bookingDate.
- Константы: UPPER_SNAKE_CASE — MAX_BOOKING_HOURS, BOOKING_STATUS.
- Функции: camelCase — calcPrice, isSlotAvailable, createBooking.
- Классы: PascalCase — Booking, ObjectCard.
- Файлы: kebab-case — booking-service.js, object-service.js.
- Таблицы SQLite: snake_case — objects, bookings.

## Форматирование
- Отступ: 2 пробела.
- Кодировка: UTF-8, перевод строки LF.
- Точка с запятой обязательна.
- Одинарные кавычки в JS.
- Максимальная длина строки — 100 символов.

## Архитектура
- Слой routes — только валидация входа и вызов сервиса.
- Слой services — вся бизнес-логика.
- Слой db — только SQL и prepared statements.
- Изменения данных — через транзакции SQLite.

## Безопасность
- Только подготовленные SQL-выражения.
- Валидация входных данных на уровне сервиса.
- Ошибки — { error: '...' } с корректным HTTP-кодом.

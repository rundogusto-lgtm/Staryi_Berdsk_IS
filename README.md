# «Старый Бердск» — веб-система управления арендой объектов парка отдыха

## Стек
- Node.js + Express
- SQLite (better-sqlite3)
- Vitest + Supertest

## Запуск
    npm install
    npm run seed
    npm start

Сервер: http://localhost:3000

## Тесты
    npm test

## API
- GET  /api/objects
- GET  /api/objects/:id
- POST /api/bookings
- GET  /api/bookings
- PATCH /api/bookings/:id/status

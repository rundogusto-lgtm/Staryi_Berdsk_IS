# «Старый Бердск» — веб-система управления арендой объектов парка отдыха

Веб-система аренды беседок, палаток и парковок: интерактивная SVG-карта,
бронирование с сезонными коэффициентами, панель администратора и дашборд
директора с печатью чеков А4.

## Возможности
- Интерактивная карта парка (8 объектов, занятость на дату).
- Бронирование: дата, часы 1–12, гости, машины, горизонт 90 дней.
- Расчёт цены с сезонными коэффициентами (лето ×1.2, зима ×0.8).
- Панель администратора: статусы, фильтры, отмена и восстановление.
- Дашборд директора: KPI, выручка, последние операции, печать чека А4.
- 15 исключительных ситуаций с типизированными ошибками (400/404/409).
- 89 автотестов (Vitest + Supertest), покрытие серверной части 98,5 %.

## Стек технологий
- Node.js + Express (REST API).
- SQLite (better-sqlite3), без ORM — подготовленные выражения.
- Фронтенд без сборки: ES-модули, SVG.
- Тесты: Vitest, Supertest, `@vitest/coverage-v8`.
- CI: GitHub Actions (`.github/workflows/test.yml`).

## Быстрый старт
```bash
git clone https://github.com/rundogusto-lgtm/Staryi_Berdsk_IS.git
cd Staryi_Berdsk_IS
npm install
npm run seed
npm start
```

Сервер: http://localhost:3000

## Тесты
```bash
npm test
npm run test:coverage
```

## API
- GET  /api/objects — список объектов (+ `?type=`, `?date=` с флагом `busy`)
- GET  /api/objects/:id — один объект
- POST /api/bookings — создать бронь (201), тело `{ objectId, date, hours, guests, cars }`
- POST /api/bookings/quote — расчёт цены без создания брони
- GET  /api/bookings — список (+ `?status=`, `?date=`, `?objectId=`)
- GET  /api/bookings/summary — статистика для дашборда
- PATCH /api/bookings/:id/status — смена статуса, тело `{ status }`
- DELETE /api/bookings/:id — отмена брони

## Документация
- [Дневник практики](docs/diary.md)
- [Руководство пользователя](docs/user-guide.md)
- [Руководство по установке](docs/install-guide.md)
- [Changelog](CHANGELOG.md)
- [Диаграммы](docs/diagrams/README.md) — Use Case, классов, ER, Activity, State, Sequence
- [Стандарты кодирования](docs/coding-standards.md)
- [Тестовые сценарии и тест-кейсы](docs/test-scenarios.md) / [тест-кейсы](docs/test-cases.md)
- [Протоколы тестирования](docs/test-protocols.md) / [баг-репорты](docs/bug-reports.md) / [сводка](docs/test-summary.md)
- [Покрытие тестами](docs/test-coverage.md)
- [Отчёт об отладке](docs/debug-report.md) / [об исключениях](docs/exceptions.md)
- [Чек-лист инспекции](docs/inspection-checklist.md) / [Отчёт об инспекции](docs/inspection-report.md)
- [Метрики качества](docs/quality-metrics.md)
- [Стратегия ветвления](docs/git-strategy.md)
- [Презентация: структура](docs/presentation-outline.md) / [текст выступления](docs/presentation-speech.md)

## Авторы
- Мариненко Е. Е.
- Козлов Д. Е.

## Лицензия
MIT

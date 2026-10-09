// tests/api.test.mjs — интеграционные тесты REST API через Supertest.
// Приложение импортируется из src/app.js: порт не открывается, запросы
// идут напрямую по стеку Express. Тесты проверяют связку
// routes -> services -> db целиком, а не отдельные функции.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import request from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Своя база для API-тестов: Vitest запускает файлы параллельно, общий
// файл с booking.test.mjs привёл бы к гонке за данные.
const API_TEST_DB = path.join(__dirname, 'api.test.db');
process.env.TEST_DB = API_TEST_DB;

for (const suffix of ['', '-shm', '-wal']) {
  if (fs.existsSync(API_TEST_DB + suffix)) {
    fs.unlinkSync(API_TEST_DB + suffix);
  }
}

const { app } = await import('../src/app.js');
const { db, seed } = await import('../src/db.js');
const { BOOKING_STATUS } = await import('../src/services/bookingStatus.js');

/** Возвращает дату YYYY-MM-DD, сдвинутую на offset дней от сегодня. */
function dayOffset(offset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Тело валидной брони для беседки №2 (вместимость 8, парковка 3). */
function validBooking(overrides = {}) {
  return {
    objectId: 2,
    date: dayOffset(1),
    hours: 4,
    guests: 5,
    cars: 2,
    ...overrides,
  };
}

beforeAll(() => {
  seed();
});

beforeEach(() => {
  db.prepare('DELETE FROM bookings').run();
});

describe('GET /api/health', () => {
  it('возвращает статус ok', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/objects', () => {
  it('отдаёт все 8 объектов из БД', async () => {
    const response = await request(app).get('/api/objects');

    expect(response.status).toBe(200);
    expect(response.body.objects).toHaveLength(8);
  });

  it('фильтрует по типу объекта', async () => {
    const response = await request(app).get('/api/objects?type=parking');

    expect(response.status).toBe(200);
    expect(response.body.objects).toHaveLength(3);
    expect(response.body.objects.every((o) => o.type === 'parking')).toBe(true);
  });

  it('отклоняет неизвестный тип объекта', async () => {
    const response = await request(app).get('/api/objects?type=castle');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Неизвестный тип объекта');
  });

  it('помечает занятый слот при фильтре по дате', async () => {
    const date = dayOffset(1);
    await request(app).post('/api/bookings').send(validBooking({ date }));

    const response = await request(app).get(`/api/objects?date=${date}`);

    expect(response.status).toBe(200);
    const busyIds = response.body.objects.filter((o) => o.busy).map((o) => o.id);
    expect(busyIds).toEqual([2]);
  });

  it('возвращает 404 для несуществующего объекта', async () => {
    const response = await request(app).get('/api/objects/999');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Объект не найден');
  });

  it('возвращает объект по id', async () => {
    const response = await request(app).get('/api/objects/1');

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Беседка №1');
    expect(response.body.pricePerHour).toBe(500);
  });
});

describe('POST /api/bookings/quote', () => {
  it('возвращает цену и сезонный коэффициент', async () => {
    const response = await request(app)
      .post('/api/bookings/quote')
      .send({ objectId: 1, hours: 4, date: dayOffset(1) });

    expect(response.status).toBe(200);
    expect(response.body.totalPrice).toBeGreaterThan(0);
    expect(response.body.seasonCoefficient).toBeGreaterThan(0);
  });

  it('возвращает 400 при часах вне диапазона', async () => {
    const response = await request(app)
      .post('/api/bookings/quote')
      .send({ objectId: 1, hours: 13, date: dayOffset(1) });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Количество часов/);
  });
});

describe('POST /api/bookings', () => {
  it('создаёт бронь и отвечает 201', async () => {
    const response = await request(app).post('/api/bookings').send(validBooking());

    expect(response.status).toBe(201);
    expect(response.body.status).toBe(BOOKING_STATUS.PENDING);
    expect(response.body.object_id).toBe(2);
    expect(response.body.total_price).toBeGreaterThan(0);
  });

  it('возвращает 409 при повторной брони того же слота', async () => {
    await request(app).post('/api/bookings').send(validBooking());
    const response = await request(app).post('/api/bookings').send(validBooking());

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Слот уже занят');
  });

  it('возвращает 404 для несуществующего объекта', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .send(validBooking({ objectId: 999 }));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Объект не найден');
  });

  it('возвращает 400 при превышении вместимости', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .send(validBooking({ guests: 9 }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Превышена вместимость');
  });

  it('возвращает 400 при количестве машин больше мест парковки', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .send(validBooking({ cars: 9 }));

    expect(response.status).toBe(400);
  });

  it('возвращает 400 на несуществующей дате', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .send(validBooking({ date: '2027-02-30' }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Такой даты не существует');
  });

  it('возвращает 400 на прошедшей дате', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .send(validBooking({ date: dayOffset(-1) }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Дата уже прошла');
  });

  it('возвращает 400 при пустом теле запроса', async () => {
    const response = await request(app).post('/api/bookings').send({});

    expect(response.status).toBe(400);
  });

  it('возвращает 400 на некорректном JSON', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .set('Content-Type', 'application/json')
      .send('{"objectId": 1,');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректный JSON в теле запроса');
  });
});

describe('GET /api/bookings', () => {
  it('возвращает пустой список, когда броней нет', async () => {
    const response = await request(app).get('/api/bookings');

    expect(response.status).toBe(200);
    expect(response.body.bookings).toHaveLength(0);
  });

  it('фильтрует по статусу', async () => {
    const created = await request(app).post('/api/bookings').send(validBooking());
    await request(app)
      .patch(`/api/bookings/${created.body.id}/status`)
      .send({ status: BOOKING_STATUS.PAID });

    const response = await request(app).get('/api/bookings?status=paid');

    expect(response.body.bookings).toHaveLength(1);
    expect(response.body.bookings[0].status).toBe(BOOKING_STATUS.PAID);
  });

  it('фильтрует по объекту', async () => {
    await request(app).post('/api/bookings').send(validBooking());

    const response = await request(app).get('/api/bookings?objectId=2');

    expect(response.body.bookings).toHaveLength(1);
  });

  it('фильтрует по дате', async () => {
    await request(app).post('/api/bookings').send(validBooking({ date: dayOffset(2) }));

    const response = await request(app).get(`/api/bookings?date=${dayOffset(2)}`);

    expect(response.body.bookings).toHaveLength(1);
  });
});

describe('PATCH /api/bookings/:id/status', () => {
  it('переводит бронь в статус paid', async () => {
    const created = await request(app).post('/api/bookings').send(validBooking());

    const response = await request(app)
      .patch(`/api/bookings/${created.body.id}/status`)
      .send({ status: BOOKING_STATUS.PAID });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe(BOOKING_STATUS.PAID);
  });

  it('проходит полный жизненный цикл статусов', async () => {
    const created = await request(app).post('/api/bookings').send(validBooking());
    const id = created.body.id;

    for (const status of [BOOKING_STATUS.PAID, BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED]) {
      const response = await request(app)
        .patch(`/api/bookings/${id}/status`)
        .send({ status });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(status);
    }
  });

  it('возвращает 400 на неизвестный статус', async () => {
    const created = await request(app).post('/api/bookings').send(validBooking());

    const response = await request(app)
      .patch(`/api/bookings/${created.body.id}/status`)
      .send({ status: 'archived' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректный статус');
  });

  it('возвращает 404 для несуществующей брони', async () => {
    const response = await request(app)
      .patch('/api/bookings/4242/status')
      .send({ status: BOOKING_STATUS.PAID });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Бронь не найдена');
  });
});

describe('DELETE /api/bookings/:id', () => {
  it('отменяет бронь', async () => {
    const created = await request(app).post('/api/bookings').send(validBooking());

    const response = await request(app).delete(`/api/bookings/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe(BOOKING_STATUS.CANCELLED);
  });

  it('освобождает слот после отмены', async () => {
    const created = await request(app).post('/api/bookings').send(validBooking());
    await request(app).delete(`/api/bookings/${created.body.id}`);

    const response = await request(app).post('/api/bookings').send(validBooking());

    expect(response.status).toBe(201);
  });

  it('возвращает 409 при отмене завершённой брони', async () => {
    const created = await request(app).post('/api/bookings').send(validBooking());
    await request(app)
      .patch(`/api/bookings/${created.body.id}/status`)
      .send({ status: BOOKING_STATUS.COMPLETED });

    const response = await request(app).delete(`/api/bookings/${created.body.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Завершённую бронь отменить нельзя');
  });

  it('возвращает 404 для несуществующей брони', async () => {
    const response = await request(app).delete('/api/bookings/9999');

    expect(response.status).toBe(404);
  });
});

describe('GET /api/bookings/summary', () => {
  it('считает выручку только по оплаченным броням', async () => {
    const paid = await request(app).post('/api/bookings').send(validBooking());
    await request(app)
      .patch(`/api/bookings/${paid.body.id}/status`)
      .send({ status: BOOKING_STATUS.PAID });
    await request(app).post('/api/bookings').send(validBooking({ objectId: 3, date: dayOffset(2) }));

    const response = await request(app).get('/api/bookings/summary');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.byStatus[BOOKING_STATUS.PAID]).toBe(1);
    expect(response.body.revenue).toBe(paid.body.total_price);
  });

  it('возвращает нули на пустой базе', async () => {
    const response = await request(app).get('/api/bookings/summary');

    expect(response.body.total).toBe(0);
    expect(response.body.revenue).toBe(0);
  });
});

describe('Обработка ошибок', () => {
  it('возвращает 404 для неизвестного маршрута API', async () => {
    const response = await request(app).get('/api/nothing-here');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Маршрут не найден');
  });

  it('отдаёт фронтенд на корне', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Старый Бердск');
  });
});
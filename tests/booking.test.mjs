// tests/booking.test.mjs — unit-тесты bookingService (ESM)
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB = path.join(__dirname, 'test.db');
process.env.TEST_DB = TEST_DB;
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

const require = createRequire(import.meta.url);
const { migrate, seed, db } = require('../src/db');
const {
  calcPrice,
  isSlotAvailable,
  validateDate,
  validateBookingInput,
  createBooking,
} = require('../src/services/bookingService');

/** Возвращает дату YYYY-MM-DD, сдвинутую на offset дней от сегодня. */
function dayOffset(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

beforeAll(() => {
  migrate();
  seed();
});

beforeEach(() => {
  db.prepare('DELETE FROM bookings').run();
});

describe('validateDate', () => {
  it('принимает завтра', () => {
    expect(validateDate(dayOffset(1)).ok).toBe(true);
  });

  it('отклоняет вчера', () => {
    const r = validateDate(dayOffset(-1));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Дата уже прошла');
  });

  it('отклоняет +91 день', () => {
    const r = validateDate(dayOffset(91));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Дата слишком далеко');
  });
});

describe('calcPrice', () => {
  it('считает стоимость для беседки №1 (500 руб/час, лето)', () => {
    // 15 июля — лето, коэффициент 1.2
    const price = calcPrice(1, 4, '2026-07-15');
    expect(price).toBe(Math.round(500 * 4 * 1.2));
  });

  it('считает стоимость для беседки №2 (700 руб/час, зима)', () => {
    // 20 января — зима, коэффициент 0.8
    const price = calcPrice(2, 2, '2026-01-20');
    expect(price).toBe(Math.round(700 * 2 * 0.8));
  });
});

describe('isSlotAvailable', () => {
  it('слот свободен, если броней нет', () => {
    expect(isSlotAvailable(1, dayOffset(1))).toBe(true);
  });

  it('слот занят после создания брони', () => {
    const date = dayOffset(1);
    const r = createBooking({ objectId: 1, date, hours: 4, guests: 4, cars: 1 });
    expect(r.ok).toBe(true);
    expect(isSlotAvailable(1, date)).toBe(false);
  });
});

describe('validateBookingInput', () => {
  // Беседка №2: вместимость 8, парковка 3. Дата — всегда завтра.
  const base = () => ({
    objectId: 2,
    date: dayOffset(1),
    hours: 4,
    guests: 5,
    cars: 2,
  });

  it('валидный ввод не даёт ошибок', () => {
    expect(validateBookingInput(base())).toBe(null);
  });

  it('отклоняет 13 часов', () => {
    expect(validateBookingInput({ ...base(), hours: 13 })).toBe('Максимум 12 часов');
  });

  it('отклоняет 9 гостей при вместимости 8', () => {
    expect(validateBookingInput({ ...base(), guests: 9 })).toBe('Превышена вместимость');
  });

  it('отклоняет -1 машину', () => {
    expect(validateBookingInput({ ...base(), cars: -1 })).toBe('Некорректное число машин');
  });
});

// tests/booking.test.mjs — unit-тесты бизнес-логики бронирования.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ValidationError, ConflictError, NotFoundError } from '../src/exceptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TEST_DB выставляется до импорта db.js: путь читается на этапе загрузки модуля.
// Без этого тесты писали бы в боевую data/park.db.
const TEST_DB = path.join(__dirname, 'test.db');
process.env.TEST_DB = TEST_DB;

if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

const { migrate, seed, db } = await import('../src/db.js');
const {
  BOOKING_STATUS,
  MIN_BOOKING_HOURS,
  MAX_BOOKING_HOURS,
  MAX_DAYS_AHEAD,
  validateDate,
  isSlotAvailable,
  getSeasonCoefficient,
  calcPrice,
  validateBookingInput,
  createBooking,
  getBookings,
  getBookingById,
  setStatus,
  cancelBooking,
  getDashboardSummary,
  getPriceQuote,
} = await import('../src/services/bookingService.js');

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
    const result = validateDate(dayOffset(-1));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Дата уже прошла');
  });

  it('отклоняет дату дальше горизонта записи', () => {
    const result = validateDate(dayOffset(MAX_DAYS_AHEAD + 1));
    expect(result.error).toBe('Дата слишком далеко');
  });

  it('отклоняет несуществующую дату 30 февраля', () => {
    // new Date(2026, 1, 30) сам по себе превращается в 2 марта,
    // поэтому нужна обратная сверка месяца и дня.
    const result = validateDate('2027-02-30');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Такой даты не существует');
  });

  it('отклоняет мусор в формате даты', () => {
    expect(validateDate('завтра').error).toBe('Некорректная дата');
    expect(validateDate('01.06.2027').error).toBe('Некорректная дата');
    expect(validateDate(undefined).error).toBe('Некорректная дата');
  });
});

describe('getSeasonCoefficient', () => {
  it('возвращает повышенный коэффициент в июне-августе', () => {
    expect(getSeasonCoefficient('2027-06-15')).toBe(1.2);
    expect(getSeasonCoefficient('2027-07-15')).toBe(1.2);
    expect(getSeasonCoefficient('2027-08-15')).toBe(1.2);
  });

  it('возвращает базовый коэффициент в мае и сентябре', () => {
    expect(getSeasonCoefficient('2027-05-10')).toBe(1.0);
    expect(getSeasonCoefficient('2027-09-10')).toBe(1.0);
  });

  it('возвращает сниженный коэффициент зимой', () => {
    expect(getSeasonCoefficient('2027-01-20')).toBe(0.8);
  });
});

describe('calcPrice', () => {
  it('считает стоимость беседки №1 по летнему коэффициенту', () => {
    expect(calcPrice(1, 4, '2027-07-15')).toBe(Math.round(500 * 4 * 1.2));
  });

  it('считает стоимость беседки №2 по зимнему коэффициенту', () => {
    expect(calcPrice(2, 2, '2027-01-20')).toBe(Math.round(700 * 2 * 0.8));
  });

  it('возвращает целое число рублей', () => {
    expect(Number.isInteger(calcPrice(3, 3, '2027-06-01'))).toBe(true);
  });

  it('бросает NotFoundError для несуществующего объекта', () => {
    expect(() => calcPrice(999, 2, '2027-06-01')).toThrow(NotFoundError);
  });
});

describe('isSlotAvailable', () => {
  it('слот свободен, если броней нет', () => {
    expect(isSlotAvailable(1, dayOffset(1))).toBe(true);
  });

  it('слот занят после создания брони', () => {
    const date = dayOffset(1);
    createBooking({ objectId: 1, date, hours: 4, guests: 4, cars: 1 });
    expect(isSlotAvailable(1, date)).toBe(false);
  });

  it('отменённая бронь освобождает слот', () => {
    const date = dayOffset(2);
    const { booking } = createBooking({ objectId: 1, date, hours: 4, guests: 4, cars: 1 });
    cancelBooking(booking.id);
    expect(isSlotAvailable(1, date)).toBe(true);
  });

  it('разные даты не конфликтуют', () => {
    createBooking({ objectId: 1, date: dayOffset(1), hours: 2, guests: 2, cars: 1 });
    expect(isSlotAvailable(1, dayOffset(2))).toBe(true);
  });
});

describe('validateBookingInput', () => {
  // Беседка №2: вместимость 8, парковка 3.
  const base = () => ({ objectId: 2, date: dayOffset(1), hours: 4, guests: 5, cars: 2 });

  it('валидный ввод не даёт ошибок', () => {
    expect(validateBookingInput(base())).toBe(null);
  });

  it('отклоняет часы сверх лимита', () => {
    expect(validateBookingInput({ ...base(), hours: MAX_BOOKING_HOURS + 1 }))
      .toBe(`Максимум ${MAX_BOOKING_HOURS} часов`);
  });

  it('отклоняет ноль часов', () => {
    expect(validateBookingInput({ ...base(), hours: 0 })).toBe(`Минимум ${MIN_BOOKING_HOURS} час`);
  });

  it('отклоняет гостей сверх вместимости', () => {
    expect(validateBookingInput({ ...base(), guests: 9 })).toBe('Превышена вместимость');
  });

  it('отклоняет машины сверх парковки', () => {
    expect(validateBookingInput({ ...base(), cars: 4 })).toBe('Превышено количество мест на парковке');
  });

  it('отклоняет отрицательное число машин', () => {
    expect(validateBookingInput({ ...base(), cars: -1 })).toBe('Некорректное число машин');
  });
});

describe('createBooking', () => {
  const valid = () => ({ objectId: 3, date: dayOffset(3), hours: 2, guests: 2, cars: 1 });

  it('создаёт бронь в статусе pending с посчитанной ценой', () => {
    const { booking } = createBooking(valid());
    expect(booking.status).toBe(BOOKING_STATUS.PENDING);
    expect(booking.hours).toBe(2);
    expect(booking.total_price).toBe(calcPrice(3, 2, valid().date));
  });

  it('бросает ConflictError при повторной брони того же слота', () => {
    createBooking(valid());
    expect(() => createBooking(valid())).toThrow(ConflictError);
  });

  it('бросает NotFoundError для несуществующего объекта', () => {
    expect(() => createBooking({ ...valid(), objectId: 999 })).toThrow(NotFoundError);
  });

  it('бросает ValidationError при превышении вместимости', () => {
    expect(() => createBooking({ ...valid(), objectId: 1, guests: 99 })).toThrow(ValidationError);
  });
});

describe('setStatus', () => {
  it('переводит бронь в статус paid', () => {
    const { booking } = createBooking({ objectId: 5, date: dayOffset(4), hours: 3, guests: 2, cars: 0 });
    const result = setStatus(booking.id, BOOKING_STATUS.PAID);
    expect(result.booking.status).toBe(BOOKING_STATUS.PAID);
  });

  it('бросает ValidationError на неизвестный статус', () => {
    const { booking } = createBooking({ objectId: 5, date: dayOffset(5), hours: 3, guests: 2, cars: 0 });
    expect(() => setStatus(booking.id, 'archived')).toThrow(ValidationError);
  });

  it('бросает NotFoundError на отсутствующей брони', () => {
    expect(() => setStatus(4242, BOOKING_STATUS.PAID)).toThrow(NotFoundError);
  });
});

describe('cancelBooking', () => {
  it('переводит бронь в статус cancelled', () => {
    const { booking } = createBooking({ objectId: 6, date: dayOffset(6), hours: 2, guests: 1, cars: 1 });
    expect(cancelBooking(booking.id).booking.status).toBe(BOOKING_STATUS.CANCELLED);
  });

  it('запрещает отменять завершённую бронь', () => {
    const { booking } = createBooking({ objectId: 6, date: dayOffset(7), hours: 2, guests: 1, cars: 1 });
    setStatus(booking.id, BOOKING_STATUS.COMPLETED);
    expect(() => cancelBooking(booking.id)).toThrow(ConflictError);
  });

  it('бросает NotFoundError на отсутствующей брони', () => {
    expect(() => cancelBooking(9999)).toThrow(NotFoundError);
  });
});

describe('getBookings', () => {
  it('фильтрует по статусу', () => {
    const first = createBooking({ objectId: 4, date: dayOffset(8), hours: 2, guests: 2, cars: 1 }).booking;
    createBooking({ objectId: 4, date: dayOffset(9), hours: 2, guests: 2, cars: 1 });
    setStatus(first.id, BOOKING_STATUS.PAID);
    expect(getBookings({ status: BOOKING_STATUS.PAID })).toHaveLength(1);
  });

  it('фильтрует по объекту', () => {
    createBooking({ objectId: 4, date: dayOffset(8), hours: 2, guests: 2, cars: 1 });
    createBooking({ objectId: 7, date: dayOffset(8), hours: 1, guests: 1, cars: 1 });
    expect(getBookings({ objectId: 4 })).toHaveLength(1);
  });

  it('возвращает пустой список без фильтров', () => {
    expect(getBookings()).toHaveLength(0);
  });
});

describe('getPriceQuote', () => {
  it('возвращает цену и коэффициент, согласованные с calcPrice', () => {
    // Дата берётся относительно сегодня: горизонт записи ограничен 90 днями,
    // поэтому фиксированная дата в 2027 году была бы всегда «слишком далеко».
    const date = dayOffset(30);
    const quote = getPriceQuote(1, 3, date);
    expect(quote.totalPrice).toBe(calcPrice(1, 3, date));
    expect(quote.seasonCoefficient).toBe(getSeasonCoefficient(date));
  });

  it('бросает ValidationError на часах вне диапазона', () => {
    const date = dayOffset(30);
    expect(() => getPriceQuote(1, 0, date)).toThrow(ValidationError);
    expect(() => getPriceQuote(1, 13, date)).toThrow(ValidationError);
  });

  it('бросает ValidationError на прошедшей дате', () => {
    expect(() => getPriceQuote(1, 2, '2020-01-01')).toThrow(ValidationError);
  });
});

describe('getDashboardSummary', () => {
  it('считает выручку только по оплаченным броням', () => {
    const paid = createBooking({ objectId: 8, date: dayOffset(10), hours: 2, guests: 1, cars: 1 }).booking;
    createBooking({ objectId: 8, date: dayOffset(11), hours: 2, guests: 1, cars: 1 });
    setStatus(paid.id, BOOKING_STATUS.PAID);

    const summary = getDashboardSummary();

    expect(summary.total).toBe(2);
    expect(summary.byStatus[BOOKING_STATUS.PAID]).toBe(1);
    expect(summary.byStatus[BOOKING_STATUS.PENDING]).toBe(1);
    expect(summary.revenue).toBe(paid.total_price);
  });
});

describe('getBookingById', () => {
  it('возвращает null для несуществующего id', () => {
    expect(getBookingById(123456)).toBe(null);
  });
});

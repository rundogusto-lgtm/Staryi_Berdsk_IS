// src/services/bookingService.js — бизнес-логика бронирования и расчёта цены.
import { db } from '../db.js';
import { getObjectById } from './objectService.js';
import { BOOKING_STATUS } from './bookingStatus.js';
import { ValidationError, ConflictError, NotFoundError } from '../exceptions.js';

export { BOOKING_STATUS };

const MAX_BOOKING_HOURS = 12;
const MIN_BOOKING_HOURS = 1;
const MAX_DAYS_AHEAD = 90;
const MS_PER_DAY = 86400000;

// Сезонные коэффициенты применяются к базовой цене за час.
const SEASON_HIGH = 1.2;
const SEASON_MID = 1.0;
const SEASON_LOW = 0.8;
const SEASON_HIGH_MONTHS = [6, 7, 8];
const SEASON_MID_MONTHS = [5, 9];

/**
 * Проверяет дату брони: формат YYYY-MM-DD, существование в календаре,
 * отсутствие в прошлом и ограничение по горизонту записи.
 * @param {string} date — дата в формате YYYY-MM-DD
 * @returns {{ok: true} | {ok: false, error: string}}
 */
function validateDate(date) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));

  if (!parts) {
    return { ok: false, error: 'Некорректная дата' };
  }

  const [, y, m, d] = parts.map(Number);
  const target = new Date(y, m - 1, d);

  // new Date(2026, 1, 30) тихо превращается в 2 марта, поэтому сверяем
  // месяц и день обратно — так отсекаются 31.02 и 30.04.
  if (target.getMonth() !== m - 1 || target.getDate() !== d) {
    return { ok: false, error: 'Такой даты не существует' };
  }

  target.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (target < today) {
    return { ok: false, error: 'Дата уже прошла' };
  }

  const diffDays = Math.round((target - today) / MS_PER_DAY);

  if (diffDays > MAX_DAYS_AHEAD) {
    return { ok: false, error: 'Дата слишком далеко' };
  }

  return { ok: true };
}

/**
 * Проверяет, свободен ли слот объекта на дату.
 * Отменённые брони слот не занимают.
 * @param {number} objectId — ID объекта
 * @param {string} date — дата в формате YYYY-MM-DD
 * @returns {boolean}
 */
function isSlotAvailable(objectId, date) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM bookings
       WHERE object_id = ? AND date = ? AND status != ?`,
    )
    .get(objectId, date, BOOKING_STATUS.CANCELLED);

  return row.cnt === 0;
}

/**
 * Возвращает сезонный коэффициент для даты.
 * @param {string} date — YYYY-MM-DD
 * @returns {number}
 */
function getSeasonCoefficient(date) {
  const month = new Date(`${date}T00:00:00`).getMonth() + 1;

  if (SEASON_HIGH_MONTHS.includes(month)) {
    return SEASON_HIGH;
  }

  if (SEASON_MID_MONTHS.includes(month)) {
    return SEASON_MID;
  }

  return SEASON_LOW;
}

/**
 * Рассчитывает полную стоимость брони с учётом сезонного коэффициента.
 * @param {number} objectId — ID объекта
 * @param {number} hours — количество часов
 * @param {string} date — YYYY-MM-DD
 * @returns {number} стоимость в рублях
 * @throws {NotFoundError} если объект не найден
 */
function calcPrice(objectId, hours, date) {
  const object = getObjectById(objectId);

  if (!object) {
    throw new NotFoundError('Объект не найден');
  }

  const coefficient = getSeasonCoefficient(date);

  return Math.round(object.pricePerHour * hours * coefficient);
}

/**
 * Проверяет входные данные брони по полному списку правил.
 * @param {object} input — objectId, date, hours, guests, cars
 * @returns {string|null} текст первой ошибки или null, если всё в порядке
 */
function validateBookingInput(input) {
  const { objectId, date, hours, guests, cars } = input || {};

  // Обязательные поля проверяются до обращения к БД: без objectId
  // запрос — это ошибка ввода (400), а не «объект не найден» (404).
  if (objectId === undefined || objectId === null || objectId === '') {
    return 'Не указан objectId';
  }

  if (!Number.isInteger(Number(objectId))) {
    return 'objectId должен быть целым числом';
  }

  const object = getObjectById(Number(objectId));

  if (!object) {
    return 'Объект не найден';
  }

  const dateCheck = validateDate(date);

  if (!dateCheck.ok) {
    return dateCheck.error;
  }

  if (!Number.isInteger(hours) || hours < MIN_BOOKING_HOURS) {
    return `Минимум ${MIN_BOOKING_HOURS} час`;
  }

  if (hours > MAX_BOOKING_HOURS) {
    return `Максимум ${MAX_BOOKING_HOURS} часов`;
  }

  if (!Number.isInteger(guests) || guests < 1) {
    return 'Минимум 1 гость';
  }

  if (guests > object.capacity) {
    return 'Превышена вместимость';
  }

  if (!Number.isInteger(cars) || cars < 0) {
    return 'Некорректное число машин';
  }

  if (cars > object.parkingCapacity) {
    return 'Превышено количество мест на парковке';
  }

  if (!isSlotAvailable(objectId, date)) {
    return 'Слот уже занят';
  }

  return null;
}

/**
 * Проверяет входные данные и превращает их в типизированное исключение.
 * @param {object} input — objectId, date, hours, guests, cars
 * @returns {void}
 * @throws {NotFoundError} если объект не найден
 * @throws {ConflictError} если слот уже занят
 * @throws {ValidationError} по любой другой причине
 */
function assertBookingInput(input) {
  const error = validateBookingInput(input);

  if (error === null) {
    return;
  }

  if (error === 'Объект не найден') {
    throw new NotFoundError(error);
  }

  if (error === 'Слот уже занят') {
    throw new ConflictError(error);
  }

  throw new ValidationError(error);
}

/**
 * Создаёт бронь в статусе pending.
 * @param {object} input — objectId, date, hours, guests, cars
 * @returns {{ok: true, booking: object}}
 * @throws {ValidationError} если данные не прошли валидацию
 * @throws {ConflictError} если слот уже занят
 */
function createBooking(input) {
  assertBookingInput(input);

  // objectId приходит из JSON и может прийти строкой — приводим к числу,
  // иначе SQLite сохранил бы '2' текстом вместо 2.
  const objectId = Number(input.objectId);
  const { date, hours, guests, cars } = input;
  const totalPrice = calcPrice(objectId, hours, date);

  const insert = db.prepare(
    `INSERT INTO bookings
      (object_id, date, hours, guests, cars, total_price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const select = db.prepare('SELECT * FROM bookings WHERE id = ?');

  // Проверка занятости и вставка идут в одной транзакции: два параллельных
  // запроса не смогут занять один и тот же слот.
  const create = db.transaction(() => {
    const info = insert.run(
      objectId,
      date,
      hours,
      guests,
      cars,
      totalPrice,
      BOOKING_STATUS.PENDING,
    );

    return select.get(info.lastInsertRowid);
  });

  return { ok: true, booking: create() };
}

/**
 * Возвращает список броней с необязательными фильтрами.
 * @param {{status?: string, date?: string, objectId?: number}} [filters]
 * @returns {object[]}
 */
function getBookings({ status, date, objectId } = {}) {
  const conditions = ['1=1'];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (date) {
    conditions.push('date = ?');
    params.push(date);
  }

  if (objectId !== undefined && objectId !== null && objectId !== '') {
    conditions.push('object_id = ?');
    params.push(Number(objectId));
  }

  const sql = `SELECT * FROM bookings WHERE ${conditions.join(' AND ')} ORDER BY date, id`;

  return db.prepare(sql).all(...params);
}

/**
 * Возвращает бронь по идентификатору либо null.
 * @param {number} id
 * @returns {object|null}
 */
function getBookingById(id) {
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) || null;
}

/**
 * Меняет статус брони.
 * @param {number} id — идентификатор брони
 * @param {string} status — новое значение из BOOKING_STATUS
 * @returns {{ok: true, booking: object}}
 * @throws {ValidationError} при неизвестном статусе
 * @throws {NotFoundError} если брони нет
 */
function setStatus(id, status) {
  if (!Object.values(BOOKING_STATUS).includes(status)) {
    throw new ValidationError('Некорректный статус');
  }

  const info = db
    .prepare('UPDATE bookings SET status = ? WHERE id = ?')
    .run(status, id);

  if (info.changes === 0) {
    throw new NotFoundError('Бронь не найдена');
  }

  return { ok: true, booking: getBookingById(id) };
}

/**
 * Отменяет бронь, если она ещё не была завершена.
 * @param {number} id — идентификатор брони
 * @returns {{ok: true, booking: object}}
 * @throws {ConflictError} если бронь в статусе completed
 * @throws {NotFoundError} если брони нет
 */
function cancelBooking(id) {
  const booking = getBookingById(id);

  if (!booking) {
    throw new NotFoundError('Бронь не найдена');
  }

  if (booking.status === BOOKING_STATUS.COMPLETED) {
    throw new ConflictError('Завершённую бронь отменить нельзя');
  }

  return setStatus(id, BOOKING_STATUS.CANCELLED);
}

/**
 * Считает выручку и количество броней по статусу.
 * @param {string} [status] — статус из BOOKING_STATUS
 * @returns {{total: number, count: number}}
 */
function getRevenueByStatus(status) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(total_price), 0) AS total, COUNT(*) AS count
       FROM bookings WHERE status = ?`,
    )
    .get(status || BOOKING_STATUS.PAID);

  return { total: row.total, count: row.count };
}

/**
 * Возвращает срез статистики для дашборда директора.
 * @returns {{total: number, byStatus: object, revenue: number}}
 */
function getDashboardSummary() {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS count FROM bookings GROUP BY status')
    .all();

  const byStatus = Object.fromEntries(Object.values(BOOKING_STATUS).map((s) => [s, 0]));

  for (const row of rows) {
    byStatus[row.status] = row.count;
  }

  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    byStatus,
    revenue: getRevenueByStatus(BOOKING_STATUS.PAID).total,
  };
}

/**
 * Готовит цену и коэффициент для показа в форме бронирования.
 * @param {number} objectId
 * @param {number} hours
 * @param {string} date — YYYY-MM-DD
 * @returns {{totalPrice: number, seasonCoefficient: number}}
 * @throws {ValidationError} при некорректных часах или дате
 */
function getPriceQuote(objectId, hours, date) {
  const dateCheck = validateDate(date);

  if (!dateCheck.ok) {
    throw new ValidationError(dateCheck.error);
  }

  const hoursNumber = Number(hours);
  const hoursInRange =
    Number.isInteger(hoursNumber) &&
    hoursNumber >= MIN_BOOKING_HOURS &&
    hoursNumber <= MAX_BOOKING_HOURS;

  if (!hoursInRange) {
    throw new ValidationError(
      `Количество часов должно быть от ${MIN_BOOKING_HOURS} до ${MAX_BOOKING_HOURS}`,
    );
  }

  return {
    totalPrice: calcPrice(objectId, hoursNumber, date),
    seasonCoefficient: getSeasonCoefficient(date),
  };
}

export {
  MAX_BOOKING_HOURS,
  MIN_BOOKING_HOURS,
  MAX_DAYS_AHEAD,
  validateDate,
  isSlotAvailable,
  getSeasonCoefficient,
  calcPrice,
  validateBookingInput,
  assertBookingInput,
  createBooking,
  getBookings,
  getBookingById,
  setStatus,
  cancelBooking,
  getRevenueByStatus,
  getDashboardSummary,
  getPriceQuote,
};

// src/services/bookingService.js — логика бронирования и расчёта цены
const { db } = require('../db');
const { getObjectById } = require('./objectService');

const BOOKING_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const MAX_BOOKING_HOURS = 12;
const MIN_BOOKING_HOURS = 1;
const MAX_DAYS_AHEAD = 90;

function validateDate(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  if (!y || !m || !d) return { ok: false, error: 'Некорректная дата' };
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (target < today) return { ok: false, error: 'Дата уже прошла' };

  const MS_PER_DAY = 86400000;
  const diffDays = Math.round((target - today) / MS_PER_DAY);
  if (diffDays > MAX_DAYS_AHEAD) return { ok: false, error: 'Дата слишком далеко' };
  return { ok: true };
}

function isSlotAvailable(objectId, date) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM bookings
       WHERE object_id = ? AND date = ? AND status != ?`
    )
    .get(objectId, date, BOOKING_STATUS.CANCELLED);
  return row.cnt === 0;
}

function getSeasonCoefficient(date) {
  const month = new Date(date + 'T00:00:00').getMonth() + 1;
  if (month >= 6 && month <= 8) return 1.2;
  if (month === 5 || month === 9) return 1.0;
  return 0.8;
}

function calcPrice(objectId, hours, date) {
  const object = getObjectById(objectId);
  if (!object) throw new Error('Объект не найден');
  const coef = getSeasonCoefficient(date);
  return Math.round(object.pricePerHour * hours * coef);
}

function validateBookingInput({ objectId, date, hours, guests, cars }) {
  const object = getObjectById(objectId);
  if (!object) return 'Объект не найден';

  const d = validateDate(date);
  if (!d.ok) return d.error;

  if (!Number.isInteger(hours) || hours < MIN_BOOKING_HOURS) return 'Минимум 1 час';
  if (hours > MAX_BOOKING_HOURS) return 'Максимум 12 часов';

  if (!Number.isInteger(guests) || guests < 1) return 'Минимум 1 гость';
  if (guests > object.capacity) return 'Превышена вместимость';

  if (!Number.isInteger(cars) || cars < 0) return 'Некорректное число машин';
  if (cars > object.parkingCapacity) return 'Некорректное число машин';

  if (!isSlotAvailable(objectId, date)) return 'Слот уже занят';

  return null;
}

function createBooking(input) {
  const error = validateBookingInput(input);
  if (error) return { ok: false, error };

  const totalPrice = calcPrice(input.objectId, input.hours, input.date);

  const info = db
    .prepare(
      `INSERT INTO bookings
        (object_id, date, hours, guests, cars, total_price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.objectId,
      input.date,
      input.hours,
      input.guests,
      input.cars,
      totalPrice,
      BOOKING_STATUS.PENDING
    );

  const booking = db
    .prepare('SELECT * FROM bookings WHERE id = ?')
    .get(info.lastInsertRowid);

  return { ok: true, booking };
}

function listBookings({ status, date } = {}) {
  let sql = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (date)   { sql += ' AND date = ?';   params.push(date); }
  sql += ' ORDER BY date, id';
  return db.prepare(sql).all(...params);
}

function setStatus(id, status) {
  if (!Object.values(BOOKING_STATUS).includes(status)) {
    return { ok: false, error: 'Некорректный статус' };
  }
  const info = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
  if (info.changes === 0) return { ok: false, error: 'Бронь не найдена' };
  return { ok: true, booking: db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) };
}

module.exports = {
  BOOKING_STATUS,
  MAX_BOOKING_HOURS,
  MIN_BOOKING_HOURS,
  MAX_DAYS_AHEAD,
  validateDate,
  isSlotAvailable,
  getSeasonCoefficient,
  calcPrice,
  validateBookingInput,
  createBooking,
  listBookings,
  setStatus,
};

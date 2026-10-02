// src/services/objectService.js — выборка объектов парка и их занятость.
import { db } from '../db.js';

/**
 * Приводит строку таблицы objects к формату, который отдаёт наружу API.
 * @param {object|null} row — строка БД
 * @returns {object|null}
 */
function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    type: row.type,
    name: row.name,
    capacity: row.capacity,
    pricePerHour: row.price_per_hour,
    parkingCapacity: row.parking_capacity,
    position: { x: row.x, y: row.y },
  };
}

/**
 * Возвращает список объектов с необязательным фильтром по типу.
 * @param {string} [type] — gazebo | tent | parking
 * @returns {object[]}
 */
function getAllObjects(type) {
  const rows = type
    ? db.prepare('SELECT * FROM objects WHERE type = ? ORDER BY id').all(type)
    : db.prepare('SELECT * FROM objects ORDER BY id').all();

  return rows.map(mapRow);
}

/**
 * Возвращает один объект по идентификатору либо null.
 * @param {number} id
 * @returns {object|null}
 */
function getObjectById(id) {
  return mapRow(db.prepare('SELECT * FROM objects WHERE id = ?').get(id));
}

/**
 * Возвращает занятость объектов на дату.
 * Отменённые брони не учитываются, поэтому слот считается свободным.
 * @param {string} date — YYYY-MM-DD
 * @returns {Map<number, boolean>} objectId -> занят
 */
function getOccupancyForDate(date) {
  const rows = db
    .prepare(
      `SELECT object_id, COUNT(*) AS cnt FROM bookings
       WHERE date = ? AND status != 'cancelled'
       GROUP BY object_id`,
    )
    .all(date);

  const occupancy = new Map();

  for (const row of rows) {
    occupancy.set(row.object_id, row.cnt > 0);
  }

  return occupancy;
}

export { mapRow, getAllObjects, getObjectById, getOccupancyForDate };

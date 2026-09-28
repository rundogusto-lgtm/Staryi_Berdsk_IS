// src/services/objectService.js — работа с объектами парка
const { db } = require('../db');

function mapRow(row) {
  if (!row) return null;
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

function getAllObjects(type) {
  const sql = type
    ? 'SELECT * FROM objects WHERE type = ? ORDER BY id'
    : 'SELECT * FROM objects ORDER BY id';
  const rows = type ? db.prepare(sql).all(type) : db.prepare(sql).all();
  return rows.map(mapRow);
}

function getObjectById(id) {
  const row = db.prepare('SELECT * FROM objects WHERE id = ?').get(id);
  return mapRow(row);
}

module.exports = { getAllObjects, getObjectById };

// src/db.js — слой доступа к данным (SQLite)
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'park.db');
const OBJECTS_JSON = path.join(__dirname, '..', 'data', 'objects.json');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS objects (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('gazebo','tent','parking')),
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      price_per_hour INTEGER NOT NULL,
      parking_capacity INTEGER NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      object_id INTEGER NOT NULL REFERENCES objects(id),
      date TEXT NOT NULL,
      hours INTEGER NOT NULL,
      guests INTEGER NOT NULL,
      cars INTEGER NOT NULL,
      total_price INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_object_date
      ON bookings (object_id, date);
  `);
}

function seed() {
  const raw = fs.readFileSync(OBJECTS_JSON, 'utf-8');
  const { objects } = JSON.parse(raw);
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO objects
      (id, type, name, capacity, price_per_hour, parking_capacity, x, y)
    VALUES (@id, @type, @name, @capacity, @pricePerHour, @parkingCapacity, @x, @y)
  `);
  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)));
  tx(objects);
  console.log(`Сид выполнен: ${objects.length} объектов.`);
}

if (require.main === module && process.argv.includes('--seed')) {
  migrate();
  seed();
}

module.exports = { db, migrate, seed };

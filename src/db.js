// src/db.js — слой доступа к данным (SQLite): схема, миграции и сид.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Тесты выставляют TEST_DB, чтобы не писать в боевую базу data/park.db.
const DB_PATH = process.env.TEST_DB || path.join(__dirname, '..', 'data', 'park.db');
const OBJECTS_JSON = path.join(__dirname, '..', 'data', 'objects.json');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Создаёт таблицы и индексы, если их ещё нет. Идемпотентна.
 * @returns {void}
 */
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

/**
 * Загружает справочник объектов из data/objects.json.
 * Выполняется в одной транзакции, повторный запуск обновляет существующие строки.
 * @returns {void}
 */
function seed() {
  const raw = fs.readFileSync(OBJECTS_JSON, 'utf-8');
  const { objects } = JSON.parse(raw);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO objects
      (id, type, name, capacity, price_per_hour, parking_capacity, x, y)
    VALUES (@id, @type, @name, @capacity, @pricePerHour, @parkingCapacity, @x, @y)
  `);

  db.transaction((rows) => rows.forEach((row) => stmt.run(row)))(objects);

  console.log(`Сид выполнен: ${objects.length} объектов.`);
}

export { db, migrate, seed };

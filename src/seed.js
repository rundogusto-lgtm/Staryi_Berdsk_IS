// src/seed.js — создаёт схему и загружает справочник объектов.
// Запуск: npm run seed
import { migrate, seed } from './db.js';

migrate();
seed();

// src/server.js — точка входа: Express-сервер, REST API и отдача фронтенда.
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { migrate } from './db.js';
import objectsRouter from './routes/objects.js';
import bookingsRouter from './routes/bookings.js';
import { errorHandler, notFoundHandler } from './middleware/asyncHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

migrate();

const app = express();

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/objects', objectsRouter);
app.use('/api/bookings', bookingsRouter);

// Всё, что начинается с /api, но не совпало с маршрутами, — ошибка 404.
// Остальные пути отдаёт статика, чтобы работали SPA-адреса вида /admin.
app.use('/api', notFoundHandler);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Сервер «Старый Бердск» запущен: http://localhost:${PORT}`);
});

export { app };

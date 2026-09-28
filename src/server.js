// src/server.js — точка входа, Express-сервер и REST API
const express = require('express');
const { migrate } = require('./db');
const objectsRouter = require('./routes/objects');
const bookingsRouter = require('./routes/bookings');

const PORT = process.env.PORT || 3000;

migrate();

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/objects', objectsRouter);
app.use('/api/bookings', bookingsRouter);

app.use((req, res) => res.status(404).json({ error: 'Не найдено' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`Сервер «Старый Бердск» запущен: http://localhost:${PORT}`);
});

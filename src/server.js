// src/server.js — точка входа: запускает HTTP-сервер на настроенном порту.
// Само приложение собрано в app.js, чтобы его можно было тестировать
// без открытия сетевого сокета.
import { app } from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Сервер «Старый Бердск» запущен: http://localhost:${PORT}`);
});
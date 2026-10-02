// src/middleware/asyncHandler.js — обёртка, передающая исключения в errorHandler.
// Express 4 не ловит отказы промисов сам, поэтому каждый async-обработчик
// оборачивается этой функцией.
import { ApiError } from '../exceptions.js';

/**
 * Оборачивает async-обработчик так, чтобы его отказ уходил в next().
 * @param {(req: object, res: object, next: Function) => Promise<void>} handler
 * @returns {(req: object, res: object, next: Function) => void}
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Централизованный обработчик ошибок API.
 * Типизированные ошибки отдают свой код и текст, остальное — 500.
 * @param {unknown} error
 * @param {object} req
 * @param {object} res
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (error instanceof ApiError) {
    res.status(error.status || 500).json({ error: error.message });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

/**
 * Обработчик для неизвестных маршрутов.
 * @returns {void}
 */
function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Маршрут не найден' });
}

export { asyncHandler, errorHandler, notFoundHandler };

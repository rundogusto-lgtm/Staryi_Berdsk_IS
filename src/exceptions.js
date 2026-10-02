// src/exceptions.js — классы исключений приложения и нормализация ошибок.
// Модуль работает и в Node (сервер), и в браузере (ES-модуль), поэтому
// здесь нет ничего кроме классов и чистых функций.

/** Ошибка запроса к API: сеть недоступна, ответ не распарсился, код не 2xx. */
class ApiError extends Error {
  /**
   * @param {string} message — текст для пользователя
   * @param {number} [status] — HTTP-код ответа, 0 если сеть недоступна
   */
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Входные данные не прошли валидацию на сервере. */
class ValidationError extends ApiError {
  /**
   * @param {string} message — причина отклонения
   */
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

/** Объект парка не найден или недоступен для операции. */
class NotFoundError extends ApiError {
  /**
   * @param {string} message — что именно не найдено
   */
  constructor(message) {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/** Бизнес-ошибка: слот занят, нельзя удалить объект из заказа и т.п. */
class ConflictError extends ApiError {
  /**
   * @param {string} message — причина конфликта
   */
  constructor(message) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * Превращает любую ошибку в объект, пригодный для показа пользователю.
 * @param {unknown} error — перехваченная ошибка
 * @returns {{title: string, text: string, kind: 'error'|'warning'|'info'}} диалог
 */
function toUserMessage(error) {
  if (error instanceof ConflictError) {
    return {
      title: 'Действие недоступно',
      text: `${error.message}. Выберите другой объект или дату.`,
      kind: 'warning',
    };
  }

  if (error instanceof ValidationError) {
    return {
      title: 'Ошибка ввода',
      text: `${error.message}. Проверьте заполненные поля и повторите попытку.`,
      kind: 'warning',
    };
  }

  if (error instanceof NotFoundError) {
    return {
      title: 'Объект не найден',
      text: `${error.message}. Обновите страницу — данные могли измениться.`,
      kind: 'warning',
    };
  }

  if (error instanceof ApiError) {
    if (error.status === 0) {
      return {
        title: 'Нет связи с сервером',
        text: 'Проверьте, запущен ли сервер командой «npm start», и повторите попытку.',
        kind: 'error',
      };
    }

    return {
      title: 'Ошибка сервера',
      text: `${error.message}. Повторите попытку или обратитесь к администратору.`,
      kind: 'error',
    };
  }

  return {
    title: 'Непредвиденная ошибка',
    text: 'Действие не выполнено. Подробности — в консоли браузера.',
    kind: 'error',
  };
}

/**
 * Выполняет операцию и всегда возвращает нормализованный результат.
 * Вызывающий код получает { ok, data } или { ok: false, message }
 * и не оборачивает вызов в собственный try/catch.
 * @template T
 * @param {() => Promise<T>} operation — асинхронная операция
 * @returns {Promise<{ok: true, data: T} | {ok: false, message: object}>}
 */
async function guard(operation) {
  try {
    const data = await operation();
    return { ok: true, data };
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error(error);
    }

    return { ok: false, message: toUserMessage(error) };
  }
}

export { ApiError, ValidationError, NotFoundError, ConflictError, toUserMessage, guard };

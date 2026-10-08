// src/public/api.js — обёртка над REST API и разбор ошибок.
// Единственное место, где фронтенд ходит на сервер.

const API_BASE = '/api';

/** Границы бронирования: синхронизированы с серверными MIN/MAX_BOOKING_HOURS. */
const MIN_BOOKING_HOURS = 1;
const MAX_BOOKING_HOURS = 12;

/**
 * Выполняет запрос и возвращает распарсенный JSON.
 * @param {string} path — путь относительно /api
 * @param {{method?: string, body?: object}} [options]
 * @returns {Promise<any>}
 * @throws {Error} с полями status и message при неуспешном ответе
 */
async function request(path, options = {}) {
  const { method = 'GET', body } = options;

  let response;

  try {
    response = await fetch(API_BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    // fetch отклоняется только при обрыве сети — это отдельный сценарий,
    // его нельзя смешивать с HTTP-ошибками.
    const error = new Error('Нет связи с сервером. Проверьте, запущен ли «npm start».');
    error.status = 0;
    throw error;
  }

  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload.error || `Ошибка ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

/**
 * Загружает объекты, при наличии date помечает занятые слоты.
 * @param {{type?: string, date?: string}} [filters]
 * @returns {Promise<object[]>}
 */
async function fetchObjects(filters = {}) {
  const params = new URLSearchParams();

  if (filters.type) {
    params.set('type', filters.type);
  }

  if (filters.date) {
    params.set('date', filters.date);
  }

  const suffix = params.toString() ? `?${params}` : '';
  const { objects } = await request(`/objects${suffix}`);

  return objects;
}

/**
 * Загружает брони с необязательными фильтрами.
 * @param {{status?: string, date?: string, objectId?: number|string}} [filters]
 * @returns {Promise<object[]>}
 */
async function fetchBookings(filters = {}) {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set('status', filters.status);
  }

  if (filters.date) {
    params.set('date', filters.date);
  }

  if (filters.objectId) {
    params.set('objectId', String(filters.objectId));
  }

  const suffix = params.toString() ? `?${params}` : '';
  const { bookings } = await request(`/bookings${suffix}`);

  return bookings;
}

/**
 * Создаёт бронь.
 * @param {{objectId: number, date: string, hours: number, guests: number, cars: number}} input
 * @returns {Promise<object>}
 */
async function createBooking(input) {
  return request('/bookings', { method: 'POST', body: input });
}

/**
 * Меняет статус брони.
 * @param {number} id
 * @param {string} status
 * @returns {Promise<object>}
 */
async function setBookingStatus(id, status) {
  return request(`/bookings/${id}/status`, { method: 'PATCH', body: { status } });
}

/**
 * Отменяет бронь.
 * @param {number} id
 * @returns {Promise<object>}
 */
async function cancelBooking(id) {
  return request(`/bookings/${id}`, { method: 'DELETE' });
}

/**
 * Считает цену без создания брони.
 * @param {{objectId: number, hours: number, date: string}} input
 * @returns {Promise<{totalPrice: number, seasonCoefficient: number}>}
 */
async function fetchPriceQuote(input) {
  return request('/bookings/quote', { method: 'POST', body: input });
}

/**
 * Возвращает срез статистики для дашборда.
 * @returns {Promise<{total: number, byStatus: object, revenue: number}>}
 */
async function fetchSummary() {
  return request('/bookings/summary');
}

/**
 * Загружает справочник объектов как Map id -> объект.
 * При недоступности сервера возвращает пустой Map, чтобы таблицы
 * строились по ID вместо падения (graceful degradation).
 * @returns {Promise<Map<number, object>>}
 */
async function fetchObjectsById() {
  try {
    const objects = await fetchObjects();
    return new Map(objects.map((object) => [object.id, object]));
  } catch {
    return new Map();
  }
}

/**
 * Возвращает название объекта по его ID.
 * @param {Map<number, object>} objectsById — справочник из fetchObjectsById
 * @param {number} objectId
 * @returns {string}
 */
function objectName(objectsById, objectId) {
  const object = objectsById.get(objectId);
  return object ? object.name : `Объект #${objectId}`;
}

export {
  MIN_BOOKING_HOURS,
  MAX_BOOKING_HOURS,
  request,
  fetchObjects,
  fetchObjectsById,
  objectName,
  fetchBookings,
  createBooking,
  setBookingStatus,
  cancelBooking,
  fetchPriceQuote,
  fetchSummary,
};

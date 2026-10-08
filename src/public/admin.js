// src/public/admin.js — панель администратора: список броней, смена статусов, отмена.

import {
  fetchBookings,
  setBookingStatus,
  cancelBooking,
  fetchObjectsById,
  objectName,
} from './api.js';
import {
  STATUS_LABELS,
  showToast,
  formatMoney,
  formatDate,
  createEl,
  fillTable,
} from './ui.js';

/**
 * Действия, доступные в зависимости от текущего статуса.
 * Завершённую бронь нельзя ни подтвердить, ни отменить.
 */
const TRANSITIONS = {
  pending: [
    { label: 'Подтвердить оплату', next: 'paid', className: 'btn btn--primary' },
    { label: 'Отклонить', next: 'cancelled', className: 'btn btn--danger' },
  ],
  paid: [
    { label: 'Активировать', next: 'active', className: 'btn btn--primary' },
    { label: 'Вернуть в ожидание', next: 'pending', className: 'btn btn--ghost' },
  ],
  active: [{ label: 'Завершить', next: 'completed', className: 'btn btn--primary' }],
  completed: [],
  cancelled: [{ label: 'Восстановить', next: 'pending', className: 'btn btn--ghost' }],
};

const dom = {};
let bookings = [];
let objectsById = new Map();

const handlers = {
  onChanged: () => {},
};

/**
 * Загружает справочник объектов, чтобы показывать названия вместо ID.
 * @returns {Promise<void>}
 */
async function loadObjects() {
  objectsById = await fetchObjectsById();
}

/**
 * Меняет статус брони и сообщает о результате.
 * @param {number} id
 * @param {string} next — новый статус
 * @returns {Promise<void>}
 */
async function changeStatus(id, next) {
  try {
    const booking = await setBookingStatus(id, next);
    showToast({
      title: 'Статус изменён',
      text: `Бронь #${booking.id}: ${STATUS_LABELS[booking.status]}.`,
      kind: 'success',
    });
    await reload();
    handlers.onChanged();
  } catch (error) {
    showToast({ title: 'Не удалось изменить статус', text: error.message, kind: 'error' });
  }
}

/**
 * Отменяет бронь.
 * @param {number} id
 * @returns {Promise<void>}
 */
async function handleCancel(id) {
  try {
    const booking = await cancelBooking(id);
    showToast({
      title: 'Бронь отменена',
      text: `Бронь #${booking.id} освободила слот.`,
      kind: 'success',
    });
    await reload();
    handlers.onChanged();
  } catch (error) {
    showToast({ title: 'Не удалось отменить бронь', text: error.message, kind: 'error' });
  }
}

/**
 * Собирает ячейку кнопок для строки.
 * @param {object} booking
 * @returns {HTMLElement}
 */
function buildActions(booking) {
  const cell = createEl('td');
  const wrapper = createEl('div', 'cell-actions');

  for (const transition of TRANSITIONS[booking.status] || []) {
    const button = createEl('button', transition.className, transition.label);
    button.type = 'button';
    button.addEventListener('click', () => changeStatus(booking.id, transition.next));
    wrapper.appendChild(button);
  }

  if (booking.status !== 'completed' && booking.status !== 'cancelled') {
    const button = createEl('button', 'btn btn--ghost', 'Отмена');
    button.type = 'button';
    button.addEventListener('click', () => handleCancel(booking.id));
    wrapper.appendChild(button);
  }

  cell.appendChild(wrapper);

  return cell;
}

/**
 * Собирает строку таблицы для брони.
 * @param {object} booking
 * @returns {HTMLTableRowElement}
 */
function buildRow(booking) {
  const row = document.createElement('tr');
  row.className = booking.status === 'active' ? 'row--active' : '';

  const cells = [
    String(booking.id),
    objectName(objectsById, booking.object_id),
    formatDate(booking.date),
    `${booking.hours} ч`,
    String(booking.guests),
    formatMoney(booking.total_price),
  ];

  for (const value of cells) {
    row.appendChild(createEl('td', '', value));
  }

  const statusCell = createEl('td');
  statusCell.appendChild(
    createEl('span', `badge badge--${booking.status}`, STATUS_LABELS[booking.status]),
  );
  row.appendChild(statusCell);
  row.appendChild(buildActions(booking));

  return row;
}

/**
 * Применяет поиск по названию объекта и рендерит таблицу.
 * @returns {void}
 */
function render() {
  const query = dom.search.value.trim().toLowerCase();
  const visible = query
    ? bookings.filter((booking) =>
        objectName(objectsById, booking.object_id).toLowerCase().includes(query),
      )
    : bookings;

  fillTable(dom.tbody, visible.map(buildRow), 'Броней нет');
}

/**
 * Перезагружает брони с учётом фильтров и перерисовывает таблицу.
 * @returns {Promise<void>}
 */
async function reload() {
  const filters = {};

  if (dom.filterStatus.value) {
    filters.status = dom.filterStatus.value;
  }

  if (dom.filterDate.value) {
    filters.date = dom.filterDate.value;
  }

  try {
    bookings = await fetchBookings(filters);
  } catch (error) {
    showToast({ title: 'Не удалось загрузить брони', text: error.message, kind: 'error' });
    return;
  }

  render();
}

/**
 * Инициализирует модуль и навешивает фильтры.
 * @returns {Promise<void>}
 */
async function init() {
  dom.tbody = document.getElementById('adminTableBody');
  dom.filterStatus = document.getElementById('adminFilterStatus');
  dom.filterDate = document.getElementById('adminFilterDate');
  dom.search = document.getElementById('adminSearch');

  dom.filterStatus.addEventListener('change', reload);
  dom.filterDate.addEventListener('change', reload);
  dom.search.addEventListener('input', render);

  await loadObjects();
  await reload();
}

/**
 * Регистрирует колбэк «изменились данные брони».
 * @param {() => void} callback
 * @returns {void}
 */
function onBookingsChanged(callback) {
  handlers.onChanged = callback;
}

export { init, reload, onBookingsChanged };

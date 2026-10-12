// src/public/admin.js — панель администратора: статусы, фильтры, отмена.
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
 * Действия по статусам. Отмена — с inline-подтверждением прямо в строке.
 * Завершённую бронь нельзя ни подтвердить, ни отменить.
 */
const TRANSITIONS = {
  pending: [
    { label: 'Подтвердить', next: 'paid', className: 'btn btn--primary' },
  ],
  paid: [
    { label: 'Активировать', next: 'active', className: 'btn btn--primary' },
    { label: 'В ожидание', next: 'pending', className: 'btn btn--ghost' },
  ],
  active: [{ label: 'Завершить', next: 'completed', className: 'btn btn--primary' }],
  completed: [],
  cancelled: [{ label: 'Восстановить', next: 'pending', className: 'btn btn--ghost' }],
};

/** Максимальная задержка staggered reveal строк. */
const STAGGER_MS = 30;

const dom = {};
let bookings = [];
let objectsById = new Map();
/** ID брони, для которой открыто inline-подтверждение отмены. */
let confirmCancelId = null;

const handlers = {
  onChanged: () => {},
};

/**
 * Загружает справочник объектов для названий и фильтра.
 * @returns {Promise<void>}
 */
async function loadObjects() {
  objectsById = await fetchObjectsById();

  for (const object of objectsById.values()) {
    const option = document.createElement('option');
    option.value = String(object.id);
    option.textContent = object.name;
    dom.filterObject.appendChild(option);
  }
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
    confirmCancelId = null;
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
    confirmCancelId = null;
    await reload();
    handlers.onChanged();
  } catch (error) {
    showToast({ title: 'Не удалось отменить бронь', text: error.message, kind: 'error' });
  }
}

/**
 * Собирает inline-подтверждение отмены: «Точно отменить? Да / Нет».
 * Модалка не используется — подтверждение живёт прямо в строке.
 * @param {object} booking
 * @returns {HTMLElement}
 */
function buildConfirm(booking) {
  const cell = createEl('td');
  const wrapper = createEl('div', 'cell-actions');

  const question = createEl('span', 'muted', 'Точно отменить?');
  const yes = createEl('button', 'btn btn--confirm', 'Да');
  yes.type = 'button';
  yes.addEventListener('click', () => handleCancel(booking.id));

  const no = createEl('button', 'btn btn--ghost', 'Нет');
  no.type = 'button';
  no.addEventListener('click', () => {
    confirmCancelId = null;
    render();
  });

  wrapper.append(question, yes, no);
  cell.appendChild(wrapper);
  return cell;
}

/**
 * Собирает ячейку кнопок для строки.
 * @param {object} booking
 * @returns {HTMLElement}
 */
function buildActions(booking) {
  if (confirmCancelId === booking.id) {
    return buildConfirm(booking);
  }

  const cell = createEl('td');
  const wrapper = createEl('div', 'cell-actions');

  for (const transition of TRANSITIONS[booking.status] || []) {
    const button = createEl('button', transition.className, transition.label);
    button.type = 'button';
    button.addEventListener('click', () => changeStatus(booking.id, transition.next));
    wrapper.appendChild(button);
  }

  if (booking.status !== 'completed' && booking.status !== 'cancelled') {
    const button = createEl('button', 'btn btn--danger', 'Отмена');
    button.type = 'button';
    button.addEventListener('click', () => {
      confirmCancelId = booking.id;
      render();
    });
    wrapper.appendChild(button);
  }

  cell.appendChild(wrapper);
  return cell;
}

/**
 * Собирает строку таблицы для брони.
 * @param {object} booking
 * @param {number} index — для staggered reveal
 * @returns {HTMLTableRowElement}
 */
function buildRow(booking, index) {
  const row = document.createElement('tr');

  if (booking.status === 'active') {
    row.className = 'row--active';
  }

  row.style.animationDelay = `${Math.min(index, 20) * STAGGER_MS}ms`;

  const cells = [
    `#${booking.id}`,
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
 * Фильтрует по номеру брони и объекту, затем рендерит таблицу.
 * @returns {void}
 */
function render() {
  const query = dom.search.value.replace('#', '').trim();
  const objectId = dom.filterObject.value ? Number(dom.filterObject.value) : null;

  const visible = bookings
    .filter((booking) => (objectId ? booking.object_id === objectId : true))
    .filter((booking) => (query ? String(booking.id).includes(query) : true));

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

  if (dom.filterObject.value) {
    filters.objectId = dom.filterObject.value;
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
  dom.filterObject = document.getElementById('adminFilterObject');
  dom.search = document.getElementById('adminSearch');

  dom.filterStatus.addEventListener('change', reload);
  dom.filterDate.addEventListener('change', reload);
  dom.filterObject.addEventListener('change', reload);
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

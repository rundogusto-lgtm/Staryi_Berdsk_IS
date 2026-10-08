// src/public/ui.js — слой представления: уведомления, форматирование, мелкие DOM-хелперы.

/** Время жизни всплывающего уведомления в мс. */
const TOAST_TIMEOUT_MS = 4500;

/** Ширина заглушки «нет данных» по умолчанию — под самую широкую таблицу. */
const DEFAULT_EMPTY_COL_SPAN = 8;

/** Подписи статусов брони для всех экранов. */
const STATUS_LABELS = {
  pending: 'Ожидает оплаты',
  paid: 'Оплачено',
  active: 'Активна',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

/** Подписи типов объектов. */
const TYPE_LABELS = {
  gazebo: 'Беседка',
  tent: 'Палатка',
  parking: 'Парковка',
};

/**
 * Показывает всплывающее уведомление.
 * @param {{title: string, text?: string, kind?: 'success'|'info'|'warning'|'error'}} message
 * @param {number} [timeout] — время жизни в мс
 * @returns {void}
 */
function showToast(message, timeout = TOAST_TIMEOUT_MS) {
  const stack = document.getElementById('toastStack');

  if (!stack) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${message.kind || 'info'}`;

  const title = document.createElement('strong');
  title.textContent = message.title;

  toast.appendChild(title);

  if (message.text) {
    const text = document.createElement('p');
    text.textContent = message.text;
    toast.appendChild(text);
  }

  stack.appendChild(toast);
  setTimeout(() => toast.remove(), timeout);
}

/**
 * Форматирует число как «1 234 ₽».
 * @param {number} value
 * @returns {string}
 */
function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
}

/**
 * Форматирует дату YYYY-MM-DD в «15.07.2026».
 * @param {string} date
 * @returns {string}
 */
function formatDate(date) {
  const parts = String(date).split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : date;
}

/**
 * Возвращает сегодняшнюю дату в формате YYYY-MM-DD по местному времени.
 * toISOString() здесь не подходит: он даёт UTC и сдвигает дату на сутки.
 * @returns {string}
 */
function todayIso() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/**
 * Возвращает HTML-элемент с текстом и классами.
 * @param {string} tagName
 * @param {string} [className]
 * @param {string} [textContent]
 * @returns {HTMLElement}
 */
function createEl(tagName, className, textContent) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (textContent !== undefined) {
    element.textContent = textContent;
  }

  return element;
}

/**
 * Заполняет <tbody> строками или показывает заглушку «нет данных».
 * @param {HTMLElement} tbody — тело таблицы
 * @param {HTMLElement[]} rows — готовые строки
 * @param {string} [emptyText]
 * @param {number} [colCount] — ширина заглушки в колонках
 * @returns {void}
 */
function fillTable(tbody, rows, emptyText = 'Нет данных', colCount = DEFAULT_EMPTY_COL_SPAN) {
  tbody.replaceChildren();

  if (rows.length === 0) {
    const cell = createEl('td', 'empty', emptyText);
    cell.colSpan = colCount;
    tbody.appendChild(cell);
    return;
  }

  for (const row of rows) {
    tbody.appendChild(row);
  }
}

export {
  STATUS_LABELS,
  TYPE_LABELS,
  TOAST_TIMEOUT_MS,
  showToast,
  formatMoney,
  formatDate,
  todayIso,
  createEl,
  fillTable,
};

// src/public/director.js — дашборд директора: KPI, последние операции, печать чека.

import { fetchBookings, fetchSummary, fetchObjectsById, objectName } from './api.js';
import { STATUS_LABELS, showToast, formatMoney, formatDate, createEl, fillTable } from './ui.js';

const dom = {};
let bookings = [];
let objectsById = new Map();
let receiptBookingId = null;

/**
 * Загружает справочник объектов, чтобы показывать названия вместо ID.
 * @returns {Promise<void>}
 */
async function loadObjects() {
  objectsById = await fetchObjectsById();
}

/**
 * Рисует карточки KPI.
 * @param {{total: number, byStatus: object, revenue: number}} summary
 * @returns {void}
 */
function renderKpi(summary) {
  const cards = [
    { label: 'Всего броней', value: summary.total },
    { label: 'Ожидают оплаты', value: summary.byStatus.pending },
    { label: 'Оплачено', value: summary.byStatus.paid },
    { label: 'Активные', value: summary.byStatus.active },
    { label: 'Выручка', value: formatMoney(summary.revenue) },
  ];

  dom.kpi.replaceChildren();

  for (const card of cards) {
    const box = createEl('div', 'kpi__card');
    box.appendChild(createEl('span', '', card.label));
    box.appendChild(createEl('strong', '', String(card.value)));
    dom.kpi.appendChild(box);
  }
}

/**
 * Рисует таблицу последних операций.
 * @returns {void}
 */
function renderTable() {
  const rows = bookings.slice(0, 10).map((booking) => {
    const row = document.createElement('tr');
    const cells = [
      String(booking.id),
      objectName(objectsById, booking.object_id),
      formatDate(booking.date),
      formatMoney(booking.total_price),
    ];

    for (const value of cells) {
      row.appendChild(createEl('td', '', value));
    }

    const statusCell = createEl('td');

    const button = createEl(
      'button',
      'btn btn--ghost',
      STATUS_LABELS[booking.status],
    );

    button.type = 'button';
    button.disabled = booking.status !== 'paid';
    button.title = booking.status === 'paid'
      ? 'Сформировать чек'
      : 'Чек доступен только для оплаченных броней';

    button.addEventListener('click', () => renderReceipt(booking.id));

    statusCell.appendChild(button);
    row.appendChild(statusCell);

    return row;
  });

  fillTable(dom.tbody, rows, 'Операций пока нет');
}

/**
 * Формирует чек по брони.
 * @param {number} bookingId
 * @returns {void}
 */
function renderReceipt(bookingId) {
  const booking = bookings.find((item) => item.id === bookingId);

  if (!booking) {
    return;
  }

  receiptBookingId = bookingId;
  dom.print.disabled = false;

  const lines = [
    ['Бронь', `#${booking.id}`],
    ['Объект', objectName(objectsById, booking.object_id)],
    ['Дата', formatDate(booking.date)],
    ['Часы', `${booking.hours} ч`],
    ['Гостей', String(booking.guests)],
    ['Машин', String(booking.cars)],
    ['Статус', STATUS_LABELS[booking.status]],
  ];

  dom.receiptBody.replaceChildren();

  for (const [term, value] of lines) {
    const line = createEl('div', 'receipt__line');
    line.appendChild(createEl('span', 'muted', term));
    line.appendChild(createEl('span', '', value));
    dom.receiptBody.appendChild(line);
  }

  const total = createEl('div', 'receipt__total');
  total.appendChild(createEl('span', '', 'Итого'));
  total.appendChild(createEl('span', '', formatMoney(booking.total_price)));
  dom.receiptBody.appendChild(total);
}

/**
 * Открывает диалог печати и печатает только блок чека.
 * Формат А4: CSS `@page { size: A4; margin: 12mm }` задаёт размер листа,
 * `data-print-hidden` скрывает всё, кроме чека (см. styles.css, день 13).
 * @returns {void}
 */
function handlePrint() {
  if (receiptBookingId === null) {
    return;
  }

  const previousTitle = document.title;
  document.title = `Чек №${receiptBookingId}`;

  const hidden = [...document.querySelectorAll('.topbar, .screen')]
    .filter((element) => !element.contains(dom.receiptBody));

  for (const element of hidden) {
    element.dataset.printHidden = 'true';
  }

  window.print();

  for (const element of hidden) {
    delete element.dataset.printHidden;
  }

  document.title = previousTitle;
}

/**
 * Перезагружает данные дашборда.
 * @returns {Promise<void>}
 */
async function reload() {
  try {
    const [summary, allBookings] = await Promise.all([fetchSummary(), fetchBookings()]);
    bookings = allBookings;
    renderKpi(summary);
    renderTable();
  } catch (error) {
    showToast({ title: 'Не удалось загрузить дашборд', text: error.message, kind: 'error' });
  }
}

/**
 * Инициализирует модуль.
 * @returns {Promise<void>}
 */
async function init() {
  dom.kpi = document.getElementById('kpi');
  dom.tbody = document.getElementById('directorTableBody');
  dom.receiptBody = document.getElementById('receiptBody');
  dom.print = document.getElementById('receiptPrint');

  dom.print.addEventListener('click', handlePrint);

  await loadObjects();
  await reload();
}

export { init, reload };

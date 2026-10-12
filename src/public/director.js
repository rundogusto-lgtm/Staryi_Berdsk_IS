// src/public/director.js — дашборд директора: KPI, график выручки, операции, чек.
import { fetchBookings, fetchSummary, fetchObjects, fetchObjectsById, objectName } from './api.js';
import { STATUS_LABELS, showToast, formatMoney, formatDate, createEl, todayIso } from './ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Глубина графика выручки в днях. */
const CHART_DAYS = 14;

/** Максимальное число операций в компактном списке. */
const RECENT_LIMIT = 8;

/** Задержка staggered reveal элементов списка. */
const STAGGER_MS = 30;

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
 * Создаёт SVG-элемент.
 * @param {string} tag
 * @param {object} attrs
 * @returns {SVGElement}
 */
function svgEl(tag, attrs) {
  const element = document.createElementNS(SVG_NS, tag);

  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }

  return element;
}

/**
 * Возвращает дату YYYY-MM-DD, сдвинутую на offset дней от сегодня.
 * @param {number} offset
 * @returns {string}
 */
function dayOffsetIso(offset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/**
 * Рисует KPI-карточки: выручка, брони, средний чек, загрузка объектов.
 * Средний чек — выручка / число оплаченных; загрузка — доля занятых сегодня.
 * @param {{total: number, byStatus: object, revenue: number}} summary
 * @param {number} occupancy — доля занятых объектов сегодня (0..1)
 * @returns {void}
 */
function renderKpi(summary, occupancy) {
  const paidCount = summary.byStatus.paid || 0;
  const average = paidCount > 0 ? Math.round(summary.revenue / paidCount) : 0;

  const cards = [
    { label: 'Выручка', value: formatMoney(summary.revenue), accent: true },
    { label: 'Брони', value: String(summary.total), accent: false },
    { label: 'Средний чек', value: formatMoney(average), accent: false },
    { label: 'Загрузка сегодня', value: `${Math.round(occupancy * 100)}%`, accent: false },
  ];

  dom.kpi.replaceChildren();

  for (const card of cards) {
    const box = createEl('div', card.accent ? 'kpi__card kpi__card--accent' : 'kpi__card');
    box.appendChild(createEl('span', '', card.label));
    box.appendChild(createEl('strong', '', card.value));
    dom.kpi.appendChild(box);
  }
}

/**
 * Рисует столбчатый SVG-график выручки за последние CHART_DAYS дней.
 * Учитываются оплаченные брони; пустые дни — нулевые столбцы.
 * @param {object[]} paidBookings — брони в статусе paid
 * @returns {void}
 */
function renderChart(paidBookings) {
  const chart = dom.chart;
  chart.replaceChildren();

  const days = [];
  const sums = new Map();

  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const iso = dayOffsetIso(-i);
    days.push(iso);
    sums.set(iso, 0);
  }

  for (const booking of paidBookings) {
    if (sums.has(booking.date)) {
      sums.set(booking.date, sums.get(booking.date) + booking.total_price);
    }
  }

  const values = days.map((day) => sums.get(day));
  const max = Math.max(...values, 1);
  const width = 560;
  const baseY = 158;
  const plotH = 128;
  const slot = (width - 16) / CHART_DAYS;
  const barW = Math.min(26, slot - 10);

  // Горизонтальная сетка.
  for (const fraction of [0.33, 0.66, 1]) {
    const y = baseY - plotH * fraction;
    chart.appendChild(svgEl('line', {
      x1: 8, y1: y, x2: width - 8, y2: y, class: 'chart__grid',
    }));
  }

  days.forEach((day, index) => {
    const value = values[index];
    const height = Math.max(value > 0 ? 3 : 0, (value / max) * plotH);
    const x = 8 + slot * index + (slot - barW) / 2;

    const bar = svgEl('rect', {
      x: x.toFixed(1),
      y: (baseY - height).toFixed(1),
      width: barW,
      height: height.toFixed(1),
      rx: 3,
      class: 'chart__bar',
    });

    const title = svgEl('title', {});
    title.textContent = `${formatDate(day)} — ${formatMoney(value)}`;
    bar.appendChild(title);
    chart.appendChild(bar);

    // Подписываем каждый второй день, чтобы не было тесно.
    if (index % 2 === 1) {
      const label = svgEl('text', {
        x: (8 + slot * index + slot / 2).toFixed(1),
        y: 178,
        'text-anchor': 'middle',
        class: 'chart__label',
      });
      label.textContent = formatDate(day).slice(0, 5);
      chart.appendChild(label);
    }
  });

  if (values.every((value) => value === 0)) {
    const label = svgEl('text', {
      x: width / 2, y: 80, 'text-anchor': 'middle', class: 'chart__label',
    });
    label.textContent = 'Пока нет оплаченных броней за период';
    chart.appendChild(label);
  }
}

/**
 * Рисует компактный список последних операций.
 * @returns {void}
 */
function renderRecent() {
  const list = dom.recent;
  list.replaceChildren();

  const recent = [...bookings].sort((a, b) => b.id - a.id).slice(0, RECENT_LIMIT);

  if (recent.length === 0) {
    const empty = createEl('li', 'ops-item muted', 'Операций пока нет');
    list.appendChild(empty);
    return;
  }

  recent.forEach((booking, index) => {
    const item = createEl('li', 'ops-item');
    item.style.animationDelay = `${Math.min(index, 20) * STAGGER_MS}ms`;

    const main = createEl('div', 'ops-item__main');
    main.appendChild(createEl(
      'div',
      'ops-item__title',
      `#${booking.id} · ${objectName(objectsById, booking.object_id)}`,
    ));
    main.appendChild(createEl(
      'div',
      'ops-item__sub',
      `${formatDate(booking.date)} · ${booking.hours} ч · ${STATUS_LABELS[booking.status]}`,
    ));

    item.appendChild(main);
    item.appendChild(createEl('div', 'ops-item__amount', formatMoney(booking.total_price)));

    const receiptBtn = createEl('button', 'btn btn--ghost', 'Чек');
    receiptBtn.type = 'button';
    receiptBtn.disabled = booking.status !== 'paid';
    receiptBtn.title = booking.status === 'paid'
      ? 'Сформировать чек'
      : 'Чек доступен только для оплаченных броней';
    receiptBtn.addEventListener('click', () => renderReceipt(booking.id));
    item.appendChild(receiptBtn);

    list.appendChild(item);
  });
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
    const [summary, allBookings, todayObjects] = await Promise.all([
      fetchSummary(),
      fetchBookings(),
      fetchObjects({ date: todayIso() }),
    ]);
    bookings = allBookings;

    const busy = todayObjects.filter((object) => object.busy === true).length;
    const occupancy = todayObjects.length > 0 ? busy / todayObjects.length : 0;

    renderKpi(summary, occupancy);
    renderChart(allBookings.filter((booking) => booking.status === 'paid'));
    renderRecent();
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
  dom.chart = document.getElementById('revenueChart');
  dom.recent = document.getElementById('directorRecentList');
  dom.receiptBody = document.getElementById('receiptBody');
  dom.print = document.getElementById('receiptPrint');

  dom.print.addEventListener('click', handlePrint);

  await loadObjects();
  await reload();
}

export { init, reload };

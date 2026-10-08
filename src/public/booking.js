// src/public/booking.js — карточка объекта, форма бронирования и расчёт цены.
// Модуль не ходит в API сам: всё общение делегировано api.js.

import { createBooking, fetchPriceQuote, MIN_BOOKING_HOURS, MAX_BOOKING_HOURS } from './api.js';
import { showToast, formatMoney, todayIso } from './ui.js';

const MIN_HOURS = MIN_BOOKING_HOURS;
const MAX_HOURS = MAX_BOOKING_HOURS;

const dom = {};
let currentObject = null;
let quoteTimer = null;

/** Отложенный пересчёт цены, чтобы не слать запрос на каждое нажатие клавиши. */
const QUOTE_DEBOUNCE_MS = 350;

/**
 * Заполняет панель данными выбранного объекта.
 * @param {object} parkObject — объект парка
 * @returns {void}
 */
function renderPanel(parkObject) {
  currentObject = parkObject;

  if (!parkObject) {
    dom.panel.hidden = true;
    return;
  }

  dom.panel.hidden = false;
  dom.panelTitle.textContent = parkObject.name;

  const typeLabel =
    parkObject.type === 'gazebo' ? 'Беседка' : parkObject.type === 'tent' ? 'Палатка' : 'Парковка';
  const info = [
    ['Тип', typeLabel],
    ['Вместимость', `${parkObject.capacity} чел.`],
    ['Мест для машин', parkObject.parkingCapacity],
    ['Цена за час', formatMoney(parkObject.pricePerHour)],
  ];

  dom.panelInfo.replaceChildren();

  for (const [term, value] of info) {
    const dt = document.createElement('dt');
    dt.textContent = term;

    const dd = document.createElement('dd');
    dd.textContent = String(value);

    dom.panelInfo.appendChild(dt);
    dom.panelInfo.appendChild(dd);
  }

  dom.objectId.value = String(parkObject.id);
  dom.date.value = dom.date.value || todayIso();
  dom.guests.max = String(parkObject.capacity);
  dom.cars.max = String(parkObject.parkingCapacity);
  refreshQuote();
}

/**
 * Запрашивает цену у сервера и выводит её в форму.
 * @returns {Promise<void>}
 */
async function refreshQuote() {
  const objectId = Number(dom.objectId.value);

  if (!objectId || !dom.date.value || !dom.hours.value) {
    dom.quote.textContent = 'Укажите дату и количество часов';
    return;
  }

  try {
    const quote = await fetchPriceQuote({
      objectId,
      hours: Number(dom.hours.value),
      date: dom.date.value,
    });

    const seasonNote = quote.seasonCoefficient > 1
      ? ' (летний коэффициент)'
      : quote.seasonCoefficient < 1
        ? ' (зимний коэффициент)'
        : '';

    dom.quote.textContent = `К оплате: ${formatMoney(quote.totalPrice)}${seasonNote}`;
  } catch (error) {
    dom.quote.textContent = error.message;
  }
}

/**
 * Ставит отложенный пересчёт цены.
 * @returns {void}
 */
function scheduleQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(refreshQuote, QUOTE_DEBOUNCE_MS);
}

/**
 * Отправляет форму бронирования.
 * @param {SubmitEvent} event
 * @returns {Promise<void>}
 */
async function handleSubmit(event) {
  event.preventDefault();

  const payload = {
    objectId: Number(dom.objectId.value),
    date: dom.date.value,
    hours: Number(dom.hours.value),
    guests: Number(dom.guests.value),
    cars: Number(dom.cars.value),
  };

  dom.submit.disabled = true;
  dom.submit.textContent = 'Создаём…';

  try {
    const booking = await createBooking(payload);
    showToast({
      title: 'Бронь создана',
      text: `${currentObject.name}, ${booking.date}. Ожидает оплаты.`,
      kind: 'success',
    });
    handlers.onCreated(booking);
  } catch (error) {
    const kind = error.status === 409 ? 'warning' : 'error';
    showToast({ title: 'Бронь не создана', text: error.message, kind });
  } finally {
    dom.submit.disabled = false;
    dom.submit.textContent = 'Забронировать';
  }
}

/** Колбэки, которые переустанавливает app.js. */
const handlers = {
  onCreated: () => {},
};

/**
 * Находит элементы формы и вешает слушатели.
 * @returns {void}
 */
function init() {
  dom.panel = document.getElementById('objectPanel');
  dom.panelTitle = document.getElementById('panelTitle');
  dom.panelInfo = document.getElementById('panelInfo');
  dom.panelClose = document.getElementById('panelClose');
  dom.form = document.getElementById('bookingForm');
  dom.objectId = document.getElementById('bookingObjectId');
  dom.date = document.getElementById('bookingDate');
  dom.hours = document.getElementById('bookingHours');
  dom.guests = document.getElementById('bookingGuests');
  dom.cars = document.getElementById('bookingCars');
  dom.quote = document.getElementById('priceQuote');
  dom.submit = document.getElementById('bookingSubmit');

  dom.hours.min = String(MIN_HOURS);
  dom.hours.max = String(MAX_HOURS);

  dom.form.addEventListener('submit', handleSubmit);
  dom.panelClose.addEventListener('click', () => renderPanel(null));

  for (const input of [dom.date, dom.hours]) {
    input.addEventListener('input', scheduleQuote);
  }
}

/**
 * Регистрирует колбэк «бронь создана».
 * @param {(booking: object) => void} callback
 * @returns {void}
 */
function onBookingCreated(callback) {
  handlers.onCreated = callback;
}

export { init, renderPanel, onBookingCreated };

// src/public/booking.js — карточка объекта, форма бронирования и живой расчёт цены.
// Модуль не ходит в API сам: всё общение делегировано api.js.
import { createBooking, fetchPriceQuote, MIN_BOOKING_HOURS, MAX_BOOKING_HOURS } from './api.js';
import { showToast, formatMoney, todayIso, TYPE_LABELS } from './ui.js';

const MIN_HOURS = MIN_BOOKING_HOURS;
const MAX_HOURS = MAX_BOOKING_HOURS;

const dom = {};
let currentObject = null;
let quoteTimer = null;
let quoteSeq = 0;
let shownPrice = null;

/** Отложенный пересчёт цены после движения слайдера. */
const QUOTE_DEBOUNCE_MS = 220;

/** Длительность анимации изменения числа — по ТЗ 200ms. */
const PRICE_ANIMATION_MS = 200;

/** Названия сезонов для строки расчёта. */
const SEASON_NAMES = { high: 'лето', low: 'зима', mid: 'межсезонье' };

/**
 * Определяет сезон по коэффициенту.
 * @param {number} coefficient
 * @returns {'high'|'mid'|'low'}
 */
function seasonOf(coefficient) {
  if (coefficient > 1) {
    return 'high';
  }

  if (coefficient < 1) {
    return 'low';
  }

  return 'mid';
}

/**
 * Показывает инлайн-ошибку под полем.
 * @param {HTMLElement} element
 * @param {string} message
 * @returns {void}
 */
function setError(element, message) {
  if (element) {
    element.textContent = message || '';
  }
}

/**
 * Плавно меняет отображаемую цену (counter animation, 200ms).
 * @param {number} target — итоговая цена
 * @returns {void}
 */
function animatePrice(target) {
  const from = shownPrice === null ? target : shownPrice;
  shownPrice = target;

  if (from === target || typeof requestAnimationFrame !== 'function') {
    dom.quote.textContent = formatMoney(target);
    return;
  }

  const startedAt = performance.now();

  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / PRICE_ANIMATION_MS);
    // Кастомная кривая вместо linear: быстрый старт, мягкое завершение.
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (target - from) * eased);
    dom.quote.textContent = formatMoney(current);

    if (progress < 1 && shownPrice === target) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

/**
 * Заполняет панель данными выбранного объекта.
 * @param {object|null} parkObject — объект парка
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
  dom.panelSub.textContent = `${TYPE_LABELS[parkObject.type] || ''} · ${formatMoney(parkObject.pricePerHour)}/ч`;

  const info = [
    ['Вместимость', `${parkObject.capacity} чел.`],
    ['Мест для машин', String(parkObject.parkingCapacity)],
    ['Тариф', `${formatMoney(parkObject.pricePerHour)} / час`],
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
  clearErrors();
  refreshQuote();
}

/**
 * Очищает все инлайн-ошибки формы.
 * @returns {void}
 */
function clearErrors() {
  setError(dom.dateError, '');
  setError(dom.hoursError, '');
  setError(dom.guestsError, '');
  setError(dom.carsError, '');
  setError(dom.formError, '');
}

/**
 * Проверяет введённые значения до запроса на сервер.
 * Ошибки — инлайн под полями, не тостами.
 * @returns {boolean} true, если данные корректны
 */
function validateLocal() {
  let valid = true;
  clearErrors();

  if (!currentObject) {
    setError(dom.formError, 'Выберите объект на карте.');
    return false;
  }

  if (!dom.date.value) {
    setError(dom.dateError, 'Выберите дату брони.');
    valid = false;
  }

  const hours = Number(dom.hours.value);

  if (!Number.isInteger(hours) || hours < MIN_HOURS || hours > MAX_HOURS) {
    setError(dom.hoursError, `От ${MIN_HOURS} до ${MAX_HOURS} часов.`);
    valid = false;
  }

  const guests = Number(dom.guests.value);

  if (!Number.isInteger(guests) || guests < 1) {
    setError(dom.guestsError, 'Минимум 1 гость.');
    valid = false;
  } else if (guests > currentObject.capacity) {
    setError(dom.guestsError, `Вместимость — ${currentObject.capacity} чел.`);
    valid = false;
  }

  const cars = Number(dom.cars.value);

  if (!Number.isInteger(cars) || cars < 0) {
    setError(dom.carsError, 'Не может быть отрицательным.');
    valid = false;
  } else if (cars > currentObject.parkingCapacity) {
    setError(dom.carsError, `Мест для машин — ${currentObject.parkingCapacity}.`);
    valid = false;
  }

  return valid;
}

/**
 * Запрашивает цену у сервера и выводит формулу расчёта.
 * Формат: «Базовый тариф × коэффициент (сезон) = итог».
 * @returns {Promise<void>}
 */
async function refreshQuote() {
  const objectId = Number(dom.objectId.value);
  const requestId = ++quoteSeq;

  if (!currentObject || !objectId || !dom.date.value || !dom.hours.value) {
    dom.priceBase.textContent = 'Укажите дату и часы';
    dom.quote.textContent = '—';
    shownPrice = null;
    return;
  }

  try {
    const quote = await fetchPriceQuote({
      objectId,
      hours: Number(dom.hours.value),
      date: dom.date.value,
    });

    // Отбрасываем устаревшие ответы: слайдер мог сдвинуться во время запроса.
    if (requestId !== quoteSeq) {
      return;
    }

    const season = SEASON_NAMES[seasonOf(quote.seasonCoefficient)] || '';
    dom.priceBase.textContent =
      `${formatMoney(currentObject.pricePerHour)} × ${dom.hours.value} ч × ${quote.seasonCoefficient} (${season})`;
    animatePrice(quote.totalPrice);
    setError(dom.formError, '');
  } catch (error) {
    if (requestId !== quoteSeq) {
      return;
    }

    dom.priceBase.textContent = 'Не удалось посчитать цену';
    dom.quote.textContent = '—';
    shownPrice = null;
    setError(dom.formError, error.message);
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

  if (!validateLocal()) {
    return;
  }

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
    // Серверную ошибку тоже показываем инлайн, а не тостом: контекст формы важнее.
    setError(dom.formError, error.message);
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
 * Привязывает степпер (+/−) к числовому полю.
 * @param {string} minusId
 * @param {string} plusId
 * @param {HTMLInputElement} input
 * @param {number} step
 * @returns {void}
 */
function bindStepper(minusId, plusId, input, step = 1) {
  const minus = document.getElementById(minusId);
  const plus = document.getElementById(plusId);

  minus.addEventListener('click', () => {
    input.value = String(Number(input.value || 0) - step);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  plus.addEventListener('click', () => {
    input.value = String(Number(input.value || 0) + step);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * Находит элементы формы и вешает слушатели.
 * @returns {void}
 */
function init() {
  dom.panel = document.getElementById('objectPanel');
  dom.panelTitle = document.getElementById('panelTitle');
  dom.panelSub = document.getElementById('panelSub');
  dom.panelInfo = document.getElementById('panelInfo');
  dom.panelClose = document.getElementById('panelClose');
  dom.form = document.getElementById('bookingForm');
  dom.objectId = document.getElementById('bookingObjectId');
  dom.date = document.getElementById('bookingDate');
  dom.dateError = document.getElementById('bookingDateError');
  dom.hours = document.getElementById('bookingHours');
  dom.hoursValue = document.getElementById('bookingHoursValue');
  dom.hoursError = document.getElementById('bookingHoursError');
  dom.guests = document.getElementById('bookingGuests');
  dom.guestsError = document.getElementById('bookingGuestsError');
  dom.cars = document.getElementById('bookingCars');
  dom.carsError = document.getElementById('bookingCarsError');
  dom.priceBase = document.getElementById('priceBase');
  dom.quote = document.getElementById('priceQuote');
  dom.formError = document.getElementById('bookingFormError');
  dom.submit = document.getElementById('bookingSubmit');

  dom.hours.min = String(MIN_HOURS);
  dom.hours.max = String(MAX_HOURS);

  dom.form.addEventListener('submit', handleSubmit);
  dom.panelClose.addEventListener('click', () => renderPanel(null));

  // Любое изменение параметра — мгновенный пересчёт цены.
  for (const input of [dom.date, dom.hours, dom.guests, dom.cars]) {
    input.addEventListener('input', () => {
      dom.hoursValue.textContent = String(dom.hours.value);
      scheduleQuote();
    });
  }

  bindStepper('hoursMinus', 'hoursPlus', dom.hours);
  bindStepper('guestsMinus', 'guestsPlus', dom.guests);
  bindStepper('carsMinus', 'carsPlus', dom.cars);
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

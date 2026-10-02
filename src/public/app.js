// src/public/app.js — точка входа фронтенда: инициализация модулей и роутинг экранов.
// Модули не знают друг о друге: связи сделаны через подписки map -> booking,
// booking/admin -> app, а app уже обновляет остальные экраны.

import * as map from './map.js';
import * as booking from './booking.js';
import * as admin from './admin.js';
import * as director from './director.js';
import { showToast, todayIso } from './ui.js';

const SCREENS = ['map', 'admin', 'director'];

const state = {
  screen: 'map',
  objects: [],
};

const dom = {};

/**
 * Показывает нужный экран и подсвечивает активную вкладку.
 * @param {string} name — имя экрана из SCREENS
 * @returns {void}
 */
function showScreen(name) {
  if (!SCREENS.includes(name)) {
    return;
  }

  state.screen = name;

  for (const screen of document.querySelectorAll('.screen')) {
    screen.hidden = screen.dataset.screen !== name;
  }

  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('tab--active', tab.dataset.screen === name);
  }

  window.location.hash = `#${name}`;
}

/**
 * Перезагружает карту и, если открыт админский экран, его таблицу.
 * Нужна после любой операции со слотом, чтобы цвет карты не устарел.
 * @returns {Promise<void>}
 */
async function refreshAll() {
  await map.reload();

  if (state.screen === 'admin') {
    await admin.reload();
  }

  if (state.screen === 'director') {
    await director.reload();
  }
}

/**
 * Валидация формы бронирования перед отправкой.
 * Сервер проверяет всё повторно, здесь — быстрый ответ пользователю.
 * @returns {string|null} текст ошибки или null
 */
function validateBookingForm() {
  const hours = Number(dom.bookingHours.value);
  const guests = Number(dom.bookingGuests.value);
  const cars = Number(dom.bookingCars.value);

  if (!dom.bookingDate.value) {
    return 'Выберите дату брони.';
  }

  if (!Number.isInteger(hours) || hours < 1 || hours > 12) {
    return 'Количество часов должно быть целым числом от 1 до 12.';
  }

  if (!Number.isInteger(guests) || guests < 1) {
    return 'Количество гостей должно быть не меньше 1.';
  }

  if (!Number.isInteger(cars) || cars < 0) {
    return 'Количество машин не может быть отрицательным.';
  }

  return null;
}

/**
 * Вешает слушатели на фильтры карты и служебные кнопки.
 * @returns {void}
 */
function bindControls() {
  dom.filterType = document.getElementById('filterType');
  dom.filterDate = document.getElementById('filterDate');
  dom.refreshBtn = document.getElementById('refreshBtn');
  dom.bookingHours = document.getElementById('bookingHours');
  dom.bookingGuests = document.getElementById('bookingGuests');
  dom.bookingCars = document.getElementById('bookingCars');
  dom.bookingDate = document.getElementById('bookingDate');

  dom.filterDate.value = todayIso();

  dom.filterType.addEventListener('change', () => map.reload());
  dom.filterDate.addEventListener('change', () => map.reload());
  dom.refreshBtn.addEventListener('click', () => refreshAll());

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => showScreen(tab.dataset.screen));
  }

  window.addEventListener('hashchange', () => {
    showScreen(window.location.hash.replace('#', ''));
  });
}

/**
 * Подписывает модули друг на друга.
 * @returns {void}
 */
function bindModules() {
  map.subscribe({
    onSelect: (object) => {
      if (object.busy) {
        showToast({
          title: 'Объект уже занят',
          text: `${object.name} занят на ${dom.filterDate.value}. Выберите другой объект или дату.`,
          kind: 'warning',
        });
      }

      booking.renderPanel(object);
    },
    onBusyChange: (objects) => {
      state.objects = objects;
    },
  });

  booking.onBookingCreated(() => {
    refreshAll();
  });

  admin.onBookingsChanged(() => {
    map.reload();
  });
}

/**
 * Точка входа: инициализирует все модули и открывает экран из адресной строки.
 * @returns {Promise<void>}
 */
async function initApp() {
  console.log('Инициализация приложения «Старый Бердск»...');

  bindControls();
  bindModules();

  map.init();
  booking.init();

  await admin.init();
  await director.init();
  await map.reload();

  showScreen(window.location.hash.replace('#', '') || 'map');

  console.log('Приложение готово к работе.');
}

document.addEventListener('DOMContentLoaded', initApp);

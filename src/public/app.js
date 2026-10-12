// src/public/app.js — точка входа: роли, экраны, фильтры, каталог, сводка дня.
// Роли входят отдельно: гость — карта и бронь, админ — брони, директор — дашборд.
import * as map from './map.js';
import * as booking from './booking.js';
import * as admin from './admin.js';
import * as director from './director.js';
import { showToast, todayIso, formatMoney, formatDate, createEl, TYPE_LABELS } from './ui.js';

const SCREENS = ['map', 'admin', 'director'];
const ROLES = ['guest', 'admin', 'director'];

const ROLE_LABELS = {
  guest: 'Гость',
  admin: 'Администратор',
  director: 'Директор',
};

/** Какие экраны доступны каждой роли. */
const ROLE_SCREENS = {
  guest: ['map'],
  admin: ['map', 'admin'],
  director: ['director'],
};

/** Стартовый экран каждой роли. */
const ROLE_HOME = {
  guest: 'map',
  admin: 'admin',
  director: 'director',
};

const state = {
  role: sessionStorage.getItem('sb_role') || null,
  screen: 'map',
  type: '',
  freeOnly: false,
  date: todayIso(),
  objects: [],
  pendingRole: null,
};

/** Пароль для персонала. Учебный проект: единый пароль администратора и директора. */
const STAFF_PASSWORD = '1234';

const dom = {};

/**
 * Показывает нужный экран и подсвечивает активную вкладку.
 * @param {string} name — имя экрана из SCREENS
 * @returns {void}
 */
function showScreen(name) {
  const allowed = ROLE_SCREENS[state.role] || SCREENS;

  if (!SCREENS.includes(name) || !allowed.includes(name)) {
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
 * Применяет роль: прячет чужие вкладки, открывает домашний экран, обновляет бейдж.
 * @param {string} role — guest | admin | director
 * @returns {void}
 */
function setRole(role) {
  if (!ROLES.includes(role)) {
    return;
  }

  state.role = role;
  sessionStorage.setItem('sb_role', role);
  document.body.dataset.role = role;

  dom.roleBadge.textContent = ROLE_LABELS[role];
  dom.gate.hidden = true;

  const allowed = ROLE_SCREENS[role];

  for (const tab of document.querySelectorAll('.tab')) {
    const screen = tab.dataset.screen;
    tab.hidden = !allowed.includes(screen);
  }

  showScreen(ROLE_HOME[role]);

  if (role === 'admin') {
    admin.reload();
  }

  if (role === 'director') {
    director.reload();
  }

  if (allowed.includes('map')) {
    map.reload({ type: state.type, date: state.date, freeOnly: state.freeOnly });
  }
}

/**
 * Возвращает на экран выбора роли.
 * @returns {void}
 */
function exitRole() {
  state.role = null;
  state.pendingRole = null;
  sessionStorage.removeItem('sb_role');
  document.body.dataset.role = 'guest';

  if (dom.gatePass) {
    dom.gatePass.hidden = true;
    dom.gateRoles.hidden = false;
    dom.gatePassInput.value = '';
    dom.gatePassError.textContent = '';
  }

  dom.gate.hidden = false;
}

/**
 * Обработчик кнопок ролей: гость входит сразу, персонал — через пароль 1234.
 * @param {string} role — guest | admin | director
 * @returns {void}
 */
function requestRole(role) {
  if (role === 'guest') {
    setRole('guest');
    return;
  }

  state.pendingRole = role;
  dom.gateRoles.hidden = true;
  dom.gatePass.hidden = false;
  dom.gatePassRole.textContent = ROLE_LABELS[role];
  dom.gatePassInput.value = '';
  dom.gatePassError.textContent = '';
  dom.gatePassInput.focus();
}

/**
 * Проверяет пароль персонала и входит в выбранную роль.
 * @returns {void}
 */
function submitPassword() {
  if (dom.gatePassInput.value === STAFF_PASSWORD) {
    dom.gatePassError.textContent = '';
    setRole(state.pendingRole);
    state.pendingRole = null;
    return;
  }

  dom.gatePassError.textContent = 'Неверный пароль. Подсказка: 1234.';
  dom.gatePassInput.select();
}

/**
 * Возвращает к выбору роли из формы пароля.
 * @returns {void}
 */
function backToRoles() {
  state.pendingRole = null;
  dom.gatePass.hidden = true;
  dom.gateRoles.hidden = false;
  dom.gatePassInput.value = '';
  dom.gatePassError.textContent = '';
}

/**
 * Обновляет счётчик, сводку дня и каталог по объектам с флагом busy.
 * @param {object[]} objects — объекты с флагом busy
 * @returns {void}
 */
function updateMapSide(objects) {
  state.objects = objects;
  const total = objects.length;
  const free = objects.filter((object) => object.busy !== true).length;
  const busy = total - free;

  dom.mapCount.textContent = `Свободно ${free} из ${total}`;
  dom.daySummaryDate.textContent = `На ${formatDate(state.date)}`;
  dom.daySummaryFree.textContent = `${free} из ${total}`;
  dom.occupancyFill.style.width = total > 0 ? `${Math.round((busy / total) * 100)}%` : '0%';

  renderCatalog(objects);
}

/**
 * Фото для карточек каталога по типу объекта.
 */
const CATALOG_PHOTOS = {
  gazebo: { src: '/images/card-gazebo.jpg', alt: 'Беседка с мангалом у воды' },
  tent: { src: '/images/card-tent.jpg', alt: 'Место отдыха у воды вечером' },
  parking: { src: '/images/card-parking.jpg', alt: 'Домики парка на берегу' },
};

/**
 * Описания объектов: домик с мангалом и остальные.
 * @param {object} object — объект парка
 * @returns {string}
 */
function catalogDescription(object) {
  if (object.type === 'gazebo') {
    return `Домик с мангалом у воды: стол, скамейки и место для огня. Вместимость — до ${object.capacity} гостей.`;
  }

  if (object.type === 'tent') {
    return `Уютное место для пикника на берегу: тень деревьев и вид на воду. Вместимость — до ${object.capacity} гостей.`;
  }

  return 'Ровное место у входа в парк для машины гостя. Удобно добираться до беседок и берега.';
}

/**
 * Рисует каталог объектов: фото, описание, вместимость, цена, состояние.
 * Клик по карточке выбирает объект так же, как клик по карте.
 * @param {object[]} objects
 * @returns {void}
 */
function renderCatalog(objects) {
  const list = dom.catalogList;

  if (!list) {
    return;
  }

  list.replaceChildren();

  objects.forEach((object, index) => {
    const busy = object.busy === true;
    const item = createEl('li', 'catalog__item');
    item.tabIndex = busy ? -1 : 0;
    item.dataset.id = String(object.id);
    item.style.animationDelay = `${Math.min(index, 20) * 30}ms`;

    if (map.getObjectById && state.selectedId === object.id) {
      item.classList.add('catalog__item--selected');
    }

    item.setAttribute(
      'aria-label',
      busy ? `${object.name}, занято` : `${object.name}, выбрать для брони`,
    );

    const photo = CATALOG_PHOTOS[object.type] || CATALOG_PHOTOS.gazebo;
    const thumb = document.createElement('img');
    thumb.className = 'catalog__thumb';
    thumb.src = photo.src;
    thumb.alt = photo.alt;
    thumb.loading = 'lazy';

    const main = createEl('div', 'catalog__main');
    const top = createEl('div', 'catalog__top');
    top.appendChild(createEl('span', busy ? 'catalog__dot catalog__dot--busy' : 'catalog__dot'));
    top.appendChild(createEl('div', 'catalog__name', object.name));
    main.appendChild(top);
    main.appendChild(createEl('p', 'catalog__desc', catalogDescription(object)));
    main.appendChild(createEl(
      'div',
      'catalog__meta',
      busy
        ? `Занято · ${formatDate(state.date)}`
        : `${TYPE_LABELS[object.type] || ''} · до ${object.capacity} чел. · машин: ${object.parkingCapacity}`,
    ));

    const side = createEl('div', 'catalog__side');
    side.appendChild(createEl('div', 'catalog__price num', `${formatMoney(object.pricePerHour)}/ч`));

    if (!busy) {
      const cta = createEl('button', 'catalog__cta', 'Выбрать');
      cta.type = 'button';
      side.appendChild(cta);
    }

    item.append(thumb, main, side);

    if (!busy) {
      const choose = () => {
        map.setSelected(object.id);
        booking.renderPanel(object);
        markCatalogSelected(object.id);
        document.getElementById('objectPanel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
      item.addEventListener('click', choose);
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choose();
        }
      });
    }

    list.appendChild(item);
  });
}

/**
 * Подсвечивает выбранную строку каталога.
 * @param {number} id
 * @returns {void}
 */
function markCatalogSelected(id) {
  state.selectedId = id;

  for (const item of dom.catalogList.querySelectorAll('.catalog__item')) {
    item.classList.toggle('catalog__item--selected', item.dataset.id === String(id));
  }
}

/**
 * Перезагружает карту и, если открыт админский экран, его таблицу.
 * @returns {Promise<void>}
 */
async function refreshAll() {
  await map.reload({ type: state.type, date: state.date, freeOnly: state.freeOnly });

  if (state.screen === 'admin') {
    await admin.reload();
  }

  if (state.screen === 'director') {
    await director.reload();
  }
}

/**
 * Вешает слушатели на вход по ролям, фильтры карты и вкладки.
 * @returns {void}
 */
function bindControls() {
  dom.gate = document.getElementById('gate');
  dom.gateRoles = dom.gate.querySelector('.gate__roles');
  dom.gatePass = document.getElementById('gatePass');
  dom.gatePassRole = document.getElementById('gatePassRole');
  dom.gatePassInput = document.getElementById('gatePassInput');
  dom.gatePassError = document.getElementById('gatePassError');
  dom.gatePassBack = document.getElementById('gatePassBack');
  dom.gatePassSubmit = document.getElementById('gatePassSubmit');
  dom.roleBadge = document.getElementById('roleBadge');
  dom.roleExit = document.getElementById('roleExit');
  dom.filterDate = document.getElementById('filterDate');
  dom.typeSegmented = document.getElementById('typeSegmented');
  dom.freeOnlyToggle = document.getElementById('freeOnlyToggle');
  dom.refreshBtn = document.getElementById('refreshBtn');
  dom.mapCount = document.getElementById('mapCount');
  dom.catalogList = document.getElementById('catalogList');
  dom.daySummaryDate = document.getElementById('daySummaryDate');
  dom.daySummaryFree = document.getElementById('daySummaryFree');
  dom.occupancyFill = document.getElementById('occupancyFill');

  dom.filterDate.value = state.date;

  for (const button of dom.gate.querySelectorAll('[data-role-btn]')) {
    button.addEventListener('click', () => requestRole(button.dataset.roleBtn));
  }

  dom.gatePassSubmit.addEventListener('click', submitPassword);
  dom.gatePassBack.addEventListener('click', backToRoles);
  dom.gatePassInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitPassword();
    }
  });

  dom.roleExit.addEventListener('click', exitRole);

  dom.filterDate.addEventListener('change', () => {
    state.date = dom.filterDate.value || todayIso();
    map.reload({ date: state.date, freeOnly: state.freeOnly });
  });

  dom.typeSegmented.addEventListener('click', (event) => {
    const button = event.target.closest('.segmented__btn');

    if (!button) {
      return;
    }

    state.type = button.dataset.type || '';

    for (const btn of dom.typeSegmented.querySelectorAll('.segmented__btn')) {
      const active = btn === button;
      btn.classList.toggle('segmented__btn--active', active);
      btn.setAttribute('aria-pressed', String(active));
    }

    map.reload({ type: state.type, freeOnly: state.freeOnly });
  });

  dom.freeOnlyToggle.addEventListener('change', () => {
    state.freeOnly = dom.freeOnlyToggle.checked;
    map.reload({ freeOnly: state.freeOnly });
  });

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
      map.setSelected(object.id);
      markCatalogSelected(object.id);

      if (object.busy) {
        showToast({
          title: 'Объект уже занят',
          text: `${object.name} занят на ${state.date}. Выберите другой объект или дату.`,
          kind: 'warning',
        });
      }

      booking.renderPanel(object);
    },
    onBusyChange: (objects) => {
      updateMapSide(objects);
    },
  });

  booking.onBookingCreated(() => {
    refreshAll();
  });

  admin.onBookingsChanged(() => {
    map.reload({ type: state.type, date: state.date, freeOnly: state.freeOnly });
  });
}

/**
 * Точка входа: роль, модули, стартовый экран.
 * @returns {Promise<void>}
 */
async function initApp() {
  bindControls();
  bindModules();

  map.init();
  booking.init();

  await admin.init();
  await director.init();

  if (state.role && ROLES.includes(state.role)) {
    setRole(state.role);
  } else {
    document.body.dataset.role = 'guest';
    dom.gate.hidden = false;
    await map.reload({ type: state.type, date: state.date, freeOnly: state.freeOnly });
  }
}

document.addEventListener('DOMContentLoaded', initApp);

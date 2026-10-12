// src/public/map.js — SVG-схема парка: среда, пиктограммы, состояния, выбор.
import { fetchObjects } from './api.js';
import { TYPE_LABELS, showToast, todayIso, formatDate, formatMoney } from './ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Статичная среда парка: зона, ограда, водохранилище, пляж, лужайки, дорожки, вход, компас. */
const SCENE = [
  { tag: 'rect', attrs: { x: 20, y: 20, width: 480, height: 520, rx: 18 }, className: 'map-zone' },
  { tag: 'rect', attrs: { x: 30, y: 30, width: 460, height: 500, rx: 12 }, className: 'map-fence' },
  { tag: 'rect', attrs: { x: 30, y: 30, width: 460, height: 100, rx: 10 }, className: 'map-reservoir' },
  { tag: 'path', attrs: { d: 'M 90 65 q 18 -8 36 0 t 36 0' }, className: 'map-wave' },
  { tag: 'path', attrs: { d: 'M 300 90 q 18 -8 36 0 t 36 0' }, className: 'map-wave' },
  { tag: 'text', attrs: { x: 260, y: 82 }, className: 'map-decor__label map-decor__label--light', text: 'водохранилище' },
  { tag: 'rect', attrs: { x: 30, y: 130, width: 460, height: 30, rx: 6 }, className: 'map-beach' },
  { tag: 'text', attrs: { x: 260, y: 149 }, className: 'map-decor__label map-decor__label--dark', text: 'пляж' },
  { tag: 'ellipse', attrs: { cx: 70, cy: 250, rx: 42, ry: 20 }, className: 'map-lawn' },
  { tag: 'ellipse', attrs: { cx: 455, cy: 395, rx: 38, ry: 20 }, className: 'map-lawn' },
  { tag: 'path', attrs: { d: 'M 20 268 Q 260 228 500 276' }, className: 'map-path' },
  { tag: 'path', attrs: { d: 'M 330 268 L 330 530' }, className: 'map-foot' },
  { tag: 'path', attrs: { d: 'M 120 232 L 120 260' }, className: 'map-foot' },
  { tag: 'path', attrs: { d: 'M 400 232 L 400 262' }, className: 'map-foot' },
  { tag: 'rect', attrs: { x: 298, y: 524, width: 64, height: 12, rx: 3 }, className: 'map-entrance' },
  { tag: 'text', attrs: { x: 330, y: 514 }, className: 'map-entrance-label', text: 'вход' },
  { tag: 'circle', attrs: { cx: 462, cy: 62, r: 15 }, className: 'map-compass' },
  { tag: 'text', attrs: { x: 462, y: 67 }, className: 'map-compass-letter', text: 'С' },
];

/** Деревья сцены: координаты и размер кроны (все ниже пляжа, вне воды). */
const TREES = [
  { x: 60, y: 215, r: 13, dark: true },
  { x: 82, y: 420, r: 15, dark: false },
  { x: 470, y: 210, r: 13, dark: false },
  { x: 455, y: 340, r: 11, dark: true },
  { x: 60, y: 480, r: 12, dark: true },
  { x: 190, y: 250, r: 11, dark: false },
];

/** Состояние модуля: дата, фильтр типа, тогл «только свободные», выбор. */
const state = {
  objects: [],
  selectedId: null,
  date: todayIso(),
  type: '',
  freeOnly: false,
};

const handlers = {
  onSelect: () => {},
  onBusyChange: () => {},
};

let svg = null;

/**
 * Создаёт SVG-элемент с атрибутами.
 * @param {string} tagName
 * @param {object} attrs
 * @returns {SVGElement}
 */
function svgEl(tagName, attrs) {
  const element = document.createElementNS(SVG_NS, tagName);

  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }

  return element;
}

/**
 * Рисует дерево: ствол и круглая крона.
 * @param {{x: number, y: number, r: number, dark: boolean}} tree
 * @returns {SVGElement}
 */
function treeIcon(tree) {
  const group = svgEl('g', {});
  const trunk = svgEl('line', {
    x1: tree.x, y1: tree.y, x2: tree.x, y2: tree.y + tree.r + 4, class: 'map-trunk',
  });
  const crown = svgEl('circle', {
    cx: tree.x, cy: tree.y, r: tree.r, class: tree.dark ? 'map-tree map-tree--dark' : 'map-tree',
  });
  group.append(trunk, crown);
  return group;
}

/**
 * Беседка: картинка домика из 22/32 (icon-gazebo.png).
 * @param {number} x
 * @param {number} y
 * @returns {SVGElement}
 */
function gazeboIcon(x, y) {
  const group = svgEl('g', { class: 'map-object__shape' });
  const img = svgEl('image', {
    x: x - 27, y: y - 30, width: 54, height: 54, href: '/images/icon-gazebo.png', class: 'map-object__img',
  });
  group.append(img);
  return group;
}

/**
 * Палатка: картинка из 22/32/11 (icon-tent.jpg).
 * @param {number} x
 * @param {number} y
 * @returns {SVGElement}
 */
function tentIcon(x, y) {
  const group = svgEl('g', { class: 'map-object__shape' });
  const img = svgEl('image', {
    x: x - 28, y: y - 30, width: 56, height: 50, href: '/images/icon-tent.png', class: 'map-object__img',
  });
  group.append(img);
  return group;
}

/**
 * Парковочное место: разметка с буквой P.
 * @param {number} x
 * @param {number} y
 * @returns {SVGElement}
 */
function parkingIcon(x, y) {
  const group = svgEl('g', { class: 'map-object__shape' });
  const slot = svgEl('rect', { x: x - 25, y: y - 21, width: 50, height: 42, rx: 7 });
  const line = svgEl('line', {
    x1: x, y1: y - 21, x2: x, y2: y + 21, class: 'map-object__line',
  });
  const letter = svgEl('text', {
    x: x - 12,
    y: y + 7,
    'text-anchor': 'middle',
    'font-size': 17,
    'font-weight': 800,
    fill: '#ffffff',
    stroke: 'none',
  });
  letter.textContent = 'P';
  group.append(slot, line, letter);
  return group;
}

/**
 * Строит пиктограмму объекта по его типу.
 * @param {object} object — объект парка
 * @returns {SVGElement}
 */
function buildIcon(object) {
  const { x, y } = object.position;

  if (object.type === 'parking') {
    return parkingIcon(x, y);
  }

  if (object.type === 'tent') {
    return tentIcon(x, y);
  }

  return gazeboIcon(x, y);
}

/**
 * Отрисовывает сцену и все объекты с учётом фильтров.
 * @returns {void}
 */
function render() {
  if (!svg) {
    return;
  }

  svg.replaceChildren();

  for (const item of SCENE) {
    const element = svgEl(item.tag, item.attrs);

    if (item.className) {
      element.setAttribute('class', item.className);
    }

    if (item.text) {
      element.textContent = item.text;
    }

    svg.appendChild(element);
  }

  for (const tree of TREES) {
    svg.appendChild(treeIcon(tree));
  }

  const visible = state.freeOnly
    ? state.objects.filter((object) => object.busy !== true)
    : state.objects;

  for (const object of visible) {
    const busy = object.busy === true;
    const selected = state.selectedId === object.id;
    const classes = [
      'map-object',
      `map-object--${object.type}`,
      busy ? 'map-object--busy' : 'map-object--free',
    ];

    if (selected) {
      classes.push('map-object--selected');
    }

    const group = svgEl('g', {
      class: classes.join(' '),
      'data-object-id': object.id,
      role: 'button',
      tabindex: busy ? '-1' : '0',
      'aria-label': `${object.name}, ${busy ? `занято на ${formatDate(state.date)}` : `свободно, ${formatMoney(object.pricePerHour)} в час`}`,
      'aria-pressed': String(selected),
    });

    const { x, y } = object.position;
    const halo = svgEl('rect', {
      x: x - 36, y: y - 40, width: 72, height: 92, rx: 14, class: 'map-object__halo',
    });
    group.appendChild(halo);
    group.appendChild(buildIcon(object));

    const label = svgEl('text', { x, y: y + 44 });
    label.setAttribute('class', 'map-object__label');
    label.textContent = object.name;
    group.appendChild(label);

    const sub = svgEl('text', { x, y: y + 58 });
    sub.setAttribute('class', 'map-object__sub map-object__sub--price');
    sub.textContent = busy
      ? `занято · ${formatDate(state.date)}`
      : `${formatMoney(object.pricePerHour)}/ч`;
    group.appendChild(sub);

    group.addEventListener('click', () => handlers.onSelect(object));
    group.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && !busy) {
        event.preventDefault();
        handlers.onSelect(object);
      }
    });

    svg.appendChild(group);
  }
}

/**
 * Перезагружает объекты и перерисовывает схему.
 * @param {{type?: string, date?: string, freeOnly?: boolean}} [filters]
 * @returns {Promise<void>}
 */
async function reload(filters = {}) {
  state.type = filters.type ?? state.type;
  state.date = filters.date || state.date;
  state.freeOnly = filters.freeOnly ?? state.freeOnly;

  try {
    state.objects = await fetchObjects({ type: state.type, date: state.date });
  } catch (error) {
    showToast({ title: 'Не удалось загрузить карту', text: error.message, kind: 'error' });
    return;
  }

  if (!state.objects.some((object) => object.id === state.selectedId)) {
    state.selectedId = null;
  }

  render();
  handlers.onBusyChange(state.objects);
}

/**
 * Помечает объект выбранным и перерисовывает схему.
 * @param {number|null} id
 * @returns {void}
 */
function setSelected(id) {
  state.selectedId = id;
  render();
}

/**
 * Находит объект по идентификатору в текущем состоянии.
 * @param {number} id
 * @returns {object|null}
 */
function getObjectById(id) {
  return state.objects.find((object) => object.id === id) || null;
}

/**
 * Возвращает слот, занятый на момент последней загрузки.
 * @param {number} id
 * @returns {boolean}
 */
function isBusy(id) {
  const object = getObjectById(id);
  return object ? object.busy === true : false;
}

/**
 * Регистрирует подписчиков модуля.
 * @param {{onSelect: Function, onBusyChange: Function}} listeners
 * @returns {void}
 */
function subscribe(listeners) {
  Object.assign(handlers, listeners);
}

/**
 * Инициализирует модуль: находит SVG в DOM и рисует сцену.
 * @returns {void}
 */
function init() {
  svg = document.getElementById('parkMap');
  render();
}

export { init, render, reload, subscribe, getObjectById, isBusy, setSelected, TYPE_LABELS };

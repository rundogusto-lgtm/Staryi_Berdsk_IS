// src/public/map.js — отрисовка SVG-схемы парка и обработка кликов по объектам.

import { fetchObjects } from './api.js';
import { TYPE_LABELS, showToast, todayIso } from './ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Геометрия декоративных элементов схемы — не зависит от данных. */
const SCENE = [
  { tag: 'rect', attrs: { x: 20, y: 20, width: 480, height: 520, rx: 16 }, className: 'map-zone' },
  { tag: 'path', attrs: { d: 'M 20 260 Q 260 220 500 270' }, className: 'map-path' },
  { tag: 'path', attrs: { d: 'M 60 100 Q 180 140 300 120' }, className: 'map-water' },
  { tag: 'text', attrs: { x: 70, y: 96, class: 'map-object__label' }, text: 'река' },
];

/** Состояние модуля: текущая дата, объекты и выбранный объект. */
const state = {
  objects: [],
  selectedId: null,
  date: todayIso(),
  type: '',
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
 * Рисует фигуру объекта по его типу.
 * @param {object} object — объект парка
 * @returns {SVGElement}
 */
function buildShape(object) {
  const { x, y } = object.position;

  if (object.type === 'parking') {
    return svgEl('rect', { x: x - 22, y: y - 16, width: 44, height: 32, rx: 5 });
  }

  if (object.type === 'tent') {
    return svgEl('path', { d: `M ${x - 24} ${y + 16} L ${x} ${y - 20} L ${x + 24} ${y + 16} Z` });
  }

  return svgEl('rect', { x: x - 24, y: y - 18, width: 48, height: 36, rx: 4 });
}

/**
 * Отрисовывает сцену и все объекты.
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

  for (const object of state.objects) {
    const busy = object.busy === true;
    const classes = ['map-object', `map-object--${object.type}`];

    if (busy) {
      classes.push('map-object--busy');
    }

    const group = svgEl('g', {
      class: classes.join(' '),
      'data-object-id': object.id,
      role: 'button',
      tabindex: '0',
      'aria-label': `${object.name}, ${busy ? 'занято' : 'свободно'}`,
    });

    const shape = buildShape(object);
    shape.setAttribute('class', 'map-object__shape');
    group.appendChild(shape);

    const label = svgEl('text', { x: object.position.x, y: object.position.y + 4 });
    label.setAttribute('class', 'map-object__label');
    label.textContent = TYPE_LABELS[object.type];
    group.appendChild(label);

    group.addEventListener('click', () => handlers.onSelect(object));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handlers.onSelect(object);
      }
    });

    svg.appendChild(group);
  }
}

/**
 * Перезагружает объекты и перерисовывает схему.
 * @param {{type?: string, date?: string}} [filters]
 * @returns {Promise<void>}
 */
async function reload(filters = {}) {
  state.type = filters.type ?? state.type;
  state.date = filters.date || state.date;

  try {
    state.objects = await fetchObjects({ type: state.type, date: state.date });
  } catch (error) {
    showToast({ title: 'Не удалось загрузить карту', text: error.message, kind: 'error' });
    return;
  }

  render();
  handlers.onBusyChange(state.objects);
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

export { init, render, reload, subscribe, getObjectById, isBusy };

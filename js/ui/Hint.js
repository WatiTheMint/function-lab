// Обучающие подсказки: небольшие, закрываются крестиком и больше не мешают.

import { h, storage } from './dom.js';
import { icon } from './icons.js';

const KEY = 'fl.hints.dismissed';

export function hint(id, content) {
  const dismissed = storage.get(KEY, []);
  if (dismissed.includes(id)) return null;
  const el = h('div', { class: 'hint', role: 'note' },
    icon('bulb', 16),
    h('div', {}, content),
    h('button', {
      type: 'button',
      class: 'icon-btn is-quiet',
      'aria-label': 'Сховати підказку',
      onClick: () => {
        storage.set(KEY, [...new Set([...storage.get(KEY, []), id])]);
        el.remove();
      },
    }, icon('x', 14)),
  );
  return el;
}

export function resetHints() {
  storage.set(KEY, []);
}

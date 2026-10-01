// Короткие уведомления внизу экрана, при необходимости — с кнопкой «Отменить».

import { h } from './dom.js';

const container = () => document.getElementById('toasts');

export function showToast(message, { action = null, timeout = 4500 } = {}) {
  const root = container();
  if (!root) return;
  while (root.children.length >= 3) root.firstChild.remove();
  const el = h('div', { class: 'toast' }, h('span', {}, message));
  const close = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    el.append(h('button', {
      type: 'button',
      class: 'btn btn-sm',
      onClick: () => {
        action.onClick();
        close();
      },
    }, action.label));
  }
  root.append(el);
  setTimeout(close, timeout);
}
